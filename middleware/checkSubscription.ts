import { Request, Response, NextFunction, RequestHandler } from 'express';
import { AuthenticatedRequest } from '@/middleware/auth';
import { User } from '@/models';

export const checkSubscription = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Skip subscription check for admins
    if (req.user?.isAdmin) {
      next();
      return;
    }

    const user = await User.findById(req.user!.id);
    
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    // Free tier - allow access
    if (!user.subscription) {
      next();
      return;
    }

    // Check if subscription is active and not expired
    const isSubscribed = user.subscription.isActive && 
                        user.subscription.endDate > Date.now();

    if (!isSubscribed) {
      res.status(403).json({ 
        message: 'Subscription required',
        subscriptionExpired: true
      });
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
}; 