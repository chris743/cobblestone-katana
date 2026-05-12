import { fetchWithRetry } from "./fetchwithRetry";
import { config } from '../../config';

export async function postStockAdjustment(adjustments: {
  variantId: string;
  quantity: number;
  costPerUnit?: number;
}[], reason: string, locationId: number = config.defaultLocationId): Promise<{ success: boolean; error?: string }> {
  const now = new Date();
  const adjustmentNumber = `SYNC-${now.toISOString().replace(/[-:T]/g, '').slice(0, 14)}`;

  const rows = adjustments.map(adj => ({
    variant_id: Number(adj.variantId),
    quantity: adj.quantity,
    ...(adj.quantity > 0 && adj.costPerUnit ? { cost_per_unit: adj.costPerUnit } : {})
  }));

  try {
    const response = await fetchWithRetry(`${config.katana.baseUrl}/stock_adjustments`, {
      method: 'POST',
      body: JSON.stringify({
        stock_adjustment_number: adjustmentNumber,
        location_id: locationId,
        reason: reason,
        stock_adjustment_rows: rows
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: errorText };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
