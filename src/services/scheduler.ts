import cron, { ScheduledTask } from 'node-cron';
import * as db from './database';
import * as syncer from './syncer';

const activeTasks = new Map<number, ScheduledTask>();

export function startScheduler(): void {
  console.log('Starting scheduler...');

  const schedules = db.getSchedules();

  for (const schedule of schedules) {
    if (schedule.enabled && schedule.id) {
      scheduleJob(schedule.id);
    }
  }

  console.log(`Scheduler started with ${activeTasks.size} active jobs`);
}

export function scheduleJob(scheduleId: number): boolean {
  const schedule = db.getSchedule(scheduleId);

  if (!schedule || !schedule.id) {
    console.error(`Schedule ${scheduleId} not found`);
    return false;
  }

  if (activeTasks.has(scheduleId)) {
    activeTasks.get(scheduleId)?.stop();
    activeTasks.delete(scheduleId);
  }

  if (!schedule.enabled) {
    console.log(`Schedule ${scheduleId} is disabled, not scheduling`);
    return true;
  }

  if (!cron.validate(schedule.cron_expression)) {
    console.error(`Invalid cron expression for schedule ${scheduleId}: ${schedule.cron_expression}`);
    return false;
  }

  const task = cron.schedule(schedule.cron_expression, async () => {
    console.log(`Running scheduled sync: ${schedule.name} (${schedule.sync_type})`);

    try {
      const options = {
        tolerance: schedule.tolerance,
        dryRun: schedule.dry_run,
        scheduleId: schedule.id
      };

      switch (schedule.sync_type) {
        case 'inventory':
          await syncer.runInventorySync(options);
          break;
        case 'materials':
          await syncer.runMaterialsSync(options);
          break;
        case 'products':
          await syncer.runProductsSync(options);
          break;
        case 'manufacturing':
          await syncer.runManufacturingSync(options);
          break;
        default:
          console.error(`Unknown sync type: ${schedule.sync_type}`);
      }
    } catch (error) {
      console.error(`Scheduled sync failed: ${error}`);
    }
  });

  activeTasks.set(scheduleId, task);
  console.log(`Scheduled job ${scheduleId}: ${schedule.name} (${schedule.cron_expression})`);

  return true;
}

export function stopJob(scheduleId: number): boolean {
  const task = activeTasks.get(scheduleId);
  if (task) {
    task.stop();
    activeTasks.delete(scheduleId);
    console.log(`Stopped job ${scheduleId}`);
    return true;
  }
  return false;
}

export function getActiveJobs(): number[] {
  return Array.from(activeTasks.keys());
}

export function stopAllJobs(): void {
  for (const [id, task] of activeTasks) {
    task.stop();
    console.log(`Stopped job ${id}`);
  }
  activeTasks.clear();
}
