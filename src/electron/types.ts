export interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  part_number: string;
  custom_hotline_href: string;
  custom_product_number_1_sku: string;
  custom_alternative_part_number: string;
}

export interface ShopifyResponse {
  data?: {
    products: {
      edges: {
        node: {
          id: string;
          title: string;
          handle: string;
          variants: {
            edges: {
              node: {
                barcode: string;
              };
            }[];
          };
          custom_hotline_href: {
            value: string;
          };
          custom_product_number_1: {
            value: string;
          };
          custom_alternative_part_number: {
            value: string;
          };
        };
      }[];
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string;
      };
    };
  };
  errors?: { message: string }[];
}

export interface PostData {
  query: string;
  variables: {
    first: number;
    after?: string | null;
  };
}

export interface SupplierProduct {
  part_number: string;
  name: string;
  warranty: string;
  instock: number;
  priceOpt: number;
  priceRtl?: number;
  supplierName?: string;
}

export interface Supplier {
  name: string;
  fetchFunction: () => Promise<SupplierProduct[]>;
}

export interface Offer {
  price?: string[];
  name?: string[];
  vendorCode?: string[];
  $: {
    available: string;
  };
}

export interface ExtendedShopifyProduct extends ShopifyProduct {
  suppliers: SupplierProduct[];
  bestSupplier: SupplierProduct | null;
  bestSupplierName: string | null;
  hotlineMinimalPrice?: number | null;
  minimalFinalPrice?: number | null;
  maximalFinalPrice?: number | null;
  middleFinalPrice?: number | null;
}
