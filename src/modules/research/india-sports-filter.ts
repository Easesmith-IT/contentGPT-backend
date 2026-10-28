/**
 * India-Specific Sports Filter & Validator
 *
 * Ensures that ONLY sports news, videos, discussions, and articles
 * specifically about Indian sports, Indian athletes, Indian teams,
 * Indian domestic leagues (IPL, WPL, ISL, PKL, Ranji, etc.),
 * or international fixtures/events involving India are permitted.
 */

export interface SportsItemInput {
  title: string;
  contentSnippet?: string;
  authorOrChannel?: string;
  sourcePlatform?: string;
  sourceUrl?: string;
}

// 1. Whitelisted 100% India-dedicated sports channels and subreddits.
// These channels broadcast only Indian sports content.
const INDIA_DEDICATED_CHANNELS = [
  'r/indiansports',
  'r/indianfootball',
  'r/indiacricket',
  'r/ipl',
  'star sports',
  'sports tak',
  'cricbuzz',
  'indian super league',
  'espncricinfo india',
  '@indiancricketteam',
  '@indiansuperleague',
  '@teamindia',
  '@indianfootball',
  'bcci',
  'revsportz',
  'sony sports network',
];

// Publication names that might appear in snippets/authors.
// These MUST be stripped from text before matching so that their brand names
// ("The Indian Express", "Times of India") do not cause foreign sports news to match.
const PUBLICATION_NAMES_TO_STRIP = [
  'the indian express',
  'indian express',
  'the times of india',
  'times of india',
  'hindustan times',
  'ndtv sports india',
  'ndtv sports',
  'ndtv india',
  'the hindu',
  'sportstar',
  'india today',
  'deccan chronicle',
  'deccan herald',
  'telangana today',
  'firstpost',
  'news18',
  'dd india',
  'dd news',
  'zee news',
  'india tv',
  'oneindia',
  'google news',
];

// 2. Definitive Indian sports entities, athletes, teams, tournaments, leagues
const INDIAN_SPORTS_KEYWORDS: string[] = [
  // National identity in sports content
  '\\bindia\\b', '\\bindian\\b', '\\bindians\\b', '\\bbharat\\b',
  'team india', 'men in blue', 'women in blue', 'indian contingent',
  'ind vs', 'india vs', 'ind v ', 'vs ind', 'indw vs', 'india women vs', 'vs indw',
  'tour of india', 'india tour of', 'india in ',

  // Governing bodies & schemes
  '\\bbcci\\b', '\\baiff\\b', '\\bbai\\b', 'hockey india', '\\bafi\\b', '\\bwfi\\b',
  '\\bbfi\\b', '\\bioa\\b', '\\bsai\\b', 'sports authority of india',
  'khelo india', 'national games', 'all india football federation',

  // Cricket leagues & tournaments
  '\\bipl\\b', '\\bwpl\\b', 'indian premier league', "women's premier league",
  'ranji trophy', '\\branji\\b', 'duleep trophy', 'vijay hazare', 'syed mushtaq ali',
  'irani cup', 'deodhar trophy', 'tata wpl',

  // IPL / WPL teams
  'chennai super kings', '\\bcsk\\b', 'mumbai indians', 'royal challengers', '\\brcb\\b',
  'kolkata knight riders', '\\bkkr\\b', 'delhi capitals', 'rajasthan royals',
  'punjab kings', '\\bpbks\\b', 'gujarat titans', 'lucknow super giants', '\\blsg\\b',
  'sunrisers hyderabad', '\\bsrh\\b', 'up warriorz', 'gujarat giants',

  // Football leagues, tournaments & clubs
  '\\bisl\\b', 'indian super league', 'i-league', 'durand cup', 'santosh trophy',
  'super cup india', 'blue tigers',
  'mohun bagan', 'east bengal', 'kerala blasters', 'bengaluru fc', 'fc goa',
  'mumbai city fc', 'chennaiyin', 'odisha fc', 'jamshedpur fc', 'northeast united',
  'hyderabad fc', 'sporting club delhi', 'mohammedan sc', 'churchill brothers',
  'gokulam kerala', 'inter kashi', 'sreenidi deccan', 'dempo sc', 'rajasthan united',

  // Kabaddi leagues & teams
  'pro kabaddi', '\\bpkl\\b', 'puneri paltan', 'patna pirates', 'jaipur pink panthers',
  'bengal warriorz', 'dabang delhi', 'telugu titans', 'bengaluru bulls', 'u mumba',
  'haryana steelers', 'up yoddhas', 'tamil thalaivas',

  // Indian Men Cricketers
  'rohit sharma', 'virat kohli', 'ms dhoni', 'sachin tendulkar', 'jasprit bumrah',
  'hardik pandya', 'shubman gill', 'rishabh pant', 'ravindra jadeja', 'mohammed shami',
  'mohammed siraj', 'yashasvi jaiswal', 'gautam gambhir', 'rahul dravid', 'r ashwin',
  'ravichandran ashwin', 'suryakumar yadav', 'kl rahul', 'shreyas iyer', 'rinku singh',
  'sanju samson', '\\bsanju\\b', 'kuldeep yadav', 'yuzvendra chahal', 'arshdeep singh', 'ishan kishan',
  'axar patel', 'washington sundar', 'nitish kumar reddy', 'mayank yadav', 'tilak varma',
  'ruturaj gaikwad', 'sarfaraz khan', 'dhruv jurel', 'prasidh krishna', 'shivam dube',
  'ravi bishnoi', 'harshit rana', 'abhishek sharma', '\\babhishek\\b', 'varun chakaravarthy', 'sai sudharsan',
  'cheteshwar pujara', 'ajinkya rahane', 'shikhar dhawan', 'suresh raina', 'yuvraj singh',
  'virender sehwag', 'sourav ganguly', 'anil kumble', 'kapil dev', 'sunil gavaskar',

  // Indian Women Cricketers
  'smriti mandhana', 'harmanpreet kaur', 'shafali verma', 'jemimah rodrigues',
  'deepti sharma', 'renuka singh', 'richa ghosh', 'shreyanka patil', 'radha yadav',
  'pooja vastrakar', 'yastika bhatia', 'sneh rana', 'kashvi gautam', 'vaishnavi sharma',
  'uma chetry', 'kiran navgire', 'arundhati reddy', 'mithali raj', 'jhulan goswami',
  'neelam sirohi', 'kajal dhochak',

  // Football players
  'sunil chhetri', 'gurpreet singh sandhu', 'sandesh jhingan', 'anwar ali',
  'lallianzuala chhangte', 'liston colaco', 'manvir singh', 'sahal abdul samad',
  'brandon fernandes', 'anirudh thapa', 'suresh singh wangjam', 'apuia',
  'vikram partap singh', 'mahesh singh naorem', 'bhaichung bhutia', 'i m vijayan',

  // Badminton players
  'pv sindhu', 'lakshya sen', 'satwiksairaj', 'satwik', 'chirag shetty', 'hs prannoy',
  'kidambi srikanth', 'saina nehwal', 'treesa jolly', 'gayatri gopichand',
  'pullela gopichand', 'prakash padukone',

  // Hockey players
  'harmanpreet singh', 'pr sreejesh', 'manpreet singh', 'hardik singh', 'mandeep singh',
  'savita punia', 'salima tete', 'navneet kaur', 'vandana katariya', 'rani rampal',
  'dhyan chand', 'dhanraj pillay',

  // Athletics
  'neeraj chopra', '\\bneeraj\\b', 'kishore jena', 'dp manu', 'annu rani', 'avinash sable',
  'jyothi yarraji', 'murali sreeshankar', 'jeswin aldrin', 'praveen chithravel',
  'tajinderpal singh toor', 'parul chaudhary', 'tejaswin shankar', 'hima das',
  'pt usha', 'milkha singh',

  // Wrestling & Boxing & Weightlifting
  'vinesh phogat', 'bajrang punia', 'sakshi malik', 'aman sehrawat', 'antim panghal',
  'ravi dahiya', 'deepak punia', 'sushil kumar', 'yogeshwar dutt',
  'nikhat zareen', 'lovlina borgohain', 'mary kom', 'amit panghal', 'nishant dev',
  'mirabai chanu', 'karnam malleswari',

  // Chess
  'd gukesh', '\\bgukesh\\b', 'praggnanandhaa', '\\bpragg\\b', 'vidit gujrathi',
  'arjun erigaisi', 'viswanathan anand', 'nihal sarin', 'raunak sadhwani',
  'koneru humpy', 'harika dronavalli', 'r vaishali', 'divya deshmukh',

  // Shooting & Archery
  'manu bhaker', 'sarabjot singh', 'swapnil kusale', 'rhythm sangwan', 'esha singh',
  'sift kaur samra', 'arjun babuta', 'abhinav bindra', 'gagan narang',
  'deepika kumari', 'tarundeep rai', 'dhiraj bommadevara', 'jyothi surekha',

  // Tennis, Table Tennis & Kabaddi
  'rohan bopanna', 'sumit nagal', 'sania mirza', 'leander paes', 'mahesh bhupathi',
  'sharath kamal', 'manika batra', 'sreeja akula', 'sathiyan gnanasekaran',
  'pawan sehrawat', 'pardeep narwal', 'naveen kumar', 'aslam inamdar', 'arjun deshwal',
];

// Compiled regexes for fast matching
const COMPILED_INDIAN_PATTERNS = INDIAN_SPORTS_KEYWORDS.map((k) => new RegExp(k, 'i'));

/**
 * Validates whether an item is specifically related to Indian sports.
 */
export function isIndiaSpecificSports(item: SportsItemInput): boolean {
  const author = (item.authorOrChannel || '').trim().toLowerCase();
  const title = (item.title || '').trim();
  const snippet = (item.contentSnippet || '').trim();

  // 1. Whitelisted 100% India-dedicated channel / subreddit match
  for (const ch of INDIA_DEDICATED_CHANNELS) {
    if (author.includes(ch)) {
      return true;
    }
  }

  // 2. CRITICAL: Analyze ONLY the content (title + snippet), NOT the publisher name!
  // Strip publication names ("The Indian Express", "Times of India", etc.) from content
  // so brand names don't trigger false positives on global sports news.
  let content = `${title} ${snippet}`.toLowerCase();

  for (const pub of PUBLICATION_NAMES_TO_STRIP) {
    content = content.replace(new RegExp(pub, 'gi'), ' ');
  }

  // Guard against false positive "Indian Wells" (California tennis tournament)
  const hasIndianWellsOnly =
    content.includes('indian wells') &&
    !content.replace(/indian wells/g, '').includes('india') &&
    !content.replace(/indian wells/g, '').includes('indian');

  // Guard against false positive "Indiana" / "Indianapolis"
  const cleanContent = content.replace(/indiana(polis)?/g, '');

  // 3. Positive match against Indian sports entities in title or snippet
  for (const regex of COMPILED_INDIAN_PATTERNS) {
    if (hasIndianWellsOnly && (regex.source.includes('india') || regex.source.includes('indian'))) {
      continue;
    }
    if (regex.test(cleanContent)) {
      return true;
    }
  }

  return false;
}
