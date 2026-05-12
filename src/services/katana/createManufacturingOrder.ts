import {config} from '../../config';

const TIMEOUT_MS = 30000;
const MAX_RETRIES = 10;
const RATE_LIMIT_WAIT_MS = 60000;

export async function createManufacturingOrder(order: {
  variantId: string;
  quantity: number;
  orderNo?: string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const now = new Date();
  const orderNo = order.orderNo || `${now.toISOString().slice(0, 10).replace(/-/g, '')}--${Date.now() % 1000}`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(`${config.katana.baseUrl}/manufacturing_orders`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${config.katana.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: 'NOT_STARTED',
          order_no: orderNo,
          variant_id: Number(order.variantId),
          location_id: config.defaultLocationId,
          planned_quantity: order.quantity
        }),
        signal: controller.signal
      });

      if (response.status === 429) {
        console.log(`Rate limited on attempt ${attempt}/${MAX_RETRIES}, waiting ${RATE_LIMIT_WAIT_MS / 1000}s...`);
        clearTimeout(timer);
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_WAIT_MS));
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `${response.status}: ${errorText}` };
      }

      const data = await response.json() as { id: string };
      return { success: true, id: data.id };
    } catch (error) {
      if (controller.signal.aborted) {
        console.log(`Timed out on attempt ${attempt}/${MAX_RETRIES}, retrying...`);
        continue;
      }
      return { success: false, error: String(error) };
    } finally {
      clearTimeout(timer);
    }
  }

  return { success: false, error: `Failed after ${MAX_RETRIES} attempts` };
}
