import axios from 'axios';
import { BaseSourceAdapter, ScrapedItem } from './base.adapter';
import { MonitoredChannel } from '../../models/MonitoredChannel';

export class InstagramSourceAdapter implements BaseSourceAdapter {
  platformName = 'INSTAGRAM' as const;

  async fetchLatest(limit: number = 10): Promise<ScrapedItem[]> {
    const results: ScrapedItem[] = [];
    const rapidApiKey = process.env.RAPIDAPI_KEY;

    try {
      const igChannels = await MonitoredChannel.find({
        platform: 'INSTAGRAM',
        isActive: true,
      });

      for (const ch of igChannels) {
        const username = ch.channelUrl
          .replace('https://www.instagram.com/', '')
          .replace('https://instagram.com/', '')
          .replace('@', '')
          .split('/')[0]
          .split('?')[0];

        if (!username) continue;

        if (rapidApiKey) {
          try {
            // RapidAPI Instagram Scraper endpoint
            const res = await axios.get(`https://instagram-scraper-api2.p.rapidapi.com/v1/posts`, {
              params: { username_or_id_or_url: username },
              headers: {
                'X-RapidAPI-Key': rapidApiKey,
                'X-RapidAPI-Host': 'instagram-scraper-api2.p.rapidapi.com',
              },
              timeout: 10000,
            });

            const posts = res.data?.data?.items || [];
            for (const item of posts.slice(0, 4)) {
              const reelUrl = item.code ? `https://www.instagram.com/reel/${item.code}/` : ch.channelUrl;
              const caption = item.caption?.text || 'Instagram sports reel';

              results.push({
                sourcePlatform: 'INSTAGRAM',
                sourceUrl: reelUrl,
                title: `${ch.channelName} - ${caption.slice(0, 60)}...`,
                contentSnippet: caption.slice(0, 250),
                authorOrChannel: `@${username}`,
                publishedAt: item.taken_at ? new Date(item.taken_at * 1000) : new Date(),
                engagementMetrics: {
                  views: item.view_count || item.play_count || 0,
                  upvotes: item.like_count || 0,
                  comments: item.comment_count || 0,
                },
                isPrioritySource: true,
                priorityWeight: ch.priorityWeight || 2.0,
                channelId: ch._id,
              });
            }
          } catch (apiErr: any) {
            console.warn(`[InstagramSourceAdapter] RapidAPI call failed for @${username}: ${apiErr.message}`);
          }
        } else {
          // If no RapidAPI key configured, record channel check without throwing error
          console.log(`[InstagramSourceAdapter] Note: Set RAPIDAPI_KEY in .env for automated Instagram profile scraping. Monitored account: @${username}`);
        }
      }
    } catch (err: any) {
      console.error(`[InstagramSourceAdapter] Error querying Instagram channels: ${err.message}`);
    }

    return results.slice(0, limit);
  }
}
