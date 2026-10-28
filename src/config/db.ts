import mongoose from 'mongoose';

let cachedConnection: typeof mongoose | null = null;

export async function connectDB(): Promise<typeof mongoose> {
  if (cachedConnection && mongoose.connection.readyState === 1) {
    return cachedConnection;
  }

  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/contentgpt';

  try {
    mongoose.set('strictQuery', false);
    cachedConnection = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 8000,
      bufferCommands: false, // Prevents hanging on cold serverless invocations
    });
    console.log(`[Database] Connected successfully to MongoDB Atlas: ${mongoose.connection.host}`);
    return cachedConnection;
  } catch (err: any) {
    console.error(`[Database Error] MongoDB connection failed: ${err.message}`);
    throw err;
  }
}
