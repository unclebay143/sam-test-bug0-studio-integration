import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGO_URL as string;

// Convert SRV connection string to direct connection if DNS issues occur
// This is a workaround for DNS resolution problems with mongodb+srv://
function getConnectionString(uri: string): string {
  // If it's already a direct connection (mongodb://), use it as-is
  if (uri.startsWith("mongodb://")) {
    return uri;
  }

  // If it's SRV (mongodb+srv://), try to use it but with better error handling
  // Note: You may need to manually convert SRV to direct connection if DNS fails
  return uri;
}

// @ts-expect-error "mongoose" is not a valid global
let cached = global.mongoose;

if (!cached) {
  // @ts-expect-error "mongoose" is not a valid global
  cached = global.mongoose = {
    conn: null,
    promise: null,
  };
}

export async function connectToDatabase() {
  if (!MONGODB_URI) {
    throw new Error("Please define the MONGO_URL environment variable");
  }

  if (cached?.conn) {
    return cached.conn;
  }

  if (!cached?.promise) {
    const connectionUri = getConnectionString(MONGODB_URI);
    cached.promise = mongoose
      .connect(connectionUri, {
        serverSelectionTimeoutMS: 10000, // 10 seconds
        socketTimeoutMS: 45000, // 45 seconds
        connectTimeoutMS: 10000, // 10 seconds
        // Disable SRV lookup if DNS is failing (use direct connection)
        // This requires converting mongodb+srv:// to mongodb:// with explicit hostnames
      })
      .catch((error) => {
        console.error("MongoDB connection failed:", error.message);
        if (
          error.message.includes("querySrv") ||
          error.message.includes("ETIMEOUT")
        ) {
          console.error(
            "DNS resolution failed. Try using a direct connection string (mongodb://) instead of mongodb+srv://"
          );
          console.error("Or check your DNS settings / VPN configuration");
        }
        throw error;
      });
  }

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (e) {
    cached.promise = null;
    console.error("MongoDB connection error:", e);
    throw e;
  }
}
