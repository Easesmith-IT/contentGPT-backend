import { ResearchItem, IResearchItem, SourcePlatform } from '../../models/ResearchItem';
import { MonitoredChannel } from '../../models/MonitoredChannel';
import { RssSourceAdapter } from '../sources/rss.adapter';
import { GoogleNewsAdapter } from '../sources/google-news.adapter';
import { RedditSourceAdapter } from '../sources/reddit.adapter';
import { YoutubeSourceAdapter } from '../sources/youtube.adapter';
import { InstagramSourceAdapter } from '../sources/instagram.adapter';
import { isIndiaSpecificSports } from './india-sports-filter';

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
   * Seed and verify default priority Indian sports channels
   * Automatically cleans up any previous global non-India channels
   */
  async ensureDefaultChannels(): Promise<void> {
    // 1. Remove legacy non-India channels
    const legacyNonIndiaUrls = [
      'https://www.youtube.com/@espnfc',
      'https://www.youtube.com/@SkySportsPL',
      'https://www.youtube.com/@NBA',
      'https://www.instagram.com/brfootball/',
    ];
    await MonitoredChannel.deleteMany({ channelUrl: { $in: legacyNonIndiaUrls } });

    // 2. Ensure official India sports priority channels
    const defaultIndiaChannels = [
      {
        platform: 'YOUTUBE' as const,
        channelName: 'Star Sports',
        channelUrl: 'https://www.youtube.com/@starsports',
        platformChannelId: 'UCmqfX0S3x0I3uwLkPdpX03w',
        priorityWeight: 2.5,
        category: 'sports',
        autoTranscribe: false,
        isActive: true,
      },
      {
        platform: 'YOUTUBE' as const,
        channelName: 'Sports Tak',
        channelUrl: 'https://www.youtube.com/@SportsTak',
        platformChannelId: 'UCVXCo0W9pk2dDkEBNLhTt7A',
        priorityWeight: 2.5,
        category: 'sports',
        autoTranscribe: false,
        isActive: true,
      },
      {
        platform: 'YOUTUBE' as const,
        channelName: 'Indian Super League',
        channelUrl: 'https://www.youtube.com/@IndianSuperLeague',
        platformChannelId: 'UCJk-aQ7NZtqYtpcqKDt_vZg',
        priorityWeight: 2.0,
        category: 'football',
        autoTranscribe: false,
        isActive: true,
      },
      {
        platform: 'YOUTUBE' as const,
        channelName: 'Cricbuzz',
        channelUrl: 'https://www.youtube.com/@cricbuzz',
        platformChannelId: 'UCSRQXk5yErn4e14vN76upOw',
        priorityWeight: 2.0,
        category: 'cricket',
        autoTranscribe: false,
        isActive: true,
      },
      {
        platform: 'YOUTUBE' as const,
        channelName: 'Sony Sports Network',
        channelUrl: 'https://www.youtube.com/@SonySportsNetwork',
        platformChannelId: 'UC_WKb6N9iTGc77hxwXLDrbA',
        priorityWeight: 2.0,
        category: 'sports',
        autoTranscribe: false,
        isActive: true,
      },
      {
        platform: 'INSTAGRAM' as const,
        channelName: 'Indian Cricket Team',
        channelUrl: 'https://www.instagram.com/indiancricketteam/',
        priorityWeight: 2.5,
        category: 'cricket',
        isActive: true,
      },
      {
        platform: 'INSTAGRAM' as const,
        channelName: 'Indian Super League',
        channelUrl: 'https://www.instagram.com/indiansuperleague/',
        priorityWeight: 2.0,
        category: 'football',
        isActive: true,
      },
      {
        platform: 'INSTAGRAM' as const,
        channelName: 'Team India',
        channelUrl: 'https://www.instagram.com/teamindia/',
        priorityWeight: 2.0,
        category: 'sports',
        isActive: true,
      },
    ];

    for (const ch of defaultIndiaChannels) {
      const existing = await MonitoredChannel.findOne({ channelUrl: ch.channelUrl });
      if (!existing) {
        await MonitoredChannel.create(ch);
        console.log(`[ResearchService] Registered India sports priority channel: ${ch.channelName}`);
      }
    }
  }

  /**
   * Purge any non-India sports news from database
   */
  async cleanGlobalItems(): Promise<{ removedCount: number }> {
    const allItems = await ResearchItem.find();
    let removedCount = 0;

    for (const item of allItems) {
      if (!isIndiaSpecificSports(item)) {
        await ResearchItem.deleteOne({ _id: item._id });
        removedCount++;
      }
    }

    if (removedCount > 0) {
      console.log(`[ResearchService] Cleaned up ${removedCount} global non-India sports items from database.`);
    }
    return { removedCount };
  }

  /**
   * Run the full scrape pipeline across all adapters (100% India-specific)
   */
  async runScrapePipeline(slot: 'MORNING_9AM' | 'EVENING_8PM' | 'MANUAL' = 'MANUAL'): Promise<{
    totalFetched: number;
    newItemsInserted: number;
    errors: string[];
  }> {
    console.log(`[Scraper Pipeline] Starting India-specific scrape cycle for slot: ${slot}...`);
    await this.ensureDefaultChannels();

    const errors: string[] = [];
    const allScrapedItems = [];

    // 1. YouTube (India Sports Channels)
    try {
      const ytItems = await this.youtubeAdapter.fetchLatest(25);
      allScrapedItems.push(...ytItems);
      console.log(`[Scraper] YouTube (India Channels): fetched ${ytItems.length} videos`);
    } catch (e: any) {
      errors.push(`YouTube scraper error: ${e.message}`);
    }

    // 2. Reddit (r/indiansports, r/IndianFootball, r/IndiaCricket, r/ipl)
    try {
      const redditItems = await this.redditAdapter.fetchLatest(25);
      allScrapedItems.push(...redditItems);
      console.log(`[Scraper] Reddit (India Subs): fetched ${redditItems.length} posts`);
    } catch (e: any) {
      errors.push(`Reddit scraper error: ${e.message}`);
    }

    // 3. Google News (India Edition & India Sports Topics)
    try {
      const gNewsItems = await this.googleNewsAdapter.fetchLatest(25);
      allScrapedItems.push(...gNewsItems);
      console.log(`[Scraper] Google News (India): fetched ${gNewsItems.length} articles`);
    } catch (e: any) {
      errors.push(`Google News scraper error: ${e.message}`);
    }

    // 4. India Sports RSS Outlets
    try {
      const rssItems = await this.rssAdapter.fetchLatest(30);
      allScrapedItems.push(...rssItems);
      console.log(`[Scraper] Sports RSS (India): fetched ${rssItems.length} articles`);
    } catch (e: any) {
      errors.push(`Sports RSS scraper error: ${e.message}`);
    }

    // 5. Instagram (India Sports Channels)
    try {
      const igItems = await this.instagramAdapter.fetchLatest(10);
      allScrapedItems.push(...igItems);
    } catch (e: any) {
      errors.push(`Instagram scraper error: ${e.message}`);
    }

    // Insert or update in database (deduplicating by sourceUrl and strictly enforcing India sports filter)
    let newItemsCount = 0;
    for (const item of allScrapedItems) {
      // Final guardrail: ensure item is strictly India-specific
      if (!isIndiaSpecificSports(item)) {
        continue;
      }

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

    console.log(
      `[Scraper Pipeline] Completed. Total fetched: ${allScrapedItems.length}, New India sports inserted: ${newItemsCount}`
    );

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

    console.log(
      `[Retention Purge] Purged ${result.deletedCount} unsaved feed items older than ${days} days (${cutoffDate.toISOString()}).`
    );

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
