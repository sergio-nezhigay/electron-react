import { net } from 'electron';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import path from 'path';
import puppeteer from 'puppeteer';

import ExcelJS from 'exceljs';

interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  part_number: string;
  custom_hotline_href: string;
  custom_product_number_1_sku: string;
  custom_alternative_part_number: string;
}

interface ShopifyResponse {
  data?: {
    products: {
      edges: {
        node: {
          id: string;
          title: string;
          handle: string;
          variants: {
            edges: {
              node: {
                barcode: string;
              };
            }[];
          };
          custom_hotline_href: {
            value: string;
          };
          custom_product_number_1: {
            value: string;
          };
          custom_alternative_part_number: {
            value: string;
          };
        };
      }[];
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string;
      };
    };
  };
  errors?: { message: string }[];
}

interface PostData {
  query: string;
  variables: {
    first: number;
    after?: string | null;
  };
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
    data.data?.products.edges.map((edge) => ({
      id: edge.node.id,
      title: edge.node.title,
      handle: edge.node.handle,
      part_number: edge.node.variants.edges[0]?.node.barcode || '',
      custom_hotline_href: edge.node.custom_hotline_href?.value || '',
      custom_product_number_1_sku:
        edge.node.custom_product_number_1?.value || '',
      custom_alternative_part_number:
        edge.node.custom_alternative_part_number?.value || '',
    })) || []
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

interface SupplierProduct {
  part_number: string;
  name: string;
  warranty: string;
  instock: number;
  priceOpt: number;
  supplierName?: string;
}

export interface Supplier {
  name: string;
  fetchFunction: () => Promise<SupplierProduct[]>;
}

export const fetchChergProducts = async (): Promise<SupplierProduct[]> => {
  try {
    const serviceAccountAuth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const documentId = process.env.CHERG_GOOGLE_SHEET_DOCUMENT_ID;
    const doc = new GoogleSpreadsheet(documentId, serviceAccountAuth);
    await doc.loadInfo();
    const sheet = doc.sheetsById[35957627];
    const rows = await sheet.getRows();

    const filtered = rows.filter((row) => {
      return row.get('Остаток') && isPositiveDigit(row.get('Остаток'));
    });

    const out: SupplierProduct[] = filtered.map((row) => ({
      part_number: row.get('Модель').toLowerCase(),
      name: row.get('Модель'),
      warranty: '36',
      instock: +row.get('Остаток') || 0,
      priceOpt: +row.get('Цена'),
    }));

    if (out.length < 50) {
      throw new Error('Less than 50 products found from Cherg');
    }

    return out;
  } catch (error) {
    throw new Error(`Failed to fetch products from Cherg: ${error.message}`);
  }
};

export const fetchMezhigProducts = async (): Promise<SupplierProduct[]> => {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(
      path.join('/prices/межигорская', 'mezhigorska.xlsx')
    );
    const worksheet = workbook.worksheets[0];
    const data: Record<string, unknown>[] = [];

    worksheet.eachRow((row: ExcelJS.Row, rowNumber: number) => {
      if (rowNumber > 1) {
        const rowData: Record<string, unknown> = {};
        row.eachCell((cell: ExcelJS.Cell, colNumber: number) => {
          const header = worksheet.getRow(1).getCell(colNumber).value as string;
          rowData[header] = cell.value;
        });
        data.push(rowData);
      }
    });

    const filtered = data.filter((product) => (product.priceOpt as number) > 0);
    const result: SupplierProduct[] = filtered.map((product) => ({
      part_number: (product.part_number as string).toLowerCase(),
      name: product.name as string,
      warranty: product.warranty as string,
      instock: product.instock as number,
      priceOpt: product.priceOpt as number,
    }));

    if (result.length < 20) {
      throw new Error('Less than 20 products found from Mezhig');
    }

    return result;
  } catch (err) {
    throw new Error(`Failed to fetch products from Mezhig: ${err.message}`);
  }
};

const fetchProductsFromPage = async (
  url: string
): Promise<SupplierProduct[]> => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const posts = await page.$$eval('.content', (elements: HTMLElement[]) => {
      return elements
        .map((post) => {
          const text = post.innerText;

          const filteredLines = text
            .split('\n')
            .filter((line: string) => line.includes('DDR'))
            .map((line: string) => {
              const quantityMatch = line.match(/(\d+)\s*шт/);
              const quantity = quantityMatch ? quantityMatch[1] : '1';

              const priceMatch = line.match(/(\d+)\s*грн/);
              const price = priceMatch ? priceMatch[1] : '';

              const regexp =
                /[A-Z0-9А-Я]{6,}-[A-Z0-9]{2,}|[0-9]{2,}.[A-Z0-9]{5,}.[A-Z0-9]{5,}|[A-Z0-9А-Я]{6,}\/[A-Z0-9]{1,}|[A-Z0-9]{6,}|[A-Z0-9А-Я]{3}-[A-Z0-9]{3,}\/[A-Z0-9]{2}/g;
              const partNumberMatch = line.match(regexp);
              const partNumber = partNumberMatch ? partNumberMatch[0] : '';

              return {
                part_number: partNumber,
                name: line.trim(),
                warranty: '24',
                instock: parseInt(quantity, 10),
                priceOpt: parseInt(price, 10),
              };
            });

          return filteredLines;
        })
        .flat();
    });

    return posts;
  } catch (error) {
    throw new Error(`Failed to fetch products from ${url}: ${error.message}`);
  } finally {
    await browser.disconnect();
  }
};

export const fetchRizhskaProducts = async (): Promise<SupplierProduct[]> => {
  const urls = [process.env.RIZHKA_URL_1, process.env.RIZHKA_URL_2];

  const allProducts: SupplierProduct[] = [];

  for (const url of urls) {
    const products = await fetchProductsFromPage(url);
    allProducts.push(...products);
  }

  return allProducts;
};

export const fetchShchusevProducts = async (): Promise<SupplierProduct[]> => {
  console.log('Fetching CSV data...');

  try {
    const response = await net.fetch(process.env.SCHUSEV_URL);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch CSV: ${response.status} ${response.statusText}`
      );
    }

    const csvString = await response.text();

    const lines = csvString
      .split('\n')
      .map((line) => line.split('\t'))
      .filter((record) => record[4] && parseInt(record[4]) > 0);

    const products = lines.map(
      (element): SupplierProduct => ({
        part_number: element[0].toLowerCase(),
        name: element[1],
        warranty: '12',
        instock: parseInt(element[4]),
        priceOpt: parseFloat(element[3]),
      })
    );

    if (products.length === 0) {
      throw new Error('No products found from Shchusev supplier');
    }

    return products;
  } catch (error) {
    console.error('Error processing Shchusev CSV data:', error);
    throw new Error(`Failed to fetch products from Shchusev: ${error.message}`);
  }
};

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

const isPositiveDigit = (value: string): boolean => {
  return /^\d+$/.test(value);
};

interface ExtendedShopifyProduct extends ShopifyProduct {
  suppliers: SupplierProduct[];
  bestSupplier: SupplierProduct | null;
  bestSupplierName: string | null;
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
    { header: 'ID', key: 'id', width: 20 },
    { header: 'Title', key: 'title', width: 30 },
    { header: 'Handle', key: 'handle', width: 30 },
    { header: 'Part Number', key: 'part_number', width: 20 },
    { header: 'Custom Hotline Href', key: 'custom_hotline_href', width: 30 },
    {
      header: 'Custom Product Number 1 SKU',
      key: 'custom_product_number_1_sku',
      width: 30,
    },
    {
      header: 'Custom Alternative Part Number',
      key: 'custom_alternative_part_number',
      width: 30,
    },
    { header: 'Best Supplier Name', key: 'bestSupplierName', width: 20 },
    { header: 'Best Supplier Price', key: 'bestSupplierPrice', width: 20 },
    { header: 'Best Supplier Stock', key: 'bestSupplierStock', width: 20 },
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
      bestSupplierPrice: product.bestSupplier?.priceOpt,
      bestSupplierStock: product.bestSupplier?.instock,
    });
  });

  await workbook.xlsx.writeFile(filePath);
};
