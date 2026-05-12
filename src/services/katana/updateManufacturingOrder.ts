import { fetchWithRetry } from './fetchwithRetry';
import { config } from '../../config';

export async function updateManufacturingOrder(
  id: string,
  patch: { status?: 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE' }
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetchWithRetry(`${config.katana.baseUrl}/manufacturing_orders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `${response.status}: ${errorText}` };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
