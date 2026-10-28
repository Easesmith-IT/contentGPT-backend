import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './config/db';
import { ResearchService } from './modules/research/research.service';
import { ChannelService } from './modules/channels/channel.service';
import { createResearchRouter } from './routes/research.routes';
import { createChannelRouter } from './routes/channel.routes';
import { setupScheduledJobs } from './jobs/scheduler';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check
app.get('/health', (_req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    service: 'ContentGPT Backend',
    schedules: {
      morningRun: '09:00 AM (0 9 * * *)',
      eveningRun: '08:00 PM (0 20 * * *)',
      retentionPurge: 'Midnight (0 0 * * *) - 14 Days',
    },
  });
});

async function bootstrap() {
  // 1. Connect Database
  await connectDB();

  // 2. Initialize Services
  const researchService = new ResearchService();
  const channelService = new ChannelService();

  // 3. Register Routes
  app.use('/api/v1/research', createResearchRouter(researchService));
  app.use('/api/v1/channels', createChannelRouter(channelService));

  // 4. Setup 9 AM / 8 PM Cron Schedulers & 14-day Auto-Purge
  setupScheduledJobs(researchService);

  // 5. Start Server
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 ContentGPT Backend running on http://localhost:${PORT}`);
    console.log(`📡 Autonomous Schedules: 09:00 AM & 08:00 PM daily`);
    console.log(`🧹 Retention Policy: 14-day auto-purge at midnight`);
    console.log(`====================================================`);
  });
}

bootstrap().catch((err) => {
  console.error('Fatal bootstrapping error:', err);
});
