import { ipcMain, IpcMainInvokeEvent } from 'electron';
import {
  fetchShopifyProducts,
  asyncFunction2,
  asyncFunction3,
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
      const result1 = await fetchShopifyProducts();
      const result2 = await asyncFunction2(result1);
      const result3 = await asyncFunction3();
      return `Process completed successfully! Result: ${result2}, ${result3}`;
    } catch (error) {
      return `Process failed: ${error.message}`;
    }
  });
};
