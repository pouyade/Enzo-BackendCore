import multer from 'multer';
import { Config } from '@/config';
import { User } from '@/models';
import { AuthenticatedRequest } from '@/middleware/auth';

const createUploadMiddleware = () => {
  return multer({
    storage: multer.memoryStorage(),
    fileFilter: async (req: AuthenticatedRequest, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
      try {
        if (!Config.getInstance().uploads.allowedMimeTypes.includes(file.mimetype)) {
          cb(new Error('File type not allowed'));
          return;
        }

        // Check user's subscription status
        const user = await User.findById(req.user!.id);
        if (!user) {
          cb(new Error('User not found'));
          return;
        }

        const hasActivePlan = user.subscription?.isActive && user.subscription.endDate > Date.now();
        const fileSizeLimit = hasActivePlan ? Config.getInstance().uploads.maxSizePremium : Config.getInstance().uploads.maxSizeBasic;

        if (file.size > fileSizeLimit) {
          cb(new Error(`File size exceeds the limit (${hasActivePlan ? '5MB' : '2MB'})`));
          return;
        }

        cb(null, true);
      } catch (error) {
        cb(error as Error);
      }
    },
    limits: {
      fileSize: Config.getInstance().uploads.maxSizePremium, // Set to max possible limit
    }
  });
};

// Create a specialized middleware for avatar uploads with stricter limits
const createAvatarUploadMiddleware = () => {
  return multer({
    storage: multer.memoryStorage(),
    fileFilter: async (req: AuthenticatedRequest, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
      try {
        // Only allow image formats for avatars
        const allowedMimeTypes = ['image/jpeg','image/jpg', 'image/png','image/webp'];
        if (file.mimetype === 'image/*') {
          const ext = file.originalname.split('.').pop()?.toLowerCase();
          const validExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext || '');
          if (validExt) {
            cb(null, true);
            return;
          }
        }else if (!allowedMimeTypes.includes(file.mimetype)) {
          cb(new Error('Only JPG, PNG, and WebP images are allowed for avatars'));
          return;
        }

        // Set a smaller file size limit for avatars (1MB)
        const maxAvatarSize = 1 * 1024 * 1024; // 1MB
        if (file.size > maxAvatarSize) {
          cb(new Error('Avatar image size should not exceed 1MB'));
          return;
        }

        cb(null, true);
      } catch (error) {
        cb(error as Error);
      }
    },
    limits: {
      fileSize: 1 * 1024 * 1024, // 1MB max for avatars
    }
  });
};

// Create a specialized middleware for icon uploads with processing
const createIconUploadMiddleware = () => {
  return multer({
    storage: multer.memoryStorage(),
    fileFilter: async (req: AuthenticatedRequest, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
      try {
        const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (!allowedMimeTypes.includes(file.mimetype)) {
          cb(new Error('Only JPG, PNG, and WebP images are allowed for icons'));
          return;
        }

        // Set a reasonable file size limit for icons (2MB)
        const maxIconSize = 2 * 1024 * 1024; // 2MB
        if (file.size > maxIconSize) {
          cb(new Error('Icon image size should not exceed 2MB'));
          return;
        }

        cb(null, true);
      } catch (error) {
        cb(error as Error);
      }
    },
    limits: {
      fileSize: 2 * 1024 * 1024, // 2MB max for icons
    }
  });
};

// Middleware to process uploaded icons
export const processIcon = async (req: AuthenticatedRequest, res: any, next: any) => {
  try {
   

    next();
  } catch (error) {
    next(error);
  }
};

export const upload = createUploadMiddleware();
export const avatarUpload = createAvatarUploadMiddleware();
export const iconUpload = createIconUploadMiddleware(); 