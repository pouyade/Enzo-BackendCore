
import mongoose from 'mongoose';
import {Router} from 'express';
import { MyRequestHandler } from '@/Helper/MyRequestHandler';
import { Logger } from '@/Helper/Logger';
import { User, Plan, Voucher, IVoucher } from '@/models';
const paymentManagmentRouter=Router();

// Voucher Management Routes
paymentManagmentRouter.post('/vouchers', MyRequestHandler(async (req,res)=>{
  try {
    const { code, planId, durationDays, maxUses, expiresAt, description } = req.body;

    // Validate required fields
    if (!code || !planId || !durationDays || !maxUses) {
      Logger.warn('Missing required fields for voucher creation', { adminId: req.user!.id });
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Check if plan exists
    const plan = await Plan.findById(planId);
    if (!plan) {
      Logger.warn('Plan not found for voucher creation', { adminId: req.user!.id, planId });
      return res.status(404).json({ message: 'Plan not found' });
    }

    // Check if code already exists
    const existingVoucher = await Voucher.findOne({ code });
    if (existingVoucher) {
      Logger.warn('Duplicate voucher code', { adminId: req.user!.id, code });
      return res.status(400).json({ message: 'Voucher code already exists' });
    }

    const voucher = await Voucher.create({
      code,
      planId,
      durationDays,
      maxUses,
      expiresAt,
      description,
      createdBy: req.user!.id
    });

    Logger.info('Voucher created', { 
      adminId: req.user!.id, 
      voucherId: voucher._id,
      code: voucher.code 
    });

    return res.status(201).json(voucher);
  } catch (error: any) {
    Logger.error('Failed to create voucher', { adminId: req.user!.id, error: error.message });
    return res.status(500).json({ message: 'Failed to create voucher' });
  }
}));

paymentManagmentRouter.get('/vouchers', MyRequestHandler(async (req,res)=>{
  try {
    const { search, isActive, planId, page = '1', limit = '20' } = req.query;
    const filter: any = {};

    if (search) {
      filter.$or = [
        { code: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }
    if (planId) {
      filter.planId = planId;
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const [vouchers, total] = await Promise.all([
      Voucher.find(filter)
        .populate('planId', 'name price')
        .populate('createdBy', 'email name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Voucher.countDocuments(filter)
    ]);

    Logger.info('Admin fetched vouchers', { 
      adminId: req.user!.id,
      filterCriteria: { search, isActive, planId },
      count: vouchers.length
    });

    return res.status(200).json({
      vouchers,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error: any) {
    Logger.error('Failed to fetch vouchers', { adminId: req.user!.id, error: error.message });
    return res.status(500).json({ message: 'Failed to fetch vouchers' });
  }
}));

paymentManagmentRouter.get('/vouchers/:id', MyRequestHandler(async (req,res)=>{
  try {
    const voucher = await Voucher.findById(req.params.id)
      .populate('planId', 'name price')
      .populate('createdBy', 'email name')
      .populate('usedBy.userId', 'email name');

    if (!voucher) {
      Logger.warn('Voucher not found', { adminId: req.user!.id, voucherId: req.params.id });
      return res.status(404).json({ message: 'Voucher not found' });
    }

    Logger.info('Admin fetched voucher details', { 
      adminId: req.user!.id, 
      voucherId: voucher._id 
    });

    return res.status(200).json(voucher);
  } catch (error: any) {
    Logger.error('Failed to fetch voucher details', { adminId: req.user!.id, error: error.message });
    return res.status(500).json({ message: 'Failed to fetch voucher details' });
  }
}));

paymentManagmentRouter.put('/vouchers/:id', MyRequestHandler(async (req,res)=>{
  try {
    const { isActive, expiresAt, description } = req.body;
    
    const voucher = await Voucher.findById(req.params.id);
    if (!voucher) {
      Logger.warn('Voucher not found for update', { adminId: req.user!.id, voucherId: req.params.id });
      return res.status(404).json({ message: 'Voucher not found' });
    }

    if (isActive !== undefined) voucher.isActive = isActive;
    if (expiresAt !== undefined) voucher.expiresAt = expiresAt;
    if (description !== undefined) voucher.description = description;

    await voucher.save();

    Logger.info('Voucher updated', { 
      adminId: req.user!.id, 
      voucherId: voucher._id 
    });

    return res.status(200).json(voucher);
  } catch (error: any) {
    Logger.error('Failed to update voucher', { adminId: req.user!.id, error: error.message });
    return res.status(500).json({ message: 'Failed to update voucher' });
  }
}));

paymentManagmentRouter.delete('/vouchers/:id', MyRequestHandler(async (req,res)=>{
  try {
    const voucher = await Voucher.findById(req.params.id);
    if (!voucher) {
      Logger.warn('Voucher not found for deletion', { adminId: req.user!.id, voucherId: req.params.id });
      return res.status(404).json({ message: 'Voucher not found' });
    }

    await Voucher.deleteOne({ _id: req.params.id });
    Logger.info('Voucher deleted', {
      adminId: req.user!.id,
      voucherId: req.params.id
    });
    return res.status(200).json({ message: 'Voucher deleted successfully' });
  } catch (error: any) {
    Logger.error('Failed to delete voucher', { adminId: req.user!.id, error: error.message });
    return res.status(500).json({ message: 'Failed to delete voucher' });
  }
}));

// Add endpoint for fetching voucher usage details
paymentManagmentRouter.get('/vouchers/:id/usage', MyRequestHandler(async (req,res)=>{
  try {
    interface PopulatedVoucher extends Omit<IVoucher, 'usedBy' | 'planId'> {
      usedBy: {
        userId: {
          _id: mongoose.Types.ObjectId;
          name: string;
          email: string;
        };
        usedAt: number;
      }[];
      planId: {
        name: string;
      };
    }

    const voucher = await Voucher.findById(req.params.id)
      .populate<{ usedBy: { userId: { _id: mongoose.Types.ObjectId; name: string; email: string } }[]; planId: { name: string } }>('usedBy.userId', 'name email')
      .populate('planId', 'name') as PopulatedVoucher | null;

    if (!voucher) {
      Logger.warn('Voucher not found for usage details', { adminId: req.user!.id, voucherId: req.params.id });
      return res.status(404).json({ message: 'Voucher not found' });
    }

    // Transform the data to match the frontend interface
    const usageDetails = voucher.usedBy.map(usage => ({
      id: usage.userId._id.toString(),
      user: {
        name: usage.userId.name,
        email: usage.userId.email
      },
      plan: {
        name: voucher.planId.name
      },
      usedAt: usage.usedAt
    }));

    Logger.info('Admin fetched voucher usage details', {
      adminId: req.user!.id,
      voucherId: voucher._id,
      usageCount: usageDetails.length
    });

    return res.status(200).json(usageDetails);
  } catch (error: any) {
    Logger.error('Failed to fetch voucher usage details', { adminId: req.user!.id, error: error.message });
    return res.status(500).json({ message: 'Failed to fetch voucher usage details' });
  }
}));


paymentManagmentRouter.post('/plans', MyRequestHandler(async (req,res)=>{
  try {
    const { name, durationDays, price, features, isActive } = req.body;

    const plan = new Plan({
      name,
      durationDays,
      price,
      features: features.map((feature: any) => ({
        feature_key: feature.feature_key,
        feature_value: feature.feature_value
      })),
      isActive: isActive ?? true
    });

    await plan.save();
    Logger.info('New plan created', { planId: plan._id, adminId: req.user!.id });
    return res.status(201).json(plan);
  } catch (error: any) {
    Logger.error('Failed to create plan', { error: error.message });
    return res.status(500).json({ message: 'Failed to create plan' });
  }
}));

paymentManagmentRouter.put('/plans/:id', MyRequestHandler(async (req,res)=>{
  try {
    const { name, durationDays, price, features, isActive } = req.body;
    const planId = req.params.id;

    const updatedPlan = await Plan.findByIdAndUpdate(
      planId,
      {
        name,
        durationDays,
        price,
        features: features.map((feature: any) => ({
          feature_key: feature.feature_key,
          feature_value: feature.feature_value
        })),
        isActive
      },
      { new: true }
    );

    if (!updatedPlan) {
      Logger.warn('Plan not found for update', { planId, adminId: req.user!.id });
      return res.status(404).json({ message: 'Plan not found' });
      
    }

    Logger.info('Plan updated', { planId, adminId: req.user!.id });
    return res.status(200).json(updatedPlan);
  } catch (error: any) {
    Logger.error('Failed to update plan', { error: error.message });
    return res.status(500).json({ message: 'Failed to update plan' });
  }
}));

paymentManagmentRouter.get('/plans', MyRequestHandler(async (req,res)=>{
  try {
    const plans = await Plan.find().sort({ createdAt: -1 });
    return res.status(200).json(plans);
  } catch (error: any) {
    Logger.error('Failed to fetch plans', { error: error.message });
    return res.status(500).json({ message: 'Failed to fetch plans' });
  }
}));

paymentManagmentRouter.get('/plans/:id', MyRequestHandler(async (req,res)=>{
  try {
    const plan = await Plan.findById(req.params.id);
    if (!plan) {
      Logger.warn('Plan not found', { planId: req.params.id, adminId: req.user!.id });
      return res.status(404).json({ message: 'Plan not found' });
      
    }
    return res.status(200).json(plan);
  } catch (error: any) {
    Logger.error('Failed to fetch plan', { error: error.message });
    return res.status(500).json({ message: 'Failed to fetch plan' });
  }
}));

paymentManagmentRouter.delete('/plans/:id', MyRequestHandler(async (req,res)=>{
  try {
    // Check if plan is in use by any users
    const usersWithPlan = await User.countDocuments({ 'subscription.planId': req.params.id });
    if (usersWithPlan > 0) {
      Logger.warn('Cannot delete plan in use', { planId: req.params.id, adminId: req.user!.id, usersCount: usersWithPlan });
      return res.status(400).json({ message: `Cannot delete plan. It is currently used by ${usersWithPlan} users.` });
      
    }

    const plan = await Plan.findByIdAndDelete(req.params.id);
    if (!plan) {
      Logger.warn('Plan not found for deletion', { planId: req.params.id, adminId: req.user!.id });
      return res.status(404).json({ message: 'Plan not found' });
      
    }

    Logger.info('Plan deleted', { planId: req.params.id, adminId: req.user!.id });
    return res.status(200).json({ message: 'Plan deleted successfully' });
  } catch (error: any) {
    Logger.error('Failed to delete plan', { error: error.message, adminId: req.user!.id });
    return res.status(500).json({ message: 'Failed to delete plan' });
  }
}));

export default paymentManagmentRouter;