export interface DiskInfo {
  filesystem: string;
  blocks: number;
  used: number;
  available: number;
  capacity: string;
  mountpoint: string;
}

export interface User {
  id: string;
  email: string;
  username: string;
  isAdmin: boolean;
  isVerified: boolean;
  isBlocked: boolean;
  isDeleted: boolean;
}

export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  createdAt: Date;
  read: boolean;
}

export interface Session {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
}

export interface Plan {
  id: string;
  name: string;
  price: number;
  duration: number;
  features: string[];
}

export interface Payment {
  id: string;
  userId: string;
  planId: string;
  amount: number;
  status: string;
  createdAt: Date;
}

export interface Setting {
  id: string;
  key: string;
  value: any;
  updatedAt: Date;
}

export interface RequestLog {
  id: string;
  method: string;
  path: string;
  status: number;
  duration: number;
  timestamp: Date;
}