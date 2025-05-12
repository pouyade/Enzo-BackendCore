import mongoose from 'mongoose';
import { IPlan } from './Plan';
import { IPayment } from './Payment';

export interface IPlanHistory extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  planId: mongoose.Types.ObjectId | IPlan;
  startDate: Date;
  endDate: Date;
  status: 'active' | 'expired' | 'cancelled';
  paymentId: mongoose.Types.ObjectId | IPayment;
  createdAt: Date;
  updatedAt: Date;
}

const PlanHistorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  status: { type: String, enum: ['active', 'expired', 'cancelled'], required: true },
  paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', required: true },
}, { timestamps: true });

PlanHistorySchema.index({ userId: 1, startDate: -1 });
PlanHistorySchema.index({ paymentId: 1 }, { unique: true });

export const PlanHistory = mongoose.model<IPlanHistory>('PlanHistory', PlanHistorySchema);
