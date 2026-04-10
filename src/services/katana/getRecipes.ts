import { fetchAllPages } from './fetchAllPages';

export interface BomRow {
  id: string;
  product_variant_id: string;
  ingredient_variant_id: string;
  quantity: number;
}

export async function getBomRows(): Promise<BomRow[]> {
  const rows = await fetchAllPages<BomRow>('/bom_rows', 250);
  console.log(`Fetched ${rows.length} BOM rows from Katana`);
  return rows;
}

/**
 * Build a map of product variant ID -> list of ingredient variant IDs with quantities
 */
export async function getRecipeMap(): Promise<Map<string, { ingredient_variant_id: string; quantity: number }[]>> {
  const rows = await getBomRows();
  const map = new Map<string, { ingredient_variant_id: string; quantity: number }[]>();

  for (const row of rows) {
    const key = String(row.product_variant_id);
    const existing = map.get(key) || [];
    existing.push({
      ingredient_variant_id: String(row.ingredient_variant_id),
      quantity: row.quantity,
    });
    map.set(key, existing);
  }

  console.log(`Built recipe map for ${map.size} product variants`);
  return map;
}
