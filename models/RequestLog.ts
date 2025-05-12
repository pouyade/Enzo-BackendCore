import mongoose from "mongoose";

export interface IRequestLog extends mongoose.Document {
    timestamp: number;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    endpoint: string;
    userId?: mongoose.Types.ObjectId;
    requestData?: {
      body?: Record<string, any>;
      query?: Record<string, any>;
      params?: Record<string, any>;
    };
    responseData?: {
      statusCode: number;
      body?: Record<string, any>;
    };
    error?: {
      name: string;
      message: string;
      stack?: string;
      code?: string;
    };
    duration: number; // Request duration in milliseconds
    ip: string;
    userAgent?: string;
    tags?: string[]; // For better filtering and categorization
  }
  
  const RequestLogSchema = new mongoose.Schema({
    timestamp: { type: Number, default: () => Date.now(), index: true },
    method: { 
      type: String, 
      required: true,
      enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      index: true
    },
    endpoint: { type: String, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    requestData: {
      body: mongoose.Schema.Types.Mixed,
      query: mongoose.Schema.Types.Mixed,
      params: mongoose.Schema.Types.Mixed
    },
    responseData: {
      statusCode: { type: Number, required: true, index: true },
      body: mongoose.Schema.Types.Mixed
    },
    error: {
      name: String,
      message: String,
      stack: String,
      code: String
    },
    duration: { type: Number, required: true, index: true },
    ip: { type: String, required: true },
    userAgent: String,
    tags: [{ type: String, index: true }]
  });
  
  // Add compound indexes for common queries
  RequestLogSchema.index({ timestamp: -1, statusCode: 1 });
  RequestLogSchema.index({ timestamp: -1, method: 1, endpoint: 1 });
  
export const RequestLog = mongoose.model<IRequestLog>('RequestLog', RequestLogSchema);
  