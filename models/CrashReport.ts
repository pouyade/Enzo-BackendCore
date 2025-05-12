import mongoose from "mongoose";

export interface ICrashReport extends mongoose.Document {
  id: string;  // UUID from client
  timestamp: number;
  appVersion: string;
  appVersionCode: number;
  stackTrace: string;
  fileName: string;
  functionName: string;
  errorTitle: string;
  // Additional server-side fields
  userId?: mongoose.Types.ObjectId;
  platform: string;
  deviceModel: string;
  osVersion: string;
  synced: boolean;
  syncedAt?: Date;
  isViewed: boolean;
  crashBugId: mongoose.Types.ObjectId;
}

const CrashReportSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  timestamp: { type: Number, required: true, index: true },
  appVersion: { type: String, required: true },
  appVersionCode: { type: Number, required: true },
  stackTrace: { type: String, required: true },
  fileName: { type: String, required: true },
  functionName: { type: String, required: true },
  errorTitle: { type: String, required: true },
  // Additional server-side fields
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  platform: { type: String, required: true, index: true },
  deviceModel: { type: String, required: true },
  osVersion: { type: String, required: true },
  synced: { type: Boolean, default: true },
  syncedAt: { type: Date, default: Date.now },
  isViewed: { type: Boolean, default: false },
  crashBugId: { type: mongoose.Schema.Types.ObjectId, ref: 'CrashBug', required: true }
});

// Add compound indexes for common queries
CrashReportSchema.index({ platform: 1, timestamp: -1 });
CrashReportSchema.index({ appVersion: 1, timestamp: -1 });
CrashReportSchema.index({ userId: 1, timestamp: -1 });

export const CrashReport = mongoose.model<ICrashReport>('CrashReport', CrashReportSchema); 