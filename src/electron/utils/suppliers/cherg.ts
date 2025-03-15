import { SupplierProduct } from '../../types';
import { loadGoogleSheet, isPositiveDigit } from '../basicUtils';

export const fetchChergProducts = async (): Promise<SupplierProduct[]> => {
  try {
    const documentId = process.env.CHERG_GOOGLE_SHEET_DOCUMENT_ID;
    const sheetId = 35957627;
    const rows = await loadGoogleSheet(documentId, sheetId);

    const filtered = rows.filter((row) => {
      return row.get('Остаток') && isPositiveDigit(row.get('Остаток'));
    });

    const out: SupplierProduct[] = filtered.map((row) => ({
      part_number: row.get('Модель').toLowerCase(),
      name: row.get('Модель'),
      warranty: '36',
      instock: +row.get('Остаток') || 0,
      priceOpt: +row.get('Цена'),
    }));

    if (out.length < 50) {
      throw new Error('Less than 50 products found from Cherg');
    }

    return out;
  } catch (error) {
    throw new Error(`Failed to fetch products from Cherg: ${error.message}`);
  }
};
