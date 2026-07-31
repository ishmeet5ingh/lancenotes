import mongoose from "mongoose";

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

const globalForMongoose = globalThis as typeof globalThis & {
  mongooseCache?: MongooseCache;
};

const cache = globalForMongoose.mongooseCache ?? { conn: null, promise: null };
globalForMongoose.mongooseCache = cache;

export async function connectDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not configured");
  }

  if (cache.conn) return cache.conn;

  cache.promise ??= mongoose.connect(uri, {
    bufferCommands: false,
    dbName: uri.includes("/") ? undefined : "freelance-notes"
  });

  cache.conn = await cache.promise;
  return cache.conn;
}

export function isMongoConfigured() {
  return Boolean(process.env.MONGODB_URI);
}
