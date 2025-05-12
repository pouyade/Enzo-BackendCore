import express from 'express';
import { auth } from '@/middleware/auth';
import { Logger } from '@/Helper/Logger';
import { MyRequestHandler } from '@/Helper/MyRequestHandler';
import { apiLimiter } from '@/middleware/rateLimiter';
import { User } from '@/models/User';
import { Notification } from '@/models/Notification';
import { NotificationService } from '@/Helper/NotificationService';

const notificationRouter = express.Router();
notificationRouter.use(auth.user);
notificationRouter.use(apiLimiter);
// Get user notifications
notificationRouter.post('/notifications', MyRequestHandler(async (req, res) => {
  try {
    const {regId} = req.body;
    const notifications = await Notification.find({ userId: req.user!.id})
        .sort({ createdAt: -1 })
        .limit(50); 
    if(regId){
      await User.findByIdAndUpdate(req.user!.id, { regId });
    }
    return res.status(200).json({"unreadCount":notifications.filter((n: any) => !n.isRead).length,"notifications":notifications});
  } catch (err) {
    Logger.error('Error in get notifications endpoint:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}));


// Mark all notifications as read
notificationRouter.post('/notifications/read-all', MyRequestHandler(async (req, res) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'User ID is required' });
    }
    
    const count = await NotificationService.getInstance().markAllNotificationsAsRead(userId);
    return res.status(200).json({ 
      message: 'All notifications marked as read',
      count
    });
  } catch (err) {
    Logger.error('Error in mark all notifications as read endpoint:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}));

export default notificationRouter;