import express, { Request, Response, RequestHandler } from 'express';
import { auth } from '@/middleware/auth';
import { Plan } from '@/models/Plan';
import { Logger } from '@/Helper/Logger';
import { MyRequestHandler } from '@/Helper/MyRequestHandler';

const planRouter = express.Router();
planRouter.get('/',auth.user, MyRequestHandler(async (req, res) => {
  try {
    const plans = await Plan.find({ isActive: true }).select('-isActive');
    return res.json({ "plans": plans });
  } catch (error: any) {
    Logger.error('Failed to fetch plans', { error: error.message });
    return res.status(500).json({ message: 'Failed to fetch plans' });
  }
}));

export default planRouter;