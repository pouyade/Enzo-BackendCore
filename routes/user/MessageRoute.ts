import express from 'express';
import sharp from 'sharp';
import { auth } from '@/middleware/auth';
import { upload } from '@/middleware/upload';
import { Config } from '@/config';
import { User } from '@/models/User';
import { Message } from '@/models/Message';
import { Session } from '@/models/Session';
import { fileStorage } from '@/Helper/FileStorage';
import { Logger } from '@/Helper/Logger';
import { MyRequestHandler } from '@/Helper/MyRequestHandler';
import { messsageRateLimit } from '@/middleware/rateLimiter';
import { apiLimiter } from '@/middleware/rateLimiter';
import { NotificationService } from '@/Helper/NotificationService';
const messageRoute = express.Router();
messageRoute.use(auth.user);
messageRoute.use(apiLimiter);
messageRoute.post('/', messsageRateLimit,upload.single('photo'),MyRequestHandler(async (req, res) => {
    try {
      const { content } = req.body;
      const user = await User.findById(req.user!.id);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      if (!content?.trim() && !req.file) {
        Logger.warn('Invalid message: no content or photo', { userId: req.user!.id });
        return res.status(400).json({ message: 'Message must have content or photo' });
      }

      // If there's a photo, check daily upload limits
      if (req.file) {
        const hasActivePlan = user.subscription?.isActive && user.subscription.endDate > Date.now();
        const dailyLimit = hasActivePlan ? Config.getInstance().uploads.dailyLimitPremium : Config.getInstance().uploads.dailyLimitBasic;

        const dailyUploads = await Message.getDailyImageCount(user._id);
        if (dailyUploads >= dailyLimit) {
          Logger.warn('Daily upload limit exceeded', { 
            userId: req.user!.id, 
            uploads: dailyUploads, 
            limit: dailyLimit 
          });
          return res.status(429).json({ 
            message: `Daily image upload limit (${dailyLimit}) exceeded. ${hasActivePlan ? '' : 'Upgrade your plan for more uploads.'}` 
          });
        }
      }

      let photoData;
      if (req.file) {
        photoData = await fileStorage.uploadMessagePhoto(req.file.buffer, req.file.mimetype);
      }

      const message = new Message({
        userId: req.user!.id,
        content: content?.trim() || '',
        photo: photoData,
        isFromAdmin: false,
        timestamp: Date.now(),
        isRead: true
      });

      await message.save();
      await NotificationService.getInstance().sendMessageNotification(user,message);
      Logger.info('User sent message with photo', { userId: req.user!.id });
      return res.status(201).json({ message: message, lastSyncTimestamp: message.timestamp });
    } catch (error) {
      return res.status(500).json({ message: 'Failed to send message' });
    }
  }));

messageRoute.get('/sync' ,MyRequestHandler(async (req, res) => {
  try {
    const lastSyncTimestamp = parseInt(req.query.lastSyncTimestamp as string) || 0;

    const messages = await Message.find({
      userId: req.user!.id,
      timestamp: { $gt: lastSyncTimestamp },
    }).sort({ timestamp: -1 });

    return res.status(200).json({
      messages,
      lastSyncTimestamp: Date.now(),
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Failed to sync messages' });
  }
}));

messageRoute.get('/', MyRequestHandler(async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;
    const lastSyncTimestamp = parseInt(req.query.lastSyncTimestamp as string) || 0;

    const query = {
      userId: req.user!.id,
      timestamp: { $gt: lastSyncTimestamp },
    };

    const messages = await Message.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Message.countDocuments({ userId: req.user!.id });

    await Message.updateMany(
      { 
        userId: req.user!.id, 
        isFromAdmin: true, 
        isRead: false 
      },
      { isRead: true }
    );

    const currentTimestamp = Date.now();
    const etag = `W/"${currentTimestamp}-${total}"`;
    res.set('ETag', etag);

    if (req.get('If-None-Match') === etag) {
      return res.status(304).send();
    }

    Logger.info('User fetched messages', { 
      userId: req.user!.id,
      page,
      limit,
      total: messages.length
    });

    return res.status(200).json({
      messages,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
        lastSyncTimestamp: currentTimestamp,
      }
    });
  } catch (error: any) {
    Logger.error('Failed to fetch messages', { userId: req.user!.id, error: error.message });
    return res.status(500).json({ message: 'Failed to fetch messages' });
  }
}));

messageRoute.get('/unread-count', MyRequestHandler(async (req, res) => {
  try {
    const count = await Message.countDocuments({
      userId: req.user!.id,
      isFromAdmin: true,
      isRead: false
    });

    Logger.info('User fetched unread count', { 
      userId: req.user!.id,
      unreadCount: count
    });

    return res.status(200).json({ count });
  } catch (error: any) {
    Logger.error('Failed to get unread count', { userId: req.user!.id, error: error.message });
    return res.status(500).json({ message: 'Failed to get unread count' });
  }
}));

export default messageRoute;