import mongoose from 'mongoose';
import express from 'express';
import { 
  User,
  Plan, IPlan, Payment, PlanHistory,
  Notification
} from '@/models';
import { Voucher } from '@/models/Voucher';
import { processPayment, generatePaymentLink } from '@/Helper/PaymentHelper';
import { auth } from '@/middleware/auth';
import { Logger } from '@/Helper/Logger';
import {MyRequestHandler} from '@/Helper/MyRequestHandler';
import { Config } from '@/config';

const userRouter = express.Router();
userRouter.use(auth.user);

userRouter.get('/profile', MyRequestHandler(async (req, res) => {
  const user = await User.findById(req.user?.id)
    .select('-password -verificationCode -resetPasswordCode -verificationCodeExpiresAt -resetPasswordCodeExpiresAt -isVerified -isAdmin -isBlocked -isDeleted -activationCodeAttempts -createdAt -updatedAt -regId')
    .populate('subscription.planId');
    
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
    
  }
  
  return res.status(200).json(user);
}));

userRouter.post('/profile', MyRequestHandler(async (req, res) => {
  const { name } = req.body;
  if (name && typeof name !== 'string') {
    return res.status(400).json({ message: 'Name must be a string' });
  }

  if (name && (name.length < 2 || name.length > 50)) {
    return res.status(400).json({ message: 'Name must be between 2 and 50 characters' });
  }

  if (name && !/^[a-zA-Z0-9\s]+$/.test(name)) {
    return res.status(400).json({ message: 'Name can only contain letters, numbers and spaces' });
  }
  
  const userId = req.user?.id;
  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
    
  }

  if (name) {
    user.name = name;
  }

  await user.save();

  return res.status(200).json({
    message: 'Profile updated successfully',
    user: {
      id: user._id,
      email: user.email,
      name: user.name,
      isVerified: user.isVerified,
      isAdmin: user.isAdmin
    }
  });
}));

userRouter.post('/subscribe', MyRequestHandler(async (req, res) => {
  const { planId, paymentDetails } = req.body;
  
  const plan = await Plan.findById(planId);
  if (!plan || !plan.isActive) {
    return res.status(404).json({ message: 'Plan not found or inactive' });
    
  }

  const user = await User.findById(req.user!.id);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
    
  }

  // Process payment here (integrate with your payment provider)
  const paymentResult = await processPayment(paymentDetails, plan.price);

  const startDate = Date.now();
  const endDate = startDate + (plan.durationDays * 24 * 60 * 60 * 1000);

  user.subscription = {
    planId: plan._id as mongoose.Types.ObjectId,
    startDate,
    endDate,
    isActive: true,
    lastPayment: {
      amount: plan.price,
      date: Date.now(),
      transactionId: paymentResult.transactionId
    }
  };

  await user.save();
  return res.status(200).json({ 
    message: 'Subscription successful',
    subscription: user.subscription
  });
}));

// router.get('/subscription/status', MyRequestHandler(async (req, res) => {
//   const user = await User.findById(req.user!.id).populate('subscription.planId');
  
//   if (!user) {
//     return res.status(404).json({ message: 'User not found' });
    
//   }

//   const subscription = user.subscription;
//   const isSubscribed = subscription?.isActive;
//   const plan = user.subscription?.planId as unknown as IPlan;
  
//   return res.status(200).json({
//     isSubscribed,
//     subscription: isSubscribed ? {
//       ...subscription,
//       plan: plan ? {
//         id: plan._id,
//         name: plan.name,
//         features: plan?.features || [],
//         durationDays: plan?.durationDays
//       } : null
//     } : null,
//   });
// }));

userRouter.post('/plans/order', MyRequestHandler(async (req, res) => {
  const { planId } = req.body;
  
  const plan = await Plan.findById(planId);
  if (!plan || !plan.isActive) {
    return res.status(404).json({ message: 'Plan not found or inactive' });
    
  }

  // Create pending payment record
  const payment = new Payment({
    userId: req.user!.id,
    planId: plan._id,
    amount: plan.price,
    status: 'pending',
    transactionId: `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    paymentMethod: 'stripe',
  });
  await payment.save();

  // Generate payment link
  const paymentLink = await generatePaymentLink({
    amount: plan.price,
    currency: 'USD',
    paymentId: payment._id as string,
    planName: plan.name,
    successUrl: `${Config.getInstance().server.baseUrl}/payment/success`,
    cancelUrl: `${Config.getInstance().server.baseUrl}/payment/cancel`
  });

  Logger.info('Payment link generated', { 
    userId: req.user!.id, 
    planId, 
    paymentId: payment._id 
  });

  return res.status(200).json({ 
    paymentLink,
    paymentId: payment._id,
    expiresIn: 3600
  });
}));

userRouter.get('/payment/status/:paymentId', MyRequestHandler(async (req, res) => {
  const { paymentId } = req.params;
  
  const payment = await Payment.findOne({ 
    _id: paymentId,
    userId: req.user!.id
  }).populate<{ planId: IPlan }>('planId');

  if (!payment) {
    return res.status(404).json({ message: 'Payment not found' });
    
  }

  if (payment.status === 'success') {
    const existingHistory = await PlanHistory.findOne({ paymentId: payment._id });
    
    if (!existingHistory) {
      const plan = payment.planId;
      const startDate = Date.now();
      const endDate = startDate + (plan.durationDays * 24 * 60 * 60 * 1000);

      const planHistory = new PlanHistory({
        userId: req.user!.id,
        planId: plan._id,
        startDate,
        endDate,
        status: 'active',
        paymentId: payment._id
      });
      await planHistory.save();

      await User.findByIdAndUpdate(req.user!.id, {
        subscription: {
          planId: plan._id,
          startDate,
          endDate,
          isActive: true,
          lastPayment: {
            amount: payment.amount,
            date: Date.now(),
            transactionId: payment.transactionId
          }
        }
      });
    }
  }

  return res.status(200).json({
    status: payment.status,
    amount: payment.amount,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
    errorMessage: payment.errorMessage
  });
}));





// Get plan details
userRouter.get('/plan', MyRequestHandler(async (req, res) => {
  const user = await User.findById(req.user!.id)
    .populate('subscription.planId');

  if (!user) {
    return res.status(404).json({ message: 'User not found' });
    
  }

  if (!user.subscription) {
    const freePlan = await Plan.findOne({ name: 'Free' });
    if (!freePlan) {
      Logger.error('Free plan not found');
      return res.status(500).json({ message: 'Error fetching plan details' });
      
    }

    user.subscription = {
      planId: freePlan._id as mongoose.Types.ObjectId,
      startDate: Date.now(),
      endDate: 0,
      isActive: true
    };
    await user.save();
  }

  const plan = user.subscription?.planId as unknown as IPlan;
  
  return res.status(200).json({
    currentPlan: {
      id: plan?._id,
      name: plan?.name,
      features: plan?.features || [],
      startDate: user.subscription?.startDate,
      endDate: user.subscription?.endDate,
      isActive: user.subscription?.isActive
    }
  });
}));


// Redeem voucher
userRouter.post('/vouchers/redeem', MyRequestHandler(async (req, res) => {
  try {
    const { code } = req.body;
    const userId = req.user!.id;

    if (!code) {
      Logger.warn('Missing voucher code', { userId });
      return res.status(400).json({ message: 'Voucher code is required' });
    }

    // Get user
    const user = await User.findById(userId);
    if (!user) {
      Logger.error('User not found for voucher redemption', { userId });
      return res.status(500).json({ message: 'Error processing voucher' });
    }

    try {
      // Use the new applyVoucher method that handles all validation and history recording
      const result = await user.applyVoucher(code);
      
      Logger.info('Voucher redeemed successfully', {
        userId,
        voucherId: result.voucher._id,
        planId: result.voucher.planId,
        historyRecordId: result.historyRecord._id
      });

      return res.status(200).json({
        message: 'Voucher redeemed successfully',
        subscription: {
          ...result.subscription,
          plan: {
            id: result.plan?._id,
            name: result.plan?.name,
            features: result.plan?.features,
            durationDays: result.voucher.durationDays
          }
        },
        validUntil: new Date(result.subscription.endDate).toISOString()
      });
    } catch (error: any) {
      // The applyVoucher method throws specific errors that we can use
      Logger.warn('Failed to apply voucher', { userId, code, error: error.message });
      return res.status(400).json({ message: error.message });
    }
  } catch (error: any) {
    Logger.error('Failed to redeem voucher', { userId: req.user!.id, error: error.message });
    return res.status(500).json({ message: 'Failed to redeem voucher' });
  }
}));

// Get user's active vouchers
userRouter.get('/vouchers/active', MyRequestHandler(async (req, res) => {
  try {
    const userId = req.user!.id;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const activeVouchers = await user.getActiveVouchers();
    
    return res.status(200).json({
      activeVouchers: activeVouchers.map(record => ({
        id: record._id,
        voucherCode: record.voucherCode,
        appliedAt: record.appliedAt,
        expiresAt: record.expiresAt,
        plan: record.planId ? {
          id: record.planId._id,
          name: record.planId.name
        } : null,
        durationDays: record.durationDays
      }))
    });
  } catch (error: any) {
    Logger.error('Failed to get active vouchers', { userId: req.user!.id, error: error.message });
    return res.status(500).json({ message: 'Failed to get active vouchers' });
  }
}));

// Get user's voucher history
userRouter.get('/vouchers/history', MyRequestHandler(async (req, res) => {
  try {
    const userId = req.user!.id;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const history = await user.getVoucherHistory();
    
    return res.status(200).json({
      history: history.map(record => ({
        id: record._id,
        voucherCode: record.voucherCode,
        appliedAt: record.appliedAt,
        expiresAt: record.expiresAt,
        status: record.status,
        plan: record.planId ? {
          id: record.planId._id,
          name: record.planId.name
        } : null,
        durationDays: record.durationDays
      }))
    });
  } catch (error: any) {
    Logger.error('Failed to get voucher history', { userId: req.user!.id, error: error.message });
    return res.status(500).json({ message: 'Failed to get voucher history' });
  }
}));

// Add rate limiter for voucher checks (5 per day)


// Add new endpoint for checking voucher details
userRouter.post('/vouchers/check/', 
  // voucherCheckLimiter,
  MyRequestHandler(async (req, res) => {
    try {
      const { code } = req.body;
      const userId = req.user!.id;

      if (!code) {
        Logger.warn('Missing voucher code in check request', { userId });
        return res.status(400).json({ message: 'Voucher code is required' });
      }

      // Find the voucher
      const voucher = await Voucher.findOne({ 
        code,
        isActive: true,
        $or: [
          { expiresAt: { $gt: Date.now() } },
          { expiresAt: null }
        ]
      }).populate('planId');

      if (!voucher) {
        Logger.warn('Voucher not found or inactive', { userId, code });
        return res.status(404).json({ message: 'Invalid or expired voucher code' });
      }

      // Check if voucher has reached max uses
      if (voucher.usedCount >= voucher.maxUses) {
        Logger.warn('Voucher has reached max uses', { userId, code });
        return res.status(400).json({ message: 'This voucher has reached its maximum usage limit' });
      }

      // Check if user has already used this voucher
      const hasUsedVoucher = voucher.usedBy.some(usage => 
        usage.userId.toString() === userId
      );

      if (hasUsedVoucher) {
        Logger.warn('User has already used this voucher', { userId, code });
        return res.status(400).json({ message: 'You have already used this voucher' });
      }

      // Cast the populated planId to the IPlan type
      const plan = voucher.planId as unknown as IPlan;

      // Return voucher details
      return res.status(200).json({
        code: voucher.code,
        plan: {
          id: plan._id,
          name: plan.name,
          description: plan.description,
          features: plan.features,
          price: plan.price,
          durationDays: voucher.durationDays || plan.durationDays,
          isActive: plan.isActive
        },
        expiresAt: voucher.expiresAt,
        remainingUses: voucher.maxUses - voucher.usedCount
      });

    } catch (error: any) {
      Logger.error('Failed to check voucher', { 
        userId: req.user!.id, 
        code: req.params.code,
        error: error.message 
      });
      return res.status(500).json({ message: 'Failed to check voucher' });
    }
  })
);

export default userRouter;