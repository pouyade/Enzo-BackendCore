import mongoose from 'mongoose';

export interface IAppText {
  key: string;
  title: string;
  title_fa: string;
  content: string;
  content_fa: string;
  section: string;
  description?: string;
  isActive: boolean;
  shouldAccept: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const textSchema = new mongoose.Schema<IAppText>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
    },
    title_fa: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    content_fa: {
      type: String,
      required: true,
    },
    section: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    shouldAccept: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

export const AppText = mongoose.model<IAppText>('AppText', textSchema); 