import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IFileUploadLedger extends Document {
  filename: string;
  originalFilename: string;
  fileType: string;
  mimeType: string;
  fileSize: number;
  userId?: mongoose.Types.ObjectId;
  adminId?: mongoose.Types.ObjectId;
  isActive: boolean;
  deletedAt?: Date;
  deletedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IFileUploadLedgerModel extends Model<IFileUploadLedger> {
  findWithPagination(query?: Record<string, any>, options?: { page: number; pageSize: number; sort?: Record<string, 1 | -1> }): Promise<{ items: IFileUploadLedger[]; total: number }>;
  markAsDeleted(filename: string, deletedBy?: string): Promise<void>;
  getStorageStats(): Promise<any[]>;
}

const FileUploadLedgerSchema = new Schema({
  filename: {
    type: String,
    required: true,
    index: true
  },
  originalFilename: {
    type: String,
    required: true
  },
  fileType: {
    type: String,
    required: true,
    enum: ['avatars', 'messages', 'others', 'icons']
  },
  mimeType: {
    type: String,
    required: true
  },
  fileSize: {
    type: Number,
    required: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  adminId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  deletedAt: Date,
  deletedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

// Add compound indexes for faster queries
FileUploadLedgerSchema.index({ fileType: 1, createdAt: -1 });
FileUploadLedgerSchema.index({ userId: 1, fileType: 1 });

// Static methods
FileUploadLedgerSchema.statics.findWithPagination = async function(
  query: Record<string, any> = {},
  options: { page: number; pageSize: number; sort?: Record<string, 1 | -1> } = { page: 1, pageSize: 20 }
) {
  const skip = (options.page - 1) * options.pageSize;

  const [items, total] = await Promise.all([
    this.find(query)
      .sort(options.sort || { createdAt: -1 })
      .skip(skip)
      .limit(options.pageSize)
      .populate('userId', 'name email')
      .populate('adminId', 'name email')
      .populate('deletedBy', 'name email')
      .exec(),
    this.countDocuments(query)
  ]);

  return { items, total };
};

FileUploadLedgerSchema.statics.markAsDeleted = async function(filename: string, deletedBy?: string) {
  return this.updateOne(
    { filename, isActive: true },
    { 
      $set: { 
        isActive: false,
        deletedAt: new Date(),
        deletedBy: deletedBy ? new mongoose.Types.ObjectId(deletedBy) : undefined
      } 
    }
  );
};

FileUploadLedgerSchema.statics.getStorageStats = async function() {
  return this.aggregate([
    {
      $group: {
        _id: '$fileType',
        totalSize: { $sum: '$fileSize' },
        count: { $sum: 1 },
        activeSize: {
          $sum: {
            $cond: [{ $eq: ['$isActive', true] }, '$fileSize', 0]
          }
        },
        activeCount: {
          $sum: {
            $cond: [{ $eq: ['$isActive', true] }, 1, 0]
          }
        }
      }
    }
  ]);
};

const FileUploadLedgerModel = mongoose.model<IFileUploadLedger, IFileUploadLedgerModel>('FileUploadLedger', FileUploadLedgerSchema);
export { FileUploadLedgerModel as FileUploadLedger };