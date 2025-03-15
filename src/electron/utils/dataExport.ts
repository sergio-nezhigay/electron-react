import ExcelJS from 'exceljs';

import { ExtendedShopifyProduct } from '../types';

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
    { header: 'Middle Final Price', key: 'middleFinalPrice', width: 15 },
    { header: 'Max Final Price', key: 'maximalFinalPrice', width: 15 },
    { header: 'Final Price', key: 'finalPrice', width: 15 },
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
      middleFinalPrice: product.middleFinalPrice,
      maximalFinalPrice: product.maximalFinalPrice,
      finalPrice: product.finalPrice,
    });
  });

  await workbook.xlsx.writeFile(filePath);
};
