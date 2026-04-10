import { Router, Request, Response } from 'express';
import * as db from '../services/database';
import * as syncer from '../services/syncer';
import * as scheduler from '../services/scheduler';

const router = Router();

// Schedules
router.get('/schedules', (req: Request, res: Response) => {
  const schedules = db.getSchedules();
  const activeJobs = scheduler.getActiveJobs();

  const enriched = schedules.map(s => ({
    ...s,
    enabled: Boolean(s.enabled),
    dry_run: Boolean(s.dry_run),
    is_active: s.id ? activeJobs.includes(s.id) : false
  }));

  res.json(enriched);
});

router.get('/schedules/:id', (req: Request, res: Response) => {
  const schedule = db.getSchedule(parseInt(req.params.id));
  if (!schedule) {
    res.status(404).json({ error: 'Schedule not found' });
    return;
  }
  res.json({
    ...schedule,
    enabled: Boolean(schedule.enabled),
    dry_run: Boolean(schedule.dry_run)
  });
});

router.post('/schedules', (req: Request, res: Response) => {
  const { name, sync_type, cron_expression, enabled, tolerance, dry_run } = req.body;

  if (!name || !sync_type || !cron_expression) {
    res.status(400).json({ error: 'Missing required fields: name, sync_type, cron_expression' });
    return;
  }

  const validTypes = ['inventory', 'products', 'materials', 'manufacturing'];
  if (!validTypes.includes(sync_type)) {
    res.status(400).json({ error: `Invalid sync_type. Must be one of: ${validTypes.join(', ')}` });
    return;
  }

  try {
    const id = db.createSchedule({
      name,
      sync_type,
      cron_expression,
      enabled: enabled !== false,
      tolerance: tolerance || 0,
      dry_run: dry_run || false
    });

    if (enabled !== false) {
      scheduler.scheduleJob(id);
    }

    res.status(201).json({ id, message: 'Schedule created' });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

router.put('/schedules/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const schedule = db.getSchedule(id);

  if (!schedule) {
    res.status(404).json({ error: 'Schedule not found' });
    return;
  }

  try {
    db.updateSchedule(id, req.body);

    // Reschedule if needed
    if (req.body.enabled !== undefined || req.body.cron_expression !== undefined) {
      scheduler.stopJob(id);
      const updated = db.getSchedule(id);
      if (updated?.enabled) {
        scheduler.scheduleJob(id);
      }
    }

    res.json({ message: 'Schedule updated' });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

router.delete('/schedules/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id);

  scheduler.stopJob(id);
  db.deleteSchedule(id);

  res.json({ message: 'Schedule deleted' });
});

// Manual sync triggers
router.post('/sync/:type', async (req: Request, res: Response) => {
  const { type } = req.params;
  const { tolerance, dry_run } = req.body;

  const options = {
    tolerance: tolerance || 0,
    dryRun: dry_run || false
  };

  try {
    let result;

    switch (type) {
      case 'inventory':
        result = await syncer.runInventorySync(options);
        break;
      case 'materials':
        result = await syncer.runMaterialsSync(options);
        break;
      case 'products':
        result = await syncer.runProductsSync(options);
        break;
      case 'manufacturing':
        result = await syncer.runManufacturingSync(options);
        break;
      default:
        res.status(400).json({ error: `Invalid sync type: ${type}` });
        return;
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Sync runs
router.get('/runs', (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const runs = db.getSyncRuns(limit);
  res.json(runs);
});

router.get('/runs/:id', (req: Request, res: Response) => {
  const run = db.getSyncRun(parseInt(req.params.id));
  if (!run) {
    res.status(404).json({ error: 'Sync run not found' });
    return;
  }
  res.json(run);
});

router.get('/runs/:id/items', (req: Request, res: Response) => {
  const items = db.getReconciliationItems(parseInt(req.params.id));
  res.json(items);
});

// Reconciliation data
router.get('/reconciliation', (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 500;
  const items = db.getRecentReconciliationItems(limit);
  res.json(items);
});

router.get('/reconciliation/stats', (req: Request, res: Response) => {
  const stats = db.getReconciliationStats();
  res.json(stats);
});

// Health check
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    activeJobs: scheduler.getActiveJobs().length
  });
});

export default router;
