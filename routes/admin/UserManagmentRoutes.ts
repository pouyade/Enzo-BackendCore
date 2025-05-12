
import { Router } from 'express';
import mongoose from 'mongoose';
import { MyRequestHandler } from '@/Helper/MyRequestHandler';
import { Logger } from '@/Helper/Logger';
import { User, Payment, Session, Plan, Message } from '@/models';
import { avatarUpload } from '@/middleware/upload';
import { fileStorage } from '@/Helper/FileStorage';
const userManagmentRouter = Router()

// Get user sessions
userManagmentRouter.get('/users/:id/sessions', MyRequestHandler(async (req,res)=>{
  try {
    const userId = req.params.id;
    const user = await User.findById(userId);

    if (!user) {
      Logger.warn('User not found for session fetch', { userId, adminId: req.user!.id });
      return res.status(404).json({ message: 'User not found' });
    }

    const sessions = await Session
      .find({ userId: user._id, isTerminated: false })
      .select(['-token', '-__v'])
      .sort({ lastActive: -1 });

    Logger.info('Admin fetched user sessions', { userId, adminId: req.user!.id, sessionCount: sessions.length });
    return res.status(200).json(sessions);
  } catch (error: any) {
    Logger.error('Failed to fetch user sessions', { adminId: req.user!.id, error: error.message });
    return res.status(500).json({ message: 'Failed to fetch user sessions' });
  }
}));

// Add Avatar management endpoints
userManagmentRouter.post('/users/:userId/avatar', 
  avatarUpload.single('avatar'), 
  MyRequestHandler(async (req, res) => {
    try {
      const { userId } = req.params;

      if (!req.file) {
        Logger.warn('No file uploaded for avatar', { userId });
        return res.status(400).json({ message: 'No file uploaded' });
      }

      const user = await User.findById(userId);
      if (!user) {
        Logger.warn('User not found for avatar upload', { userId });
        return res.status(404).json({ message: 'User not found' });
      }
      
      // Delete old avatar if exists
      if (user.avatar) {
        try {
          await fileStorage.deleteFile(user.avatar.path as string);
        } catch (deleteError) {
          Logger.error('Error deleting old avatar', { 
            userId, 
            key: user.avatar, 
            error: deleteError 
          });
          // Continue even if deletion fails
        }
      }
      
      // Upload and process the new avatar
      const filename = await fileStorage.uploadAvatar(req.file.buffer);
      user.avatar = filename;
      await user.save();
      
      Logger.info('Avatar uploaded successfully by admin', { adminId: req.user!.id, userId });
      return res.status(200).json({ 
        message: 'Avatar uploaded successfully',
        avatar: user.avatar
      });
    } catch (error: any) {
      Logger.error('Avatar upload failed', { 
        userId: req.params.userId, 
        adminId: req.user!.id,
        error: error.message,
        stack: error.stack
      });
      return res.status(500).json({ message: 'Avatar upload failed: ' + error.message });
    }
  })
);

// Admin API for deleting user avatars
userManagmentRouter.delete('/users/:userId/avatar', 
  MyRequestHandler(async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await User.findById(userId);
      if (!user) {
        Logger.warn('User not found for avatar deletion by admin', { userId, adminId: req.user!.id });
        return res.status(404).json({ message: 'User not found' });
      }
      
      // Check if user has an avatar
      if (!user.avatar) {
        Logger.warn('No avatar to delete', { userId, adminId: req.user!.id });
        return res.status(400).json({ message: 'No avatar to delete' });
      }
      
      // Delete avatar file
      try {
        await fileStorage.deleteFile(user.avatar.path as string);
      } catch (deleteError) {
        Logger.error('Error deleting avatar file', { 
          userId, 
          adminId: req.user!.id,
          key: user.avatar, 
          error: deleteError 
        });
        // Continue even if file deletion fails
      }
      
      // Remove avatar from user object
      user.avatar = undefined;
      await user.save();
      
      Logger.info('Avatar deleted successfully by admin', { userId, adminId: req.user!.id });
      return res.status(200).json({ message: 'Avatar deleted successfully' });
    } catch (error: any) {
      Logger.error('Avatar deletion failed', { 
        userId: req.params.userId,
        adminId: req.user!.id,
        error: error.message 
      });
      return res.status(500).json({ message: 'Avatar deletion failed' });
    }
  })
);

// Endpoint to remove a user's plan
userManagmentRouter.delete('/users/:userId/plan', 
  MyRequestHandler(async (req, res) => {
    try {
      const { userId } = req.params;
      
      const user = await User.findById(userId);
      if (!user) {
        Logger.warn('User not found for plan removal', { userId });
        return res.status(404).json({ message: 'User not found' });
      }
      
      // Check if user has an active subscription
      if (!user.subscription || !user.subscription.isActive) {
        Logger.warn('User has no active subscription to remove', { userId });
        return res.status(400).json({ message: 'User has no active subscription' });
      }
      
      // Store plan info for logging
      const previousPlan = user.subscription?.planId;
      
      // Remove the subscription
      user.subscription = undefined;
      await user.save();
      
      Logger.info('User plan removed by admin', { 
        userId, 
        adminId: req.user!.id, 
        previousPlan 
      });
      
      return res.status(200).json({ message: 'User plan removed successfully' });
    } catch (error: any) {
      Logger.error('Failed to remove user plan', { 
        userId: req.params.userId, 
        adminId: req.user!.id,
        error: error.message 
      });
      return res.status(500).json({ message: 'Failed to remove user plan' });
    }
  })
);


// Soft delete user (mark as deleted)
userManagmentRouter.put('/users/:id/soft-delete', MyRequestHandler(async (req,res)=>{
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      Logger.warn('User not found for soft delete', { userId: req.params.id, adminId: req.user!.id });
      return res.status(404).json({ message: 'User not found' });
    }

    // Don't allow deleting admin users
    if (user.isAdmin) {
      Logger.warn('Attempt to delete admin user', { userId: req.params.id, adminId: req.user!.id });
      return res.status(403).json({ message: 'Cannot delete admin users' });
    }

    user.isDeleted = true;
    // When marking as deleted, also unblock the user
    user.isBlocked = false;
    await user.save();

    // Terminate all active sessions for this user
    await Session.updateMany(
      { userId: user._id, isTerminated: false },
      { isTerminated: true }
    );

    Logger.info('User soft deleted by admin', { userId: user._id, adminId: req.user!.id });
    return res.status(200).json({ message: 'User marked as deleted successfully' });
  } catch (error: any) {
    Logger.error('Failed to soft delete user', { adminId: req.user!.id, error: error.message });
    return res.status(500).json({ message: 'Failed to mark user as deleted' });
  }
}));

// Hard delete user (complete removal)
userManagmentRouter.delete('/users/:id/hard-delete', MyRequestHandler(async (req,res)=>{
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      Logger.warn('User not found for hard delete', { userId: req.params.id, adminId: req.user!.id });
      return res.status(404).json({ message: 'User not found' });
      
    }

    // Don't allow deleting admin users
    if (user.isAdmin) {
      Logger.warn('Attempt to hard delete admin user', { userId: req.params.id, adminId: req.user!.id });
      return res.status(403).json({ message: 'Cannot delete admin users' });
    }

    // Delete all associated data
    await Promise.all([
      // Delete user's messages
      Message.deleteMany({ $or: [{ senderId: req.params.id }, { recipientId: req.params.id }] }),
      // Delete user's sessions
      Session.deleteMany({ userId: req.params.id }),
      // Delete user's taken appointments
      Payment.deleteMany({ userId: req.params.id }),
      // Delete the user
      User.deleteOne({ _id: req.params.id })
    ]);

    Logger.info('User hard deleted by admin', { 
      userId: req.params.id, 
      adminId: req.user!.id,
      userEmail: user.email 
    });
    
    return res.status(200).json({ 
      message: 'User and all associated data deleted successfully',
      deletedData: {
        userId: req.params.id,
        email: user.email,
        name: user.name
      }
    });
  } catch (error: any) {
    Logger.error('Failed to hard delete user', { 
      adminId: req.user!.id, 
      userId: req.params.id,
      error: error.message 
    });
    return res.status(500).json({ message: 'Failed to delete user and associated data' });
  }
}));

userManagmentRouter.put('/users/:id/block', MyRequestHandler(async (req,res)=>{
  try {
    const { isBlocked } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) {
      Logger.warn('User not found for block/unblock', { userId: req.params.id, adminId: req.user!.id });
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.isAdmin) {
      Logger.warn('Attempt to block admin user', { userId: req.params.id, adminId: req.user!.id });
      return res.status(403).json({ message: 'Cannot block admin users' });
      
    }

    user.isBlocked = isBlocked;
    await user.save();

    // If blocking user, terminate all their active sessions
    if (isBlocked) {
      await Session.updateMany(
        { userId: user._id, isTerminated: false },
        { isTerminated: true }
      );
    }

    Logger.info(`User ${isBlocked ? 'blocked' : 'unblocked'}`, { userId: user._id, adminId: req.user!.id });
    return res.status(200).json({ message: `User ${isBlocked ? 'blocked' : 'unblocked'} successfully` });
  } catch (error: any) {
    Logger.error('Failed to block/unblock user', { adminId: req.user!.id, error: error.message });
    return res.status(500).json({ message: 'Failed to block/unblock user' });
  }
}));

// Undelete user endpoint
userManagmentRouter.put('/users/:id/undelete', MyRequestHandler(async (req,res)=>{
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      Logger.warn('User not found for undelete', { userId: req.params.id, adminId: req.user!.id });
      return res.status(404).json({ message: 'User not found' });
      
    }

    if (user.isAdmin) {
      Logger.warn('Attempt to undelete admin user', { userId: req.params.id, adminId: req.user!.id });
      return res.status(403).json({ message: 'Cannot modify admin users' });
      
    }

    user.isDeleted = false;
    await user.save();

    Logger.info('User undeleted', { userId: user._id, adminId: req.user!.id });
    return res.status(200).json({ message: 'User undeleted successfully' });
  } catch (error: any) {
    Logger.error('Failed to undelete user', { adminId: req.user!.id, error: error.message });
    return res.status(500).json({ message: 'Failed to undelete user' });
  }
}));

// Add plan activation endpoint
userManagmentRouter.post('/users/:userId/activate-plan', MyRequestHandler(async (req,res)=>{
  try {
    const { userId } = req.params;
    const { planId } = req.body;

    // Validate required fields
    if (!planId) {
      Logger.warn('Missing planId in request', { adminId: req.user!.id, userId });
      return res.status(400).json({ message: 'Plan ID is required' });
      
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      Logger.warn('User not found for plan activation', { adminId: req.user!.id, userId });
      return res.status(404).json({ message: 'User not found' });
      
    }

    // Find plan
    const plan = await Plan.findById(planId);
    if (!plan) {
      Logger.warn('Plan not found for activation', { adminId: req.user!.id, planId });
      return res.status(404).json({ message: 'Plan not found' });
      
    }

    // Calculate subscription dates
    const now = Date.now();
    const startDate = now;
    const endDate = plan.durationDays > 0 ? now + (plan.durationDays * 24 * 60 * 60 * 1000) : 0;

    // Update user's subscription
    user.subscription = {
      planId: plan._id as mongoose.Types.ObjectId,
      startDate,
      endDate,
      isActive: true,
      features: plan.features.reduce((acc: Record<string, string>, feature) => {
        acc[feature.feature_key] = feature.feature_value;
        return acc;
      }, {})
    };

    await user.save();

    // Create a payment record if the plan is not free
    if (plan.price > 0) {
      await Payment.create({
        userId: user._id,
        planId: plan._id,
        amount: plan.price,
        status: 'success',
        createdAt: now,
        method: 'admin_activation'
      });
    }

    Logger.info('Plan activated for user', {
      adminId: req.user!.id,
      userId: user._id,
      planId: plan._id,
      planName: plan.name
    });

    return res.status(200).json({
      message: 'Plan activated successfully',
      subscription: user.subscription
    });
  } catch (error: any) {
    Logger.error('Failed to activate plan', {
      adminId: req.user!.id,
      userId: req.params.userId,
      error: error.message
    });
    return res.status(500).json({ message: 'Failed to activate plan' });
  }
}));

userManagmentRouter.get('/users', MyRequestHandler(async (req,res)=>{
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const skip = (page - 1) * limit;
  
  // Build filter object
  const filter: any = {};
  
  // Apply search filter if provided
  if (req.query.search) {
    const searchRegex = new RegExp(req.query.search as string, 'i');
    filter.$or = [
      { name: searchRegex },
      { email: searchRegex }
    ];
  }
  
  // Filter by status
  if (req.query.status === 'active') {
    filter.isBlocked = false;
    filter.isDeleted = false;
  } else if (req.query.status === 'blocked') {
    filter.isBlocked = true;
  } else if (req.query.status === 'deleted') {
    filter.isDeleted = true;
  }
  
  // Filter by role
  if (req.query.role === 'admin') {
    filter.isAdmin = true;
  } else if (req.query.role === 'user') {
    filter.isAdmin = false;
  }
  
  // Filter by subscription status
  if (req.query.subscription === 'active') {
    filter['subscription.isActive'] = true;
  } else if (req.query.subscription === 'inactive') {
    filter['subscription.isActive'] = false;
  }
  
  // Build sort object
  let sort: any = { createdAt: -1 }; // Default sort
  if (req.query.sortBy) {
    const sortField = req.query.sortBy as string;
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    
    // Map frontend sort fields to database fields
    const sortFieldMap: {[key: string]: string} = {
      name: 'name',
      email: 'email',
      role: 'isAdmin',
      status: 'isBlocked', // We'll handle this special case
      createdAt: 'createdAt',
      lastOnlineAt: 'lastOnlineAt'
    };
    
    if (sortFieldMap[sortField]) {
      sort = { [sortFieldMap[sortField]]: sortOrder };
    }
  }
  
  try {
    // Count total documents for pagination
    const total = await User.countDocuments(filter);
    
    // Get paginated and sorted users
    const users = await User.find(filter)
      .populate('subscription.planId')
      .sort(sort)
      .skip(skip)
      .limit(limit);
    
    Logger.info('Admin viewed users with pagination', { 
      adminId: req.user!.id,
      page,
      limit,
      filters: req.query,
      total
    });
    
    return res.status(200).json({
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error: any) {
    Logger.error('Failed to fetch users', { error: error.message, adminId: req.user!.id });
    return res.status(500).json({ message: 'Failed to fetch users' });
  }
}));

userManagmentRouter.put('/users/:id', MyRequestHandler(async (req,res)=>{
  try {
    const { name, email, isAdmin, regId } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) {
      Logger.warn('User not found for update', { userId: req.params.id, adminId: req.user!.id });
      return res.status(404).json({ message: 'User not found' });
      
    }

    user.name = name || user.name;
    user.email = email || user.email;
    user.isAdmin = isAdmin !== undefined ? isAdmin : user.isAdmin;
    user.regId = regId || user.regId;

    await user.save();
    Logger.info('User updated by admin', { userId: user._id, adminId: req.user!.id });
    return res.status(200).json({ message: 'User updated successfully' });
  } catch (error: any) {
    Logger.error('Failed to update user', { adminId: req.user!.id, error: error.message });
    return res.status(500).json({ message: 'Failed to update user' });
  }
}));

userManagmentRouter.delete('/users/:id', MyRequestHandler(async (req,res)=>{
  try {
    await Promise.all([
      // Delete user's sessions
      Session.deleteMany({ userId: req.params.id }),
      // Delete user's payments
      Payment.deleteMany({ userId: req.params.id }),
      // Delete the user
      User.findByIdAndDelete(req.params.id)
    ]);

    Logger.info('Admin deleted user', {
      adminId: req.user!.id,
      userId: req.params.id
    });

    return res.status(200).json({ message: 'User deleted successfully' });
  } catch (error: any) {
    Logger.error('Failed to delete user', { adminId: req.user!.id, error: error.message });
    return res.status(500).json({ message: 'Failed to delete user' });
  }
}));

// Ban/unban user route
userManagmentRouter.put('/users/:id/ban', MyRequestHandler(async (req,res)=>{
  try {
    const { isBlocked } = req.body;
    
    if (isBlocked === undefined) {
      Logger.warn('Missing isBlocked parameter', { userId: req.params.id, adminId: req.user!.id });
      return res.status(400).json({ message: 'isBlocked parameter is required' });
      
    }
    
    const user = await User.findById(req.params.id);

    if (!user) {
      Logger.warn('User not found for ban/unban', { userId: req.params.id, adminId: req.user!.id });
      return res.status(404).json({ message: 'User not found' });
      
    }

    // Don't allow banning admin users
    if (user.isAdmin) {
      Logger.warn('Attempt to ban admin user', { userId: req.params.id, adminId: req.user!.id });
      return res.status(403).json({ message: 'Cannot ban admin users' });
      
    }

    user.isBlocked = isBlocked;
    await user.save();
    
    // If banning, terminate all active sessions for this user
    if (isBlocked) {
      await Session.updateMany(
        { userId: user._id, isTerminated: false },
        { isTerminated: true }
      );
      Logger.info('All sessions terminated for banned user', { userId: user._id });
    }

    const action = isBlocked ? 'banned' : 'unbanned';
    Logger.info(`User ${action} by admin`, { userId: user._id, adminId: req.user!.id });
    return res.status(200).json({ message: `User ${action} successfully` });
  } catch (error: any) {
    Logger.error('Failed to ban/unban user', { adminId: req.user!.id, error: error.message });
    return res.status(500).json({ message: 'Failed to ban/unban user' });
  }
}));

export default userManagmentRouter

