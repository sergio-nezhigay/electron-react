import { ipcMain, app } from 'electron';
import fs from 'fs';
import { promisify } from 'util';
import path from 'path';

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
  convertProductsToJsonLines,
  startBulkUpdate,
} from './utils/index';
import { Supplier } from './types';

const writeFileAsync = promisify(fs.writeFile);

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

      const step1MergedProducts = mergeSupplierData(
        shopifyProducts,
        allSupplierProducts
      );

      logMergedProductsStats(step1MergedProducts);

      const downloadDataPath = app.getPath('downloads');
      const step1OutputPath = path.join(
        downloadDataPath,
        'step1_products.xlsx'
      );
      console.log('🚀 ~ step1OutputPath:', step1OutputPath);
      const step2OutputPath = path.join(
        downloadDataPath,
        'step2_products.xlsx'
      );

      await writeExtendedProductsToFile(step1MergedProducts, step1OutputPath);

      const step2EnrichedProducts = await enrichProductsWithPriceData(
        step1MergedProducts
      );

      await writeExtendedProductsToFile(step2EnrichedProducts, step2OutputPath);

      const jsonlLines = convertProductsToJsonLines(step2EnrichedProducts);

      const jsonlOutputPath = path.join(downloadDataPath, 'shopify_data.jsonl');
      const joinedJsonLines = jsonlLines.join('\n');

      await writeFileAsync(jsonlOutputPath, joinedJsonLines, 'utf-8');
      console.log(`Successfully wrote JSON lines to ${jsonlOutputPath}`);

      await startBulkUpdate(jsonlOutputPath);

      const message = `Process completed successfully! Result: ${step1MergedProducts.length} products processed. New format prepared in ${jsonlOutputPath}`;
      console.log(message);
      return message;
    } catch (error) {
      const message = error.message;
      console.log(message);
      return `Process failed: ${message}`;
    }
  });
};
