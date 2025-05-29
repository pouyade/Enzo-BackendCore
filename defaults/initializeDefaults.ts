import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

import { Plan } from '@/models/Plan';
import { Setting } from '@/models/Setting';
import { Logger } from '@/Helper/Logger';
import { CacheManager } from '@/Helper/CacheManager';

import { Database } from '@/Database';
import { AppText } from '@/models/AppText';
import { logger } from '@/index';

import defaultPlans from '@/defaults/plans.json'
import defaultSettings from '@/defaults/settings.json';
import defaultTexts from '@/defaults/texts.json'

export async function initializeDefaults(){
  await initializePlans();
  await initializeSettings();
  await initializeAppTexts();
}

export const initializePlans = async () => {
  try {
    for (const planData of defaultPlans) {
      const existingPlan = await Plan.findOne({ name: planData.name });
      if (!existingPlan) {
        const plan = new Plan(planData);
        await plan.save();
      }
    }
  } catch (error) {
    console.error('Error initializing plans:', error);
    throw error;
  }
};


export async function initializeSettings() {
  try {
    for (const setting of defaultSettings) {
      const existingSetting = await Setting.findOne({ key: setting.key });
      // Only create if not exists
      if (!existingSetting) {
        await Setting.create({
          ...setting,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
        Logger.info(`Created new setting: ${setting.key}`);
      }
    }
    await CacheManager.getInstance().invalidateSettingsCache();
  } catch (error: any) {
    Logger.error('Failed to initialize settings', { error: error.message });
    throw error;
  }
} 



// Function to read HTML content from files
function getHtmlContent(filePath: string): string {
  try {
    const fullPath = path.join(process.cwd(), filePath);
    return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
  } catch (error) {
    logger.error(`Error reading HTML file ${filePath}:`, error);
    return '';
  }
}

export const initializeAppTexts = async () => {
  try {
    if (!Database.isConnected()) {
      logger.error('Database connection not established');
      return;
    }
    for (const textData of defaultTexts) {
      const existingText = await AppText.findOne({ key: textData.key });
      if (!existingText) {
        const text = new AppText(textData);
        text.content = getHtmlContent("./defaults/"+textData.content);
        text.content_fa = getHtmlContent("./defaults/"+textData.content_fa);
        await text.save();
      }
    }
  } catch (error: any) {
    logger.error('Error initializing app texts:', { error: error.message });
    throw error;
  }
}