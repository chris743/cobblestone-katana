import { getMaterials } from "./getMaterials";

export async function getMaterialVariantMap(): Promise<Map<string, string>> {
  const materials = await getMaterials();
  const map = new Map<string, string>();

  for (const material of materials) {
    for (const variant of material.variants || []) {
      if (variant.sku) {
        map.set(variant.sku, variant.id);
      }
    }
  }

  return map;
}