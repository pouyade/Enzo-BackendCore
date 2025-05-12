import mongoose from "mongoose";

export interface ICrashBug extends mongoose.Document {
  platform: string;
  appVersionCode: number;
  fileName: string;
  functionName: string;
  errorTitle: string;
  firstSeen: Date;
  lastSeen: Date;
  occurrences: number;
  isResolved: boolean;
  resolvedAt?: Date;
  isViewed: boolean;
  affectedDevices: {
    deviceModel: string;
    osVersion: string;
    count: number;
  }[];
  notes?: string;
}

const CrashBugSchema = new mongoose.Schema({
  platform: { type: String, required: true },
  appVersionCode: { type: Number, required: true },
  fileName: { type: String, required: true },
  functionName: { type: String, required: true },
  errorTitle: { type: String, required: true },
  firstSeen: { type: Date, default: Date.now },
  lastSeen: { type: Date, default: Date.now },
  occurrences: { type: Number, default: 1 },
  isResolved: { type: Boolean, default: false },
  resolvedAt: { type: Date },
  isViewed: { type: Boolean, default: false },
  affectedDevices: [{
    deviceModel: { type: String, required: true },
    osVersion: { type: String, required: true },
    count: { type: Number, default: 1 }
  }],
  notes: { type: String }
});

// Create a compound unique index for identifying unique bugs
CrashBugSchema.index(
  { 
    platform: 1,
    appVersionCode: 1,
    fileName: 1,
    functionName: 1,
    errorTitle: 1
  },
  { unique: true }
);

// Add indexes for common queries
CrashBugSchema.index({ isResolved: 1, lastSeen: -1 });
CrashBugSchema.index({ occurrences: -1 });
CrashBugSchema.index({ isViewed: 1 });

export const CrashBug = mongoose.model<ICrashBug>('CrashBug', CrashBugSchema); 