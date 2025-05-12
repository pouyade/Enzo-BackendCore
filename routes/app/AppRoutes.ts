import express from 'express';
import mongoose from 'mongoose';
import { Logger } from '@/Helper/Logger';
import { MyRequestHandler } from '@/Helper/MyRequestHandler';
import settingRouter  from '@/routes/app/SettingRoutes';
import planRouter from '@/routes/app/Planroutes';
import { apiLimiter } from '@/middleware/rateLimiter';
import { auth } from '@/middleware/auth';
import { CacheManager } from '@/Helper/CacheManager';
import { AppText } from '@/models';
import { CrashReport } from '@/models/CrashReport';
import { CrashBug } from '@/models/CrashBug';

const appRouter = express.Router();
appRouter.use('/settings',settingRouter);
appRouter.use('/plans',planRouter);
appRouter.use(apiLimiter);

// Get texts by section
appRouter.get('/texts/:key/:lang', MyRequestHandler(async (req, res) => {
  const { key, lang } = req.params;
  const cacheKey = `app_texts_${key}_${lang}`;
  const cacheManager = CacheManager.getInstance();
  
  // Try to get from cache first
  const cachedTexts = await cacheManager.get(cacheKey, {
    prefix: 'app_texts',
    ttl: 3600 // 1 hour in seconds
  });
  
  if (cachedTexts) {
    return res.status(200).json({ texts: cachedTexts });
  }

  // If not in cache, fetch from database
  const texts = await AppText.find({ 
    key, 
    isActive: true 
  }).select('-__v');

  // Store in cache
  await cacheManager.set(cacheKey, texts, {
    prefix: 'app_texts',
    ttl: 3600
  });
  if(texts.length > 0){
    if(lang === 'en'){
      return res.status(200).contentType('text/html').send(texts[0].content);
    }else{
      return res.status(200).contentType('text/html').send(texts[0].content_fa);
    }
  }else{
    return res.status(200).contentType('text/html').send('<html><body><h1>Text not found</h1></body></html>');
  }
}));
// Get all active texts
appRouter.get('/texts', MyRequestHandler(async (req, res) => {
  const cacheKey = 'app_texts_all';
  const cacheManager = CacheManager.getInstance();
  
  // Try to get from cache first
  const cachedTexts = await cacheManager.get(cacheKey, {
    prefix: 'app_texts',
    ttl: 3600
  });
  
  if (cachedTexts) {
    return res.status(200).json({ texts: cachedTexts });
  }

  // If not in cache, fetch from database
  const texts = await AppText.find({ 
    isActive: true 
  }).select('-__v');

  // Store in cache
  await cacheManager.set(cacheKey, texts, {
    prefix: 'app_texts',
    ttl: 3600
  });

  return res.status(200).json({ texts });
}));

// Sync error logs endpoint
appRouter.post('/errors/sync', auth.user, MyRequestHandler(async (req, res) => {
  const { platform, deviceModel, osVersion, errors } = req.body;

  if (!platform || !deviceModel || !osVersion || !errors) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields'
    });
  }

  try {
    const errorsList = JSON.parse(errors);
    const crashReports = [];
    
    for (const error of errorsList) {
      try {
        // Parse version string to get version code
        const versionMatch = error.app_version.match(/^(.*?)\s*\((\d+)\)$/);
        const appVersion = versionMatch ? versionMatch[1].trim() : error.app_version;
        const appVersionCode = versionMatch ? parseInt(versionMatch[2]) : 1;

        // Normalize error title by removing instance-specific IDs
        // Example: "IllegalStateException: LifecycleOwner com.embtime.bot.Ui.Activity.MainActivity@8a9c21e is attempting..."
        // Becomes: "IllegalStateException: LifecycleOwner com.embtime.bot.Ui.Activity.MainActivity is attempting..."
        const normalizedErrorTitle = error.error_title.replace(/@[a-f0-9]+/i, '');

        // Create or update the crash bug
        const bugData = {
          platform,
          appVersionCode,
          fileName: error.file_name,
          functionName: error.function_name,
          errorTitle: normalizedErrorTitle
        };

        Logger.info('Processing crash bug', {
          userId: req.user?.id,
          bugData,
          errorId: error.id,
          originalTitle: error.error_title,
          normalizedTitle: normalizedErrorTitle
        });

        let crashBug = await CrashBug.findOne(bugData);
        
        if (!crashBug) {
          crashBug = await CrashBug.create({
            ...bugData,
            firstSeen: new Date(),
            lastSeen: new Date(),
            occurrences: 1,
            affectedDevices: [{
              deviceModel,
              osVersion,
              count: 1
            }]
          });
        } else {
          // Update existing bug
          crashBug.lastSeen = new Date();
          crashBug.occurrences += 1;

          // Update affected devices
          const deviceIndex = crashBug.affectedDevices.findIndex(
            d => d.deviceModel === deviceModel && d.osVersion === osVersion
          );

          if (deviceIndex >= 0) {
            crashBug.affectedDevices[deviceIndex].count += 1;
          } else {
            crashBug.affectedDevices.push({
              deviceModel,
              osVersion,
              count: 1
            });
          }

          await crashBug.save();
        }

        // Create crash report with original error title
        crashReports.push({
          id: error.id,
          timestamp: error.timestamp,
          appVersion,
          appVersionCode,
          stackTrace: error.stack_trace,
          fileName: error.file_name,
          functionName: error.function_name,
          errorTitle: error.error_title, // Keep original error title in the report
          userId: req.user?.id,
          platform,
          deviceModel,
          osVersion,
          synced: true,
          syncedAt: new Date(),
          crashBugId: crashBug._id
        });
      } catch (innerError) {
        Logger.error('Error processing individual crash report', {
          userId: req.user?.id,
          errorId: error.id,
          error: innerError instanceof Error ? innerError.message : 'Unknown error',
          errorData: error
        });
        // Continue processing other reports even if one fails
        continue;
      }
    }

    if (crashReports.length > 0) {
      await CrashReport.insertMany(crashReports, { ordered: false });

      Logger.info('Synced crash reports', {
        userId: req.user?.id,
        platform,
        count: crashReports.length
      });

      return res.status(200).json({
        success: true,
        message: `Successfully synced ${crashReports.length} crash reports`
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'No valid crash reports to process'
      });
    }

  } catch (error) {
    Logger.error('Error syncing crash reports', {
      userId: req.user?.id,
      platform,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      requestBody: req.body
    });

    return res.status(500).json({
      success: false,
      message: 'Error processing crash reports',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

export default appRouter;