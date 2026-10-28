import Parser from 'rss-parser';
import { isIndiaSpecificSports } from './src/modules/research/india-sports-filter';

const parser = new Parser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ContentGPT/1.0',
  },
});

const queries = [
  'indian+cricket+team+OR+BCCI+OR+IPL+OR+WPL',
  'india+sports+badminton+OR+hockey+OR+athletics+OR+wrestling',
  'indian+football+OR+ISL+OR+I-League+OR+AIFF',
  'indian+athletes+chess+OR+shooting+OR+kabaddi+OR+olympics',
  'india+sports+news',
];

async function testGNews() {
  for (const q of queries) {
    const url = `https://news.google.com/rss/search?q=${q}+when:24h&hl=en-IN&gl=IN&ceid=IN:en`;
    try {
      const feed = await parser.parseURL(url);
      console.log(`\nQuery: ${q} (Total ${feed.items.length})`);
      for (const item of feed.items.slice(0, 5)) {
        const titleParts = (item.title || '').split(' - ');
        const publisher = titleParts.length > 1 ? titleParts.pop() : 'Google News';
        const cleanTitle = titleParts.join(' - ');
        const isIndia = isIndiaSpecificSports({
          title: cleanTitle,
          contentSnippet: item.contentSnippet,
          authorOrChannel: publisher,
        });
        console.log(`  [${isIndia ? 'INDIA' : 'SKIP'}] [${publisher}] ${cleanTitle}`);
      }
    } catch (err: any) {
      console.log(`Failed query ${q}: ${err.message}`);
    }
  }
}

testGNews();
