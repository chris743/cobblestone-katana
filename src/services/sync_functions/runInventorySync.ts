import { famous } from './index';
import { db } from './index';
import { katana } from './index';
import { ReconciliationItem } from './index';
import { SyncOptions, SyncResult } from './interfaces';

export async function runInventorySync(options: SyncOptions = {}): Promise<SyncResult> {
  const { tolerance = 0, dryRun = false, scheduleId } = options;

  const runId = db.createSyncRun({
    schedule_id: scheduleId,
    sync_type: 'inventory',
    status: 'running',
    items_processed: 0,
    items_adjusted: 0
  });

  try {
    console.log('Fetching inventory from Katana...');
    const katanaInventory = await katana.getInventory();
    console.log(`Got ${katanaInventory.size} items from Katana`);

    console.log('Fetching inventory from Famous...');
    const famousInventory = await famous.getInventory();
    console.log(`Got ${famousInventory.size} items from Famous`);

    const allSkus = new Set([...katanaInventory.keys(), ...famousInventory.keys()]);
    const reconciliationItems: ReconciliationItem[] = [];
    const adjustments: { variantId: string; quantity: number; costPerUnit?: number }[] = [];

    for (const sku of allSkus) {
      const katanaItem = katanaInventory.get(sku);
      const famousItem = famousInventory.get(sku);

      const katanaQty = katanaItem?.qty ?? 0;
      const famousQty = famousItem?.qty ?? 0;
      const adjustment = famousQty - katanaQty;

      let adjustmentType: 'increase' | 'decrease' | 'match' = 'match';
      let sourceSystem: 'famous' | 'katana' | 'both' = 'both';

      if (!famousItem) sourceSystem = 'katana';
      else if (!katanaItem) sourceSystem = 'famous';

      if (Math.abs(adjustment) > tolerance) {
        adjustmentType = adjustment > 0 ? 'increase' : 'decrease';

        if (katanaItem && sourceSystem === 'both') {
          adjustments.push({
            variantId: katanaItem.variantId,
            quantity: adjustment,
            costPerUnit: famousItem?.cost || 0
          });
        }
      }

      reconciliationItems.push({
        sync_run_id: runId,
        sku,
        product_description: famousItem?.productDescription || '',
        famous_qty: famousQty,
        katana_qty: katanaQty,
        adjustment_needed: adjustment,
        adjustment_type: adjustmentType,
        cost: famousItem?.cost || 0,
        status: adjustmentType === 'match' ? 'matched' : (dryRun ? 'pending' : 'adjusted'),
        source_system: sourceSystem
      });
    }

    db.insertReconciliationItems(reconciliationItems);

    const itemsAdjusted = adjustments.length;

    if (!dryRun && adjustments.length > 0) {
      console.log(`Posting ${adjustments.length} adjustments to Katana...`);
      const batchSize = 100;
      for (let i = 0; i < adjustments.length; i += batchSize) {
        const batch = adjustments.slice(i, i + batchSize);
        const result = await katana.postStockAdjustment(batch, 'Inventory sync from Famous ERP');
        if (!result.success) {
          console.error('Batch adjustment failed:', result.error);
        }
      }
    }

    db.updateSyncRun(runId, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      items_processed: reconciliationItems.length,
      items_adjusted: itemsAdjusted
    });

    return {
      runId,
      status: 'completed',
      itemsProcessed: reconciliationItems.length,
      itemsAdjusted,
      items: reconciliationItems
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    db.updateSyncRun(runId, {
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: errorMessage
    });

    return {
      runId,
      status: 'failed',
      itemsProcessed: 0,
      itemsAdjusted: 0,
      items: [],
      error: errorMessage
    };
  }
}