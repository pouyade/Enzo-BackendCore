import jwt from 'jsonwebtoken';
import { Config } from '@/config';
import { Request} from 'express';
import { Logger } from '@/Helper/Logger';


export function getClientIP(req: Request): string {
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (xForwardedFor) {
    return Array.isArray(xForwardedFor) ? xForwardedFor[0] : xForwardedFor.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
} 
export   const generateSixDigitCode = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const generateToken = (userId: string, isAdmin: boolean): string => {
  // Ensure isAdmin is a boolean
  const adminFlag = Boolean(isAdmin);
  
  // Use a longer expiration time for admin tokens (7 days)
  const expirationTime = adminFlag 
    ? Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7 days for admins
    : Math.floor(Date.now() / 1000) + (14 * 24 * 60 * 60);    // 14 days for regular users
  
  const payload = {
    userId,
    isAdmin: adminFlag,
    iat: Math.floor(Date.now() / 1000),
    exp: expirationTime
  };
  
  Logger.info('Generating token with payload', { payload }); // Debug log
  const token = jwt.sign(payload, Config.getInstance().jwtSecret as string);
  Logger.info('Token generated successfully', { tokenLength: token.length });
  
  return token;
};
