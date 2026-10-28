import Parser from 'rss-parser';

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ContentGPT/1.0',
  },
});

const testFeeds = [
  { name: 'ESPNcricinfo India', url: 'https://www.espncricinfo.com/rss/content/story/feeds/6.xml' },
  { name: 'Times of India Sports', url: 'https://timesofindia.indiatimes.com/rssfeeds/4719148.cms' },
  { name: 'Times of India Cricket', url: 'https://timesofindia.indiatimes.com/rssfeeds/54829575.cms' },
  { name: 'The Hindu Sport', url: 'https://www.thehindu.com/sport/feeder/default.rss' },
  { name: 'Sportstar', url: 'https://sportstar.thehindu.com/feeder/default.rss' },
  { name: 'NDTV Sports India', url: 'https://feeds.feedburner.com/ndtvsports-latest' },
  { name: 'Indian Express Sports', url: 'https://indianexpress.com/section/sports/feed/' },
  { name: 'Hindustan Times Sports', url: 'https://www.hindustantimes.com/feeds/rss/sports/rssfeed.xml' },
  { name: 'Hindustan Times Cricket', url: 'https://www.hindustantimes.com/feeds/rss/cricket/rssfeed.xml' },
];

async function test() {
  for (const f of testFeeds) {
    try {
      const feed = await parser.parseURL(f.url);
      console.log(`✅ [${f.name}] fetched ${feed.items?.length || 0} items. Sample: "${feed.items?.[0]?.title}"`);
    } catch (err: any) {
      console.log(`❌ [${f.name}] failed: ${err.message}`);
    }
  }
}

test();
