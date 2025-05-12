
import {Router} from 'express';
import mongoose from 'mongoose';
import { MyRequestHandler } from '@/Helper/MyRequestHandler';
import { Logger } from '@/Helper/Logger';
import { IMessage, Message, User} from '@/models';
import { NotificationService } from '@/Helper/NotificationService';
import { fileStorage } from '@/Helper/FileStorage';
import { upload } from '@/middleware/upload';
const supportManagmentRouter=Router();

// Support Chat Endpoints

// Get all conversations with latest message
supportManagmentRouter.get('/conversations', MyRequestHandler(async (req,res)=>{
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    // Get conversations grouped by user with latest message and unread count
    const conversations = await Message.aggregate([
      {
        $sort: { timestamp: -1 }
      },
      {
        $group: {
          _id: '$userId',
          lastMessage: { $first: '$$ROOT' },
          unreadCount: {
            $sum: {
              $cond: [
                { $and: [
                  { $eq: ['$isFromAdmin', false] },
                  { $eq: ['$isRead', false] }
                ]},
                1,
                0
              ]
            }
          },
          totalMessages: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },
      {
        $sort: { 'lastMessage.timestamp': -1 }
      },
      {
        $skip: skip
      },
      {
        $limit: limit
      },
      {
        $project: {
          userId: '$_id',
          userEmail: '$user.email',
          userName: '$user.name',
          lastMessage: {
            content: '$lastMessage.content',
            photo: '$lastMessage.photo',
            timestamp: '$lastMessage.timestamp',
            isFromAdmin: '$lastMessage.isFromAdmin'
          },
          unreadCount: 1,
          totalMessages: 1
        }
      }
    ]);

    // Get total conversations count
    const total = await Message.aggregate([
      {
        $group: {
          _id: '$userId'
        }
      },
      {
        $count: 'total'
      }
    ]);

    Logger.info('Admin fetched support conversations', { 
      adminId: req.user!.id,
      page,
      limit,
      count: conversations.length
    });

    return res.status(200).json({
      conversations,
      pagination: {
        current: page,
        pages: Math.ceil((total[0]?.total || 0) / limit),
        total: total[0]?.total || 0
      }
    });
  } catch (error: any) {
    Logger.error('Failed to fetch support conversations', { 
      adminId: req.user!.id, 
      error: error.message 
    });
    return res.status(500).json({ message: 'Failed to fetch conversations' });
  }
}));


// Get unread message counts
supportManagmentRouter.get('/unread', MyRequestHandler(async (req,res)=>{
  try {
    const unreadCounts = await Message.aggregate([
      {
        $match: {
          isFromAdmin: false,
          isRead: false
        }
      },
      {
        $group: {
          _id: '$userId',
          count: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },
      {
        $project: {
          userId: '$_id',
          userEmail: '$user.email',
          userName: '$user.name',
          unreadCount: '$count'
        }
      }
    ]);

    const totalUnread = unreadCounts.reduce((sum, item) => sum + item.unreadCount, 0);

    Logger.info('Admin fetched unread counts', { 
      adminId: req.user!.id,
      totalUnread,
      userCount: unreadCounts.length
    });

    return res.status(200).json({
      total: totalUnread,
      byUser: unreadCounts
    });
  } catch (error: any) {
    Logger.error('Failed to get unread counts', { 
      adminId: req.user!.id,
      error: error.message
    });
    return res.status(500).json({ message: 'Failed to get unread counts' });
  }
}));
// Get messages for a specific user
supportManagmentRouter.get('/messages/:userId', MyRequestHandler(async (req,res)=>{
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = (page - 1) * limit;

    // Validate user exists
    const user = await User.findById(userId);
    if (!user) {
      Logger.warn('User not found for messages', { userId });
      return res.status(404).json({ message: 'User not found' });
      
    }

    // Get messages
    const messages = await Message.find({ userId })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Message.countDocuments({ userId });

    // Mark unread messages as read
    await Message.updateMany(
      { 
        userId,
        isFromAdmin: false,
        isRead: false
      },
      { isRead: true }
    );

    Logger.info('Admin fetched user messages', { 
      adminId: req.user!.id,
      userId,
      messageCount: messages.length
    });

    return res.status(200).json({
      messages: messages.reverse(), // Return in chronological order
      user: {
        id: user._id,
        email: user.email,
        name: user.name
      },
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error: any) {
    Logger.error('Failed to fetch user messages', { 
      adminId: req.user!.id,
      userId: req.params.userId,
      error: error.message
    });
    return res.status(500).json({ message: 'Failed to fetch messages' });
  }
}));

// Send text message to user
supportManagmentRouter.post('/messages/:userId', MyRequestHandler(async (req,res)=>{
  try {
    const { userId } = req.params;
    const { content } = req.body;

    // Validate user exists
    const user = await User.findById(userId);
    if (!user) {
      Logger.warn('Target user not found for message', { adminId: req.user!.id, userId });
      return res.status(404).json({ message: 'User not found' });
    }

    // Validate content
    if (!content || typeof content !== 'string' || content.trim() === '') {
      Logger.warn('Invalid message content', { adminId: req.user!.id, userId });
      return res.status(400).json({ message: 'Message content is required' });
    }

    const message = await Message.create({
      userId,
      content: content.trim(),
      isFromAdmin: true,
      timestamp: Date.now(),
      isRead: false
    }) as mongoose.Document & { _id: mongoose.Types.ObjectId };

    // Send notification to user if they have a registration ID
    if (user.regId) {
      try {
        await NotificationService.getInstance().sendMessageNotification(
          user,
          message as IMessage
        );
      } catch (notifError: any) {
        Logger.error('Failed to send notification', { 
          userId, 
          messageId: message._id,
          error: notifError.message 
        });
        // Don't fail the request if notification fails
      }
    }

    Logger.info('Admin sent message', { 
      adminId: req.user!.id,
      userId,
      messageId: message._id
    });

    return res.status(200).json(message);
  } catch (error: any) {
    Logger.error('Failed to send message', { 
      adminId: req.user!.id,
      userId: req.params.userId,
      error: error.message
    });
    return res.status(500).json({ message: 'Failed to send message' });
  }
}));

// Send message to user (text or photo)
supportManagmentRouter.post('/messages/:userId/photo', 
  upload.single('photo'),
  MyRequestHandler(async (req,res)=>{
    try {
      const { userId } = req.params;
      const { content } = req.body;
      const file = req.file;

      if (!content?.trim() && !file) {
        Logger.warn('Invalid message: no content or photo', { adminId: req.user!.id, userId });
        return res.status(400).json({ message: 'Message must have content or photo' });
      }

      // Validate user exists
      const user = await User.findById(userId);
      if (!user) {
        Logger.warn('Target user not found for photo message', { adminId: req.user!.id, userId });
        return res.status(404).json({ message: 'User not found' });
      }

      let photoData;
      if (file) {
        photoData = await fileStorage.uploadMessagePhoto(file.buffer, file.mimetype);
      }

      const message = await Message.create({
        userId,
        content: content?.trim() || '',
        photo: photoData,
        isFromAdmin: true,
        timestamp: Date.now(),
        isRead: false
      }) as mongoose.Document & { _id: mongoose.Types.ObjectId };

      // Send notification to user if they have a registration ID
      if (user.regId) {
        try {
          await NotificationService.getInstance().sendMessageNotification(
            user,
            message as IMessage
          );
        } catch (notifError: any) {
          Logger.error('Failed to send notification', { 
            userId, 
            messageId: message._id,
            error: notifError.message 
          });
          // Don't fail the request if notification fails
        }
      }

      Logger.info('Admin sent message with photo', { 
        adminId: req.user!.id,
        userId,
        messageId: message._id,
        hasPhoto: !!photoData
      });

      return res.status(200).json(message);
    } catch (error: any) {
      Logger.error('Failed to send photo message', { 
        adminId: req.user!.id,
        userId: req.params.userId,
        error: error.message
      });
      return res.status(500).json({ message: 'Failed to send photo message' });
    }
  }));


// Delete all messages for a specific user
supportManagmentRouter.delete('/messages/:userId', MyRequestHandler(async (req,res)=>{
  try {
    const { userId } = req.params;
    
    // Validate user exists
    const user = await User.findById(userId);
    if (!user) {
      Logger.warn('User not found for message deletion', { 
        adminId: req.user!.id, 
        userId 
      });
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Delete all messages for this user
    const result = await Message.deleteMany({ userId });
    
    Logger.info('Admin deleted all messages for user', { 
      adminId: req.user!.id,
      userId,
      deletedCount: result.deletedCount
    });
    
    return res.status(200).json({ 
      success: true, 
      message: `Deleted ${result.deletedCount} messages`,
      deletedCount: result.deletedCount
    });
  } catch (error: any) {
    Logger.error('Failed to delete user messages', { 
      adminId: req.user!.id,
      userId: req.params.userId,
      error: error.message
    });
    return res.status(500).json({ message: 'Failed to delete messages' });
  }
}));


supportManagmentRouter.get('/messages', MyRequestHandler(async (req,res)=>{
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    // Get messages grouped by user
    const messages = await Message.aggregate([
      {
        $sort: { timestamp: -1 }
      },
      {
        $group: {
          _id: '$userId',
          lastMessage: { $first: '$$ROOT' },
          unreadCount: {
            $sum: {
              $cond: [
                { $and: [
                  { $eq: ['$isFromAdmin', false] },
                  { $eq: ['$isRead', false] }
                ]},
                1,
                0
              ]
            }
          }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },
      {
        $skip: skip
      },
      {
        $limit: limit
      }
    ]);

    const total = await Message.aggregate([
      {
        $group: {
          _id: '$userId'
        }
      },
      {
        $count: 'total'
      }
    ]);

    return res.status(200).json({
      conversations: messages,
      pagination: {
        current: page,
        pages: Math.ceil((total[0]?.total || 0) / limit),
        total: total[0]?.total || 0
      }
    });
  } catch (error: any) {
    Logger.error('Failed to fetch messages for admin', { error: error.message });
    return res.status(500).json({ message: 'Failed to fetch messages' });
  }
}));

supportManagmentRouter.get('/messages/:userId', MyRequestHandler(async (req,res)=>{
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const messages = await Message.find({ userId })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Message.countDocuments({ userId });

    // Mark messages from user as read
    await Message.updateMany(
      { 
        userId, 
        isFromAdmin: false, 
        isRead: false 
      },
      { isRead: true }
    );

    return res.status(200).json({
      messages,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error: any) {
    Logger.error('Failed to fetch user messages', { userId: req.params.userId, error: error.message });
    return res.status(500).json({ message: 'Failed to fetch messages' });
  }
}));

supportManagmentRouter.post('/messages/:userId', MyRequestHandler(async (req,res)=>{
  try {
    const { userId } = req.params;
    const { content } = req.body;

    // Validate user exists
    const user = await User.findById(userId);
    if (!user) {
      Logger.warn('Target user not found for message', { adminId: req.user!.id, userId });
      return res.status(404).json({ message: 'User not found' });
      
    }

    // Validate content
    if (!content || typeof content !== 'string' || content.trim() === '') {
      Logger.warn('Invalid message content', { adminId: req.user!.id, userId });
      return res.status(400).json({ message: 'Message content is required' });
      
    }

    const message = await Message.create({
      userId,
      content: content.trim(),
      isFromAdmin: true,
      timestamp: Date.now(),
      isRead: false
    }) as mongoose.Document & { _id: mongoose.Types.ObjectId };

    const messageId = message._id.toString();

    // Send notification to user if they have a registration ID
    if (user.regId) {
      try {
        await NotificationService.getInstance().sendMessageNotification(
          user,
          message as IMessage
        );
        Logger.info('Notification sent to user', { userId, messageId });
      } catch (notifError: any) {
        Logger.error('Failed to send notification', { 
          userId, 
          messageId,
          error: notifError.message 
        });
        // Don't fail the request if notification fails
      }
    }

    Logger.info('Admin sent message', { adminId: req.user!.id, userId });
    return res.status(200).json(message);
  } catch (error: any) {
    Logger.error('Failed to send message', { adminId: req.user!.id, error: error.message });
    return res.status(500).json({ message: 'Failed to send message' });
  }
}));

supportManagmentRouter.get('/messages/unread-count', MyRequestHandler(async (req,res)=>{
  try {
    const unreadCounts = await Message.aggregate([
      {
        $match: {
          isFromAdmin: false,
          isRead: false
        }
      },
      {
        $group: {
          _id: '$userId',
          count: { $sum: 1 }
        }
      }
    ]);
    
    return res.status(200).json({ 
      totalUnread: unreadCounts.reduce((sum, item) => sum + item.count, 0),
      byUser: unreadCounts
    });
  } catch (error: any) {
    Logger.error('Failed to get unread count', { error: error.message });
    return res.status(500).json({ message: 'Failed to get unread count' });
  }
}));

export default supportManagmentRouter;

