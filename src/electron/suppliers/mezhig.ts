import { SupplierProduct } from '../types';
import ExcelJS from 'exceljs';
import path from 'path';

export const fetchMezhigProducts = async (): Promise<SupplierProduct[]> => {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(
      path.join('/prices/межигорская', 'mezhigorska.xlsx')
    );
    const worksheet = workbook.worksheets[0];
    const data: Record<string, unknown>[] = [];

    worksheet.eachRow((row: ExcelJS.Row, rowNumber: number) => {
      if (rowNumber > 1) {
        const rowData: Record<string, unknown> = {};
        row.eachCell((cell: ExcelJS.Cell, colNumber: number) => {
          const header = worksheet.getRow(1).getCell(colNumber).value as string;
          rowData[header] = cell.value;
        });
        data.push(rowData);
      }
    });

    const filtered = data.filter((product) => (product.priceOpt as number) > 0);
    const result: SupplierProduct[] = filtered.map((product) => ({
      part_number: (product.part_number as string).toLowerCase(),
      name: product.name as string,
      warranty: product.warranty as string,
      instock: product.instock as number,
      priceOpt: product.priceOpt as number,
    }));

    if (result.length < 20) {
      throw new Error('Less than 20 products found from Mezhig');
    }

    return result;
  } catch (err) {
    throw new Error(`Failed to fetch products from Mezhig: ${err.message}`);
  }
};
