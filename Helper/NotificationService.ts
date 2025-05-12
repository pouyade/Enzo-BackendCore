import { credential } from 'firebase-admin';
import { initializeApp, App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { User, Notification, IUser, IMessage } from '@/models';
import { Logger } from '@/Helper/Logger';
import { Config } from '@/config';
import mongoose from 'mongoose';

enum NotificationType {
  WELCOME = "welcome",
  LOGIN = "login",
  PROMOTION = "promotion",
  ALERT = "alert",
  UPDATE = "update",
  SYSTEM = "system",
  MESSAGE = "message",
  DIALOG = "dialog",
  UNKNOWN = "unknown"
}

export class NotificationService {
  private static instance: NotificationService;
  private app;

  private constructor() {
    try {
      this.app = initializeApp({
        credential: credential.cert({
          projectId: Config.getInstance().firebase.projectId,
        clientEmail: Config.getInstance().firebase.clientEmail,
        privateKey: Config.getInstance().firebase.privateKey.replace(/\\n/g, '\n')
      })
    });
    } catch (error) {
      console.error({
        projectId: Config.getInstance().firebase.projectId,
        clientEmail: Config.getInstance().firebase.clientEmail,
        privateKey: Config.getInstance().firebase.privateKey.replace(/\\n/g, '\n')
      });
      Logger.error('Failed to initialize Firebase', { error });
    }
  }

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }


  isInitialized(): boolean {
    return this.app !== null;
  }

  public async sendToUser(userId: string, title: string, body: string, data?: Record<string, string>) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Store notification in database regardless of push notification status
      await this.createNotification(userId, title, body, data);
      
      // Skip push notification if user has no registration ID
      if (!user.regId) {
        Logger.info('Notification stored but not sent (no regId)', { userId });
        return null;
      }

      const message = {
        notification: {
          title,
          body
        },
        data: data || {},
        token: user.regId
      };

      const response = await getMessaging().send(message);
      Logger.info('Notification sent successfully', { 
        userId,
        messageId: response 
      });
      return response;
    } catch (error: any) {
      Logger.error('Failed to send notification', { 
        userId, 
        error: error.message 
      });
      throw error;
    }
  }

  async sendToMultipleUsers(userIds: string[], title: string, body: string, data?: Record<string, string>) {
    try {
      // Store notifications for all users
      await Promise.all(
        userIds.map(userId => this.createNotification(userId, title, body, data))
      );

      const users = await User.find({ 
        _id: { $in: userIds },
        regId: { $exists: true, $ne: null }
      });

      const regIds = users.map(user => user.regId!);
      if (regIds.length === 0) {
        Logger.info('Notifications stored but not sent (no valid regIds)', { userIds });
        return { successCount: 0, failureCount: 0, responses: [] };
      }

      const messages = regIds.map(token => ({
        notification: {
          title,
          body
        },
        data: data || {},
        token
      }));

      const responses = await Promise.all(
        messages.map(msg => getMessaging().send(msg))
      );
      
      const successCount = responses.length;
      const failureCount = 0;  // Since errors would have thrown

      Logger.info('Multicast notification sent', { 
        successCount,
        failureCount,
        userIds
      });
      
      return { successCount, failureCount, responses };
    } catch (error: any) {
      Logger.error('Failed to send multicast notification', { 
        userIds, 
        error: error.message 
      });
      throw error;
    }
  }

  async sendToTopic(topic: string, title: string, body: string, data?: Record<string, string>) {
    try {
      const message = {
        notification: {
          title,
          body
        },
        data: data || {},
        topic
      };

      const response = await getMessaging().send(message);
      Logger.info('Topic notification sent', { 
        topic,
        messageId: response 
      });
      return response;
    } catch (error: any) {
      Logger.error('Failed to send topic notification', { 
        topic, 
        error: error.message 
      });
      throw error;
    }
  }

  // Create a notification in the database - this is now public for scripts to use
  async createNotification(userId: string, title: string, body: string, data?: Record<string, any>) {
    try {
      const notification = new Notification({
        userId: new mongoose.Types.ObjectId(userId),
        title,
        body,
        data: data || {},
        isRead: false
      });
      
      await notification.save();
      Logger.info('Notification created in database', { 
        userId, 
        notificationId: notification._id 
      });
      
      return notification;
    } catch (error: any) {
      Logger.error('Failed to create notification in database', { 
        userId, 
        error: error.message 
      });
      throw error;
    }
  }



  // Mark notification as read
  async markNotificationAsRead(userId: string, notificationId: string) {
    try {
      const result = await Notification.updateOne(
        { _id: notificationId, userId },
        { $set: { isRead: true } }
      );
      
      if (result.matchedCount === 0) {
        throw new Error('Notification not found or does not belong to this user');
      }
      
      Logger.info('Marked notification as read', { 
        userId, 
        notificationId 
      });
      
      return true;
    } catch (error: any) {
      Logger.error('Failed to mark notification as read', { 
        userId, 
        notificationId, 
        error: error.message 
      });
      throw error;
    }
  }

  // Mark all notifications as read for a user
  async markAllNotificationsAsRead(userId: string) {
    try {
      const result = await Notification.updateMany(
        { userId, isRead: false },
        { $set: { isRead: true } }
      );
      
      Logger.info('Marked all notifications as read', { 
        userId, 
        count: result.modifiedCount 
      });
      
      return result.modifiedCount;
    } catch (error: any) {
      Logger.error('Failed to mark all notifications as read', { 
        userId, 
        error: error.message 
      });
      throw error;
    }
  }

  async sendRegisterationNotification(user: IUser) {
    await NotificationService.getInstance().createNotification(
      user._id.toString(),
      'Welcome to the app!',
      `Thanks for joining us, ${user.name || user.email}. We're excited to have you on board.`,
      { type: NotificationType.WELCOME }
    );
  }
  async sendMessageNotification(user: IUser,message: IMessage) {
    await NotificationService.getInstance().sendToUser(
      user._id.toString(),
      'New message',
      message.content ?? 'message',
      { type: NotificationType.MESSAGE }
    );
  }
  // Get unread notification count for a user
  async getUnreadCount(userId: string) {
    try {
      const count = await Notification.countDocuments({ 
        userId, 
        isRead: false 
      });
      
      return count;
    } catch (error: any) {
      Logger.error('Failed to get unread notification count', { 
        userId, 
        error: error.message 
      });
      throw error;
    }
  }
}