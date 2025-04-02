import { ExtendedShopifyProduct } from '../types';
import { enrichProductsWithPriceData } from './hotlineService';

export function calculatePricePoints(product: ExtendedShopifyProduct): {
  minimalFinalPrice: number | null;
  maximalFinalPrice: number | null;
  middleFinalPrice: number | null;
} {
  let minimalFinalPrice: number | null = null;
  let maximalFinalPrice: number | null = null;
  let middleFinalPrice: number | null = null;
  let strategy: 'aggressive' | 'premium' | 'middle' = 'middle';

  if (product.bestSupplier?.supplierName) {
    if (
      ['ЧЕ', 'Б', 'РИ', 'BudgetDistributor'].includes(
        product.bestSupplier?.supplierName
      )
    ) {
      strategy = 'aggressive';
    } else if (['ИИ'].includes(product.bestSupplier?.supplierName)) {
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
      product.bestSupplier?.supplierName || ''
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
              product.bestSupplier?.supplierName || ''
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
            value: String(product.bestSupplier?.warranty || ''),
            type: 'single_line_text_field',
          },
        ],
      },
    };
  });

  const lines = transformedData.map((obj) => JSON.stringify(obj));

  return lines;
};

export { enrichProductsWithPriceData };
