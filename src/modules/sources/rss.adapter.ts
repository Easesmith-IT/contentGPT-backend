import Parser from 'rss-parser';
import { BaseSourceAdapter, ScrapedItem } from './base.adapter';
import { isIndiaSpecificSports } from '../research/india-sports-filter';

export class RssSourceAdapter implements BaseSourceAdapter {
  platformName = 'RSS_NEWS' as const;
  private parser: Parser;

  // Curated, 100% India-centric sports feeds (Global feeds like BBC, Sky Sports, ESPN Global removed)
  private defaultFeeds = [
    { name: 'ESPNcricinfo India', url: 'https://www.espncricinfo.com/rss/content/story/feeds/6.xml' },
    { name: 'Times of India Sports', url: 'https://timesofindia.indiatimes.com/rssfeeds/4719148.cms' },
    { name: 'Times of India Cricket', url: 'https://timesofindia.indiatimes.com/rssfeeds/54829575.cms' },
    { name: 'The Hindu Sport', url: 'https://www.thehindu.com/sport/feeder/default.rss' },
    { name: 'Sportstar India', url: 'https://sportstar.thehindu.com/feeder/default.rss' },
    { name: 'Hindustan Times Cricket', url: 'https://www.hindustantimes.com/feeds/rss/cricket/rssfeed.xml' },
    { name: 'NDTV Sports India', url: 'https://feeds.feedburner.com/ndtvsports-latest' },
  ];

  constructor() {
    this.parser = new Parser({
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ContentGPT/1.0',
      },
    });
  }

  async fetchLatest(limit: number = 30): Promise<ScrapedItem[]> {
    const results: ScrapedItem[] = [];

    for (const feed of this.defaultFeeds) {
      try {
        const parsed = await this.parser.parseURL(feed.url);
        const items = parsed.items.slice(0, 15);

        for (const item of items) {
          if (!item.link || !item.title) continue;

          // Strip HTML tags for clean snippet
          const rawSnippet = item.contentSnippet || item.content || item.summary || '';
          const cleanSnippet = rawSnippet.replace(/<[^>]*>?/gm, '').trim().slice(0, 300);

          // Strictly filter for India-specific sports news
          if (
            !isIndiaSpecificSports({
              title: item.title,
              contentSnippet: cleanSnippet,
              authorOrChannel: feed.name,
            })
          ) {
            continue;
          }

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
