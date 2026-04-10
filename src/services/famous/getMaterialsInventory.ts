import { FamousInventoryItem } from "./interfaces";
import { getPool } from "./getPool";

export async function getMaterialsInventory(): Promise<Map<string, FamousInventoryItem>> {
  const db = await getPool();

  // Materials inventory (Commodity IS NULL)
  const result = await db.request().query(`
    SELECT
      prod.ProductID AS sku,
      prod.ProductDescription AS product_description,
      SUM(inv.RecvQnt - inv.IssueQnt) AS qty,
      AVG(inv.RecvCost / NULLIF(inv.RecvQnt, 0)) AS cost
    FROM [DM01].[dbo].[VWL_Inventory] AS inv
    JOIN [DM01].[dbo].[VW_F_Products] AS prod
      ON inv.ProductIdx = prod.ProductIDx
    WHERE prod.ProductID IS NOT NULL
      AND prod.Commodity IS NULL
    GROUP BY
      prod.ProductID,
      prod.ProductDescription
    ORDER BY prod.ProductID
  `);

  console.log(`Famous materials inventory query returned ${result.recordset.length} items`);

  const inventory = new Map<string, FamousInventoryItem>();

  for (const row of result.recordset) {
    inventory.set(row.sku, {
      sku: row.sku,
      productDescription: row.product_description || '',
      qty: row.qty || 0,
      cost: row.cost || 0
    });
  }

  return inventory;
}