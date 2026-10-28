import Parser from 'rss-parser';
import { BaseSourceAdapter, ScrapedItem } from './base.adapter';

export class RssSourceAdapter implements BaseSourceAdapter {
  platformName = 'RSS_NEWS' as const;
  private parser: Parser;

  private defaultFeeds = [
    { name: 'ESPNcricinfo', url: 'https://www.espncricinfo.com/rss/content/story/feeds/0.xml' },
    { name: 'Times of India Sports', url: 'https://timesofindia.indiatimes.com/rssfeeds/4719148.cms' },
    { name: 'The Hindu Sport', url: 'https://www.thehindu.com/sport/feeder/default.rss' },
    { name: 'NDTV Sports India', url: 'https://feeds.feedburner.com/ndtvsports-latest' },
    { name: 'ESPN Global', url: 'https://www.espn.com/espn/rss/news' },
    { name: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/rss.xml' },
    { name: 'Sky Sports', url: 'https://www.skysports.com/rss/12040' },
  ];

  constructor() {
    this.parser = new Parser({
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ContentGPT/1.0',
      },
    });
  }

  async fetchLatest(limit: number = 20): Promise<ScrapedItem[]> {
    const results: ScrapedItem[] = [];

    for (const feed of this.defaultFeeds) {
      try {
        const parsed = await this.parser.parseURL(feed.url);
        const items = parsed.items.slice(0, 8);

        for (const item of items) {
          if (!item.link || !item.title) continue;

          // Strip HTML tags for clean snippet
          const rawSnippet = item.contentSnippet || item.content || item.summary || '';
          const cleanSnippet = rawSnippet.replace(/<[^>]*>?/gm, '').trim().slice(0, 300);

          results.push({
            sourcePlatform: 'RSS_NEWS',
            sourceUrl: item.link.trim(),
            title: item.title.trim(),
            contentSnippet: cleanSnippet || item.title.trim(),
            authorOrChannel: feed.name,
            publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
            isPrioritySource: false,
            priorityWeight: 1.0,
          });
        }
      } catch (err: any) {
        console.warn(`[RssSourceAdapter] Failed to fetch feed ${feed.name}: ${err.message}`);
      }
    }

    return results.slice(0, limit);
  }
}
