import Parser from 'rss-parser';
import axios from 'axios';
import { YoutubeTranscript } from 'youtube-transcript';
import { BaseSourceAdapter, ScrapedItem } from './base.adapter';
import { MonitoredChannel } from '../../models/MonitoredChannel';
import { isIndiaSpecificSports } from '../research/india-sports-filter';

export class YoutubeSourceAdapter implements BaseSourceAdapter {
  platformName = 'YOUTUBE' as const;
  private parser: Parser;

  constructor() {
    this.parser = new Parser({
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ContentGPT/1.0',
      },
    });
  }

  /**
   * Resolve a channel handle (e.g. https://www.youtube.com/@starsports) to channel ID
   */
  async resolveChannelId(urlOrHandle: string): Promise<string | null> {
    try {
      const cleanUrl = urlOrHandle.trim();
      if (cleanUrl.includes('/channel/')) {
        const parts = cleanUrl.split('/channel/');
        return parts[1].split('/')[0].split('?')[0];
      }

      // Fetch HTML to find channelId / externalId
      const res = await axios.get(cleanUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        timeout: 8000,
      });

      // Modern YouTube externalId
      const externalMatch = res.data.match(/"externalId":"(UC[a-zA-Z0-9_-]{22})"/);
      if (externalMatch && externalMatch[1]) {
        return externalMatch[1];
      }

      // Classic channelId pattern
      const match = res.data.match(/"channelId":"(UC[a-zA-Z0-9_-]{22})"/);
      if (match && match[1]) {
        return match[1];
      }

      // Meta itemprop
      const metaMatch = res.data.match(/<meta itemprop="channelId" content="(UC[a-zA-Z0-9_-]{22})">/);
      if (metaMatch && metaMatch[1]) {
        return metaMatch[1];
      }

      // Direct URL pattern in HTML
      const urlMatch = res.data.match(/channel\/(UC[a-zA-Z0-9_-]{22})/);
      if (urlMatch && urlMatch[1]) {
        return urlMatch[1];
      }

      return null;
    } catch (err: any) {
      console.warn(`[YoutubeSourceAdapter] Could not resolve channel ID for ${urlOrHandle}: ${err.message}`);
      return null;
    }
  }

  /**
   * Fetch latest uploads from monitored YouTube channels
   */
  async fetchLatest(limit: number = 25): Promise<ScrapedItem[]> {
    const results: ScrapedItem[] = [];

    try {
      // Find all active YouTube channels registered in DB
      const monitoredChannels = await MonitoredChannel.find({
        platform: 'YOUTUBE',
        isActive: true,
      });

      for (const channel of monitoredChannels) {
        let channelId = channel.platformChannelId;
        if (!channelId) {
          const resolved = await this.resolveChannelId(channel.channelUrl);
          if (resolved) {
            channel.platformChannelId = resolved;
            channelId = resolved;
            await channel.save();
          }
        }

        if (!channelId) continue;

        const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
        try {
          const feed = await this.parser.parseURL(rssUrl);
          const recentVideos = feed.items.slice(0, 8);

          for (const vid of recentVideos) {
            if (!vid.link || !vid.title) continue;

            // Optional: Auto fetch transcript if channel.autoTranscribe is enabled
            let transcriptPreview = '';
            if (channel.autoTranscribe) {
              try {
                const transcriptData = await YoutubeTranscript.fetchTranscript(vid.link);
                if (transcriptData && transcriptData.length > 0) {
                  transcriptPreview = transcriptData.slice(0, 5).map((t) => t.text).join(' ');
                }
              } catch {
                // Captions may be disabled for this video
              }
            }

            const snippet = transcriptPreview
              ? `Transcript excerpt: "${transcriptPreview.slice(0, 250)}..."`
              : (vid.contentSnippet || vid.title || '').slice(0, 250);

            // Filter check: verify India sports relevance
            if (
              !isIndiaSpecificSports({
                title: vid.title,
                contentSnippet: snippet,
                authorOrChannel: channel.channelName,
              })
            ) {
              continue;
            }

            results.push({
              sourcePlatform: 'YOUTUBE',
              sourceUrl: vid.link.trim(),
              title: vid.title.trim(),
              contentSnippet: snippet,
              authorOrChannel: channel.channelName,
              publishedAt: vid.pubDate ? new Date(vid.pubDate) : new Date(),
              isPrioritySource: true,
              priorityWeight: channel.priorityWeight || 2.5,
              channelId: channel._id,
            });
          }

          channel.lastPolledAt = new Date();
          await channel.save();
        } catch (err: any) {
          console.warn(`[YoutubeSourceAdapter] Failed to fetch channel RSS for ${channel.channelName}: ${err.message}`);
        }
      }
    } catch (err: any) {
      console.error(`[YoutubeSourceAdapter] Database error when querying channels: ${err.message}`);
    }

    return results.slice(0, limit);
  }

  /**
   * Helper to fetch full transcript for any YouTube link on demand
   */
  async getTranscript(videoUrl: string): Promise<string> {
    const transcript = await YoutubeTranscript.fetchTranscript(videoUrl);
    return transcript.map((t) => t.text).join(' ');
  }
}
