import mongoose from 'mongoose';
import { IPlan } from './Plan';

export interface IPayment extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  planId: mongoose.Types.ObjectId | IPlan;
  amount: number;
  status: 'pending' | 'success' | 'failed';
  transactionId: string;
  paymentMethod: string;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'success', 'failed'], required: true },
  transactionId: { type: String, required: true },
  paymentMethod: { type: String, required: true },
  errorMessage: { type: String },
}, { timestamps: true });

export const Payment = mongoose.model<IPayment>('Payment', PaymentSchema);
