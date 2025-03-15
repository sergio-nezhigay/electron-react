import puppeteer, { Browser } from 'puppeteer';

import { getRandomUserAgent, makeRandomDelay } from './basicUtils';
import { ExtendedShopifyProduct } from '../types';

export function calculatePricePoints(
  product: ExtendedShopifyProduct,
  strategy?: 'aggressive' | 'middle' | 'premium'
): {
  minimalFinalPrice: number | null;
  maximalFinalPrice: number | null;
  middleFinalPrice: number | null;
} {
  let minimalFinalPrice: number | null = null;
  let maximalFinalPrice: number | null = null;
  let middleFinalPrice: number | null = null;

  if (!strategy && product.bestSupplierName) {
    if (['ЧЕ', 'Б', 'BudgetDistributor'].includes(product.bestSupplierName)) {
      strategy = 'aggressive';
    } else if (['ИИ', 'РИ'].includes(product.bestSupplierName)) {
      strategy = 'premium';
    } else {
      strategy = 'middle';
    }
  } else if (!strategy) {
    strategy = 'middle';
  }

  if (product.bestSupplier?.priceOpt) {
    const optPrice = product.bestSupplier.priceOpt;

    switch (strategy) {
      case 'aggressive':
        minimalFinalPrice = parseFloat((optPrice * 1.05 + 25).toFixed(2));
        middleFinalPrice = parseFloat((optPrice * 1.1 + 50).toFixed(2));
        maximalFinalPrice = parseFloat((optPrice * 1.15 + 75).toFixed(2));
        break;

      case 'premium':
        minimalFinalPrice = parseFloat((optPrice * 1.1 + 50).toFixed(2));
        middleFinalPrice = parseFloat((optPrice * 1.2 + 100).toFixed(2));
        maximalFinalPrice = parseFloat((optPrice * 1.3 + 150).toFixed(2));
        break;

      case 'middle':
      default:
        minimalFinalPrice = parseFloat((optPrice * 1.07 + 50).toFixed(2));
        middleFinalPrice = parseFloat((optPrice * 1.15 + 100).toFixed(2));
        maximalFinalPrice = parseFloat((optPrice * 1.2 + 150).toFixed(2));
        break;
    }
  }

  return {
    minimalFinalPrice,
    maximalFinalPrice,
    middleFinalPrice,
  };
}

export function calculateFinalPrice(
  retailPrice: number | null,
  hotlinePrice: number | null,
  pricePoints: {
    minimalFinalPrice: number | null;
    middleFinalPrice: number | null;
    maximalFinalPrice: number | null;
  }
): number | null {
  const { minimalFinalPrice, middleFinalPrice, maximalFinalPrice } =
    pricePoints;

  if (retailPrice !== null) {
    return retailPrice;
  }

  if (hotlinePrice === null) {
    return maximalFinalPrice;
  }

  if (maximalFinalPrice !== null && hotlinePrice > maximalFinalPrice) {
    return maximalFinalPrice;
  }

  if (minimalFinalPrice !== null && hotlinePrice < minimalFinalPrice) {
    return middleFinalPrice;
  }

  return hotlinePrice;
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

    await makeRandomDelay(1000, 3000);

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

    await makeRandomDelay(500, 3000);

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

    await page.close();
    await context.close();

    if (prices.length > 0) {
      const minPrice = Math.min(...(prices as number[]));
      return minPrice;
    }

    return null;
  } catch (error) {
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

          await makeRandomDelay(1000, 5000);
        }

        const productWithHotlinePrice = {
          ...product,
          hotlineMinimalPrice: minimalHotlinePrice,
        };

        const pricePoints = calculatePricePoints(productWithHotlinePrice);

        const finalPrice = calculateFinalPrice(
          product.bestSupplier?.priceRtl || null,
          minimalHotlinePrice,
          pricePoints
        );

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
