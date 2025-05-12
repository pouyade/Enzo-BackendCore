import { Router } from 'express';
import { MyRequestHandler } from '@/Helper/MyRequestHandler';
import { AppText } from '@/models';
import { CacheManager } from '@/Helper/CacheManager';
import {Setting} from '@models/Setting';
import { Logger } from '@/Helper/Logger';

const appManagmentRouter = Router();
appManagmentRouter.get('/settings', MyRequestHandler(async (req,res)=>{
  try {
    const settings = await Setting.find({});
    const formattedSettings = {
      siteName: settings.find(s => s.key === 'app_name')?.value || '',
      maintenanceMode: settings.find(s => s.key === 'maintenance_mode')?.value || 'off',
      maintenanceStart: settings.find(s => s.key === 'maintenance_start')?.value,
      maintenanceEnd: settings.find(s => s.key === 'maintenance_end')?.value,
      smtp: {
        host: settings.find(s => s.key === 'smtp_host')?.value || '',
        port: parseInt(settings.find(s => s.key === 'smtp_port')?.value || '587'),
        username: settings.find(s => s.key === 'smtp_username')?.value || '',
        password: settings.find(s => s.key === 'smtp_password')?.value || '',
        fromEmail: settings.find(s => s.key === 'smtp_from_email')?.value || ''
      },
      security: {
        sessionTimeout: parseInt(settings.find(s => s.key === 'session_timeout')?.value || '30'),
        maxLoginAttempts: parseInt(settings.find(s => s.key === 'max_login_attempts')?.value || '5'),
        twoFactorAuth: settings.find(s => s.key === 'two_factor_auth')?.value === 'true'
      }
    };

    Logger.info('Admin fetched settings', { adminId: req.user!.id });
    return res.status(200).json(formattedSettings);
  } catch (error: any) {
    Logger.error('Failed to fetch settings', { adminId: req.user!.id, error: error.message });
    return res.status(500).json({ message: 'Failed to fetch settings' });
  }
}));

appManagmentRouter.put('/settings', MyRequestHandler(async (req,res)=>{
  try {
    const {
      siteName,
      maintenanceMode,
      maintenanceStart,
      maintenanceEnd,
      smtp,
      security
    } = req.body;

    // Update settings
    const settingsToUpdate = [
      { key: 'app_name', value: siteName },
      { key: 'maintenance_mode', value: maintenanceMode },
      { key: 'maintenance_start', value: maintenanceStart },
      { key: 'maintenance_end', value: maintenanceEnd },
      { key: 'smtp_host', value: smtp.host },
      { key: 'smtp_port', value: smtp.port.toString() },
      { key: 'smtp_username', value: smtp.username },
      { key: 'smtp_password', value: smtp.password },
      { key: 'smtp_from_email', value: smtp.fromEmail },
      { key: 'session_timeout', value: security.sessionTimeout.toString() },
      { key: 'max_login_attempts', value: security.maxLoginAttempts.toString() },
      { key: 'two_factor_auth', value: security.twoFactorAuth.toString() }
    ];

    for (const setting of settingsToUpdate) {
      await Setting.findOneAndUpdate(
        { key: setting.key },
        { 
          $set: { 
            value: setting.value,
            updatedAt: Date.now()
          }
        },
        { upsert: true }
      );
    }

    Logger.info('Admin updated settings', { adminId: req.user!.id });
    return res.status(200).json({ message: 'Settings updated successfully' });
  } catch (error: any) {
    Logger.error('Failed to update settings', { adminId: req.user!.id, error: error.message });
    return res.status(500).json({ message: 'Failed to update settings' });
  }
}));

// Get all settings with filtering
appManagmentRouter.get('/settings/all', MyRequestHandler(async (req,res)=>{
  try {
    const { search, section, platform, isPublic } = req.query;
    const filter: any = {};

    if (search) {
      filter.$or = [
        { key: { $regex: search, $options: 'i' } },
        { value: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    if (section) filter.section = section;
    if (platform) filter.platform = platform;
    if (isPublic !== undefined) filter.isPublic = isPublic === 'true';

    const settings = await Setting.find(filter).sort({ section: 1, key: 1 });
    
    // Get unique sections for filtering
    const sections = await Setting.distinct('section');
    
    Logger.info('Admin fetched all settings', { adminId: req.user!.id });
    return res.status(200).json({ settings, sections });
  } catch (error: any) {
    Logger.error('Failed to fetch settings', { adminId: req.user!.id, error: error.message });
    return res.status(500).json({ message: 'Failed to fetch settings' });
  }
}));

// Create new setting
appManagmentRouter.post('/settings/create', MyRequestHandler(async (req,res)=>{
  try {
    const { key, value, section, platform, isPublic, description, minAppVersion, maxAppVersion } = req.body;

    // Check if key already exists
    const existingSetting = await Setting.findOne({ key });
    if (existingSetting) {
      return res.status(400).json({ message: 'Setting key already exists' });
      
    }

    const setting = await Setting.create({
      key,
      value,
      section,
      platform,
      isPublic,
      description,
      minAppVersion,
      maxAppVersion
    });

    Logger.info('Admin created new setting', { adminId: req.user!.id, settingKey: key });
    return res.status(201).json(setting);
  } catch (error: any) {
    Logger.error('Failed to create setting', { adminId: req.user!.id, error: error.message });
    return res.status(500).json({ message: 'Failed to create setting' });
  }
}));

// Update single setting
appManagmentRouter.put('/settings/:key', MyRequestHandler(async (req,res)=>{
  try {
    const { value, section, platform, isPublic, description, minAppVersion, maxAppVersion } = req.body;
    
    const setting = await Setting.findOne({ key: req.params.key });
    if (!setting) {
      return res.status(404).json({ message: 'Setting not found' });
      
    }

    setting.value = value;
    setting.section = section;
    setting.platform = platform;
    setting.isPublic = isPublic;
    setting.description = description;
    setting.minAppVersion = minAppVersion;
    setting.maxAppVersion = maxAppVersion;
    setting.updatedAt = Date.now();

    await setting.save();

    Logger.info('Admin updated setting', { adminId: req.user!.id, settingKey: req.params.key });
    return res.status(200).json(setting);
  } catch (error: any) {
    Logger.error('Failed to update setting', { adminId: req.user!.id, error: error.message });
    return res.status(500).json({ message: 'Failed to update setting' });
  }
}));

// Delete setting
appManagmentRouter.delete('/settings/:key', MyRequestHandler(async (req,res)=>{
  try {
    const setting = await Setting.findOne({ key: req.params.key });
    if (!setting) {
      return res.status(404).json({ message: 'Setting not found' });
      
    }

    await Setting.deleteOne({ key: req.params.key });

    Logger.info('Admin deleted setting', { adminId: req.user!.id, settingKey: req.params.key });
    return res.status(200).json({ message: 'Setting deleted successfully' });
  } catch (error: any) {
    Logger.error('Failed to delete setting', { adminId: req.user!.id, error: error.message });
    return res.status(500).json({ message: 'Failed to delete setting' });
  }
}));

// Text Managment
// Get all texts (including inactive)
appManagmentRouter.get('/text/all', MyRequestHandler(async (req, res) => {
  const texts = await AppText.find().sort({ section: 1, key: 1 });
  const sections = [...new Set(texts.map(text => text.section))];
  return res.status(200).json({ texts, sections });
}));

// Create new text
appManagmentRouter.post('/text/create', MyRequestHandler(async (req, res) => {
  const { key, title, title_fa, content, content_fa, section, description, shouldAccept } = req.body;

  // Check if text with key already exists
  const existingText = await AppText.findOne({ key });
  if (existingText) {
    return res.status(400).json({ message: 'Text with this key already exists' });
  }

  const text = new AppText({
    key,
    title,
    title_fa,
    content,
    content_fa,
    section,
    description,
    isActive: true,
    shouldAccept: shouldAccept || false
  });

  await text.save();
  await clearCache();

  return res.status(201).json({ text });
}));

// Update text
appManagmentRouter.put('/text/:key', MyRequestHandler(async (req, res) => {
  const { key } = req.params;
  const updateData = req.body;

  const text = await AppText.findOneAndUpdate(
    { key },
    updateData,
    { new: true }
  );

  if (!text) {
    return res.status(404).json({ message: 'Text not found' });
  }

  await clearCache();
  return res.status(200).json({ text });
}));

// Delete text
appManagmentRouter.delete('/text/:key', MyRequestHandler(async (req, res) => {
  const { key } = req.params;

  const text = await AppText.findOneAndDelete({ key });

  if (!text) {
    return res.status(404).json({ message: 'Text not found' });
  }

  await clearCache();
  return res.status(200).json({ message: 'Text deleted successfully' });
}));

// Helper function to clear cache
async function clearCache() {
  const cacheManager = CacheManager.getInstance();
  await cacheManager.deleteByPrefix('texts');
}

export default appManagmentRouter; 