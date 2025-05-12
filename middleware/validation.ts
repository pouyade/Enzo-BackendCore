import { Request, Response, NextFunction } from 'express';
import { Logger } from '@/Helper/Logger';

// Password validation regex
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])[A-Za-z\d!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]{8,}$/;

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Validation middleware functions
export const validateEmail = (email: string): boolean => {
  if (!email || !EMAIL_REGEX.test(email)) {
    return false;
  }
  return true;
};

export const validatePassword = (password: string): boolean => {
  if (!password || !PASSWORD_REGEX.test(password)) {
    return false;
  }
  return true;
};

export const validateRegId = (regId: string): boolean => {
  if (regId && (typeof regId !== 'string' || regId.trim().length === 0)) {
    return false;
  }
  return true;
};

export const validateSessionId = (req: Request, res: Response, next: NextFunction): void => {
  const { id } = req.body;
  if (!id || typeof id !== 'string' || !id.match(/^[0-9a-fA-F]{24}$/)) {
    Logger.warn('Invalid session ID format');
    res.status(400).json({ message: 'Invalid session ID' });
    return;
  }
  next();
};

export const validateActivationCode = (code:string): boolean => {
  if (!code || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
    return false;
  }
  return true;
};

// Request size limiter middleware
export const requestSizeLimiter = (req: Request, res: Response, next: NextFunction): void => {
  const maxSize = 1024 * 1024; // 1MB
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > maxSize) {
    Logger.warn('Request size exceeded limit', { size: contentLength });
    res.status(413).json({ message: 'Request entity too large' });
    return;
  }

  next();
}; 