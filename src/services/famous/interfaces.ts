export interface RepackOutput {
  repackId: string;
  sku: string;
  commodity: string;
  rundate: Date;
  output: number;
  productIdx: string;
  warehouse: string;
  label: string;
  method: string;
  style: string;
  styleGroup: string;
  tagId: string;
  uom: string;
}

export interface ProductRow {
  ProductIdx: number;
  ProductId: string;
  ProductDescr: string;
  Uom: string;
  Commodity?: string;
  Label?: string;
  Method?: string;
  Style?: string;
}

export interface FamousProduct {
  productIdx: number;
  productId: string;
  productDescr: string;
  uom: string;
  commodity?: string;
  label?: string;
  method?: string;
  style?: string;
}

export interface FamousInventoryItem {
  sku: string;
  productDescription: string;
  qty: number;
  cost: number;
  warehouse?: string;
}

export interface InventoryRow {
  sku: string;
  product_description: string;
  qty: number;
  cost: number;
}

export interface RepackRow {
  ICRUNIDX: string;
  RunDate: Date;
  Output: number;
  ProductIDX: string;
  Sku: string;
  StyleGroup: string;
  Commodity: string;
  Warehouse: string;
  Label: string;
  Method: string;
  Style: string;
  GALOTIDX: string;
  Uom: string;
}