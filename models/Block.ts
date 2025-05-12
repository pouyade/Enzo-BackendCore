import mongoose from "mongoose";

export interface IBlock extends mongoose.Document {
    type: 'ip' | 'ip_range' | 'email';
    value: string;
    reason: string;
    isActive: boolean;
    expiresAt?: Date;
    createdAt: Date;
    updatedAt: Date;
    createdBy: mongoose.Types.ObjectId | string;
}

const BlockSchema = new mongoose.Schema({
    type: { type: String, enum: ['ip', 'ip_range', 'email'], required: true },
    value: { type: String, required: true },
    reason: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    expiresAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Add indexes for better query performance
BlockSchema.index({ value: 1, type: 1 }, { unique: true });
BlockSchema.index({ expiresAt: 1 }, { sparse: true });

export const Block = mongoose.model<IBlock>('Block', BlockSchema);
  