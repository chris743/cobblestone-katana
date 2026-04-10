import { getPool } from "./getPool";
import { ProductRow, FamousProduct } from "./interfaces";
export async function getMaterials(): Promise<FamousProduct[]> {
  const db = await getPool();

  const result = await db.request().query(`
    SELECT
      [ProductIdx],
      [Id] AS ProductId,
      [ProductDescr],
      [Uom]
    FROM [DM01].[dbo].[VWL_Products]
    WHERE [Id] IS NOT NULL
      AND [Commodity] IS NULL
  `);

  console.log(`Famous materials query returned ${result.recordset.length} items`);

  return result.recordset.map((row: ProductRow) => ({
    productIdx: row.ProductIdx,
    productId: row.ProductId,
    productDescr: row.ProductDescr,
    uom: row.Uom
  }));
}