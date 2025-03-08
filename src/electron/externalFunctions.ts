import { net } from 'electron';

interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  barcode: string;
  custom_hotline_href: string;
  custom_product_number_1: string;
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
      barcode: edge.node.variants.edges[0]?.node.barcode || '',
      custom_hotline_href: edge.node.custom_hotline_href?.value || '',
      custom_product_number_1: edge.node.custom_product_number_1?.value || '',
      custom_alternative_part_number:
        edge.node.custom_alternative_part_number?.value || '',
    })) || []
  );
};

export const fetchShopifyProducts = async (): Promise<string> => {
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

  return JSON.stringify(allProducts.length);
};

export const asyncFunction2 = async (input: string): Promise<string> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(`Result from asyncFunction2 with input: ${input}`);
    }, 1000);
  });
};
