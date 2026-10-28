import Parser from 'rss-parser';
import { BaseSourceAdapter, ScrapedItem } from './base.adapter';
import { isIndiaSpecificSports } from '../research/india-sports-filter';

export class RedditSourceAdapter implements BaseSourceAdapter {
  platformName = 'REDDIT' as const;

  // Strictly Indian sports subreddits (Removed global 'sports' and 'soccer')
  private subreddits = ['indiansports', 'IndianFootball', 'IndiaCricket', 'ipl'];

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async fetchLatest(limit: number = 25): Promise<ScrapedItem[]> {
    const results: ScrapedItem[] = [];

    for (const sub of this.subreddits) {
      try {
        const parser = new Parser({
          timeout: 10000,
          headers: {
            'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.${Math.floor(
              Math.random() * 50
            )} Safari/537.36 NishiGPT-${sub}/1.0`,
          },
        });

        // Reddit provides free RSS feeds for every subreddit
        const rssUrl = `https://www.reddit.com/r/${sub}/hot.rss`;
        const feed = await parser.parseURL(rssUrl);
        const topPosts = feed.items.slice(0, 10);

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

          // Verify India-specific sports relevance
          if (
            !isIndiaSpecificSports({
              title: post.title,
              contentSnippet: cleanSnippet,
              authorOrChannel: `r/${sub}`,
            })
          ) {
            continue;
          }

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

      // Brief pause to avoid 429 rate limiting
      await this.delay(800);
    }

    return results.slice(0, limit);
  }
}
