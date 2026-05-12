import { getPoolDM03 } from "./getPool";
import { RepackOutput, RepackRow } from "./interfaces";

export async function getRepackOutputs(daysBack = 1): Promise<RepackOutput[]> {
  const db = await getPoolDM03();

  const result = await db.request().query(`
    SELECT r.[ICRUNIDX]
      ,r.[RunDate]
      ,r.[Output]
      ,r.[ProductIDX]
      ,CASE
          WHEN p.StyleInvc NOT LIKE '%FB%'
           AND p.StyleInvc NOT LIKE '%CB%'
           AND p.StyleInvc NOT LIKE '%NB%'
           AND p.StyleInvc NOT LIKE '%WM%'
           AND p.StyleInvc NOT LIKE '%HD%'
          THEN CONCAT(p.Commodity, '-', 'BULK', '-', p.Method)
          ELSE CONCAT(p.Commodity, '-', p.Style, '-', p.Method, '-', CASE WHEN p.Label LIKE '%PLU%' THEN '' ELSE p.Label END)
      END AS Sku
      ,CASE
          WHEN p.StyleInvc LIKE '%FB%' THEN 'FB'
          WHEN p.StyleInvc LIKE '%CB%' THEN 'CB'
          WHEN p.StyleInvc LIKE '%NB%' THEN 'NB'
          WHEN p.StyleInvc LIKE '%WM%' THEN 'WM'
          WHEN p.StyleInvc LIKE '%HD%' THEN 'HB'
          ELSE 'BULK'
      END AS StyleGroup
      ,r.[Warehouse]
      ,p.Commodity AS Commodity
      ,r.[GALOTIDX]
      ,CASE WHEN p.Label LIKE '%PLU%' THEN NULL ELSE p.Label END AS Label
      ,p.Method AS Method
      ,p.[Style] AS Style
      ,p.Uom AS Uom
  FROM [DM03].[rpt].[vw_IC_REPACKING_OutputByRun] r
  JOIN [DM03].[dbo].[VW_PRODUCTS] p ON p.ProductIdx = r.ProductIDX
  WHERE CAST(r.RunDate AS DATE) = CAST((GETDATE() - ${daysBack}) AS DATE)
    AND p.Method != 'BIN'
  `);

  return result.recordset.map((row: RepackRow) => ({
    repackId: row.ICRUNIDX,
    sku: row.Sku,
    commodity: row.Commodity,
    rundate: row.RunDate,
    output: row.Output,
    productIdx: row.ProductIDX,
    warehouse: row.Warehouse,
    label: row.Label,
    method: row.Method,
    style: row.Style,
    styleGroup: row.StyleGroup,
    tagId: row.GALOTIDX,
    uom: row.Uom,
  }));
}