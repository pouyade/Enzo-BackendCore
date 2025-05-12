import mongoose from 'mongoose';

export interface IVoucherHistory extends mongoose.Document {
  voucherId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  planId: mongoose.Types.ObjectId;
  voucherCode: string;
  durationDays: number;
  appliedAt: number;
  expiresAt: number;
  status: 'active' | 'expired' | 'cancelled';
  metadata?: Record<string, any>;
}

const VoucherHistorySchema = new mongoose.Schema({
  voucherId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Voucher', 
    required: true,
    index: true 
  },
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true 
  },
  planId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Plan', 
    required: true 
  },
  voucherCode: { 
    type: String, 
    required: true,
    index: true 
  },
  durationDays: { 
    type: Number, 
    required: true 
  },
  appliedAt: { 
    type: Number, 
    default: () => Date.now(),
    index: true 
  },
  expiresAt: { 
    type: Number, 
    required: true,
    index: true 
  },
  status: { 
    type: String, 
    enum: ['active', 'expired', 'cancelled'],
    default: 'active',
    index: true 
  },
  metadata: { 
    type: Map, 
    of: mongoose.Schema.Types.Mixed 
  }
});

// Create indexes for common queries
VoucherHistorySchema.index({ userId: 1, status: 1 });
VoucherHistorySchema.index({ voucherId: 1, appliedAt: -1 });
VoucherHistorySchema.index({ expiresAt: 1, status: 1 });

export const VoucherHistory = mongoose.model<IVoucherHistory>('VoucherHistory', VoucherHistorySchema); 