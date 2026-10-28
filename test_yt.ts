import axios from 'axios';
import Parser from 'rss-parser';

async function resolveChannelId(urlOrHandle: string): Promise<string | null> {
  try {
    const cleanUrl = urlOrHandle.trim();
    if (cleanUrl.includes('/channel/')) {
      const parts = cleanUrl.split('/channel/');
      return parts[1].split('/')[0].split('?')[0];
    }

    const res = await axios.get(cleanUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      timeout: 8000,
    });

    const match1 = res.data.match(/"externalId":"(UC[a-zA-Z0-9_-]{22})"/);
    if (match1 && match1[1]) return match1[1];

    const match2 = res.data.match(/"channelId":"(UC[a-zA-Z0-9_-]{22})"/);
    if (match2 && match2[1]) return match2[1];

    const match3 = res.data.match(/<meta itemprop="channelId" content="(UC[a-zA-Z0-9_-]{22})">/);
    if (match3 && match3[1]) return match3[1];

    const match4 = res.data.match(/channel\/(UC[a-zA-Z0-9_-]{22})/);
    if (match4 && match4[1]) return match4[1];

    return null;
  } catch (err: any) {
    return null;
  }
}

const channels = [
  { name: 'Star Sports', url: 'https://www.youtube.com/@starsports', category: 'sports' },
  { name: 'Sports Tak', url: 'https://www.youtube.com/@SportsTak', category: 'sports' },
  { name: 'Sony Sports Network', url: 'https://www.youtube.com/@SonySportsNetwork', category: 'sports' },
  { name: 'Indian Super League', url: 'https://www.youtube.com/@IndianSuperLeague', category: 'football' },
  { name: 'Cricbuzz', url: 'https://www.youtube.com/@cricbuzz', category: 'cricket' },
];

async function main() {
  const parser = new Parser();
  for (const c of channels) {
    const id = await resolveChannelId(c.url);
    console.log(`Channel ${c.name}: ${id}`);
    if (id) {
      try {
        const feed = await parser.parseURL(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`);
        console.log(`  -> Items: ${feed.items.length}, latest: "${feed.items[0]?.title}"`);
      } catch (err: any) {
        console.log(`  -> Feed fetch error: ${err.message}`);
      }
    }
  }
}

main();
