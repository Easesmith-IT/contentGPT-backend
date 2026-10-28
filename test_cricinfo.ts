import Parser from 'rss-parser';

async function checkCricinfo() {
  const parser = new Parser();
  const feed = await parser.parseURL('https://www.espncricinfo.com/rss/content/story/feeds/6.xml');
  console.log('Total items in Cricinfo 6.xml:', feed.items.length);
  feed.items.forEach((item, i) => {
    console.log(`${i + 1}. ${item.title}`);
  });
}

checkCricinfo();
