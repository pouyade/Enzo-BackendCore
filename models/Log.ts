import mongoose from "mongoose";
import zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export interface ILog {
    userId?: mongoose.Types.ObjectId;
    timestamp: number;
    installationId: string;
    logContent: string;
    compressedContent?: Buffer;
    device: {
      model?: string;
      manufacturer?: string;
      os: string;
      osVersion: string;
      screenSize?: string;
      appVersion: string;
      appBuild: string;
    };
    metadata?: {
      logFileName?: string;
      logFileSize?: string;
      timestamp?: string;
    };
    context?: {
      route?: string;
      action?: string;
      networkType?: string;
      batteryLevel?: number;
    };
}

interface ILogDocument extends mongoose.Document, ILog {
    _logContent?: string;
    setLogContent(content: string): void;
}

const LogSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    timestamp: { type: Number, default: () => Date.now(), index: true },
    installationId: { type: String, required: true },
    compressedContent: { type: Buffer },
    device: {
      model: String,
      manufacturer: String,
      os: { type: String, required: true },
      osVersion: { type: String, required: true },
      screenSize: String,
      appVersion: { type: String, required: true },
      appBuild: { type: String, required: true }
    },
    metadata: {
      logFileName: String,
      logFileSize: String,
      timestamp: String
    },
    context: {
      route: String,
      action: String,
      networkType: String,
      batteryLevel: Number
    }
});

// Virtual for decompressed content
LogSchema.virtual('logContent').get(async function(this: ILogDocument) {
  if (!this.compressedContent) return '';
  try {
    const decompressed = await gunzip(this.compressedContent);
    return decompressed.toString('utf-8');
  } catch (error) {
    console.error('Error decompressing log content:', error);
    return '';
  }
});

// Pre-save middleware to compress content
LogSchema.pre('save', async function(this: ILogDocument) {
  if (this._logContent) {
    try {
      this.compressedContent = await gzip(this._logContent);
      delete this._logContent;
    } catch (error) {
      console.error('Error compressing log content:', error);
      throw error;
    }
  }
});

// Method to set log content
LogSchema.methods.setLogContent = function(this: ILogDocument, content: string) {
  this._logContent = content;
};


// Add compound indexes for common queries
LogSchema.index({ userId: 1, timestamp: -1 });
LogSchema.index({ 'device.os': 1, 'device.appVersion': 1 });
LogSchema.index({ 'logFile.uploadedAt': -1 });  // Index for log file queries
LogSchema.index({ installationId: 1, timestamp: -1 });

export const Log = mongoose.model<ILogDocument>('Log', LogSchema);
  