import path from 'path';
import { ipcMain } from 'electron';

import {
  fetchShopifyProducts,
  fetchChergProducts,
  fetchMezhigProducts,
  fetchRizhskaProducts,
  fetchShchusevProducts,
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
        { name: 'ЧЕ1', fetchFunction: fetchChergProducts },
        { name: 'МЕ2', fetchFunction: fetchMezhigProducts },
        { name: 'РИ3', fetchFunction: fetchRizhskaProducts },
        { name: 'ЩУ4', fetchFunction: fetchShchusevProducts },
        //{ name: 'Б', fetchFunction: fetchBrnProducts },
        { name: 'Бо5', fetchFunction: fetchBgdnProducts },
        { name: 'ИИ6', fetchFunction: fetchEeeProducts },
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
