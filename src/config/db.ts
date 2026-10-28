import mongoose from 'mongoose';

export async function connectDB(): Promise<void> {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/contentgpt';

  try {
    mongoose.set('strictQuery', false);
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`[Database] Connected successfully to MongoDB: ${mongoose.connection.host}`);
  } catch (err: any) {
    console.error(`[Database Error] MongoDB connection failed: ${err.message}`);
    console.warn(`[Database Warning] Please ensure your MongoDB Atlas URI or local MongoDB is configured in .env.`);
  }
}
