import mongoose from 'mongoose';
import { Voucher } from './Voucher';
import { VoucherHistory } from './VoucherHistory';
import { generateSixDigitCode } from '@/Helper/AuthHelper';

export interface IUser extends mongoose.Document {
    _id: mongoose.Types.ObjectId;
    name?: string;
    email: string;
    password?: string;
    avatar?: {
      filename: String,
      url: String,
      path: String,
      width: Number,
      height: Number,
      isExternal: boolean;
    };
    isVerified: boolean;
    activationCode?: string;
    activationCodeExpires?: number;
    activationCodeAttempts: number;
    resetPasswordToken?: string;
    resetPasswordExpires?: number;
    regId?: string;
    isAdmin: boolean;
    isBlocked: boolean;
    isDeleted: boolean;
    createdAt: number;
    lastOnlineAt: number;
    subscription?: {
      planId: mongoose.Types.ObjectId;
      
      startDate: number;
      endDate: number;
      isActive: boolean;
      cancelledAt?: number;
      lastPayment?: {
        amount: number;
        date: number;
        transactionId: string;
      };
      features?: Record<string, string>;
    };
    telegramId?: string;
    telegramUsername?: string;
    telegramVerified: boolean;
    telegramVerificationCode?: string;
    telegramVerificationCodeExpires?: number;
    telegramVerificationAttempts: number;
    
    // Voucher-related methods
    applyVoucher(voucherCode: string): Promise<any>;
    getActiveVouchers(): Promise<any[]>;
    getVoucherHistory(): Promise<any[]>;

    // Methods
    generateTelegramVerificationCode(): Promise<string>;
    verifyTelegramCode(code: string): Promise<boolean>;
}
  
const UserSchema = new mongoose.Schema({
    name: String,
    email: { type: String,  required: true },
    password: { type: String, required: true },
    avatar: {
      filename: String,
      url: String,
      path: String,
      width: Number,
      height: Number,
    },
    isVerified: { type: Boolean, default: false },
    activationCode: String,
    activationCodeExpires: Number,
    activationCodeAttempts: { type: Number, default: 0 },
    resetPasswordToken: String,
    resetPasswordExpires: Number,
    regId: { type: String, default: null },
    isAdmin: { type: Boolean, default: false },
    isBlocked: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    createdAt: { type: Number, default: () => Date.now() },
    lastOnlineAt: { type: Number },
    subscription: {
      planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' },
      startDate: Number,
      endDate: Number,
      isActive: { type: Boolean, default: false },
      cancelledAt: Number,
      lastPayment: {
        amount: Number,
        date: Number,
        transactionId: String
      },
      features: { type: Map, of: String }
    },
    telegramId: { type: String, default: null },
    telegramUsername: { type: String, default: null },
    telegramVerified: { type: Boolean, default: false },
    telegramVerificationCode: { type: String, default: null },
    telegramVerificationCodeExpires: { type: Number, default: null },
    telegramVerificationAttempts: { type: Number, default: 0 }
}, {
    toJSON: { virtuals: true,
        transform: function(doc, ret) {
            ret.id = ret._id;
            delete ret.password;
            delete ret.activationCode;
            delete ret.activationCodeExpires;
            delete ret.activationCodeAttempts;
            delete ret.resetPasswordToken;
            delete ret.resetPasswordExpires;
            delete ret.regId;
            delete ret.telegramVerificationCode;
            delete ret.telegramVerificationCodeExpires;
            delete ret.telegramVerificationAttempts;
            delete ret._id;
            delete ret.__v;
            return ret;
        }
    },
});
  
// Add middleware to check subscription status
UserSchema.pre('save', function(next) {
    if (this.subscription && this.subscription.endDate) {
      this.subscription.isActive = this.subscription.endDate > Date.now();
    }
    next();
});
  
// Method to apply a voucher to the user
UserSchema.methods.applyVoucher = async function(voucherCode: string) {
    // Find the voucher by code
    const voucher = await Voucher.findOne({ 
      code: voucherCode,
      isActive: true,
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: { $gt: Date.now() } }
      ]
    });
    
    if (!voucher) {
      throw new Error('Voucher not found or expired');
    }
    
    // Check if voucher has reached its maximum use count
    if (voucher.usedCount >= voucher.maxUses) {
      throw new Error('Voucher has reached maximum use count');
    }
    
    // Check if user has already used this voucher
    const hasUsed = voucher.usedBy.some(
      use => use.userId.toString() === this._id.toString()
    );
    
    if (hasUsed) {
      throw new Error('You have already used this voucher');
    }
    
    // Record voucher usage and create history
    const historyRecord = await voucher.recordUsage(this._id.toString());
    
    // Update user's subscription based on voucher
    const now = Date.now();
    const voucherEndDate = now + (voucher.durationDays * 24 * 60 * 60 * 1000);
    
    // If user has no subscription, create a new one
    if (!this.subscription || !this.subscription.isActive) {
      this.subscription = {
        planId: voucher.planId,
        startDate: now,
        endDate: voucherEndDate,
        isActive: true
      };
    } else {
      // If user has an active subscription, extend it
      this.subscription.endDate = Math.max(this.subscription.endDate, voucherEndDate);
      this.subscription.planId = voucher.planId; // Update to the voucher's plan
    }
    
    await this.save();
    
    return {
      voucher,
      historyRecord,
      subscription: this.subscription
    };
};
  
// Method to get user's active vouchers
UserSchema.methods.getActiveVouchers = async function() {
    return VoucherHistory.find({
      userId: this._id,
      status: 'active',
      expiresAt: { $gt: Date.now() }
    })
    .populate('voucherId')
    .populate('planId')
    .sort({ expiresAt: 1 })
    .exec();
};
  
// Method to get user's voucher history
UserSchema.methods.getVoucherHistory = async function() {
    return VoucherHistory.find({ userId: this._id })
      .populate('voucherId')
      .populate('planId')
      .sort({ appliedAt: -1 })
      .exec();
};

// Method to generate telegram verification code
UserSchema.methods.generateTelegramVerificationCode = async function() {
    this.telegramVerificationCode = generateSixDigitCode();
    this.telegramVerificationCodeExpires = Date.now() + (15 * 60 * 1000); // 15 minutes
    this.telegramVerificationAttempts = 0;
    await this.save();
    return this.telegramVerificationCode;
};

// Method to verify telegram code
UserSchema.methods.verifyTelegramCode = async function(code: string) {
    if (!this.telegramVerificationCode || 
        !this.telegramVerificationCodeExpires || 
        Date.now() > this.telegramVerificationCodeExpires) {
        return false;
    }

    if (this.telegramVerificationAttempts >= 5) {
        this.telegramVerificationCode = null;
        this.telegramVerificationCodeExpires = null;
        this.telegramVerificationAttempts = 0;
        await this.save();
        return false;
    }

    this.telegramVerificationAttempts += 1;

    if (this.telegramVerificationCode === code) {
        this.telegramVerified = true;
        this.telegramVerificationCode = null;
        this.telegramVerificationCodeExpires = null;
        this.telegramVerificationAttempts = 0;
        await this.save();
        return true;
    }

    await this.save();
    return false;
};
  
export const User = mongoose.model<IUser>('User', UserSchema);