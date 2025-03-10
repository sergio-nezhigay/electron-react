import { ipcMain, IpcMainInvokeEvent } from 'electron';
import {
  fetchShopifyProducts,
  fetchChergProducts,
  fetchMezhigProducts,
  fetchRizhskaProducts,
  mergeSupplierData,
  writeExtendedProductsToFile,
  fetchAllSupplierProducts,
  Supplier,
} from './externalFunctions';
import path from 'path';

export const registerIpcHandlers = (): void => {
  ipcMain.handle(
    'say-hello',
    async (event: IpcMainInvokeEvent, name: string): Promise<string> => {
      return `Hello, ${name}!`;
    }
  );

  ipcMain.handle('long-process', async (): Promise<string> => {
    try {
      const shopifyProducts = await fetchShopifyProducts();

      const suppliers: Supplier[] = [
        { name: 'Cherg', fetchFunction: fetchChergProducts },
        { name: 'Mezhig', fetchFunction: fetchMezhigProducts },
        { name: 'Rizhska', fetchFunction: fetchRizhskaProducts },
        // Add more suppliers here as needed
      ];

      const allSupplierProducts = await fetchAllSupplierProducts(suppliers);

      const extendedProducts = mergeSupplierData(
        shopifyProducts,
        allSupplierProducts
      );

      const filePath = path.join(__dirname, 'extendedProducts.xlsx');
      await writeExtendedProductsToFile(extendedProducts, filePath);

      return `Process completed successfully! Result: ${extendedProducts.length} products processed. File saved at ${filePath}`;
    } catch (error) {
      return `Process failed: ${error.message}`;
    }
  });
};
