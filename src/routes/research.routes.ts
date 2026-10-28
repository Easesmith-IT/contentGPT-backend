import { Router, Request, Response } from 'express';
import { ResearchService } from '../modules/research/research.service';

export function createResearchRouter(researchService: ResearchService): Router {
  const router = Router();

  // GET /api/v1/research/feed
  router.get('/feed', async (req: Request, res: Response) => {
    try {
      const { date, platform, isSaved, priorityOnly, search, page, limit } = req.query;

      const result = await researchService.getFeeds({
        date: date as string,
        platform: platform as string,
        isSaved: isSaved === 'true' ? true : isSaved === 'false' ? false : undefined,
        priorityOnly: priorityOnly === 'true',
        search: search as string,
        page: page ? parseInt(page as string, 10) : 1,
        limit: limit ? parseInt(limit as string, 10) : 20,
      });

      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/v1/research/dates - Get unique dates available in DB
  router.get('/dates', async (_req: Request, res: Response) => {
    try {
      const dates = await researchService.getAvailableDates();
      res.json({ success: true, data: dates });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/v1/research/stats - Get storage and retention stats
  router.get('/stats', async (_req: Request, res: Response) => {
    try {
      const stats = await researchService.getStats();
      res.json({ success: true, data: stats });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // PATCH /api/v1/research/:id/save - Toggle bookmark/save flag
  router.patch('/:id/save', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const { isSaved } = req.body;
      const updated = await researchService.toggleSaveItem(id, isSaved);

      if (!updated) {
        return res.status(404).json({ success: false, error: 'Feed item not found' });
      }

      res.json({
        success: true,
        message: updated.isSaved ? 'Saved to Vault (protected from auto-purge)' : 'Removed from Vault',
        data: updated,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/v1/research/scrape - Trigger immediate scrape
  router.post('/scrape', async (req: Request, res: Response) => {
    try {
      const slot = req.body.slot || 'MANUAL';
      const result = await researchService.runScrapePipeline(slot);
      res.json({
        success: true,
        message: `Scrape completed. Fetched ${result.totalFetched} items (${result.newItemsInserted} new).`,
        data: result,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/v1/research/purge - Manually purge unsaved feeds older than X days
  router.post('/purge', async (req: Request, res: Response) => {
    try {
      const days = req.body.days ? parseInt(req.body.days, 10) : 14;
      const result = await researchService.purgeOldUnsaved(days);
      res.json({
        success: true,
        message: `Successfully purged ${result.deletedCount} unsaved feeds older than ${days} days.`,
        data: result,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // VERCEL CRON ENDPOINTS (Triggered automatically by Vercel Cloud Scheduler)
  router.get('/cron/morning', async (_req: Request, res: Response) => {
    try {
      const result = await researchService.runScrapePipeline('MORNING_9AM');
      res.json({ success: true, slot: 'MORNING_9AM', data: result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/cron/evening', async (_req: Request, res: Response) => {
    try {
      const result = await researchService.runScrapePipeline('EVENING_8PM');
      res.json({ success: true, slot: 'EVENING_8PM', data: result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/cron/purge', async (_req: Request, res: Response) => {
    try {
      const result = await researchService.purgeOldUnsaved(14);
      res.json({ success: true, slot: 'PURGE_14D', data: result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
