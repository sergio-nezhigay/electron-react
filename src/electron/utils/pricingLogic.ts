import puppeteer, { Browser } from 'puppeteer';

import { getRandomUserAgent, makeRandomDelay } from './basicUtils';
import { ExtendedShopifyProduct } from '../types';

export function calculatePricePoints(product: ExtendedShopifyProduct): {
  minimalFinalPrice: number | null;
  maximalFinalPrice: number | null;
  middleFinalPrice: number | null;
} {
  let minimalFinalPrice: number | null = null;
  let maximalFinalPrice: number | null = null;
  let middleFinalPrice: number | null = null;
  let strategy: 'aggressive' | 'premium' | 'middle' = 'middle';

  if (product.bestSupplierName) {
    if (
      ['ЧЕ', 'Б', 'РИ', 'BudgetDistributor'].includes(product.bestSupplierName)
    ) {
      strategy = 'aggressive';
    } else if (['ИИ'].includes(product.bestSupplierName)) {
      strategy = 'premium';
    }
  }

  if (product.bestSupplier?.priceOpt) {
    const optPrice = product.bestSupplier.priceOpt;

    switch (strategy) {
      case 'aggressive':
        minimalFinalPrice = parseFloat((optPrice * 1.04 + 25).toFixed(0));
        middleFinalPrice = parseFloat((optPrice * 1.07 + 40).toFixed(0));
        maximalFinalPrice = parseFloat((optPrice * 1.15 + 75).toFixed(0));
        break;

      case 'premium':
        minimalFinalPrice = parseFloat((optPrice * 1.1 + 50).toFixed(0));
        middleFinalPrice = parseFloat((optPrice * 1.2 + 100).toFixed(0));
        maximalFinalPrice = parseFloat((optPrice * 1.3 + 150).toFixed(0));
        break;

      case 'middle':
      default:
        minimalFinalPrice = parseFloat((optPrice * 1.07 + 50).toFixed(0));
        middleFinalPrice = parseFloat((optPrice * 1.15 + 100).toFixed(0));
        maximalFinalPrice = parseFloat((optPrice * 1.2 + 150).toFixed(0));
        break;
    }
  }
  const instock = product.bestSupplier?.instock || 0;
  return {
    minimalFinalPrice:
      minimalFinalPrice * calculatePriceAdjustmentFactor(instock),
    maximalFinalPrice:
      maximalFinalPrice * calculatePriceAdjustmentFactor(instock),
    middleFinalPrice:
      middleFinalPrice * calculatePriceAdjustmentFactor(instock),
  };
}

export function calculatePriceAdjustmentFactor(instock: number): number {
  if (instock === 1) {
    return 1.02;
  } else if (instock > 3) {
    return 0.97;
  } else if (instock > 2) {
    return 0.98;
  }
  return 1.0;
}

export function calculateFinalPrice(params: {
  retailPrice: number | null;
  minimalAllCompetitors: number | null;
  pricePoints: {
    minimalFinalPrice: number | null;
    middleFinalPrice: number | null;
    maximalFinalPrice: number | null;
  };
}): number | null {
  const { retailPrice, minimalAllCompetitors, pricePoints } = params;
  const { minimalFinalPrice, middleFinalPrice, maximalFinalPrice } =
    pricePoints;

  if (retailPrice !== null) {
    return retailPrice;
  }

  if (minimalAllCompetitors === null) {
    return maximalFinalPrice;
  }

  if (maximalFinalPrice !== null && minimalAllCompetitors > maximalFinalPrice) {
    return maximalFinalPrice;
  }

  if (minimalFinalPrice !== null && minimalAllCompetitors < minimalFinalPrice) {
    return middleFinalPrice;
  }

  return minimalAllCompetitors;
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

function computeSupplierAdjustedDelta(
  delta: number,
  supplierName: string | undefined
): number {
  let adjustedDelta = delta;

  if (supplierName && supplierName.includes('Щу')) {
    adjustedDelta -= 30;
  }

  if (adjustedDelta >= 200) adjustedDelta *= 1.2;
  else if (adjustedDelta >= 150) adjustedDelta *= 1.15;
  else if (adjustedDelta >= 100) adjustedDelta *= 1.1;

  return adjustedDelta;
}

export const convertProductsToJsonLines = (
  products: ExtendedShopifyProduct[]
): string[] => {
  const transformedData = products.map((product) => {
    const isAtStock = product.bestSupplier?.instock
      ? product.bestSupplier.instock > 0
      : false;

    const parsedCost = product.bestSupplier?.priceOpt || 0;
    const cost = parsedCost.toFixed(0);
    const parsedPrice = product.finalPrice || 0;
    const price = parsedPrice.toFixed(0);

    const baseDelta = parsedPrice - parsedCost;

    const adjustedDelta = computeSupplierAdjustedDelta(
      baseDelta,
      product.bestSupplierName
    );

    const delta = adjustedDelta.toFixed(0);

    return {
      input: {
        id: product.id,
        title: product.title,
        variants: [
          {
            price: price,
            barcode: product.part_number,
            sku: `${product.custom_product_number_1_sku}^${
              product.bestSupplierName || ''
            }`,
            inventoryManagement: 'SHOPIFY',
            inventoryQuantities: {
              availableQuantity: isAtStock
                ? Number(product.bestSupplier?.instock || 0) + 10
                : 0,
              locationId: `gid://shopify/Location/97195786556`,
            },
            inventoryItem: {
              cost,
            },
          },
        ],
        metafields: [
          {
            namespace: 'custom',
            key: 'delta',
            value: delta,
            type: 'number_integer',
          },
          {
            namespace: 'custom',
            key: 'warranty',
            value: product.bestSupplier?.warranty || '',
            type: 'single_line_text_field',
          },
        ],
      },
    };
  });

  const lines = transformedData.map((obj) => JSON.stringify(obj));

  return lines;
};
