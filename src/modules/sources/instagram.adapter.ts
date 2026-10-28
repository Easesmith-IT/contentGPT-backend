import axios from 'axios';
import Parser from 'rss-parser';
import { BaseSourceAdapter, ScrapedItem } from './base.adapter';
import { MonitoredChannel } from '../../models/MonitoredChannel';
import { isIndiaSpecificSports } from '../research/india-sports-filter';

export class InstagramSourceAdapter implements BaseSourceAdapter {
  platformName = 'INSTAGRAM' as const;
  private parser: Parser;

  constructor() {
    this.parser = new Parser({
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ContentGPT/1.0',
      },
    });
  }

  async fetchLatest(limit: number = 15): Promise<ScrapedItem[]> {
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

        // METHOD 1: RapidAPI Instagram Scraper (if key provided)
        if (rapidApiKey) {
          try {
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
              const caption = item.caption?.text || 'Indian sports reel';

              if (
                !isIndiaSpecificSports({
                  title: `${ch.channelName} - ${caption.slice(0, 60)}`,
                  contentSnippet: caption,
                  authorOrChannel: `@${username}`,
                })
              ) {
                continue;
              }

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
          // METHOD 2: Automated Public Fallback via Google News Feed for public Reels & Posts
          // Works without requiring any third-party API key
          try {
            const queries = [
              `site:instagram.com/reel/+${username}`,
              `site:instagram.com/p/+${username}`,
            ];

            for (const q of queries) {
              const url = `https://news.google.com/rss/search?q=${q}&hl=en-IN&gl=IN&ceid=IN:en`;
              const feed = await this.parser.parseURL(url);
              const topPosts = feed.items.slice(0, 4);

              for (const post of topPosts) {
                if (!post.title || !post.link) continue;

                const cleanTitle = post.title.replace(/ - Instagram$/i, '').trim();
                const rawSnippet = post.contentSnippet || post.content || cleanTitle;
                const cleanSnippet = rawSnippet.replace(/<[^>]*>?/gm, '').trim().slice(0, 280);

                if (
                  !isIndiaSpecificSports({
                    title: cleanTitle,
                    contentSnippet: cleanSnippet,
                    authorOrChannel: `@${username}`,
                  })
                ) {
                  continue;
                }

                results.push({
                  sourcePlatform: 'INSTAGRAM',
                  sourceUrl: post.link.trim(),
                  title: `${ch.channelName}: ${cleanTitle.slice(0, 75)}`,
                  contentSnippet: cleanSnippet || cleanTitle,
                  authorOrChannel: `@${username}`,
                  publishedAt: post.pubDate ? new Date(post.pubDate) : new Date(),
                  engagementMetrics: {
                    views: 0,
                    upvotes: 0,
                    comments: 0,
                  },
                  isPrioritySource: true,
                  priorityWeight: ch.priorityWeight || 2.0,
                  channelId: ch._id,
                });
              }
            }
          } catch (rssErr: any) {
            console.warn(`[InstagramSourceAdapter] Public fallback failed for @${username}: ${rssErr.message}`);
          }
        }
      }
    } catch (err: any) {
      console.error(`[InstagramSourceAdapter] Error querying Instagram channels: ${err.message}`);
    }

    return results.slice(0, limit);
  }
}
