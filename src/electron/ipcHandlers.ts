import { ipcMain, IpcMainInvokeEvent } from 'electron';
import {
  fetchShopifyProducts,
  fetchChergProducts,
  fetchMezhigProducts,
} from './externalFunctions';

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
      return `Process completed successfully! Result: ${shopifyProducts.length}, ${supplier1Products.length}, ${supplier2Products.length}`;
    } catch (error) {
      return `Process failed: ${error.message}`;
    }
  });
};
