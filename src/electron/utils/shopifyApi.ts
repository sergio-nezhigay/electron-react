import { net } from 'electron';
import {
  PostData,
  ShopifyResponse,
  ShopifyProduct,
  SupplierProduct,
  ExtendedShopifyProduct,
} from '../types';

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
      hasNextPage = false;
      //  hasNextPage = data.data?.products.pageInfo.hasNextPage || false;
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
