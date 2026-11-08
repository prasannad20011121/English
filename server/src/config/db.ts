import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';

mongoose.set('strictQuery', true);

export async function connectDB(uri: string = env.MONGO_URI): Promise<void> {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  logger.info({ db: mongoose.connection.name }, 'MongoDB connected');
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}

export function dbStatus(): 'up' | 'down' {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected ? 'up' : 'down';
}
