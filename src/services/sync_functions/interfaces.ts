import { ReconciliationItem } from '../database';

export interface SyncOptions {
  tolerance?: number;
  dryRun?: boolean;
  scheduleId?: number;
}

export interface SyncResult {
  runId: number;
  status: 'completed' | 'failed';
  itemsProcessed: number;
  itemsAdjusted: number;
  items: ReconciliationItem[];
  error?: string;
  issuePreview?: { sku: string; name: string; quantity: number }[];
}