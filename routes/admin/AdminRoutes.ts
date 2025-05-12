import { auth } from '@middleware/auth';
import { Router } from 'express';

import analyticsRouter from '@routes/admin/AnalyticsManagmentRoutes';
import appManagmentRouter from '@routes/admin/AppManagmentRoutes'
import blockManagmentRouter from './BlockManagmentRoutes';
import bugManagmentRouter from './BugManagmentRoutes';
import logsAdminRouter from './LogsAdminRoutes';
import paymentManagmentRouter from './PaymentManagmentRoutes';
import supportManagmentRouter from './SupportManagmentRoutes';
import userManagmentRouter from './UserManagmentRoutes';
// // Configure multer for memory storage (not disk)
// const upload = multer({
//   storage: multer.memoryStorage(),
//   limits: {
//     fileSize: 50 * 1024 * 1024 // 5MB limit
//   },
//   fileFilter: (req, file, cb) => {
//     if (!file.mimetype.startsWith('image/')) {
//       return cb(new Error('Only images are allowed'));
//     }
//     cb(null, true);
//   }
// });

// // Configure multer for icon uploads
// const iconStorage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, path.join(process.cwd(), 'uploads', 'icons'));
//   },
//   filename: (req, file, cb) => {
//     const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
//     cb(null, `icon-${uniqueSuffix}${path.extname(file.originalname)}`);
//   }
// });

// const iconUpload = multer({
//   storage: iconStorage,
//   limits: {
//     fileSize: 5 * 1024 * 1024 // 5MB limit
//   },
//   fileFilter: (req, file, cb) => {
//     if (!file.mimetype.startsWith('image/')) {
//       cb(new Error('Only images are allowed'));
      
//     }
//     cb(null, true);
//   }
// });

const adminRouter = Router();
adminRouter.use(auth.admin);
adminRouter.use('/analytics',analyticsRouter);
adminRouter.use('/app',appManagmentRouter);
adminRouter.use('/block',blockManagmentRouter);
adminRouter.use('/bug',bugManagmentRouter);
adminRouter.use('/logs',logsAdminRouter);
adminRouter.use('/payment',paymentManagmentRouter);
adminRouter.use('/support',supportManagmentRouter);
adminRouter.use('/user',userManagmentRouter);

export default adminRouter;