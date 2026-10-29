import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './config/db';
import { ResearchService } from './modules/research/research.service';
import { ChannelService } from './modules/channels/channel.service';
import { createResearchRouter } from './routes/research.routes';
import { createChannelRouter } from './routes/channel.routes';
import { createTranscriptRouter } from './routes/transcript.routes';
import { setupScheduledJobs } from './jobs/scheduler';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure DB is connected for serverless invocations
app.use(async (_req, _res, next) => {
  try {
    await connectDB();
  } catch (err: any) {
    console.error('[DB Middleware] Connection error:', err.message);
  }
  next();
});

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

app.get('/', (_req, res) => {
  res.json({
    name: 'ContentGPT Backend API',
    status: 'online',
    version: '1.0.0',
    endpoints: [
      '/health',
      '/api/v1/research/feed',
      '/api/v1/research/dates',
      '/api/v1/research/stats',
      '/api/v1/channels',
    ],
  });
});

// Initialize Services
const researchService = new ResearchService();
const channelService = new ChannelService();

// Register Routes
app.use('/api/v1/research', createResearchRouter(researchService));
app.use('/api/v1/channels', createChannelRouter(channelService));
app.use('/api/v1/transcripts', createTranscriptRouter());

// Setup Cron Schedulers
setupScheduledJobs(researchService);

// Only listen locally or when not in Vercel serverless environment
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 ContentGPT Backend running on http://localhost:${PORT}`);
    console.log(`📡 Autonomous Schedules: 09:00 AM & 08:00 PM daily`);
    console.log(`🧹 Retention Policy: 14-day auto-purge at midnight`);
    console.log(`====================================================`);
  });
}

// Export for Vercel Serverless
export default app;
module.exports = app;
