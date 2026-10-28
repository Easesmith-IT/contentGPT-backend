import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// Comprehensive India sports detection logic
export function isIndiaSpecificSports(item: {
  title: string;
  contentSnippet?: string;
  authorOrChannel?: string;
  sourcePlatform?: string;
}): { isIndia: boolean; reason: string } {
  const title = (item.title || '').trim();
  const snippet = (item.contentSnippet || '').trim();
  const author = (item.authorOrChannel || '').trim();
  const text = `${title} ${snippet} ${author}`.toLowerCase();

  // 1. Definite India channels/subreddits
  const indiaChannels = [
    'r/indiansports',
    'r/indianfootball',
    'r/indiacricket',
    'r/ipl',
    'star sports',
    'sports tak',
    'cricbuzz',
    'indian super league',
    'espncricinfo india',
    'times of india cricket',
    'hindustan times cricket',
    '@indiancricketteam',
    '@indiansuperleague',
    '@teamindia',
    'bcci',
  ];

  for (const ch of indiaChannels) {
    if (author.toLowerCase().includes(ch)) {
      return { isIndia: true, reason: `India channel match: ${ch}` };
    }
  }

  // 2. Specific Indian sports entities & leagues
  const indianEntities = [
    '\\bindia\\b', '\\bindian\\b', '\\bindians\\b', '\\bbharat\\b',
    'team india', 'men in blue', 'women in blue',
    '\\bbcci\\b', '\\bipl\\b', '\\bwpl\\b', 'ranji trophy', 'ranji', 'duleep trophy',
    'vijay hazare', 'syed mushtaq ali', 'irani cup',
    '\\bisl\\b', 'indian super league', 'i-league', '\\baiff\\b', 'durand cup', 'santosh trophy',
    'hockey india', 'pro kabaddi', '\\bpkl\\b', 'khelo india', 'national games',
    'sports authority of india', '\\bsai\\b', 'indian olympic association', '\\bioa\\b',
    'badminton association of india', '\\bbai\\b', 'athletics federation of india',
    'wrestling federation of india', '\\bwfi\\b', 'boxing federation of india', '\\bbfi\\b',
    // IPL / WPL teams
    'chennai super kings', '\\bcsk\\b', 'mumbai indians', 'royal challengers', '\\brcb\\b',
    'kolkata knight riders', '\\bkkr\\b', 'delhi capitals', 'rajasthan royals',
    'punjab kings', 'gujarat titans', 'lucknow super giants', 'sunrisers hyderabad', '\\bsrh\\b',
    'up warriorz', 'gujarat giants',
    // ISL clubs
    'mohun bagan', 'east bengal', 'kerala blasters', 'bengaluru fc', 'fc goa',
    'mumbai city fc', 'chennaiyin', 'odisha fc', 'jamshedpur fc', 'northeast united',
    'hyderabad fc', 'sporting club delhi', 'mohammedan sc',
    // Notable Indian athletes across sports
    'rohit sharma', 'virat kohli', 'ms dhoni', 'jasprit bumrah', 'hardik pandya',
    'shubman gill', 'rishabh pant', 'ravindra jadeja', 'mohammed shami', 'mohammed siraj',
    'yashasvi jaiswal', 'gautam gambhir', 'rahul dravid', 'r ashwin', 'ravichandran ashwin',
    'suryakumar yadav', 'kl rahul', 'shreyas iyer', 'rinku singh', 'sanju samson',
    'kuldeep yadav', 'yuzvendra chahal', 'arshdeep singh', 'ishan kishan', 'axar patel',
    'smriti mandhana', 'harmanpreet kaur', 'shafali verma', 'jemimah rodrigues', 'deepti sharma',
    'kashvi gautam', 'vaishnavi sharma', 'uma chetry',
    'neeraj chopra', 'manu bhaker', 'pv sindhu', 'lakshya sen', 'satwiksairaj', 'satwik',
    'chirag shetty', 'hs prannoy', 'kidambi srikanth', 'saina nehwal',
    'sunil chhetri', 'gurpreet singh sandhu', 'lallianzuala chhangte', 'manvir singh',
    'harmanpreet singh', 'pr sreejesh', 'manpreet singh', 'savita punia',
    'vinesh phogat', 'bajrang punia', 'sakshi malik', 'aman sehrawat', 'antim panghal',
    'nikhat zareen', 'lovlina borgohain', 'mirabai chanu',
    'd gukesh', '\\bgukesh\\b', 'praggnanandhaa', 'vidit gujrathi', 'arjun erigaisi', 'viswanathan anand',
    'koneru humpy', 'dronavalli harika',
    'rohan bopanna', 'sumit nagal', 'sania mirza',
    'sharath kamal', 'manika batra', 'sreeja akula',
    'avinash sable', 'jyothi yarraji', 'annu rani', 'kishore jena',
    'pawan sehrawat', 'pardeep narwal',
    'ind vs', 'india vs', 'ind v ', 'vs ind', 'tour of india',
  ];

  for (const pattern of indianEntities) {
    const rx = new RegExp(pattern, 'i');
    if (rx.test(text)) {
      return { isIndia: true, reason: `Pattern match: ${pattern}` };
    }
  }

  return { isIndia: false, reason: 'No Indian sports entity or channel found' };
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || '');
  const items = await mongoose.connection.collection('researchitems').find({}).toArray();

  let indiaCount = 0;
  let globalCount = 0;
  const globalSamples: any[] = [];
  const indiaSamples: any[] = [];

  for (const item of items) {
    const res = isIndiaSpecificSports(item);
    if (res.isIndia) {
      indiaCount++;
      indiaSamples.push({ title: item.title, author: item.authorOrChannel, reason: res.reason });
    } else {
      globalCount++;
      globalSamples.push({ title: item.title, author: item.authorOrChannel });
    }
  }

  console.log(`Total: ${items.length}`);
  console.log(`India: ${indiaCount}`);
  console.log(`Global: ${globalCount}`);

  console.log('\n--- SAMPLE REJECTED GLOBAL ITEMS ---');
  globalSamples.slice(0, 15).forEach(s => console.log(`[${s.author}] ${s.title}`));

  console.log('\n--- SAMPLE ACCEPTED INDIA ITEMS ---');
  indiaSamples.slice(0, 15).forEach(s => console.log(`[${s.author}] ${s.title} (${s.reason})`));

  await mongoose.disconnect();
}

run().catch(console.error);
