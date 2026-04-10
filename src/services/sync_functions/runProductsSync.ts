import { famous } from './index';
import { db } from './index';
import { katana } from './index';
import { ReconciliationItem } from './index';
import { SyncOptions, SyncResult } from './interfaces';

export async function runProductsSync(options: SyncOptions = {}): Promise<SyncResult> {
  const { dryRun = false, scheduleId } = options;

  const runId = db.createSyncRun({
    schedule_id: scheduleId,
    sync_type: 'products',
    status: 'running',
    items_processed: 0,
    items_adjusted: 0
  });

  try {
    console.log('Fetching products from Famous...');
    const famousProducts = await famous.getProducts();
    console.log(`Got ${famousProducts.length} products from Famous`);

    // Save products to local database for cross-sync lookups
    db.upsertFamousProducts(famousProducts.map(p => ({
      sku: p.productId,
      product_description: p.productDescr,
      commodity: p.commodity,
      style: p.style,
      method: p.method,
      label: p.label
    })));
    console.log(`Saved ${famousProducts.length} products to local database`);

    console.log('Fetching existing products from Katana...');
    const katanaProducts = await katana.getProducts();
    const existingSkus = new Set<string>();
    for (const prod of katanaProducts) {
      for (const v of prod.variants || []) {
        if (v.sku) existingSkus.add(v.sku.toUpperCase());
      }
    }
    console.log(`Found ${existingSkus.size} existing products in Katana`);

    const reconciliationItems: ReconciliationItem[] = [];
    let created = 0;
    const seenSkus = new Set<string>();

    let processed = 0;
    for (const product of famousProducts) {
      processed++;
      if (processed % 25 === 0) console.log(`Processing product ${processed}/${famousProducts.length}...`);
      const skuUpper = product.productId.toUpperCase();

      if (seenSkus.has(skuUpper)) {
        reconciliationItems.push({
          sync_run_id: runId,
          sku: product.productId,
          product_description: product.productDescr,
          status: 'skipped_duplicate',
          source_system: 'famous'
        });
        continue;
      }
      seenSkus.add(skuUpper);

      if (existingSkus.has(skuUpper)) {
        reconciliationItems.push({
          sync_run_id: runId,
          sku: product.productId,
          product_description: product.productDescr,
          status: 'skipped_existing',
          source_system: 'both'
        });
        continue;
      }

      if (!dryRun) {
        console.log(`Creating product ${processed}/${famousProducts.length}: ${product.productId}`);
        const result = await katana.createProduct({
          name: product.productDescr,
          sku: product.productId,
          category_name: product.commodity || 'Uncategorized'
        });

        if (!result.success) console.log(`Failed to create ${product.productId}: ${result.error}`);

        reconciliationItems.push({
          sync_run_id: runId,
          sku: product.productId,
          product_description: product.productDescr,
          status: result.success ? 'created' : 'failed',
          source_system: 'famous'
        });

        if (result.success) created++;
      } else {
        reconciliationItems.push({
          sync_run_id: runId,
          sku: product.productId,
          product_description: product.productDescr,
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