import { SupplierProduct } from '../types';
import { net } from 'electron';

export const fetchShchusevProducts = async (): Promise<SupplierProduct[]> => {
  try {
    const response = await net.fetch(process.env.SCHUSEV_URL);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch CSV: ${response.status} ${response.statusText}`
      );
    }

    const csvString = await response.text();

    const lines = csvString
      .split('\n')
      .map((line) => line.split('\t'))
      .filter((record) => record[4] && parseInt(record[4]) > 0);

    const products = lines.map(
      (element): SupplierProduct => ({
        part_number: element[0].toLowerCase(),
        name: element[1],
        warranty: '12',
        instock: parseInt(element[4]),
        priceOpt: parseFloat(element[3]),
      })
    );

    if (products.length === 0) {
      throw new Error('No products found from Shchusev supplier');
    }

    return products;
  } catch (error) {
    console.error('Error processing Shchusev CSV data:', error);
    throw new Error(`Failed to fetch products from Shchusev: ${error.message}`);
  }
};
