import Parser from 'rss-parser';

const parser = new Parser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ContentGPT/1.0',
  },
});

async function checkFeeds() {
  const feeds = [
    { name: 'Times of India Sports', url: 'https://timesofindia.indiatimes.com/rssfeeds/4719148.cms' },
    { name: 'The Hindu Sport', url: 'https://www.thehindu.com/sport/feeder/default.rss' },
  ];

  for (const f of feeds) {
    const feed = await parser.parseURL(f.url);
    console.log(`\n=== ${f.name} (Top 10) ===`);
    feed.items.slice(0, 10).forEach((item, i) => {
      console.log(`${i + 1}. ${item.title}`);
    });
  }
}

checkFeeds();
