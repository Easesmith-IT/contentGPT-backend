import Parser from 'rss-parser';

const subreddits = ['indiansports', 'IndianFootball', 'IndiaCricket', 'ipl'];

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

async function testReddit() {
  for (const sub of subreddits) {
    const parser = new Parser({
      timeout: 10000,
      headers: {
        'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.${Math.floor(Math.random() * 100)} Safari/537.36 ContentGPT-${sub}/1.0`,
      },
    });

    try {
      const feed = await parser.parseURL(`https://www.reddit.com/r/${sub}/hot.rss`);
      console.log(`✅ [r/${sub}] fetched ${feed.items?.length || 0} posts. Sample: "${feed.items?.[0]?.title}"`);
    } catch (err: any) {
      console.log(`❌ [r/${sub}] failed: ${err.message}`);
    }
    await delay(1200);
  }
}

testReddit();
