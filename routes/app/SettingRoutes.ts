import { Router } from 'express';
import { auth } from '@/middleware/auth';
import { MyRequestHandler } from '@/Helper/MyRequestHandler';
import { Setting } from '@/models/Setting';
import { Logger } from '@/Helper/Logger';
import { CacheManager } from '@/Helper/CacheManager';

const settingRouter = Router();

settingRouter.get('/', auth.optional, MyRequestHandler(async (req, res) => {
  try {
    const settings = await CacheManager.getInstance().getSettings();
    if (!settings) {
      Logger.warn('No settings found in database');
      return res.status(404).json({ message: 'No settings found' });
    }
    
    // Transform settings array to a key-value object
    const settingsMap: Record<string, string> = {};
    
    // Check if settings is an array-like object with numeric keys
    if (typeof settings === 'object' && Object.keys(settings).every(key => !isNaN(Number(key)))) {
      // It's an array-like object, so extract key-value pairs
      Object.values(settings).forEach((setting: any) => {
        if (setting && typeof setting === 'object' && 'key' in setting && 'value' in setting) {
          settingsMap[setting.key as string] = setting.value as string;
        }
      });
    } else {
      // If it's already a key-value map, just use it
      Object.entries(settings as Record<string, any>).forEach(([key, value]) => {
        settingsMap[key] = String(value);
      });
    }
    
    return res.json(settingsMap);
  } catch (error: any) {
    Logger.error('Failed to fetch all settings', { error: error.message });
    return res.status(500).json({ message: 'Failed to fetch settings' });
  }
}));

export default settingRouter;