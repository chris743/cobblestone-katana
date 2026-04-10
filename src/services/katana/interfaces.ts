interface KatanaResponse<T> {
  data: T[];
  pagination?: {
    page: number;
    last_page: boolean;
  };
}

interface InventoryItem {
  id: string;
  variant: {
    id: string;
    sku: string;
    name?: string;
  };
  quantity_in_stock: number;
  location_id?: string;
}

interface Variant {
  id: string;
  sku: string;
  name?: string;
  type?: string;
}

interface Product {
  id: string;
  name: string;
  category_name?: string;
  variants: Variant[];
}

interface Material {
  id: string;
  name: string;
  uom?: string;
  variants: Variant[];
}