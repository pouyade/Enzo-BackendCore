import Redis from 'ioredis';
import { Config } from '@/config';
import { Logger } from '@/Helper/Logger';
import { Setting } from '@/models/Setting';

interface CacheOptions {
  ttl: number;  // Time to live in seconds
  prefix: string;  // Prefix for cache keys
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export class CacheManager {
  private static instance: CacheManager;
  private client: Redis;
  private readonly defaultTTL: number;
  private isDebugMode: boolean;
  // Settings cache keys
  private readonly SETTINGS_PREFIX = 'settings';
  private readonly ALL_SETTINGS_KEY = 'all';
  private readonly PUBLIC_SETTINGS_KEY = 'public';

  private constructor() {
    const config = Config.getInstance();
    this.defaultTTL = config.redis.ttl;
    this.isDebugMode = config.debug.enabled;
    
    this.client = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    });

    this.client.on('connect', () => {
      // Logger.info('Redis client connected');
    });

    this.client.on('error', (error: Error) => {
      Logger.error('Redis client error', { error: error.message });
    });

    this.client.on('close', () => {
      Logger.warn('Redis client closed');
    });
  }

  public static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  // Generic cache methods
  public async get<T>(key: string, options: CacheOptions): Promise<T | null> {
    try {
      if (this.isDebugMode) {
        return null;
      }
      const fullKey = `${options.prefix}:${key}`;
      const cached = await this.client.get(fullKey);
      
      if (cached) {
        const entry: CacheEntry<T> = JSON.parse(cached);
        if (Date.now() - entry.timestamp < options.ttl * 1000) {
          Logger.debug(`Cache hit for key: ${fullKey}`);
          return entry.data;
        }
      }
      
      Logger.debug(`Cache miss for key: ${fullKey}`);
      return null;
    } catch (error: any) {
      Logger.error('Cache get error', { key, error: error.message });
      return null;
    }
  }

  public async set<T>(key: string, data: T, options: CacheOptions): Promise<void> {
    try {
      if (this.isDebugMode) {
        return;
      }
      const fullKey = `${options.prefix}:${key}`;
      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now()
      };

      await this.client.setex(
        fullKey,
        options.ttl,
        JSON.stringify(entry)
      );
      
      Logger.debug(`Cache set for key: ${fullKey}`);
    } catch (error: any) {
      Logger.error('Cache set error', { key, error: error.message });
    }
  }

  public async delete(key: string, options: CacheOptions): Promise<void> {
    try {
      const fullKey = `${options.prefix}:${key}`;
      await this.client.del(fullKey);
      Logger.debug(`Cache deleted for key: ${fullKey}`);
    } catch (error: any) {
      Logger.error('Cache delete error', { key, error: error.message });
    }
  }

  public async deleteByPrefix(prefix: string): Promise<void> {
    try {
      const keys = await this.client.keys(`${prefix}:*`);
      if (keys.length > 0) {
        await this.client.del(...keys);
        Logger.debug(`Cache deleted for prefix: ${prefix}`);
      }
    } catch (error: any) {
      Logger.error('Cache delete by prefix error', { prefix, error: error.message });
    }
  }

  // Settings-specific cache methods
  public async getSettings(): Promise<any> {
    try {
      const cached = await this.get(this.ALL_SETTINGS_KEY, {
        prefix: this.SETTINGS_PREFIX,
        ttl: this.defaultTTL
      });

      if (cached) {
        return cached;
      }

      const settings = await Setting.find({});
      await this.set(this.ALL_SETTINGS_KEY, settings, {
        prefix: this.SETTINGS_PREFIX,
        ttl: this.defaultTTL
      });
      return settings;
    } catch (error: any) {
      Logger.error('Failed to get settings from cache', { error: error.message });
      return Setting.find({});
    }
  }

  public async getPublicSettings(): Promise<any> {
    try {
      const cached = await this.get(this.PUBLIC_SETTINGS_KEY, {
        prefix: this.SETTINGS_PREFIX,
        ttl: this.defaultTTL
      });

      if (cached) {
        return cached;
      }

      const settings = await Setting.find({ isPublic: true });
      await this.set(this.PUBLIC_SETTINGS_KEY, settings, {
        prefix: this.SETTINGS_PREFIX,
        ttl: this.defaultTTL
      });
      return settings;
    } catch (error: any) {
      Logger.error('Failed to get public settings from cache', { error: error.message });
      return Setting.find({ isPublic: true });
    }
  }

  public async invalidateSettingsCache(): Promise<void> {
    try {
      await this.deleteByPrefix(this.SETTINGS_PREFIX);
      // Logger.info('Settings cache invalidated');
    } catch (error: any) {
      Logger.error('Failed to invalidate settings cache', { error: error.message });
    }
  }

  public async disconnect(): Promise<void> {
    try {
      await this.client.quit();
      Logger.info('Redis client disconnected');
    } catch (error: any) {
      Logger.error('Failed to disconnect Redis client', { error: error.message });
    }
  }
}