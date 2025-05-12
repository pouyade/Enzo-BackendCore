import { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { Config } from '@/config';
import { User, Session } from '@/models';
import { ISession } from '@/models';
import { Block } from '@/models';
import { getClientIP } from '@/Helper/AuthHelper';
import mongoose from 'mongoose';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    isAdmin: boolean;
  };
  session?: ISession;
  admin?: any;
}

interface JwtPayload {
  userId: string;
  isAdmin: boolean;
  exp: number;
}

interface SessionValidationResult {
  isValid: boolean;
  error?: string;
  session?: ISession;
}

const checkBlocked = async (req: Request): Promise<boolean> => {
  try {
    const clientIP = getClientIP(req);
    const email = req.body.email || req.query.email || req.params.email || req.headers.email || null;
    const now = Date.now();
    
    // Use lean() for better performance since we only need the data
    const blocks = await Block.find({
      isActive: true,
      $or: [
        { expiresAt: { $gt: now } },
        { expiresAt: null }
      ],
      $and: [
        {
          $or: [
            { type: 'ip', value: clientIP },
            { type: 'email', value: email },
            {
              type: 'ip_range',
              value: { 
                $regex: new RegExp('^' + clientIP.split('.').slice(0, 3).join('\\.'))
              }
            }
          ]
        }
      ]
    }).lean();

    if (blocks.length > 0) {
      const block = blocks[0];
      console.log(`Access blocked: ${block.type} ${block.value}`);
      return true;
    }
  } catch (error) {
    console.error('Error in checkBlocked middleware:', error);
  }
  return false;
};

const validateSession = async (token: string): Promise<SessionValidationResult> => {
  try {
    // Don't use lean() here since we need the Mongoose document methods
    const session = await Session.findOne({ token });
    
    if (!session) {
      return { isValid: false, error: 'Session not found' };
    }
    
    if (session.isTerminated) {
      return { isValid: false, error: 'Session terminated' };
    }
    
    if (session.expiresAt < Date.now()) {
      return { isValid: false, error: 'Session expired' };
    }
    
    return { isValid: true, session };
  } catch (error) {
    console.error('Error validating session:', error);
    return { isValid: false, error: 'Session validation failed' };
  }
};

const verifyToken = (token: string): JwtPayload | null => {
  try {
    return jwt.verify(token, Config.getInstance().jwtSecret) as JwtPayload;
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
};

const updateUserLastOnline = async (userId: string): Promise<void> => {
  try {
    await User.findByIdAndUpdate(userId, { lastOnlineAt: Date.now() });
  } catch (error) {
    console.error('Error updating user last online:', error);
  }
};

const handleAuthError = (res: Response, message: string, status: number = 403): void => {
  res.status(status).json({ message });
};

export const auth = {
  optional: (async (req: Request, res: Response, next: NextFunction) => {
    try {
      const blocked = await checkBlocked(req);
      if (blocked) {
        return handleAuthError(res, 'Access denied', 403);
      }
      return next();
    } catch (error) {
      console.error('Error in optional middleware:', error);
      return handleAuthError(res, 'Access Error', 403);
    }
  }) as RequestHandler,

  user: (async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const blocked = await checkBlocked(req);
      if (blocked) {
        return handleAuthError(res, 'Access denied', 403);
      }

      const token = req.headers.authorization?.split(' ')[1];
      if (!token) {
        return handleAuthError(res, 'Authentication required');
      }

      const decoded = verifyToken(token);
      if (!decoded) {
        return handleAuthError(res, 'Invalid token', 403);
      }

      if (decoded.exp < Math.floor(Date.now() / 1000)) {
        return handleAuthError(res, 'Token expired');
      }

      // Validate session
      const sessionValidation = await validateSession(token);
      if (!sessionValidation.isValid) {
        return handleAuthError(res, sessionValidation.error || 'Session validation failed');
      }
      req.session = sessionValidation.session;

      // Fetch user with lean() for better performance
      const user = await User.findById(decoded.userId).lean();
      if (!user) {
        return handleAuthError(res, 'Account not found', 403);
      }
      if (!user.isVerified) {
        return handleAuthError(res, 'Account not verified', 403);
      }
      if (user.isDeleted || user.isBlocked) {
        return handleAuthError(res, 'Account Error!', 403);
      }

      req.user = { id: decoded.userId, isAdmin: decoded.isAdmin };
      
      // Update last online time asynchronously
      updateUserLastOnline(decoded.userId).catch(console.error);
      
      return next();
    } catch (error) {
      console.error('Auth error:', error);
      return handleAuthError(res, 'Authentication failed', 403);
    }
  }) as RequestHandler,

  admin: (async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const blocked = await checkBlocked(req);
      if (blocked) {
        return handleAuthError(res, 'Access denied', 403);
      }

      const token = req.headers.authorization?.split(' ')[1];
      if (!token) {
        return handleAuthError(res, 'No token provided');
      }

      const decoded = verifyToken(token);
      if (!decoded) {
        return handleAuthError(res, 'Invalid token', 403);
      }

      if (!decoded.isAdmin) {
        return handleAuthError(res, 'Not authorized as admin', 403);
      }

      if (decoded.exp < Math.floor(Date.now() / 1000)) {
        return handleAuthError(res, 'Token expired');
      }

      // Validate session
      const sessionValidation = await validateSession(token);
      if (!sessionValidation.isValid) {
        return handleAuthError(res, sessionValidation.error || 'Session validation failed');
      }
      req.session = sessionValidation.session;

      // Fetch admin with lean() for better performance
      const admin = await User.findById(decoded.userId).lean();
      if (!admin || !admin.isAdmin) {
        return handleAuthError(res, 'Admin account not found', 403);
      }

      req.admin = admin;
      req.user = {
        id: admin._id.toString(),
        isAdmin: true
      };

      // Update last online time asynchronously
      updateUserLastOnline(decoded.userId).catch(console.error);
      
      return next();
    } catch (error) {
      console.error('Admin auth error:', error);
      return handleAuthError(res, 'Internal server error', 500);
    }
  }) as RequestHandler,
}; 