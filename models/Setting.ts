import mongoose from 'mongoose';
import { Platform } from '../enums/Platform';

export interface ISetting extends mongoose.Document {
    key: string;
    value: string;
    section: string;
    platform: string;  // Now Platform is defined
    isPublic: boolean;
    description?: string;
    minAppVersion?: string;
    maxAppVersion?: string;
    createdAt: number;
    updatedAt: number;
  }
  
  const SettingSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: String },
    section: { type: String, required: true },
    platform: { type: String, default: "all" },
    isPublic: { type: Boolean, default: true },
    description: String,
    minAppVersion: String,
    maxAppVersion: String,
    createdAt: { type: Number, default: () => Date.now() },
    updatedAt: { type: Number, default: () => Date.now() }
  });
  
  export const Setting = mongoose.model<ISetting>('Setting', SettingSchema);
  