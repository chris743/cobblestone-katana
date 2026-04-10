import Database, { Database as DatabaseType } from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(__dirname, '../../data/sync.db');
const db: DatabaseType = new Database(dbPath);

// Initialize database schema
db.exec(`
  CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sync_type TEXT NOT NULL,
    cron_expression TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    tolerance REAL DEFAULT 0.0,
    dry_run INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sync_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schedule_id INTEGER,
    sync_type TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT,
    items_processed INTEGER DEFAULT 0,
    items_adjusted INTEGER DEFAULT 0,
    error_message TEXT,
    FOREIGN KEY (schedule_id) REFERENCES schedules(id)
  );

  CREATE TABLE IF NOT EXISTS reconciliation_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_run_id INTEGER NOT NULL,
    sku TEXT NOT NULL,
    product_description TEXT,
    famous_qty REAL,
    katana_qty REAL,
    adjustment_needed REAL,
    adjustment_type TEXT,
    cost REAL DEFAULT 0,
    status TEXT DEFAULT 'pending',
    source_system TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sync_run_id) REFERENCES sync_runs(id)
  );

  CREATE TABLE IF NOT EXISTS famous_products (
    sku TEXT PRIMARY KEY,
    product_description TEXT,
    commodity TEXT,
    style TEXT,
    style_group TEXT,
    method TEXT,
    label TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_reconciliation_sync_run ON reconciliation_items(sync_run_id);
  CREATE INDEX IF NOT EXISTS idx_reconciliation_sku ON reconciliation_items(sku);
  CREATE INDEX IF NOT EXISTS idx_sync_runs_status ON sync_runs(status);
`);

export interface Schedule {
  id?: number;
  name: string;
  sync_type: 'inventory' | 'products' | 'materials' | 'manufacturing';
  cron_expression: string;
  enabled: boolean;
  tolerance: number;
  dry_run: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface SyncRun {
  id?: number;
  schedule_id?: number;
  sync_type: string;
  status: 'running' | 'completed' | 'failed';
  started_at?: string;
  completed_at?: string;
  items_processed: number;
  items_adjusted: number;
  error_message?: string;
}

export interface ReconciliationItem {
  id?: number;
  sync_run_id: number;
  sku: string;
  product_description?: string;
  famous_qty?: number;
  katana_qty?: number;
  adjustment_needed?: number;
  adjustment_type?: 'increase' | 'decrease' | 'match';
  cost?: number;
  status?: string;
  source_system?: 'famous' | 'katana' | 'both';
  created_at?: string;
}

// Schedule CRUD
export function getSchedules(): Schedule[] {
  return db.prepare('SELECT * FROM schedules ORDER BY created_at DESC').all() as Schedule[];
}

export function getSchedule(id: number): Schedule | undefined {
  return db.prepare('SELECT * FROM schedules WHERE id = ?').get(id) as Schedule | undefined;
}

export function createSchedule(schedule: Schedule): number {
  const stmt = db.prepare(`
    INSERT INTO schedules (name, sync_type, cron_expression, enabled, tolerance, dry_run)
    VALUES (@name, @sync_type, @cron_expression, @enabled, @tolerance, @dry_run)
  `);
  const result = stmt.run({
    name: schedule.name,
    sync_type: schedule.sync_type,
    cron_expression: schedule.cron_expression,
    enabled: schedule.enabled ? 1 : 0,
    tolerance: schedule.tolerance,
    dry_run: schedule.dry_run ? 1 : 0
  });
  return result.lastInsertRowid as number;
}

export function updateSchedule(id: number, schedule: Partial<Schedule>): void {
  const fields: string[] = [];
  const values: Record<string, unknown> = { id };

  if (schedule.name !== undefined) { fields.push('name = @name'); values.name = schedule.name; }
  if (schedule.sync_type !== undefined) { fields.push('sync_type = @sync_type'); values.sync_type = schedule.sync_type; }
  if (schedule.cron_expression !== undefined) { fields.push('cron_expression = @cron_expression'); values.cron_expression = schedule.cron_expression; }
  if (schedule.enabled !== undefined) { fields.push('enabled = @enabled'); values.enabled = schedule.enabled ? 1 : 0; }
  if (schedule.tolerance !== undefined) { fields.push('tolerance = @tolerance'); values.tolerance = schedule.tolerance; }
  if (schedule.dry_run !== undefined) { fields.push('dry_run = @dry_run'); values.dry_run = schedule.dry_run ? 1 : 0; }

  fields.push('updated_at = CURRENT_TIMESTAMP');

  db.prepare(`UPDATE schedules SET ${fields.join(', ')} WHERE id = @id`).run(values);
}

export function deleteSchedule(id: number): void {
  db.prepare('DELETE FROM schedules WHERE id = ?').run(id);
}

// Sync Run CRUD
export function getSyncRuns(limit = 50): SyncRun[] {
  return db.prepare('SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT ?').all(limit) as SyncRun[];
}

export function getSyncRun(id: number): SyncRun | undefined {
  return db.prepare('SELECT * FROM sync_runs WHERE id = ?').get(id) as SyncRun | undefined;
}

export function createSyncRun(run: SyncRun): number {
  const stmt = db.prepare(`
    INSERT INTO sync_runs (schedule_id, sync_type, status, items_processed, items_adjusted, error_message)
    VALUES (@schedule_id, @sync_type, @status, @items_processed, @items_adjusted, @error_message)
  `);
  const result = stmt.run({
    schedule_id: run.schedule_id || null,
    sync_type: run.sync_type,
    status: run.status,
    items_processed: run.items_processed,
    items_adjusted: run.items_adjusted,
    error_message: run.error_message || null
  });
  return result.lastInsertRowid as number;
}

export function updateSyncRun(id: number, updates: Partial<SyncRun>): void {
  const fields: string[] = [];
  const values: Record<string, unknown> = { id };

  if (updates.status !== undefined) { fields.push('status = @status'); values.status = updates.status; }
  if (updates.completed_at !== undefined) { fields.push('completed_at = @completed_at'); values.completed_at = updates.completed_at; }
  if (updates.items_processed !== undefined) { fields.push('items_processed = @items_processed'); values.items_processed = updates.items_processed; }
  if (updates.items_adjusted !== undefined) { fields.push('items_adjusted = @items_adjusted'); values.items_adjusted = updates.items_adjusted; }
  if (updates.error_message !== undefined) { fields.push('error_message = @error_message'); values.error_message = updates.error_message; }

  if (fields.length > 0) {
    db.prepare(`UPDATE sync_runs SET ${fields.join(', ')} WHERE id = @id`).run(values);
  }
}

// Reconciliation Items
export function getReconciliationItems(syncRunId: number): ReconciliationItem[] {
  return db.prepare('SELECT * FROM reconciliation_items WHERE sync_run_id = ? ORDER BY adjustment_needed DESC').all(syncRunId) as ReconciliationItem[];
}

export function getRecentReconciliationItems(limit = 500): ReconciliationItem[] {
  return db.prepare(`
    SELECT ri.*, sr.sync_type, sr.started_at as sync_started_at
    FROM reconciliation_items ri
    JOIN sync_runs sr ON ri.sync_run_id = sr.id
    ORDER BY ri.created_at DESC
    LIMIT ?
  `).all(limit) as ReconciliationItem[];
}

export function insertReconciliationItems(items: ReconciliationItem[]): void {
  const stmt = db.prepare(`
    INSERT INTO reconciliation_items
    (sync_run_id, sku, product_description, famous_qty, katana_qty, adjustment_needed, adjustment_type, cost, status, source_system)
    VALUES (@sync_run_id, @sku, @product_description, @famous_qty, @katana_qty, @adjustment_needed, @adjustment_type, @cost, @status, @source_system)
  `);

  const insertMany = db.transaction((items: ReconciliationItem[]) => {
    for (const item of items) {
      stmt.run({
        sync_run_id: item.sync_run_id,
        sku: item.sku,
        product_description: item.product_description || null,
        famous_qty: item.famous_qty ?? null,
        katana_qty: item.katana_qty ?? null,
        adjustment_needed: item.adjustment_needed ?? null,
        adjustment_type: item.adjustment_type || null,
        cost: item.cost || 0,
        status: item.status || 'pending',
        source_system: item.source_system || null
      });
    }
  });

  insertMany(items);
}

// Famous Products
export interface StoredProduct {
  sku: string;
  product_description: string;
  commodity?: string;
  style?: string;
  style_group?: string;
  method?: string;
  label?: string;
  updated_at?: string;
}

export function upsertFamousProducts(products: StoredProduct[]): void {
  const stmt = db.prepare(`
    INSERT INTO famous_products (sku, product_description, commodity, style, style_group, method, label, updated_at)
    VALUES (@sku, @product_description, @commodity, @style, @style_group, @method, @label, CURRENT_TIMESTAMP)
    ON CONFLICT(sku) DO UPDATE SET
      product_description = @product_description,
      commodity = @commodity,
      style = @style,
      style_group = @style_group,
      method = @method,
      label = @label,
      updated_at = CURRENT_TIMESTAMP
  `);

  const upsertMany = db.transaction((items: StoredProduct[]) => {
    for (const item of items) {
      stmt.run({
        sku: item.sku,
        product_description: item.product_description || null,
        commodity: item.commodity || null,
        style: item.style || null,
        style_group: item.style_group || null,
        method: item.method || null,
        label: item.label || null
      });
    }
  });

  upsertMany(products);
}

export function getFamousProduct(sku: string): StoredProduct | undefined {
  return db.prepare('SELECT * FROM famous_products WHERE sku = ?').get(sku) as StoredProduct | undefined;
}

export function getAllFamousProducts(): StoredProduct[] {
  return db.prepare('SELECT * FROM famous_products ORDER BY sku').all() as StoredProduct[];
}

export function getReconciliationStats(): { total: number; by_type: Record<string, number>; by_status: Record<string, number> } {
  const total = (db.prepare('SELECT COUNT(*) as count FROM reconciliation_items').get() as { count: number }).count;

  const byType = db.prepare(`
    SELECT adjustment_type, COUNT(*) as count FROM reconciliation_items
    WHERE adjustment_type IS NOT NULL GROUP BY adjustment_type
  `).all() as { adjustment_type: string; count: number }[];

  const byStatus = db.prepare(`
    SELECT status, COUNT(*) as count FROM reconciliation_items GROUP BY status
  `).all() as { status: string; count: number }[];

  return {
    total,
    by_type: Object.fromEntries(byType.map(r => [r.adjustment_type, r.count])),
    by_status: Object.fromEntries(byStatus.map(r => [r.status, r.count]))
  };
}

export default db;
