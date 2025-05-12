import mongoose from 'mongoose';
import { VoucherHistory } from './VoucherHistory';

export interface IVoucher extends mongoose.Document {
  code: string;
  planId: mongoose.Types.ObjectId;
  durationDays: number;
  maxUses: number;
  usedCount: number;
  isActive: boolean;
  expiresAt?: number;
  createdAt: number;
  createdBy: mongoose.Types.ObjectId;
  description?: string;
  usedBy: {
    userId: mongoose.Types.ObjectId;
    usedAt: number;
  }[];
  
  // Methods for voucher history
  recordUsage(userId: string): Promise<any>;
  getHistory(): Promise<any[]>;
}

const VoucherSchema = new mongoose.Schema({
  code: { 
    type: String, 
    required: true, 
    unique: true,
    validate: {
      validator: function(v: string) {
        return /^[a-zA-Z0-9]{3,20}$/.test(v);
      },
      message: 'Voucher code must be between 3 to 20 characters and contain only letters and numbers'
    }
  },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },
  durationDays: { type: Number, required: true },
  maxUses: { type: Number, required: true },
  usedCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  expiresAt: { type: Number },
  createdAt: { type: Number, default: () => Date.now() },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  description: { type: String },
  usedBy: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    usedAt: { type: Number }
  }]
});

// Add index for faster lookups
VoucherSchema.index({ code: 1 });
VoucherSchema.index({ isActive: 1 });
VoucherSchema.index({ expiresAt: 1 });

// Method to record voucher usage in history
VoucherSchema.methods.recordUsage = async function(userId: string) {
  // Calculate expiration date
  const appliedAt = Date.now();
  const expiresAt = appliedAt + (this.durationDays * 24 * 60 * 60 * 1000);
  
  // Create history record
  const historyRecord = new VoucherHistory({
    voucherId: this._id,
    userId: new mongoose.Types.ObjectId(userId),
    planId: this.planId,
    voucherCode: this.code,
    durationDays: this.durationDays,
    appliedAt,
    expiresAt,
    status: 'active'
  });
  
  await historyRecord.save();
  
  // Update the main voucher document
  this.usedCount += 1;
  this.usedBy.push({
    userId: new mongoose.Types.ObjectId(userId),
    usedAt: appliedAt
  });
  
  await this.save();
  
  return historyRecord;
};

// Method to get voucher usage history
VoucherSchema.methods.getHistory = async function() {
  return VoucherHistory.find({ voucherId: this._id })
    .sort({ appliedAt: -1 })
    .populate('userId', 'name email')
    .exec();
};

// Static method to find active vouchers for a user
VoucherSchema.statics.findActiveVouchersForUser = async function(userId: string) {
  return VoucherHistory.find({
    userId: new mongoose.Types.ObjectId(userId),
    status: 'active',
    expiresAt: { $gt: Date.now() }
  })
  .populate('voucherId')
  .populate('planId')
  .sort({ expiresAt: 1 })
  .exec();
};

export const Voucher = mongoose.model<IVoucher>('Voucher', VoucherSchema); 