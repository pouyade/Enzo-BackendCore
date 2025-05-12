import rateLimit from 'express-rate-limit';
import { Config } from '@/config';
import { AuthenticatedRequest } from './auth';

// Helper function to create rate limiter with debug mode check
const createRateLimiter = (options: {
  windowMs: number,
  max: number,
  message: { message: string },
  msgCode?: string
}) => {
  return rateLimit({
    windowMs: options.windowMs,
    max: (req) => {
      // Bypass rate limit if debug mode is enabled and bypassRateLimits is true
      if (Config.getInstance().debug.bypassRateLimits) {
        return 0; // Unlimited requests in debug mode
      }
      return options.max;
    },
    message: { 
      message: options.message.message,
      msg_code: options.msgCode || 'rate_limit_exceeded'
    },
    keyGenerator: (req: AuthenticatedRequest): string => {
        const forwardedFor = req.headers['x-forwarded-for']?.toString();
        return forwardedFor || req.ip || 'unknown';
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => Config.getInstance().debug.bypassRateLimits // Skip rate limiting in debug mode req.user?.isAdmin === true;
  });
};

// Login rate limiter
export const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts
  message: { message: 'Too many login attempts, please try again later' },
  msgCode: 'login_rate_limit_exceeded'
});

// Register rate limiter
export const registerLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts
  message: { message: 'Too many register attempts, please try again later' },
  msgCode: 'register_rate_limit_exceeded'
});

// Verification code rate limiter
export const verificationLimiter = createRateLimiter({
  windowMs: 24 * 60 * 60 * 1000, // 1 day
  max: 10, // 10 attempts
  message: { message: 'Too many verification attempts, please try again later' },
  msgCode: 'verification_rate_limit_exceeded',
  
});

// Password reset rate limiter
export const passwordResetLimiter = createRateLimiter({
  windowMs: 24 * 60 * 60 * 1000, // 1 day
  max: 3, // 3 attempts
  message: { message: 'Too many password reset attempts, please try again later' },
  msgCode: 'password_reset_rate_limit_exceeded'
});

// General API rate limiter
export const apiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 requests per window
  message: { message: 'Too many requests, please try again later' },
  msgCode: 'api_rate_limit_exceeded'
}); 

export const messsageRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per window
  message: { message: 'Too many requests, please try again later' },
  msgCode: 'message_rate_limit_exceeded'
}); 

export const voucherCheckLimiter = createRateLimiter({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 10, // 10 requests per day
  message: { message: 'You have exceeded the maximum number of voucher checks for today'},
  msgCode: 'voucher_check_rate_limit_exceeded'
});