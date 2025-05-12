import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  body: string;
  isRead: boolean;
  data?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true
  },
  body: {
    type: String,
    required: true
  },
  isRead: {
    type: Boolean,
    default: false
  },
  data: {
    type: Map,
    of: Schema.Types.Mixed,
    default: () => ({})
  }
}, { timestamps: true });

// Add compound index for faster queries
NotificationSchema.index({ userId: 1, createdAt: -1 });

// Static methods for Notification model
NotificationSchema.statics = {
  /**
   * Get a single notification by ID
   * @param id - Notification ID
   */
  async get(id: string) {
    return this.findById(id).exec();
  },

  /**
   * Get all notifications for a user
   * @param userId - User ID
   * @param limit - Maximum number of notifications to return (default 50)
   * @param skip - Number of notifications to skip (default 0)
   */
  async getAll(userId: string, limit: number = 50, skip: number = 0) {
    return this.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();
  },

  /**
   * Get unread notifications for a user
   * @param userId - User ID
   * @param limit - Maximum number of notifications to return (default 50)
   */
  async getUnread(userId: string, limit: number = 50) {
    return this.find({ userId, isRead: false })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  },

  /**
   * Mark a notification as read
   * @param id - Notification ID
   * @param userId - User ID (for security validation)
   */
  async markAsRead(id: string, userId: string) {
    return this.updateOne(
      { _id: id, userId },
      { $set: { isRead: true } }
    );
  },

  /**
   * Mark all notifications as read for a user
   * @param userId - User ID
   */
  async markAllAsRead(userId: string) {
    return this.updateMany(
      { userId, isRead: false },
      { $set: { isRead: true } }
    );
  },

  /**
   * Count all notifications for a user
   * @param userId - User ID
   */
  async countAll(userId: string) {
    return this.countDocuments({ userId });
  },

  /**
   * Count unread notifications for a user
   * @param userId - User ID
   */
  async countUnread(userId: string) {
    return this.countDocuments({ userId, isRead: false });
  },

  /**
   * Count notifications created today for a user
   * @param userId - User ID
   */
  async countToday(userId: string) {
    // Get start of today (midnight)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return this.countDocuments({
      userId,
      createdAt: { $gte: today }
    });
  },

  /**
   * Delete all notifications for a user
   * @param userId - User ID
   */
  async deleteAll(userId: string) {
    return this.deleteMany({ userId });
  },

  /**
   * Create a new notification
   * @param notification - Notification data
   */
  async createNotification(notification: {
    userId: string,
    title: string,
    body: string,
    data?: Record<string, any>,
    isRead?: boolean
  }) {
    const newNotification = new this({
      userId: new mongoose.Types.ObjectId(notification.userId),
      title: notification.title,
      body: notification.body,
      data: notification.data || {},
      isRead: notification.isRead || false
    });
    
    return newNotification.save();
  },

  /**
   * Parse a notification from JSON
   * Similar to fromJSON in Message.java
   * @param json - JSON object containing notification data
   */
  fromJSON(json: any): Partial<INotification> {
    return {
      userId: json.userId ? new mongoose.Types.ObjectId(json.userId) : undefined,
      title: json.title,
      body: json.body,
      isRead: json.isRead || false,
      data: json.data || {}
    };
  }
};

// Create and export the model
export const Notification = mongoose.model<INotification, mongoose.Model<INotification>>(
  'Notification', 
  NotificationSchema
);