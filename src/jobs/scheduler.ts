import cron from 'node-cron';
import { ResearchService } from '../modules/research/research.service';

export function setupScheduledJobs(researchService: ResearchService) {
  console.log('[Scheduler] Initializing autonomous cron jobs...');

  // 1. Morning Scrape & Briefing Run: 09:00 AM every day
  // Cron expression: '0 9 * * *'
  cron.schedule('0 9 * * *', async () => {
    console.log('[Scheduler] Executing scheduled 09:00 AM Morning Scrape...');
    try {
      await researchService.runScrapePipeline('MORNING_9AM');
    } catch (err: any) {
      console.error(`[Scheduler Error] Morning scrape failed: ${err.message}`);
    }
  });
  console.log('[Scheduler] Registered Morning Run: 09:00 AM daily (0 9 * * *)');

  // 2. Evening Scrape & Briefing Run: 08:00 PM (20:00) every day
  // Cron expression: '0 20 * * *'
  cron.schedule('0 20 * * *', async () => {
    console.log('[Scheduler] Executing scheduled 08:00 PM Evening Scrape...');
    try {
      await researchService.runScrapePipeline('EVENING_8PM');
    } catch (err: any) {
      console.error(`[Scheduler Error] Evening scrape failed: ${err.message}`);
    }
  });
  console.log('[Scheduler] Registered Evening Run: 08:00 PM daily (0 20 * * *)');

  // 3. Midnight 14-day Auto-Purge of unsaved feeds: 00:00 every day
  // Cron expression: '0 0 * * *'
  cron.schedule('0 0 * * *', async () => {
    console.log('[Scheduler] Executing midnight 14-day auto-purge of unsaved feed data...');
    try {
      const purgeResult = await researchService.purgeOldUnsaved(14);
      console.log(`[Scheduler] 14-day cleanup completed. Removed ${purgeResult.deletedCount} unsaved records.`);
    } catch (err: any) {
      console.error(`[Scheduler Error] 14-day auto-purge failed: ${err.message}`);
    }
  });
  console.log('[Scheduler] Registered 14-day Auto-Purge: Midnight 00:00 daily (0 0 * * *)');
}
