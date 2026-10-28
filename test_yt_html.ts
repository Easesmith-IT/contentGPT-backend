import axios from 'axios';

async function testHtml() {
  const res = await axios.get('https://www.youtube.com/@starsports', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  console.log('Length:', res.data.length);
  const match1 = res.data.match(/"channelId":"(UC[a-zA-Z0-9_-]{22})"/);
  const match2 = res.data.match(/<meta itemprop="channelId" content="(UC[a-zA-Z0-9_-]{22})">/);
  const match3 = res.data.match(/channel\/(UC[a-zA-Z0-9_-]{22})/);
  const match4 = res.data.match(/"externalId":"(UC[a-zA-Z0-9_-]{22})"/);
  console.log('match1:', match1?.[1]);
  console.log('match2:', match2?.[1]);
  console.log('match3:', match3?.[1]);
  console.log('match4:', match4?.[1]);
}
testHtml();
