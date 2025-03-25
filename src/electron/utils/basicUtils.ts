import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import {
  Supplier,
  SupplierProduct,
  ExtendedShopifyProduct,
  ShopifyProduct,
  ShopifyResponse,
} from '../types';
import {
  fetchChergProducts,
  fetchMezhigProducts,
  fetchRizhskaProducts,
  fetchShchusevProducts,
  fetchBrnProducts,
  fetchBgdnProducts,
  fetchEeeProducts,
} from './suppliers';

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

export const fetchAllSupplierProducts = async (): Promise<
  SupplierProduct[]
> => {
  const suppliers: Supplier[] = [
    {
      name: 'ЧЕ',
      fetchFunction: fetchChergProducts,
      priceNormalizationFactor: 1,
    },
    {
      name: 'МЕ',
      fetchFunction: fetchMezhigProducts,
      priceNormalizationFactor: 1.02,
    },
    {
      name: 'РИ',
      fetchFunction: fetchRizhskaProducts,
      priceNormalizationFactor: 1.2,
    },
    {
      name: 'ЩУ',
      fetchFunction: fetchShchusevProducts,
      priceNormalizationFactor: 1,
    },
    {
      name: 'Б',
      fetchFunction: fetchBrnProducts,
      priceNormalizationFactor: 1,
    },
    {
      name: 'Бо',
      fetchFunction: fetchBgdnProducts,
      priceNormalizationFactor: 1,
    },
    {
      name: 'ИИ',
      fetchFunction: fetchEeeProducts,
      priceNormalizationFactor: 1,
    },
  ];

  const allSupplierProducts: SupplierProduct[] = [];

  for (const supplier of suppliers) {
    try {
      const products = await supplier.fetchFunction();

      // Use your existing enhancedLog function for better Cyrillic display
      enhancedLog(`Fetched ${products.length} products from ${supplier.name}`);

      allSupplierProducts.push(
        ...products.map((product) => ({
          ...product,
          supplierName: supplier.name,
          normalizedPrice:
            product.priceOpt * (supplier.priceNormalizationFactor || 1),
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

// Helper to properly display supplier names with Cyrillic characters
export const formatSupplierName = (name: string): string => {
  // Ensure the string is properly encoded as UTF-8
  return Buffer.from(name, 'utf8').toString('utf8');
};

// Enhance console.log for better Cyrillic display
export const enhancedLog = (message: string, data?: unknown): void => {
  if (typeof data === 'string') {
    data = formatSupplierName(data);
  }
  console.log(formatSupplierName(message), data || '');
};

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
        if (!best || current.normalizedPrice < best.normalizedPrice) {
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

export const extractProducts = (data: ShopifyResponse): ShopifyProduct[] => {
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
        custom_competitor_minimum_price:
          edge.node.custom_competitor_minimum_price?.value || '',
      })
    ) || []
  );
};
