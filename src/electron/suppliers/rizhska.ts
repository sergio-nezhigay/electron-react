import { SupplierProduct } from '../types';
import puppeteer from 'puppeteer';

const fetchProductsFromPage = async (
  url: string
): Promise<SupplierProduct[]> => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const posts = await page.$$eval('.content', (elements: HTMLElement[]) => {
      return elements
        .map((post) => {
          const text = post.innerText;

          const filteredLines = text
            .split('\n')
            .filter((line: string) => line.includes('DDR'))
            .map((line: string) => {
              const quantityMatch = line.match(/(\d+)\s*шт/);
              const quantity = quantityMatch ? quantityMatch[1] : '1';

              const priceMatch = line.match(/(\d+)\s*грн/);
              const price = priceMatch ? priceMatch[1] : '';

              const regexp =
                /[A-Z0-9А-Я]{6,}-[A-Z0-9]{2,}|[0-9]{2,}.[A-Z0-9]{5,}.[A-Z0-9]{5,}|[A-Z0-9А-Я]{6,}\/[A-Z0-9]{1,}|[A-Z0-9]{6,}|[A-Z0-9А-Я]{3}-[A-Z0-9]{3,}\/[A-Z0-9]{2}/g;
              const partNumberMatch = line.match(regexp);
              const partNumber = partNumberMatch ? partNumberMatch[0] : '';

              return {
                part_number: partNumber,
                name: line.trim(),
                warranty: '24',
                instock: parseInt(quantity, 10),
                priceOpt: parseInt(price, 10),
              };
            });

          return filteredLines;
        })
        .flat();
    });

    return posts;
  } catch (error) {
    throw new Error(`Failed to fetch products from ${url}: ${error.message}`);
  } finally {
    await browser.disconnect();
  }
};

export const fetchRizhskaProducts = async (): Promise<SupplierProduct[]> => {
  const urls = [process.env.RIZHKA_URL_1, process.env.RIZHKA_URL_2];

  const allProducts: SupplierProduct[] = [];

  for (const url of urls) {
    const products = await fetchProductsFromPage(url);
    allProducts.push(...products);
  }

  return allProducts;
};
