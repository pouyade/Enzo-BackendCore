import mongoose from 'mongoose';
import winston from 'winston';
import { Config } from '@/config';
import { User } from './models/User';

export class Database {
  private static logger: winston.Logger;
  
  static async initialize(logger: winston.Logger) {
    this.logger = logger;
    try {
      await mongoose.connect(Config.getInstance().mongoUri as string, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        maxPoolSize: 10,
        retryWrites: true,
        retryReads: true
      });


      this.logger.info('MongoDB Connected');
    } catch (error: any) {
      this.logger.error('MongoDB Connection Error:', { error: error.message });
      process.exit(1);
    }
  }

  static isConnected(): boolean {
    return mongoose.connection.readyState === 1;
  }

  static async disconnect() {
    try {
      await mongoose.disconnect();
      this.logger.info('MongoDB Disconnected');
    } catch (error: any) {
      this.logger.error('MongoDB Disconnect Error:', { error: error.message });
    }
  }
}