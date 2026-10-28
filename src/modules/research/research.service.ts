import { ResearchItem, IResearchItem, SourcePlatform } from '../../models/ResearchItem';
import { MonitoredChannel } from '../../models/MonitoredChannel';
import { RssSourceAdapter } from '../sources/rss.adapter';
import { GoogleNewsAdapter } from '../sources/google-news.adapter';
import { RedditSourceAdapter } from '../sources/reddit.adapter';
import { YoutubeSourceAdapter } from '../sources/youtube.adapter';
import { InstagramSourceAdapter } from '../sources/instagram.adapter';

export interface FeedQueryOptions {
  date?: string; // 'YYYY-MM-DD'
  platform?: string;
  isSaved?: boolean;
  priorityOnly?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export class ResearchService {
  private rssAdapter = new RssSourceAdapter();
  private googleNewsAdapter = new GoogleNewsAdapter();
  private redditAdapter = new RedditSourceAdapter();
  private youtubeAdapter = new YoutubeSourceAdapter();
  private instagramAdapter = new InstagramSourceAdapter();

  /**
   * Seed default priority sports channels if the database has none
   */
  async ensureDefaultChannels(): Promise<void> {
    const count = await MonitoredChannel.countDocuments();
    if (count === 0) {
      console.log('[ResearchService] Seeding default priority sports channels...');
      await MonitoredChannel.create([
        {
          platform: 'YOUTUBE',
          channelName: 'ESPN FC',
          channelUrl: 'https://www.youtube.com/@espnfc',
          platformChannelId: 'UC6C1xG0tUpxzXGZrY3wP3mA',
          priorityWeight: 2.5,
          category: 'football',
          autoTranscribe: false,
          isActive: true,
        },
        {
          platform: 'YOUTUBE',
          channelName: 'Sky Sports Premier League',
          channelUrl: 'https://www.youtube.com/@SkySportsPL',
          platformChannelId: 'UCNAf1k0yIjyGu3k9BwAg3lg',
          priorityWeight: 2.5,
          category: 'football',
          autoTranscribe: false,
          isActive: true,
        },
        {
          platform: 'YOUTUBE',
          channelName: 'NBA',
          channelUrl: 'https://www.youtube.com/@NBA',
          platformChannelId: 'UCWJ2lWNubArHWmf3FIHbfcQ',
          priorityWeight: 2.0,
          category: 'basketball',
          autoTranscribe: false,
          isActive: true,
        },
        {
          platform: 'INSTAGRAM',
          channelName: 'Bleacher Report Football',
          channelUrl: 'https://www.instagram.com/brfootball/',
          priorityWeight: 2.0,
          category: 'football',
          isActive: true,
        },
      ]);
    }
  }

  /**
   * Run the full scrape pipeline across all adapters
   */
  async runScrapePipeline(slot: 'MORNING_9AM' | 'EVENING_8PM' | 'MANUAL' = 'MANUAL'): Promise<{
    totalFetched: number;
    newItemsInserted: number;
    errors: string[];
  }> {
    console.log(`[Scraper Pipeline] Starting scrape cycle for slot: ${slot}...`);
    await this.ensureDefaultChannels();

    const errors: string[] = [];
    const allScrapedItems = [];

    // 1. YouTube
    try {
      const ytItems = await this.youtubeAdapter.fetchLatest(25);
      allScrapedItems.push(...ytItems);
      console.log(`[Scraper] YouTube: fetched ${ytItems.length} videos`);
    } catch (e: any) {
      errors.push(`YouTube scraper error: ${e.message}`);
    }

    // 2. Reddit
    try {
      const redditItems = await this.redditAdapter.fetchLatest(25);
      allScrapedItems.push(...redditItems);
      console.log(`[Scraper] Reddit: fetched ${redditItems.length} posts`);
    } catch (e: any) {
      errors.push(`Reddit scraper error: ${e.message}`);
    }

    // 3. Google News & Trends
    try {
      const gNewsItems = await this.googleNewsAdapter.fetchLatest(20);
      allScrapedItems.push(...gNewsItems);
      console.log(`[Scraper] Google News: fetched ${gNewsItems.length} articles`);
    } catch (e: any) {
      errors.push(`Google News scraper error: ${e.message}`);
    }

    // 4. Sports News RSS
    try {
      const rssItems = await this.rssAdapter.fetchLatest(20);
      allScrapedItems.push(...rssItems);
      console.log(`[Scraper] Sports RSS: fetched ${rssItems.length} articles`);
    } catch (e: any) {
      errors.push(`Sports RSS scraper error: ${e.message}`);
    }

    // 5. Instagram
    try {
      const igItems = await this.instagramAdapter.fetchLatest(10);
      allScrapedItems.push(...igItems);
    } catch (e: any) {
      errors.push(`Instagram scraper error: ${e.message}`);
    }

    // Insert or update in database (deduplicating by sourceUrl)
    let newItemsCount = 0;
    for (const item of allScrapedItems) {
      try {
        const existing = await ResearchItem.findOne({ sourceUrl: item.sourceUrl });
        if (!existing) {
          await ResearchItem.create({
            ...item,
            isSaved: false,
          });
          newItemsCount++;
        } else {
          // If already exists, update engagement metrics or priority if changed
          if (item.engagementMetrics) {
            existing.engagementMetrics = item.engagementMetrics;
            await existing.save();
          }
        }
      } catch (err: any) {
        // Ignore duplicate key race conditions
      }
    }

    console.log(`[Scraper Pipeline] Completed. Total fetched: ${allScrapedItems.length}, New inserted: ${newItemsCount}`);

    return {
      totalFetched: allScrapedItems.length,
      newItemsInserted: newItemsCount,
      errors,
    };
  }

  /**
   * Purge unsaved feed items older than N days (default 14 days)
   * Items with isSaved === true are strictly protected!
   */
  async purgeOldUnsaved(days: number = 14): Promise<{ deletedCount: number; cutoffDate: Date }> {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = await ResearchItem.deleteMany({
      isSaved: false,
      createdAt: { $lt: cutoffDate },
    });

    console.log(`[Retention Purge] Purged ${result.deletedCount} unsaved feed items older than ${days} days (${cutoffDate.toISOString()}).`);

    return {
      deletedCount: result.deletedCount || 0,
      cutoffDate,
    };
  }

  /**
   * Toggle isSaved (bookmark) flag on an item
   */
  async toggleSaveItem(id: string, saveStatus?: boolean): Promise<IResearchItem | null> {
    const item = await ResearchItem.findById(id);
    if (!item) return null;

    if (typeof saveStatus === 'boolean') {
      item.isSaved = saveStatus;
    } else {
      item.isSaved = !item.isSaved;
    }

    item.savedAt = item.isSaved ? new Date() : null;
    await item.save();
    return item;
  }

  /**
   * Fetch feeds with pagination, date filtering, platform, and search
   */
  async getFeeds(options: FeedQueryOptions) {
    const {
      date,
      platform,
      isSaved,
      priorityOnly,
      search,
      page = 1,
      limit = 20,
    } = options;

    const query: any = {};

    // 1. Filter by specific day (YYYY-MM-DD)
    if (date) {
      const startOfDay = new Date(`${date}T00:00:00.000Z`);
      const endOfDay = new Date(`${date}T23:59:59.999Z`);
      query.createdAt = { $gte: startOfDay, $lte: endOfDay };
    }

    // 2. Filter by platform
    if (platform && platform !== 'ALL') {
      query.sourcePlatform = platform;
    }

    // 3. Filter by isSaved (vault)
    if (typeof isSaved === 'boolean') {
      query.isSaved = isSaved;
    }

    // 4. Priority channels only
    if (priorityOnly) {
      query.isPrioritySource = true;
    }

    // 5. Search keyword
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [{ title: regex }, { contentSnippet: regex }, { authorOrChannel: regex }];
    }

    const total = await ResearchItem.countDocuments(query);
    const items = await ResearchItem.find(query)
      .sort({ isPrioritySource: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get list of unique dates with item counts for easy calendar/day navigation
   */
  async getAvailableDates(): Promise<{ date: string; count: number; savedCount: number }[]> {
    const agg = await ResearchItem.aggregate([
      {
        $project: {
          dateStr: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
          },
          isSaved: 1,
        },
      },
      {
        $group: {
          _id: '$dateStr',
          count: { $sum: 1 },
          savedCount: {
            $sum: { $cond: [{ $eq: ['$isSaved', true] }, 1, 0] },
          },
        },
      },
      {
        $sort: { _id: -1 },
      },
      {
        $project: {
          _id: 0,
          date: '$_id',
          count: 1,
          savedCount: 1,
        },
      },
    ]);

    return agg;
  }

  /**
   * Get system storage & feed statistics
   */
  async getStats() {
    const totalItems = await ResearchItem.countDocuments();
    const savedItems = await ResearchItem.countDocuments({ isSaved: true });
    const unsavedItems = totalItems - savedItems;

    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const pendingPurgeCount = await ResearchItem.countDocuments({
      isSaved: false,
      createdAt: { $lt: fourteenDaysAgo },
    });

    const priorityChannelsCount = await MonitoredChannel.countDocuments({ isActive: true });

    return {
      totalItems,
      savedItems,
      unsavedItems,
      pendingPurgeCount,
      priorityChannelsCount,
    };
  }
}
