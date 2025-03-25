import { net } from 'electron';
import { PostData, ShopifyResponse, ShopifyProduct } from '../types';
import path from 'path';
import fs from 'fs';
import { extractProducts } from './basicUtils';

export async function shopifyGraphQLRequest({
  query,
  variables = {},
}: PostData) {
  const url = `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/graphql.json`;
  try {
    const response = await net.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
      },
      body: JSON.stringify({ query, variables }),
    });

    const data = await response.json();
    if (data.errors && data.errors.length > 0) {
      throw new Error(
        data.errors
          .map((error: { message: string }) => error.message)
          .join(', ')
      );
    }

    return data;
  } catch (error) {
    console.error('Shopify API Error:', error.response?.data || error.message);
    throw error;
  }
}

export const fetchShopifyProducts = async (): Promise<ShopifyProduct[]> => {
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
              custom_competitor_minimum_price: metafield(namespace: "custom", key: "competitor_minimum_price") {
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

    try {
      const data: ShopifyResponse = await shopifyGraphQLRequest({
        query,
        variables: {
          first: 250,
          after: endCursor,
        },
      });
      allProducts.push(...extractProducts(data));
      console.log(`Fetched ${allProducts.length} products from Shopify`);
      // hasNextPage = false;
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

async function createStagedUpload({ filename }: { filename: string }) {
  const query = `mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url parameters { name value } }
        userErrors { field message }
      }
    }`;

  const variables = {
    input: [
      {
        filename: `${filename}.jsonl`,
        mimeType: 'text/jsonl',
        resource: 'BULK_MUTATION_VARIABLES',
        httpMethod: 'POST',
      },
    ],
  };

  const response = await shopifyGraphQLRequest({ query, variables });
  const { stagedUploadsCreate } = response.data || {};

  if (stagedUploadsCreate?.userErrors?.length) {
    throw new Error(JSON.stringify(stagedUploadsCreate.userErrors));
  }

  const target = stagedUploadsCreate?.stagedTargets?.[0];
  if (!target) throw new Error('No staged upload target returned');

  return { uploadUrl: target.url, parameters: target.parameters };
}

interface UploadParameter {
  name: string;
  value: string;
}

export async function uploadFile(filePath: string) {
  const { uploadUrl, parameters } = await createStagedUpload({
    filename: filePath,
  });

  const formData = new FormData();
  parameters.forEach(({ name, value }: UploadParameter) =>
    formData.append(name, value)
  );

  const fileData = fs.readFileSync(filePath);
  const file = new Blob([fileData]);
  formData.append('file', file, path.basename(filePath));

  const response = await net.fetch(uploadUrl, {
    method: 'POST',
    body: formData,
  });

  const status = response.status;
  const uploadPath = parameters.find(
    (p: UploadParameter) => p.name === 'key'
  )?.value;
  console.log('Upload Status:', status, '\nStaged Upload Path:', uploadPath);

  return uploadPath;
}

export async function startBulkUpdate(filePath: string) {
  const stagedUploadPath = await uploadFile(filePath);

  const query = `mutation {
    bulkOperationRunMutation(
      mutation: """
      mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
          product { id }
          userErrors { field message }
        }
      }
      """
      stagedUploadPath: "${stagedUploadPath}"
    ) {
      bulkOperation { id status }
      userErrors { field message }
    }
  }`;

  try {
    const response = await shopifyGraphQLRequest({ query });

    const { bulkOperationRunMutation } = response.data || {};

    if (bulkOperationRunMutation?.userErrors?.length) {
      console.error(
        'Bulk operation user errors:',
        JSON.stringify(bulkOperationRunMutation.userErrors, null, 2)
      );
      throw new Error(JSON.stringify(bulkOperationRunMutation.userErrors));
    }

    const bulkOperationId = bulkOperationRunMutation?.bulkOperation?.id;
    if (!bulkOperationId) {
      console.error(
        'No bulk operation ID returned. Full response:',
        JSON.stringify(response, null, 2)
      );
      throw new Error('No bulk operation ID returned');
    }

    const result = await checkBulkStatus(bulkOperationId);

    if (!result) {
      console.error(
        'Bulk operation failed or timed out. Please check the logs.'
      );
    }

    return bulkOperationId;
  } catch (error) {
    console.error('Error during bulk update operation:', error);
    console.error('Error details:', error.message);
    throw error;
  }
}

async function checkBulkStatus(bulkOperationId: string) {
  const query = `query {
      node(id: "${bulkOperationId}") {
        ... on BulkOperation {
          id status errorCode
          objectCount fileSize url
        }
      }
    }`;

  const MAX_ATTEMPTS = 300;
  const POLLING_INTERVAL = 6000;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await shopifyGraphQLRequest({ query });
    const operation = response.data?.node;

    console.log(`Status (${attempt}/${MAX_ATTEMPTS}):`, operation?.status);

    if (operation?.status === 'COMPLETED') {
      console.log('Success:', {
        objectCount: operation.objectCount,
        fileSize: operation.fileSize,
        url: operation.url,
      });
      return true;
    }

    if (operation?.status === 'FAILED') {
      console.error('Failed:', operation.errorCode);
      return false;
    }

    await new Promise((resolve) => setTimeout(resolve, POLLING_INTERVAL));
  }

  console.error('Operation timed out');
  return false;
}
