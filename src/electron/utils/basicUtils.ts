import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { ExtendedShopifyProduct, Supplier, SupplierProduct } from '../types';

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

export function makeRandomDelay(min: number, max: number): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPad; CPU OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
];

export function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export function logMergedProductsStats(
  extendedProducts: ExtendedShopifyProduct[]
): void {
  const supplierStats: Record<string, number> = {};

  extendedProducts.forEach((product) => {
    const supplierName = product.bestSupplierName;
    if (!supplierStats[supplierName]) {
      supplierStats[supplierName] = 0;
    }

    supplierStats[supplierName] += 1;
  });

  console.log(`Merged Products: ${extendedProducts.length} total products`);
  Object.entries(supplierStats).forEach(([supplierName, count]) => {
    console.log(`${supplierName} : ${count}`);
  });
}
