import puppeteer, { Browser, Page } from 'puppeteer';
import { getRandomUserAgent, makeRandomDelay } from './basicUtils';
import { ExtendedShopifyProduct } from '../types';
import { calculatePricePoints, calculateFinalPrice } from './pricingLogic';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Takes a screenshot of the current page and saves it to the filesystem
 * @param page - Puppeteer Page object
 * @param url - URL of the page (used for naming the file)
 * @param prefix - Optional prefix for the screenshot filename
 * @returns Path to the saved screenshot
 */
export async function takeScreenshot(
  page: Page,
  url: string,
  prefix = 'screenshot'
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const urlHash = crypto
    .createHash('md5')
    .update(url)
    .digest('hex')
    .substring(0, 8);
  const screenshotDir = path.join(process.cwd(), 'screenshots');

  // Create screenshots directory if it doesn't exist
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  const screenshotPath = path.join(
    screenshotDir,
    `${prefix}-${timestamp}-${urlHash}.png`
  );
  await page.screenshot({
    path: screenshotPath,
    fullPage: true,
  });

  console.log(`Screenshot saved to: ${screenshotPath}`);
  return screenshotPath;
}

async function getMinimalPriceFromHotlineUrl(
  url: string,
  browser: Browser
): Promise<number | null> {
  if (!url) return null;

  try {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();

    const userAgent = getRandomUserAgent();
    await page.setUserAgent(userAgent);

    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      Connection: 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'max-age=0',
    });

    await makeRandomDelay(1000, 2000);

    await page.setViewport({
      width: 1366,
      height: 768,
      deviceScaleFactor: 1,
    });

    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    await page.evaluate(() => {
      const scrollPositions = [
        window.innerHeight * 0.3,
        window.innerHeight * 0.6,
        window.innerHeight * 0.9,
      ];

      for (const position of scrollPositions) {
        window.scrollTo(0, position);
      }
    });

    await makeRandomDelay(500, 2000);

    const prices = await page.evaluate((): (number | null)[] => {
      const priceElements = Array.from(
        document.querySelectorAll('.many__price .price__value')
      );

      return priceElements
        .map((el) => {
          const priceText = el.textContent || '';
          const numberMatch = priceText
            .replace(/\s+/g, '')
            .match(/\d+(\.\d+)?/);
          return numberMatch ? parseFloat(numberMatch[0]) : null;
        })
        .filter((price) => price !== null);
    });

    // Take a screenshot after collecting prices using the dedicated function
    //  await takeScreenshot(page, url, 'hotline');

    await page.close();
    await context.close();

    if (prices.length > 0) {
      const minPrice = Math.min(...(prices as number[]));
      return minPrice;
    }

    return null;
  } catch (error) {
    console.error('Error while getting price from Hotline:', error);
    return null;
  }
}

export const enrichProductsWithPriceData = async (
  extendedProducts: ExtendedShopifyProduct[]
): Promise<ExtendedShopifyProduct[]> => {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-infobars',
      '--window-position=0,0',
      '--ignore-certifcate-errors',
      '--ignore-certifcate-errors-spki-list',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-blink-features=AutomationControlled',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
  });

  await browser
    .defaultBrowserContext()
    .overridePermissions('https://hotline.ua', []);

  try {
    const batchSize = 3;
    const processedProducts: ExtendedShopifyProduct[] = [];

    for (let i = 0; i < extendedProducts.length; i += batchSize) {
      const batch = extendedProducts.slice(i, i + batchSize);

      for (const product of batch) {
        console.log(
          `Enriching product: ${product.title} (${product.part_number}) - [${
            i + 1
          }/${extendedProducts.length}]`
        );

        let minimalHotlinePrice: number | null = null;

        if (product.custom_hotline_href && product.bestSupplier) {
          minimalHotlinePrice = await getMinimalPriceFromHotlineUrl(
            product.custom_hotline_href,
            browser
          );

          await makeRandomDelay(1000, 4000);
        }

        const minimalOtherCompetitor = product.custom_competitor_minimum_price
          ? parseFloat(product.custom_competitor_minimum_price)
          : null;

        const minimalAllCompetitors = minimalOtherCompetitor
          ? Math.min(minimalHotlinePrice, minimalOtherCompetitor)
          : minimalHotlinePrice;

        const productWithHotlinePrice = {
          ...product,
          minimalHotlinePrice,
        };

        const pricePoints = calculatePricePoints(product);

        const finalPrice = calculateFinalPrice({
          retailPrice: product.bestSupplier?.priceRtl || null,
          minimalAllCompetitors,
          pricePoints,
        });

        processedProducts.push({
          ...productWithHotlinePrice,
          ...pricePoints,
          finalPrice,
        });
      }
    }

    return processedProducts;
  } finally {
    await browser.disconnect();
  }
};

export { getMinimalPriceFromHotlineUrl };
