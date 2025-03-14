import { net } from 'electron';
import ExcelJS from 'exceljs';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import puppeteer, { Browser } from 'puppeteer';
import {
  ShopifyProduct,
  ShopifyResponse,
  PostData,
  SupplierProduct,
  Supplier,
  ExtendedShopifyProduct,
} from './types';

export const isPositiveDigit = (value: string): boolean => {
  return /^\d+$/.test(value);
};

export async function loadGoogleSheet(documentId: string, sheetId: number) {
  const serviceAccountAuth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const doc = new GoogleSpreadsheet(documentId, serviceAccountAuth);
  await doc.loadInfo();
  return doc.sheetsById[sheetId].getRows();
}

const fetchShopifyData = async (
  url: string,
  accessToken: string,
  postData: PostData
): Promise<ShopifyResponse> => {
  const response = await net.fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify(postData),
  });

  if (response.status !== 200) {
    throw new Error('Failed to fetch products from Shopify');
  }

  const data: ShopifyResponse = await response.json();
  if (data.errors && data.errors.length > 0) {
    throw new Error(data.errors.map((error) => error.message).join(', '));
  }

  return data;
};

const extractProducts = (data: ShopifyResponse): ShopifyProduct[] => {
  return (
    data.data?.products.edges.map(
      (edge): ShopifyProduct => ({
        id: edge.node.id,
        title: edge.node.title,
        handle: edge.node.handle,
        part_number: edge.node.variants.edges[0]?.node.barcode || '',
        custom_hotline_href: edge.node.custom_hotline_href?.value || '',
        custom_product_number_1_sku:
          edge.node.custom_product_number_1?.value || '',
        custom_alternative_part_number:
          edge.node.custom_alternative_part_number?.value || '',
      })
    ) || []
  );
};

export const fetchShopifyProducts = async (): Promise<ShopifyProduct[]> => {
  const shopifyStoreUrl = process.env.SHOPIFY_STORE_URL;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!shopifyStoreUrl || !accessToken) {
    throw new Error(
      'Shopify store URL or access token is not defined in environment variables'
    );
  }

  let hasNextPage = true;
  let endCursor: string | null = null;
  const allProducts: ShopifyProduct[] = [];

  while (hasNextPage) {
    const query = `
      query getProducts($first: Int!, $after: String) {
        products(first: $first, after: $after) {
          edges {
            node {
              id
              title
              handle
              variants(first: 1) {
                edges {
                  node {
                    barcode
                  }
                }
              }
              custom_hotline_href: metafield(namespace: "custom", key: "hotline_href") {
                value
              }
              custom_product_number_1: metafield(namespace: "custom", key: "product_number_1") {
                value
              }
              custom_alternative_part_number: metafield(namespace: "custom", key: "alternative_part_number") {
                value
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    const url = `${shopifyStoreUrl}/admin/api/2025-01/graphql.json`;
    const postData: PostData = {
      query,
      variables: {
        first: 250,
        after: endCursor,
      },
    };

    try {
      const data: ShopifyResponse = await fetchShopifyData(
        url,
        accessToken,
        postData
      );
      allProducts.push(...extractProducts(data));
      console.log(`Fetched ${allProducts.length} products from Shopify`);
      //  hasNextPage = false;
      hasNextPage = data.data?.products.pageInfo.hasNextPage || false;
      endCursor = data.data?.products.pageInfo.endCursor || null;
    } catch (error) {
      throw new Error(
        `Failed to fetch products from Shopify: ${error.message}`
      );
    }
  }

  if (allProducts.length === 0) {
    throw new Error('No products found from Shopify');
  }

  return allProducts;
};

// Aggregation of supplier data
export const fetchAllSupplierProducts = async (
  suppliers: Supplier[]
): Promise<SupplierProduct[]> => {
  const allSupplierProducts: SupplierProduct[] = [];

  for (const supplier of suppliers) {
    try {
      const products = await supplier.fetchFunction();
      console.log(`Fetched ${products.length} products from ${supplier.name}`);
      allSupplierProducts.push(
        ...products.map((product) => ({
          ...product,
          supplierName: supplier.name,
        }))
      );
    } catch (error) {
      throw new Error(
        `Failed to fetch products from ${supplier.name}: ${error.message}`
      );
    }
  }

  return allSupplierProducts;
};

export const mergeSupplierData = (
  shopifyProducts: ShopifyProduct[],
  allSupplierProducts: SupplierProduct[]
): ExtendedShopifyProduct[] => {
  const extendedProducts: ExtendedShopifyProduct[] = shopifyProducts.map(
    (product) => {
      const suppliers = allSupplierProducts.filter(
        (supplier) =>
          supplier.part_number.toLowerCase() ===
            product.part_number.toLowerCase() ||
          (product.custom_alternative_part_number &&
            supplier.part_number.toLowerCase() ===
              product.custom_alternative_part_number.toLowerCase())
      );

      const bestSupplier = suppliers.reduce((best, current) => {
        if (!best || current.priceOpt < best.priceOpt) {
          return current;
        }
        return best;
      }, null as SupplierProduct | null);

      return {
        ...product,
        suppliers,
        bestSupplier,
        bestSupplierName: bestSupplier ? bestSupplier.supplierName : null,
      };
    }
  );

  return extendedProducts;
};

export const writeExtendedProductsToFile = async (
  extendedProducts: ExtendedShopifyProduct[],
  filePath: string
): Promise<void> => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Extended Products');

  worksheet.columns = [
    { header: 'ID', key: 'id', width: 10 },
    { header: 'Title', key: 'title', width: 30 },
    { header: 'Handle', key: 'handle', width: 10 },
    { header: 'Part Number', key: 'part_number', width: 20 },
    { header: 'Hotline Link', key: 'custom_hotline_href', width: 30 },
    { header: 'Product SKU', key: 'custom_product_number_1_sku', width: 30 },
    {
      header: 'Alt Part Number',
      key: 'custom_alternative_part_number',
      width: 30,
    },
    { header: 'Best Supplier', key: 'bestSupplierName', width: 20 },
    { header: 'Opt Price', key: 'bestSupplierOptPrice', width: 15 },
    { header: 'Rtl Price', key: 'bestSupplierRtlPrice', width: 15 },
    { header: 'Stock', key: 'bestSupplierStock', width: 8 },
    { header: 'Warranty', key: 'bestSupplierWarranty', width: 8 },
    { header: 'Hotline Price', key: 'hotlineMinimalPrice', width: 15 },
    { header: 'Min Final Price', key: 'minimalFinalPrice', width: 15 },
    { header: 'Middle Final Price', key: 'middleFinalPrice', width: 15 }, // Renamed column header
    { header: 'Max Final Price', key: 'maximalFinalPrice', width: 15 },
  ];

  extendedProducts.forEach((product) => {
    worksheet.addRow({
      id: product.id,
      title: product.title,
      handle: product.handle,
      part_number: product.part_number,
      custom_hotline_href: product.custom_hotline_href,
      custom_product_number_1_sku: product.custom_product_number_1_sku,
      custom_alternative_part_number: product.custom_alternative_part_number,
      bestSupplierName: product.bestSupplierName,
      bestSupplierOptPrice: product.bestSupplier?.priceOpt,
      bestSupplierRtlPrice: product.bestSupplier?.priceRtl,
      bestSupplierStock: product.bestSupplier?.instock,
      bestSupplierWarranty: product.bestSupplier?.warranty,
      hotlineMinimalPrice: product.hotlineMinimalPrice,
      minimalFinalPrice: product.minimalFinalPrice,
      middleFinalPrice: product.middleFinalPrice, // Renamed property
      maximalFinalPrice: product.maximalFinalPrice,
    });
  });

  await workbook.xlsx.writeFile(filePath);
};

// Helper function to generate a random delay within a range
function makeRandomDelay(min: number, max: number): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  console.log(`Waiting for ${delay / 1000} seconds...`);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

// List of common user agents to rotate through
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPad; CPU OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
];

// Get a random user agent from the list
function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function getMinimalPriceFromHotlineUrl(
  url: string,
  browser: Browser
): Promise<number | null> {
  if (!url) return null;

  console.log(`Starting scrape for URL: ${url}`);
  try {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();

    const userAgent = getRandomUserAgent();
    console.log(`Using user agent: ${userAgent}`);
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

    console.log(`Navigating to page: ${url}`);
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });
    console.log(`Page loaded: ${url}`);

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
    console.log('Performed scroll actions');

    await makeRandomDelay(500, 3000);

    console.log('Extracting prices from page');
    const prices = await page.evaluate((): (number | null)[] => {
      const priceElements = Array.from(
        document.querySelectorAll('.many__price .price__value')
      );
      console.log(`Found ${priceElements.length} price elements`);

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

    console.log(`Extracted prices: ${JSON.stringify(prices)}`);

    await page.close();
    await context.close();
    console.log('Closed browser context');

    if (prices.length > 0) {
      const minPrice = Math.min(...(prices as number[]));
      console.log(`Found minimum price: ${minPrice}`);
      return minPrice;
    }

    console.log('No valid prices found');
    return null;
  } catch (error) {
    console.error(`Error scraping Hotline URL ${url}:`, error);
    return null;
  }
}

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

  // Determine strategy based on supplier if not explicitly specified
  if (!strategy && product.bestSupplierName) {
    // Examples of supplier-based strategy assignment
    if (
      ['Supplier1', 'CheapVendor', 'BudgetDistributor'].includes(
        product.bestSupplierName
      )
    ) {
      strategy = 'aggressive';
    } else if (
      ['PremiumSupplier', 'LuxuryVendor', 'HighEndDistributor'].includes(
        product.bestSupplierName
      )
    ) {
      strategy = 'premium';
    } else {
      strategy = 'middle'; // Default strategy
    }
  } else if (!strategy) {
    strategy = 'middle'; // Default if no supplier or strategy is provided
  }

  if (product.bestSupplier?.priceOpt) {
    const optPrice = product.bestSupplier.priceOpt;

    // Apply different pricing strategies
    switch (strategy) {
      case 'aggressive':
        // Aggressive pricing with smaller markups
        minimalFinalPrice = parseFloat((optPrice * 1.05 + 25).toFixed(2));
        maximalFinalPrice = parseFloat((optPrice * 1.15 + 75).toFixed(2));
        middleFinalPrice = parseFloat((optPrice * 1.1 + 50).toFixed(2));
        break;

      case 'premium':
        // Premium pricing with larger markups
        minimalFinalPrice = parseFloat((optPrice * 1.2 + 100).toFixed(2));
        maximalFinalPrice = parseFloat((optPrice * 1.4 + 200).toFixed(2));
        middleFinalPrice = parseFloat((optPrice * 1.3 + 150).toFixed(2));
        break;

      case 'middle':
      default:
        // Default middle pricing (original strategy)
        minimalFinalPrice = parseFloat((optPrice * 1.1 + 50).toFixed(2));
        maximalFinalPrice = parseFloat((optPrice * 1.25 + 150).toFixed(2));
        middleFinalPrice = parseFloat((optPrice * 1.15 + 100).toFixed(2));
        break;
    }
  }

  return {
    minimalFinalPrice,
    maximalFinalPrice,
    middleFinalPrice,
  };
}

export const postProcessExtendedProducts = async (
  extendedProducts: ExtendedShopifyProduct[]
): Promise<ExtendedShopifyProduct[]> => {
  console.log(
    `Post-processing ${extendedProducts.length} extended products...`
  );

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
  console.log('Browser launched');

  await browser
    .defaultBrowserContext()
    .overridePermissions('https://hotline.ua', []);
  console.log('Browser permissions set');

  try {
    const batchSize = 3;
    const processedProducts: ExtendedShopifyProduct[] = [];

    for (let i = 0; i < extendedProducts.length; i += batchSize) {
      const batch = extendedProducts.slice(i, i + batchSize);
      console.log(
        `Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(
          extendedProducts.length / batchSize
        )}`
      );

      for (const product of batch) {
        let minimalHotlinePrice: number | null = null;
        console.log(`Processing product: ${product.title} (${product.id})`);

        if (product.custom_hotline_href && product.bestSupplier) {
          console.log(
            `Scraping Hotline price for ${product.title}: ${product.custom_hotline_href}`
          );
          minimalHotlinePrice = await getMinimalPriceFromHotlineUrl(
            product.custom_hotline_href,
            browser
          );
          console.log(`Got price for ${product.title}: ${minimalHotlinePrice}`);

          await makeRandomDelay(1000, 5000);
        } else {
          console.log(`No supplier or Hotline URL for: ${product.title}`);
        }

        const productWithHotlinePrice = {
          ...product,
          hotlineMinimalPrice: minimalHotlinePrice,
        };

        // Calculate price points using the pricing function
        const pricePoints = calculatePricePoints(productWithHotlinePrice);

        processedProducts.push({
          ...productWithHotlinePrice,
          ...pricePoints,
        });

        console.log(
          `Processed ${processedProducts.length} of ${
            extendedProducts.length
          } products (${Math.round(
            (processedProducts.length / extendedProducts.length) * 100
          )}%)`
        );
      }
    }

    console.log(
      `Post-processing complete. Processed ${processedProducts.length} products`
    );
    return processedProducts;
  } finally {
    await browser.disconnect();
    console.log('Browser closed after processing all products');
  }
};
