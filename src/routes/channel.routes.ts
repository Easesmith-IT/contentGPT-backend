import { Router, Request, Response } from 'express';
import { ChannelService } from '../modules/channels/channel.service';

export function createChannelRouter(channelService: ChannelService): Router {
  const router = Router();

  // GET /api/v1/channels
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const channels = await channelService.getAllChannels();
      res.json({ success: true, data: channels });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/v1/channels
  router.post('/', async (req: Request, res: Response) => {
    try {
      const { platform, channelName, channelUrl, priorityWeight, category, autoTranscribe } = req.body;
      if (!platform || !channelName || !channelUrl) {
        return res.status(400).json({ success: false, error: 'platform, channelName, and channelUrl are required' });
      }

      const channel = await channelService.addChannel({
        platform,
        channelName,
        channelUrl,
        priorityWeight: priorityWeight ? parseFloat(priorityWeight) : 2.0,
        category: category || 'sports',
        autoTranscribe: !!autoTranscribe,
      });

      res.status(201).json({ success: true, data: channel });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // PATCH /api/v1/channels/:id
  router.patch('/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const updated = await channelService.updateChannel(id, req.body);
      if (!updated) {
        return res.status(404).json({ success: false, error: 'Channel not found' });
      }
      res.json({ success: true, data: updated });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // DELETE /api/v1/channels/:id
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const success = await channelService.deleteChannel(id);
      if (!success) {
        return res.status(404).json({ success: false, error: 'Channel not found' });
      }
      res.json({ success: true, message: 'Channel deleted successfully' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
