import mongoose from 'mongoose';

// Message Schema
export interface IMessage extends mongoose.Document {
    userId: mongoose.Types.ObjectId;
    content: string;
    photo?: {
      filename: String,
      url: String,
      path: String,
      width: Number,
      height: Number,
    };
    timestamp: Date;
    isRead: boolean;
    isFromAdmin: boolean;
    isViewed: boolean;
    status: 'new' | 'in_progress' | 'resolved';
    adminResponse?: string;
    adminId?: mongoose.Types.ObjectId;
    responseTimestamp?: Date;
}

export interface IMessageModel extends mongoose.Model<IMessage> {
  getDailyImageCount(userId: mongoose.Types.ObjectId): Promise<number>;
}

const MessageSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { 
    type: String, 
    required: function(this: any) {
      return !this.photo; // content is required only if there's no photo
    },
    default: ''
  },
  photo: {
    filename: String,
    url: String,
    path: String,
    width: Number,
    height: Number,
  },
  timestamp: { type: Date, default: Date.now },
  isRead: { type: Boolean, default: false },
  isFromAdmin: { type: Boolean, required: true },
  isViewed: { type: Boolean, default: false },
  status: { 
    type: String, 
    enum: ['new', 'in_progress', 'resolved'],
    default: 'new'
  },
  adminResponse: { type: String },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  responseTimestamp: { type: Date }
});

// Add indexes for common queries
MessageSchema.index({ isViewed: 1, status: 1 });
MessageSchema.index({ userId: 1, timestamp: -1 });

// Add static method to check daily image uploads
MessageSchema.statics.getDailyImageCount = async function(userId: mongoose.Types.ObjectId): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  
  return this.countDocuments({
    userId,
    'photo.filename': { $exists: true },
    timestamp: { $gte: startOfDay.getTime() }
  });
};

export const Message = mongoose.model<IMessage, IMessageModel>('Message', MessageSchema);