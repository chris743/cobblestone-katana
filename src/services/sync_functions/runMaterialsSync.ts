import { famous } from './index';
import { db } from './index';
import { katana } from './index';
import { ReconciliationItem } from './index';
import { SyncOptions, SyncResult } from './interfaces';

export async function runMaterialsSync(options: SyncOptions = {}): Promise<SyncResult> {
  const { tolerance = 0, dryRun = false, scheduleId } = options;

  const runId = db.createSyncRun({
    schedule_id: scheduleId,
    sync_type: 'materials',
    status: 'running',
    items_processed: 0,
    items_adjusted: 0
  });

  try {
    console.log('Fetching materials from Famous...');
    const famousMaterials = await famous.getMaterials();
    console.log(`Got ${famousMaterials.length} materials from Famous`);

    console.log('Fetching existing materials from Katana...');
    const katanarials = await katana.getMaterials();
    const existingSkus = new Set<string>();
    for (const mat of katanarials) {
      for (const v of mat.variants || []) {
        if (v.sku) existingSkus.add(v.sku.toUpperCase());
      }
    }
    console.log(`Found ${existingSkus.size} existing materials in Katana`);

    const reconciliationItems: ReconciliationItem[] = [];
    let created = 0;
    let skipped = 0;
    const seenSkus = new Set<string>();

    for (const material of famousMaterials) {
      const skuUpper = material.productId.toUpperCase();

      if (seenSkus.has(skuUpper)) {
        reconciliationItems.push({
          sync_run_id: runId,
          sku: material.productId,
          product_description: material.productDescr,
          status: 'skipped_duplicate',
          source_system: 'famous'
        });
        skipped++;
        continue;
      }
      seenSkus.add(skuUpper);

      if (existingSkus.has(skuUpper)) {
        reconciliationItems.push({
          sync_run_id: runId,
          sku: material.productId,
          product_description: material.productDescr,
          status: 'skipped_existing',
          source_system: 'both'
        });
        skipped++;
        continue;
      }

      if (!dryRun) {
        const result = await katana.createMaterial({
          name: material.productDescr,
          sku: material.productId,
          uom: material.uom
        });

        reconciliationItems.push({
          sync_run_id: runId,
          sku: material.productId,
          product_description: material.productDescr,
          status: result.success ? 'created' : 'failed',
          source_system: 'famous'
        });

        if (result.success) created++;
      } else {
        reconciliationItems.push({
          sync_run_id: runId,
          sku: material.productId,
          product_description: material.productDescr,
          status: 'pending',
          source_system: 'famous'
        });
      }
    }

    db.insertReconciliationItems(reconciliationItems);

    db.updateSyncRun(runId, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      items_processed: reconciliationItems.length,
      items_adjusted: created
    });

    return {
      runId,
      status: 'completed',
      itemsProcessed: reconciliationItems.length,
      itemsAdjusted: created,
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