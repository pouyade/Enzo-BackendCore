export interface AppConfig {
  uploads: {
    maxSizeBasic: number;    // in bytes
    maxSizePremium: number;  // in bytes
    dailyLimitBasic: number;
    dailyLimitPremium: number;
    allowedMimeTypes: string[];
  };
  session: {
    maxLifeTime: number;     // in milliseconds
    maxCount: number;
  };
  paths: {
    uploadsDir: string;
  };
} 