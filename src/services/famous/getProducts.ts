import { getPool } from "./getPool";
import { FamousProduct } from "./interfaces";

interface ProductQueryRow {
  Commodity: string;
  Method: string;
  Label: string | null;
  Style: string;
  StyleGroup: string;
  ConcatKey: string;
}

export async function getProducts(): Promise<FamousProduct[]> {
  const db = await getPool();

  const result = await db.request().query(`
    SELECT DISTINCT
    Commodity,
    Method,
    CASE WHEN Label LIKE '%PLU%' THEN NULL ELSE Label END AS Label,
    Style,
    CASE
        WHEN StyleInvc LIKE '%FB%' THEN 'FB'
        WHEN StyleInvc LIKE '%CB%' THEN 'CB'
        WHEN StyleInvc LIKE '%NB%' THEN 'NB'
        WHEN StyleInvc LIKE '%WM%' THEN 'WM'
        WHEN StyleInvc LIKE '%HB%' THEN 'HB'
        ELSE 'BULK'
    END AS StyleGroup,
    CASE
        WHEN StyleInvc NOT LIKE '%FB%'
         AND StyleInvc NOT LIKE '%CB%'
         AND StyleInvc NOT LIKE '%NB%'
         AND StyleInvc NOT LIKE '%WM%'
         AND StyleInvc NOT LIKE '%HD%'
        THEN CONCAT(Commodity, '-', 'BULK', '-', Method)
        ELSE CONCAT(Commodity, '-', Style, '-', Method, '-', CASE WHEN Label LIKE '%PLU%' THEN '' ELSE Label END)
    END AS ConcatKey
  FROM Products
  WHERE source_database = 'LP'
    AND Label NOT LIKE 'Z%'
    AND Method NOT LIKE 'Z%'
    AND Method != 'CTN'
    AND Method != 'BIN'
    AND Method != 'BULK BIN'
    AND Method != 'BAGMAS MED'
    AND Method != 'BAGMAS LRG'
    AND Method != 'ORIG CTN'
    AND Commodity NOT LIKE 'ORG%'
  ORDER BY Commodity, Method, Label
  `);

  console.log(`Famous products query returned ${result.recordset.length} items`);

  return result.recordset.map((row: ProductQueryRow) => ({
    productIdx: 0,
    productId: row.ConcatKey,
    productDescr: [row.Commodity, row.StyleGroup, row.Method, row.Label].filter(v => v && v.trim()).join(' - '),
    uom: '',
    commodity: row.Commodity,
    label: row.Label ?? undefined,
    method: row.Method,
    style: row.Style
  }));
}