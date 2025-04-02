import { net } from 'electron';
import fs from 'fs';
import ExcelJS from 'exceljs';

import { SupplierProduct } from '../../types';

export const fetchBrnProducts = async (): Promise<SupplierProduct[]> => {
  try {
    const filename = process.env.BRN_SAVE_PATH;
    const authUrl = process.env.BRN_AUTH_URL;
    const user = process.env.BRN_USER;
    const hashedPassword = process.env.BRN_PASSWORD;
    const priceUrlBase = process.env.BRN_PRICE_URL;

    const allowedCategories = [
      'Накопители SSD',
      'Накопители HDD - 3.5", 2.5", внутренние',
      'Накопители HDD - 3.5", 2.5", внешние',
      'Модули памяти',
      'Модули памяти - имп.',
      'Аксессуары',
      'Аксессуары к ноутбукам, КПК, телефонам',
      'Аксессуары к мониторам',
      'Аксессуары имп.',
      'Блоки питания внешние',
      'Блоки питания внешние имп.',
      'Манипуляторы',
      'Манипуляторы имп.',
      'Проекторы и презентационное оборудование',
      'Сетевое оборудование пасивное',
      'Сетевое оборудование пасивное имп.',
      'Сумки для ноутбуков и фото-техники',
      'Сумки для ноутбуков и фото-техники имп.',
      'Кронштейны',
      'Канцтовары',
      'Наушники, гарнитуры, микрофоны',
      'Наушники, гарнитуры, микрофоны  имп.',
      'Медиаплееры',
      'Флеш-накопители',
      'Фильтры питания',
      'Расходные материалы совместимые',
      'Системы охлаждения',
      'Системы охлаждения имп.',
      'LED-лампы',
      'Электроинструмент',
    ];

    const disallowedVendors = ['Defender', 'Tolsen', 'Werk'];

    const authResponse = await net.fetch(authUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        login: user,
        password: hashedPassword,
      }).toString(),
    });

    if (!authResponse.ok) {
      throw new Error(
        `Auth request failed: ${authResponse.status} ${authResponse.statusText}`
      );
    }

    const authData = await authResponse.json();
    const authToken = authData.result;

    const priceUrl = `${priceUrlBase}${authToken}?lang=ru&full=1`;
    const priceResponse = await net.fetch(priceUrl);

    if (!priceResponse.ok) {
      throw new Error(
        `Price request failed: ${priceResponse.status} ${priceResponse.statusText}`
      );
    }

    const priceData = await priceResponse.json();

    const fileResponse = await net.fetch(priceData.url);
    if (!fileResponse.ok) {
      throw new Error(
        `File download failed: ${fileResponse.status} ${fileResponse.statusText}`
      );
    }

    const buffer = await fileResponse.arrayBuffer();
    fs.writeFileSync(filename, Buffer.from(buffer));

    const products: SupplierProduct[] = [];

    // Process the Excel file in smaller chunks to reduce memory usage
    // Define stream options but do not use variables that aren't needed
    const workbook = new ExcelJS.Workbook();
    const RATE = Number(process.env.EXCHANGE_RATE);

    // Stream approach with row by row processing
    const headers: { [key: string]: number } = {}; // Changed to const
    let rowCount = 0;

    await new Promise<void>((resolve, reject) => {
      const stream = fs.createReadStream(filename);

      workbook.xlsx
        .read(stream)
        .then(() => {
          const worksheet = workbook.getWorksheet(1);

          // Process headers (first row)
          const headerRow = worksheet.getRow(1);
          headerRow.eachCell((cell: ExcelJS.Cell, colNumber: number) => {
            headers[cell.value as string] = colNumber;
          });

          // Process data rows
          worksheet.eachRow(
            { includeEmpty: false },
            (row: ExcelJS.Row, rowNumber: number) => {
              if (rowNumber === 1) {
                // Skip header row
                return;
              }

              const group = row.getCell(headers['Group']).value as string;
              const vendor = row.getCell(headers['Vendor']).value as string;

              // Early filtering to avoid unnecessary processing
              if (
                allowedCategories.includes(group) &&
                !disallowedVendors.includes(vendor)
              ) {
                const article = row.getCell(headers['Article']).value as string;
                const name = row.getCell(headers['Name']).value as string;
                const warranty = row.getCell(headers['Warranty'])
                  .value as string;
                const priceUSD = row.getCell(headers['PriceUSD'])
                  .value as number;
                const retailPrice = row.getCell(headers['RetailPrice'])
                  .value as number;

                const minRecommendedPrice = Math.round(
                  priceUSD * RATE * 1.08 + 30
                );

                products.push({
                  part_number: article.toLowerCase(),
                  name: name,
                  warranty: warranty,
                  instock: 10,
                  priceOpt: priceUSD * RATE,
                  priceRtl: retailPrice > minRecommendedPrice ? retailPrice : 0,
                });
              }
              rowCount++;
            }
          );

          resolve();
        })
        .catch((error: Error) => {
          reject(error);
        });
    });

    console.log(
      `Processed ${rowCount} rows from BRN supplier, filtered to ${products.length} products`
    );

    if (products.length < 100) {
      throw new Error(
        `Too few products found from Brn supplier: ${products.length}`
      );
    }

    return products;
  } catch (error) {
    throw new Error(`Failed to fetch products from Brn: ${error.message}`);
  }
};
