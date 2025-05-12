import mongoose from 'mongoose';


// Session Schema
export interface ISession extends mongoose.Document {
    userId: mongoose.Types.ObjectId;
    token: string;
    userAgent?: string;
    ip?: string;
    deviceOs?: string;
    osVersion?: string;
    deviceName?: string;
    deviceResolution?: string;
    deviceRegId?: string | null;
    appVersionName?: string;
    appVersionCode?: string;
    createdAt: number;
    lastActive: number;
    isTerminated: boolean;
    expiresAt: number;
  }
  
  const SessionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    token: { type: String, required: true },
    userAgent: { type: String, default: 'unknown' },
    ip: { type: String, default: 'unknown' },
    deviceOs: { type: String, default: 'unknown' },
    osVersion: { type: String, default: 'unknown' },
    deviceName: { type: String, default: 'unknown' },
    deviceResolution: { type: String, default: 'unknown' },
    deviceRegId: { type: String, default: null },
    appVersionName: { type: String, default: 'unknown' },
    appVersionCode: { type: String, default: 'unknown' },
    createdAt: { type: Number, default: () => Date.now() },
    lastActive: { type: Number, default: () => Date.now() },
    isTerminated: { type: Boolean, default: false },
    expiresAt: { type: Number, required: true }
  });
  
  // Replace the old index dropping logic with proper index management
  SessionSchema.index({ token: 1 }, { unique: true });
  
  export const Session = mongoose.model<ISession>('Session', SessionSchema);
  