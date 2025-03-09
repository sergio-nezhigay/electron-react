import { ipcMain, IpcMainInvokeEvent } from 'electron';
import {
  fetchShopifyProducts,
  fetchChergProducts,
  fetchMezhigProducts,
  mergeSupplierData,
  writeExtendedProductsToFile,
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
      const supplier1Products = await fetchChergProducts();
      const supplier2Products = await fetchMezhigProducts();

      const extendedProducts = mergeSupplierData(
        shopifyProducts,
        supplier1Products,
        supplier2Products
      );

      const filePath = path.join(__dirname, 'extendedProducts.xlsx');
      await writeExtendedProductsToFile(extendedProducts, filePath);

      return `Process completed successfully! Result: ${extendedProducts.length} products processed. File saved at ${filePath}`;
    } catch (error) {
      return `Process failed: ${error.message}`;
    }
  });
};
