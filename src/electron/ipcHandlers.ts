import { ipcMain, IpcMainInvokeEvent } from 'electron';
import {
  fetchShopifyProducts,
  fetchAllSupplierProducts,
  mergeSupplierData,
  writeExtendedProductsToFile,
} from './utils';
import {
  fetchChergProducts,
  fetchMezhigProducts,
  fetchRizhskaProducts,
  fetchShchusevProducts,
  fetchBrnProducts,
  fetchBgdnProducts,
  fetchEeeProducts,
} from './suppliers';
import { ExtendedShopifyProduct, Supplier } from './types';
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
        { name: 'Shchusev', fetchFunction: fetchShchusevProducts },
        { name: 'Brn', fetchFunction: fetchBrnProducts },
        { name: 'Bgdn', fetchFunction: fetchBgdnProducts },
        { name: 'Eee', fetchFunction: fetchEeeProducts },
      ];

      const allSupplierProducts = await fetchAllSupplierProducts(suppliers);

      const extendedProducts = mergeSupplierData(
        shopifyProducts,
        allSupplierProducts
      );

      logMergedProductsStats(extendedProducts);

      const filePath = path.join(__dirname, 'extendedProducts.xlsx');
      await writeExtendedProductsToFile(extendedProducts, filePath);

      return `Process completed successfully! Result: ${extendedProducts.length} products processed. File saved at ${filePath}`;
    } catch (error) {
      return `Process failed: ${error.message}`;
    }
  });
};

function logMergedProductsStats(
  extendedProducts: ExtendedShopifyProduct[]
): void {
  const supplierStats: Record<string, number> = {};

  extendedProducts.forEach((product) => {
    const supplierName = product.bestSupplierName;
    if (!supplierStats[supplierName]) {
      supplierStats[supplierName] = 0;
    }

    supplierStats[supplierName] += 1;
  });

  console.log(`Merged Products: ${extendedProducts.length} total products`);
  Object.entries(supplierStats).forEach(([supplierName, count]) => {
    console.log(`${supplierName} : ${count}`);
  });
}
