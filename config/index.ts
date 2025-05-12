import { AppConfig } from './types';
import path from 'path';

const MB = 1024 * 1024;

export const config: AppConfig = {
  uploads: {
    maxSizeBasic: Number(process.env.UPLOAD_MAX_SIZE_BASIC_MB || 2) * MB,
    maxSizePremium: Number(process.env.UPLOAD_MAX_SIZE_PREMIUM_MB || 5) * MB,
    dailyLimitBasic: Number(process.env.UPLOAD_DAILY_LIMIT_BASIC || 10),
    dailyLimitPremium: Number(process.env.UPLOAD_DAILY_LIMIT_PREMIUM || 100),
    allowedMimeTypes: (process.env.UPLOAD_ALLOWED_MIME_TYPES || 'image/jpeg,image/png,image/gif').split(','),
  },
  session: {
    maxLifeTime: Number(process.env.USER_SESSION_LIFE_DAYS || 30) * 24 * 60 * 60 * 1000,
    maxCount: Number(process.env.USER_MAX_SESSION_COUNT || 1),
  },
  paths: {
    uploadsDir: process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads', 'messages'),
  },
}; 