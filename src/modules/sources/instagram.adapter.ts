import axios from 'axios';
import Parser from 'rss-parser';
import { BaseSourceAdapter, ScrapedItem } from './base.adapter';
import { MonitoredChannel } from '../../models/MonitoredChannel';
import { isIndiaSpecificSports } from '../research/india-sports-filter';

// Dynamic require to avoid missing types in commonjs
const { GoogleDecoder } = require('google-news-url-decoder');

export class InstagramSourceAdapter implements BaseSourceAdapter {
  platformName = 'INSTAGRAM' as const;
  private parser: Parser;
  private decoder: any;

  constructor() {
    this.parser = new Parser({
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ContentGPT/1.0',
      },
    });
    this.decoder = new GoogleDecoder();
  }

  async fetchLatest(limit: number = 15): Promise<ScrapedItem[]> {
    const results: ScrapedItem[] = [];
    const rapidApiKey = process.env.RAPIDAPI_KEY;
    const rapidApiHost = process.env.RAPIDAPI_HOST;

    try {
      let igChannels = await MonitoredChannel.find({
        platform: 'INSTAGRAM',
        isActive: true,
      });

      if (!igChannels || igChannels.length === 0) {
        igChannels = [
          { channelName: 'Indian Cricket Team', channelUrl: 'https://www.instagram.com/indiancricketteam/', priorityWeight: 2.5 } as any,
          { channelName: 'Indian Super League', channelUrl: 'https://www.instagram.com/indiansuperleague/', priorityWeight: 2.0 } as any,
          { channelName: 'Team India', channelUrl: 'https://www.instagram.com/teamindia/', priorityWeight: 2.0 } as any,
        ];
      }

      for (const ch of igChannels) {
        const username = ch.channelUrl
          .replace('https://www.instagram.com/', '')
          .replace('https://instagram.com/', '')
          .replace('@', '')
          .split('/')[0]
          .split('?')[0];

        if (!username) continue;

        let postsScraped = 0;

        // METHOD 1: RapidAPI Instagram Scraper (active only if BOTH Key and Host are configured)
        if (rapidApiKey && rapidApiKey.trim() && rapidApiHost && rapidApiHost.trim()) {
          try {
            const host = rapidApiHost.trim();
            const res = await axios.get(`https://${host}/v1/posts`, {
              params: { username_or_id_or_url: username },
              headers: {
                'X-RapidAPI-Key': rapidApiKey.trim(),
                'X-RapidAPI-Host': host,
              },
              timeout: 10000,
            });

            const posts = res.data?.data?.items || res.data?.posts || res.data?.items || [];
            for (const item of posts.slice(0, 4)) {
              const reelUrl = item.code 
                ? `https://www.instagram.com/reel/${item.code}/` 
                : (item.url || ch.channelUrl);
              const caption = item.caption?.text || item.caption || item.text || 'Indian sports reel';

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
                  upvotes: item.like_count || item.likes || 0,
                  comments: item.comment_count || item.comments || 0,
                },
                isPrioritySource: true,
                priorityWeight: ch.priorityWeight || 2.0,
                channelId: ch._id,
              });
              postsScraped++;
            }
          } catch (apiErr: any) {
            console.warn(
              `[InstagramSourceAdapter] RapidAPI call for @${username} returned: ${apiErr.response?.data?.message || apiErr.message}. Executing public feed engine...`
            );
          }
        }

        // METHOD 2: Zero-Key Public Feed Engine (100% Free Forever & Always Reliable)
        // Runs automatically to ensure a full stream of real-time Indian sports reels and posts
        // with zero API keys or subscriptions needed
        if (postsScraped < 4) {
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

                let finalUrl = post.link.trim();
                if (finalUrl.includes('news.google.com')) {
                  try {
                    const dec = await this.decoder.decode(finalUrl);
                    if (dec && dec.status && dec.decoded_url) {
                      finalUrl = dec.decoded_url.trim();
                    }
                  } catch {}
                }

                results.push({
                  sourcePlatform: 'INSTAGRAM',
                  sourceUrl: finalUrl,
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
