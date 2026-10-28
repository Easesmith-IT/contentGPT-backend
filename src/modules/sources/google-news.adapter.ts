import Parser from 'rss-parser';
import { BaseSourceAdapter, ScrapedItem } from './base.adapter';
import { isIndiaSpecificSports } from '../research/india-sports-filter';

export class GoogleNewsAdapter implements BaseSourceAdapter {
  platformName = 'GOOGLE' as const;
  private parser: Parser;

  constructor() {
    this.parser = new Parser({
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ContentGPT/1.0',
      },
    });
  }

  async fetchLatest(limit: number = 25): Promise<ScrapedItem[]> {
    const results: ScrapedItem[] = [];
    const queries = [
      { q: 'indian+cricket+team+OR+BCCI+OR+IPL+OR+WPL', loc: 'hl=en-IN&gl=IN&ceid=IN:en' },
      { q: 'india+sports+badminton+OR+hockey+OR+athletics+OR+wrestling', loc: 'hl=en-IN&gl=IN&ceid=IN:en' },
      { q: 'indian+football+OR+ISL+OR+I-League+OR+AIFF', loc: 'hl=en-IN&gl=IN&ceid=IN:en' },
      { q: 'indian+athletes+chess+OR+shooting+OR+kabaddi+OR+olympics', loc: 'hl=en-IN&gl=IN&ceid=IN:en' },
      { q: 'india+sports+news+athletes', loc: 'hl=en-IN&gl=IN&ceid=IN:en' },
    ];

    for (const itemQuery of queries) {
      const newsUrl = `https://news.google.com/rss/search?q=${itemQuery.q}+when:24h&${itemQuery.loc}`;
      try {
        const feed = await this.parser.parseURL(newsUrl);
        const topItems = feed.items.slice(0, 10);

        for (const item of topItems) {
          if (!item.link || !item.title) continue;

          // Format title and extract source publisher if present (e.g., "Title - Publisher")
          const titleParts = item.title.split(' - ');
          const publisher = titleParts.length > 1 ? titleParts.pop() : 'Google News';
          const cleanTitle = titleParts.join(' - ');

          const rawSnippet = item.contentSnippet || item.content || '';
          const cleanSnippet = rawSnippet.replace(/<[^>]*>?/gm, '').trim().slice(0, 300);

          // Strictly enforce India-specific sports verification
          if (
            !isIndiaSpecificSports({
              title: cleanTitle,
              contentSnippet: cleanSnippet,
              authorOrChannel: publisher || 'Google News',
            })
          ) {
            continue;
          }

          results.push({
            sourcePlatform: 'GOOGLE',
            sourceUrl: item.link.trim(),
            title: cleanTitle.trim() || item.title.trim(),
            contentSnippet: cleanSnippet || item.title.trim(),
            authorOrChannel: publisher || 'Google News',
            publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
            isPrioritySource: false,
            priorityWeight: 1.1,
          });
        }
      } catch (err: any) {
        console.warn(`[GoogleNewsAdapter] Failed to fetch query ${itemQuery.q}: ${err.message}`);
      }
    }

    return results.slice(0, limit);
  }
}
