import { famous } from './index';
import { db } from './index';
import { katana } from './index';
import { ReconciliationItem } from './index';
import { SyncOptions, SyncResult } from './interfaces';

interface MaterialIssue {
  sku: string;
  name: string;
  quantity: number;
  forProduct: string;
  forQty: number;
}

export async function runManufacturingSync(options: SyncOptions = {}): Promise<SyncResult> {
  const { dryRun = false, scheduleId } = options;

  const runId = db.createSyncRun({
    schedule_id: scheduleId,
    sync_type: 'manufacturing',
    status: 'running',
    items_processed: 0,
    items_adjusted: 0
  });

  try {
    console.log('Fetching repack outputs from Famous...');
    const repacks = await famous.getRepackOutputs(1);
    console.log(`Got ${repacks.length} repack outputs`);

    // Fetch variants, recipes, and build lookup maps in parallel
    console.log('Fetching variants and recipes from Katana...');
    const [variants, recipeMap] = await Promise.all([
      katana.getVariants(),
      katana.getRecipeMap(),
    ]);

    // variant SKU (upper) -> variant ID
    const skuToVariantId = new Map<string, string>();
    // variant ID -> variant SKU
    const variantIdToSku = new Map<string, string>();
    // variant ID -> variant name
    const variantIdToName = new Map<string, string>();

    for (const v of variants) {
      if (v.sku) {
        skuToVariantId.set(v.sku.toUpperCase(), String(v.id));
        variantIdToSku.set(String(v.id), v.sku);
        variantIdToName.set(String(v.id), v.name || v.sku);
      }
    }
    console.log(`Built variant map with ${skuToVariantId.size} entries`);
    console.log(`Built recipe map with ${recipeMap.size} recipes`);

    const reconciliationItems: ReconciliationItem[] = [];
    let created = 0;

    // Aggregate repacks by SKU
    const skuTotals = new Map<string, { sku: string; totalQty: number; description: string; variantId: string | undefined; savedProduct: boolean }>();
    for (const repack of repacks) {
      if (!repack.sku) continue;

      const sku = repack.sku;
      const existing = skuTotals.get(sku.toUpperCase());
      if (existing) {
        existing.totalQty += repack.output;
      } else {
        const savedProduct = db.getFamousProduct(sku);
        const description = savedProduct?.product_description
          || `${repack.commodity || ''} - ${repack.label || ''} - ${repack.style || ''}`.trim();
        skuTotals.set(sku.toUpperCase(), {
          sku,
          totalQty: repack.output,
          description,
          variantId: skuToVariantId.get(sku.toUpperCase()),
          savedProduct: !!savedProduct
        });
      }
    }

    console.log(`Aggregated ${repacks.length} repacks into ${skuTotals.size} unique SKUs`);

    // Collect material issues from BOM explosion
    const materialIssues: MaterialIssue[] = [];

    for (const [, entry] of skuTotals) {
      if (!entry.variantId) {
        console.log(`No match for Famous SKU: "${entry.sku.toUpperCase()}"${entry.savedProduct ? ' (known product)' : ' (unknown product)'}`);
        reconciliationItems.push({
          sync_run_id: runId,
          sku: entry.sku,
          product_description: entry.description,
          famous_qty: entry.totalQty,
          status: entry.savedProduct ? 'skipped_no_variant' : 'skipped_unknown_product',
          source_system: 'famous'
        });
        continue;
      }

      // Explode BOM for this product
      const ingredients = recipeMap.get(entry.variantId) || recipeMap.get(String(entry.variantId)) || [];
      if (ingredients.length === 0) {
        console.log(`No recipe found for ${entry.sku} (variant ${entry.variantId})`);
      }

      for (const ingredient of ingredients) {
        const ingId = String(ingredient.ingredient_variant_id);
        const ingredientSku = variantIdToSku.get(ingId) || '';
        const ingredientName = variantIdToName.get(ingId) || ingId;
        if (!ingredientSku) {
          console.log(`No SKU for ingredient variant ${ingId} (product: ${entry.sku})`);
        }
        materialIssues.push({
          sku: ingredientSku,
          name: ingredientName,
          quantity: ingredient.quantity * entry.totalQty,
          forProduct: entry.sku,
          forQty: entry.totalQty,
        });
      }

      if (!dryRun) {
        console.log(`Creating MO for ${entry.sku} (qty: ${entry.totalQty}, ${ingredients.length} BOM items)`);
        const result = await katana.createManufacturingOrder({
          variantId: entry.variantId,
          quantity: entry.totalQty
        });

        if (!result.success) {
          console.log(`Failed: ${result.error}`);
        } else if (result.id) {
          const done = await katana.updateManufacturingOrder(result.id, { status: 'DONE' });
          if (!done.success) console.log(`Failed to mark MO ${result.id} DONE: ${done.error}`);
        }

        reconciliationItems.push({
          sync_run_id: runId,
          sku: entry.sku,
          product_description: entry.description,
          famous_qty: entry.totalQty,
          status: result.success ? 'created' : 'failed',
          source_system: 'famous'
        });

        if (result.success) created++;
      } else {
        reconciliationItems.push({
          sync_run_id: runId,
          sku: entry.sku,
          product_description: entry.description,
          famous_qty: entry.totalQty,
          status: 'pending',
          source_system: 'famous'
        });
      }
    }

    // Aggregate material issues by SKU for FAPI
    const aggregatedIssues = new Map<string, { sku: string; name: string; totalQty: number }>();
    for (const issue of materialIssues) {
      if (!issue.sku) continue;
      const existing = aggregatedIssues.get(issue.sku.toUpperCase());
      if (existing) {
        existing.totalQty += issue.quantity;
      } else {
        aggregatedIssues.set(issue.sku.toUpperCase(), {
          sku: issue.sku,
          name: issue.name,
          totalQty: issue.quantity,
        });
      }
    }

    console.log(`BOM explosion produced ${materialIssues.length} material issue lines, ${aggregatedIssues.size} unique materials`);

    // Build issue preview for the response
    const issuePreview = Array.from(aggregatedIssues.values()).map(m => ({
      sku: m.sku,
      name: m.name,
      quantity: m.totalQty,
    }));

    // Post material issues to Famous via FAPI
    if (!dryRun && aggregatedIssues.size > 0) {
      console.log(`Posting ${aggregatedIssues.size} material issues to Famous FAPI...`);
      for (const [sku, m] of aggregatedIssues) {
        console.log(`  Issue: ${m.sku} - ${m.name} qty: ${m.totalQty}`);
      }
      // Build repack-like objects for the FAPI import with material SKUs
      const issueRepacks = Array.from(aggregatedIssues.values()).map(m => ({
        repackId: '',
        sku: m.sku,
        commodity: '',
        rundate: repacks[0]?.rundate || new Date(),
        output: m.totalQty,
        productIdx: '',
        warehouse: '',
        label: '',
        method: '',
        style: '',
        styleGroup: '',
        tagId: '',
        uom: '',
      }));
      const issueResult = await famous.postIssueImport(issueRepacks);
      if (!issueResult.success) {
        console.log(`FAPI issue import failed: ${issueResult.error}`);
      } else {
        console.log(`FAPI issue import completed (${issueResult.lineCount} lines)`);
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
      items: reconciliationItems,
      issuePreview: dryRun ? issuePreview : undefined,
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
