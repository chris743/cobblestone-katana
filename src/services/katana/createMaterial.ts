import { fetchWithRetry } from "./fetchwithRetry";
import { config } from '../../config';

export async function createMaterial(material: {
  name: string;
  sku: string;
  uom?: string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const response = await fetchWithRetry(`${config.katana.baseUrl}/materials`, {
      method: 'POST',
      body: JSON.stringify({
        name: material.name,
        uom: material.uom || 'ea',
        is_sellable: false,
        batch_tracked: false,
        variants: [{ sku: material.sku }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: errorText };
    }

    const data = await response.json() as { id: string };
    return { success: true, id: data.id };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}