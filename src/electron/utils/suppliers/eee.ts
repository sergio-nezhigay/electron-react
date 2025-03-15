import ExcelJS from 'exceljs';
import path from 'path';
import xml2js from 'xml2js';
import { net } from 'electron';

import { SupplierProduct, Offer } from '../../types';

async function readXML(url: string): Promise<SupplierProduct[]> {
  try {
    const response = await net.fetch(url);
    if (response.status !== 200) {
      throw new Error(
        `Failed to fetch XML: ${response.status} ${response.statusText}`
      );
    }

    const xmlContent = await response.text();
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(xmlContent);
    const offers: Offer[] =
      result.yml_catalog?.shop?.[0]?.offers?.[0]?.offer || [];

    const mappedProducts: SupplierProduct[] = offers
      .map((offer) => ({
        part_number: offer.vendorCode?.[0] || '',
        name: offer.name?.[0] || '',
        warranty: '12',
        instock: offer.$.available === 'true' ? 5 : 0,
        priceOpt: offer.price?.[0] ? Number(offer.price[0]) : 0,
      }))
      .filter((product) => product.part_number && product.priceOpt > 0);

    return mappedProducts;
  } catch (error) {
    console.error(`Error in readXML: ${error.message}`);
    throw new Error(`Failed to read XML: ${error.message}`);
  }
}

export const fetchEeeProducts = async (): Promise<SupplierProduct[]> => {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(path.join('/prices/eee', 'eee.xlsx'));
    const worksheet = workbook.worksheets[0];

    const excelData: Record<string, unknown>[] = [];
    worksheet.eachRow((row: ExcelJS.Row, rowNumber: number) => {
      if (rowNumber > 1) {
        const rowData: Record<string, unknown> = {};
        row.eachCell((cell: ExcelJS.Cell, colNumber: number) => {
          const header = worksheet.getRow(1).getCell(colNumber).value as string;
          rowData[header] = cell.value;
        });
        excelData.push(rowData);
      }
    });

    const filteredExcelData = excelData
      .filter((product) => (product.priceRtl as number) > 0)
      .map((product) => ({
        part_number: String(product.part_number || '').toLowerCase(),
        priceOpt: product.priceOpt as number,
        priceRtl: product.priceRtl as number,
      }));

    const xmlProducts = await readXML(process.env.EEE_XML_URL);

    const result: SupplierProduct[] = xmlProducts.map((xmlProduct) => {
      const matchingExcelProduct = filteredExcelData.find(
        (excelProduct) =>
          excelProduct.part_number.toLowerCase() ===
          xmlProduct.part_number.toLowerCase()
      );

      return {
        part_number: xmlProduct.part_number,
        name: xmlProduct.name,
        warranty: xmlProduct.warranty,
        instock: xmlProduct.instock,
        priceOpt: matchingExcelProduct
          ? Number(matchingExcelProduct.priceOpt.toFixed(0))
          : Number((xmlProduct.priceOpt - 30).toFixed(0)),
        priceRtl: matchingExcelProduct
          ? Number(matchingExcelProduct.priceRtl.toFixed(0))
          : Number(((xmlProduct.priceOpt + 20) * 1.03).toFixed(0)),
      };
    });

    if (result.length < 500) {
      throw new Error(
        'Less than 500 products found from Eee supplier after fallback'
      );
    }

    return result;
  } catch (error) {
    console.error('Error in fetchEeeProducts:', error);
    throw new Error(`Failed to fetch products from Eee: ${error.message}`);
  }
};
