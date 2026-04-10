import {config} from '../../config';

const TIMEOUT_MS = 30000;
const MAX_RETRIES = 10;
const RATE_LIMIT_WAIT_MS = 60000;

export async function createProduct(product: {
  name: string;
  sku: string;
  category_name?: string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(`${config.katana.baseUrl}/products`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${config.katana.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: product.name,
          category_name: product.category_name || 'Uncategorized',
          batch_tracked: false,
          serial_tracked: false,
          is_purchasable: false,
          is_producible: true,
          is_sellable: true,
          variants: [{ sku: product.sku }]
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
