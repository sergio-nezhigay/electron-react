import { SupplierProduct } from '../types';
import { loadGoogleSheet } from '../utils';

export const fetchBgdnProducts = async (): Promise<SupplierProduct[]> => {
  try {
    const documentId = process.env.BGDN_GOOGLE_SHEET_DOCUMENT_ID;
    const sheetId = 1963594762;
    const rows = await loadGoogleSheet(documentId, sheetId);

    const minusWords: string[] = [];

    const filtered = rows.filter(
      (row) =>
        row.get('Наявність, шт.') &&
        row.get('Ціна') &&
        !minusWords.some((minusWord) => row.get('Модель').includes(minusWord))
    );

    const out: SupplierProduct[] = filtered.map((row) => ({
      part_number: row.get('Модель').toLowerCase(),
      name: row.get('Модель'),
      warranty: '36',
      instock: Number(row.get('Наявність, шт.')) || 0,
      priceOpt: Number(row.get('Ціна').replace(/[^0-9.-]+/g, '')),
    }));

    if (out.length < 10) {
      throw new Error('Less than 10 products found from Bgdn');
    }

    return out;
  } catch (error) {
    throw new Error(`Failed to fetch products from Bogdan: ${error.message}`);
  }
};
