import mongoose from 'mongoose';

interface IFeature {
  feature_key: string;
  feature_value: string;
}

export interface IPlan extends mongoose.Document {
  name: string;
  description: string;
  price: number;
  durationDays: number;
  features: IFeature[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PlanSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: { type: String, required: false },
  price: { type: Number, required: true },
  durationDays: { type: Number, required: true },
  features: [{
    feature_key: { type: String, required: true },
    feature_value: { type: String, required: true }
  }],
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

export const Plan = mongoose.model<IPlan>('Plan', PlanSchema);