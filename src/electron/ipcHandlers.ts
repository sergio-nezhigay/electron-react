import { ipcMain, app, BrowserWindow } from 'electron';
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

const sendProgressUpdate = (task: string, progress = 0) => {
  const windows = BrowserWindow.getAllWindows();
  if (windows.length > 0) {
    windows[0].webContents.send('progress-update', { task, progress });
  }
};

export const registerIpcHandlers = (): void => {
  ipcMain.handle('long-process', async (): Promise<string> => {
    try {
      sendProgressUpdate('Fetching products from Shopify', 5);
      const shopifyProducts = await fetchShopifyProducts();

      sendProgressUpdate('Preparing suppliers list', 10);
      const suppliers: Supplier[] = [
        { name: 'ЧЕ', fetchFunction: fetchChergProducts },
        { name: 'МЕ', fetchFunction: fetchMezhigProducts },
        { name: 'РИ', fetchFunction: fetchRizhskaProducts },
        { name: 'ЩУ', fetchFunction: fetchShchusevProducts },
        { name: 'Б', fetchFunction: fetchBrnProducts },
        { name: 'Бо', fetchFunction: fetchBgdnProducts },
        { name: 'ИИ', fetchFunction: fetchEeeProducts },
      ];

      sendProgressUpdate('Fetching products from suppliers', 15);
      const allSupplierProducts = await fetchAllSupplierProducts(suppliers);

      sendProgressUpdate('Merging product data', 40);
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

      sendProgressUpdate('Writing stage 1 data to file', 50);
      await writeExtendedProductsToFile(step1MergedProducts, step1OutputPath);

      sendProgressUpdate('Enriching products with price data', 60);
      const step2EnrichedProducts = await enrichProductsWithPriceData(
        step1MergedProducts
      );

      sendProgressUpdate('Writing stage 2 data to file', 70);
      await writeExtendedProductsToFile(step2EnrichedProducts, step2OutputPath);

      sendProgressUpdate('Converting data to JSONL format', 80);
      const jsonlLines = convertProductsToJsonLines(step2EnrichedProducts);

      const jsonlOutputPath = path.join(downloadDataPath, 'shopify_data.jsonl');
      const joinedJsonLines = jsonlLines.join('\n');

      await writeFileAsync(jsonlOutputPath, joinedJsonLines, 'utf-8');
      console.log(`Successfully wrote JSON lines to ${jsonlOutputPath}`);

      sendProgressUpdate('Starting bulk update to Shopify', 90);
      await startBulkUpdate(jsonlOutputPath);

      sendProgressUpdate('Process completed successfully', 100);
      const message = `Process completed successfully! Result: ${step1MergedProducts.length} products processed. New format prepared in ${jsonlOutputPath}`;
      console.log(message);
      return message;
    } catch (error) {
      sendProgressUpdate(`Error: ${error.message}`, 0);
      const message = error.message;
      console.log(message);
      return `Process failed: ${message}`;
    }
  });
};
