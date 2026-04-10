import {fetchAllPages} from './fetchAllPages'

export async function getInventory(): Promise<Map<string, { sku: string; qty: number; variantId: string }>> {
  const inventory = await fetchAllPages<InventoryItem>('/inventory', 1000, 'extend=variant');
  const result = new Map<string, { sku: string; qty: number; variantId: string }>();

  for (const item of inventory) {
    if (item.variant?.sku) {
      const existing = result.get(item.variant.sku);
      if (existing) {
        existing.qty += item.quantity_in_stock;
      } else {
        result.set(item.variant.sku, {
          sku: item.variant.sku,
          qty: item.quantity_in_stock,
          variantId: item.variant.id
        });
      }
    }
  }

  return result;
}