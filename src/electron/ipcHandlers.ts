import path from 'path';
import { ipcMain } from 'electron';

import {
  fetchShopifyProducts,
  fetchChergProducts,
  fetchMezhigProducts,
  fetchRizhskaProducts,
  fetchShchusevProducts,
  fetchBrnProducts,
  fetchBgdnProducts,
  fetchEeeProducts,
  fetchAllSupplierProducts,
  mergeSupplierData,
  logMergedProductsStats,
  writeExtendedProductsToFile,
  enrichProductsWithPriceData,
} from './utils';
import { Supplier } from './types';

export const registerIpcHandlers = (): void => {
  ipcMain.handle('long-process', async (): Promise<string> => {
    try {
      const shopifyProducts = await fetchShopifyProducts();

      const suppliers: Supplier[] = [
        { name: 'ЧЕ', fetchFunction: fetchChergProducts },
        { name: 'МЕ', fetchFunction: fetchMezhigProducts },
        { name: 'РИ', fetchFunction: fetchRizhskaProducts },
        { name: 'ЩУ', fetchFunction: fetchShchusevProducts },
        { name: 'Б', fetchFunction: fetchBrnProducts },
        { name: 'Бо', fetchFunction: fetchBgdnProducts },
        { name: 'ИИ', fetchFunction: fetchEeeProducts },
      ];

      const allSupplierProducts = await fetchAllSupplierProducts(suppliers);

      const extendedProducts = mergeSupplierData(
        shopifyProducts,
        allSupplierProducts
      );

      logMergedProductsStats(extendedProducts);

      const filePath = path.join(__dirname, 'extendedProducts.xlsx');
      await writeExtendedProductsToFile(extendedProducts, filePath);

      const processedProducts = await enrichProductsWithPriceData(
        extendedProducts
      );

      const processedFilePath = path.join(__dirname, 'processedProducts.xlsx');
      await writeExtendedProductsToFile(processedProducts, processedFilePath);

      const message = `Process completed successfully! Result: ${extendedProducts.length} products processed. Files saved at ${filePath} and ${processedFilePath}`;
      console.log(message);
      return message;
    } catch (error) {
      return `Process failed: ${error.message}`;
    }
  });
};
