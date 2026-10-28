import Parser from 'rss-parser';
import { BaseSourceAdapter, ScrapedItem } from './base.adapter';

export class RedditSourceAdapter implements BaseSourceAdapter {
  platformName = 'REDDIT' as const;
  private parser: Parser;

  private subreddits = ['Cricket', 'IndianFootball', 'indiansports', 'sports', 'soccer'];

  constructor() {
    this.parser = new Parser({
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 ContentGPT/1.0',
      },
    });
  }

  async fetchLatest(limit: number = 25): Promise<ScrapedItem[]> {
    const results: ScrapedItem[] = [];

    for (const sub of this.subreddits) {
      try {
        // Reddit provides free, rate-limit-resistant RSS feeds for every subreddit
        const rssUrl = `https://www.reddit.com/r/${sub}/hot.rss`;
        const feed = await this.parser.parseURL(rssUrl);
        const topPosts = feed.items.slice(0, 8);

        for (const post of topPosts) {
          if (!post.link || !post.title) continue;

          // Strip HTML content for clean discussion snippet
          const rawContent = post.content || post.contentSnippet || '';
          const cleanSnippet = rawContent
            .replace(/<[^>]*>?/gm, ' ')
            .replace(/submitted by\s+.*$/i, '')
            .replace(/\[link\].*$/i, '')
            .trim()
            .slice(0, 280);

          results.push({
            sourcePlatform: 'REDDIT',
            sourceUrl: post.link.trim(),
            title: post.title.trim(),
            contentSnippet: cleanSnippet || `Reddit discussion on r/${sub}`,
            authorOrChannel: `r/${sub} (${post.author || 'community'})`,
            publishedAt: post.pubDate ? new Date(post.pubDate) : new Date(),
            engagementMetrics: {
              upvotes: 0,
              comments: 0,
            },
            isPrioritySource: false,
            priorityWeight: 1.2,
          });
        }
      } catch (err: any) {
        console.warn(`[RedditSourceAdapter] Failed to fetch r/${sub} RSS: ${err.message}`);
      }
    }

    return results.slice(0, limit);
  }
}
