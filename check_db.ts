import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || '');
  const count = await mongoose.connection.collection('researchitems').countDocuments();
  console.log('Total items in DB:', count);

  const items = await mongoose.connection.collection('researchitems').find({}).toArray();
  const platforms: Record<string, number> = {};
  const channels: Record<string, number> = {};

  for (const item of items) {
    platforms[item.sourcePlatform] = (platforms[item.sourcePlatform] || 0) + 1;
    channels[item.authorOrChannel] = (channels[item.authorOrChannel] || 0) + 1;
  }

  console.log('\nBreakdown by platform:', platforms);
  console.log('\nBreakdown by channel/publisher:', channels);

  console.log('\nSample items:');
  items.slice(0, 20).forEach((i, idx) => {
    console.log(`${idx + 1}. [${i.sourcePlatform}] [${i.authorOrChannel}] ${i.title}`);
  });

  await mongoose.disconnect();
}

run().catch(console.error);
