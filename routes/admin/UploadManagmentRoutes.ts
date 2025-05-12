
import {Router} from 'express';
import { MyRequestHandler } from '@/Helper/MyRequestHandler';
import { Logger } from '@/Helper/Logger';


const uploadManagmentRouter=Router();

// Upload management routes
uploadManagmentRouter.post('/upload/avatar', upload.single('file'), MyRequestHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const result = await fileStorage.uploadAvatar(req.file.buffer);
    Logger.info('Avatar uploaded by admin', { adminId: req.user!.id, filename: result.filename });
    return res.json(result);
  } catch (error: any) {
    Logger.error('Error uploading avatar:', { error: error.message, adminId: req.user!.id });
    return res.status(500).json({ error: 'Failed to upload avatar' });
  }
}));

uploadManagmentRouter.post('/upload/icon', upload.single('file'), MyRequestHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const result = await fileStorage.uploadIcon(req.file.buffer, req.file.mimetype);
    Logger.info('Icon uploaded by admin', { adminId: req.user!.id, filename: result.filename });
    return res.json(result);
  } catch (error: any) {
    Logger.error('Error uploading icon:', { error: error.message, adminId: req.user!.id });
    return res.status(500).json({ error: 'Failed to upload icon' });
  }
}));

uploadManagmentRouter.post('/upload/message', upload.single('file'), MyRequestHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const result = await fileStorage.uploadMessagePhoto(req.file.buffer, req.file.mimetype);
    Logger.info('Message photo uploaded by admin', { adminId: req.user!.id, filename: result.filename });
    return res.json(result);
  } catch (error: any) {
    Logger.error('Error uploading message photo:', { error: error.message, adminId: req.user!.id });
    return res.status(500).json({ error: 'Failed to upload message photo' });
  }
}));

uploadManagmentRouter.get('/uploads', MyRequestHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const config = Config.getInstance();
    const files: any[] = [];

    // Read files from different directories
    const directories = {
      avatars: path.join(config.storage.appDir, config.storage.uploadsDir, config.storage.avatarsDir),
      icons: path.join(config.storage.appDir, config.storage.uploadsDir, config.storage.iconsDir),
      messages: path.join(config.storage.appDir, config.storage.uploadsDir, config.storage.messagesDir),
      others: path.join(config.storage.appDir, config.storage.uploadsDir, config.storage.othersDir)
    };

    for (const [type, dir] of Object.entries(directories)) {
      if (fs.existsSync(dir)) {
        const dirFiles = fs.readdirSync(dir);
        for (const filename of dirFiles) {
          const filePath = path.join(dir, filename);
          const stats = fs.statSync(filePath);
          if (stats.isFile()) {
            files.push({
              filename,
              path: filePath,
              url: `${config.server.baseUrl}/uploads/${type}/${filename}`,
              type,
              size: stats.size,
              createdAt: stats.birthtime
            });
          }
        }
      }
    }

    Logger.info('Admin listed uploads', { adminId: req.user!.id });
    return res.json({ files });
  } catch (error: any) {
    Logger.error('Error listing uploads:', { error: error.message, adminId: req.user!.id });
    return res.status(500).json({ error: 'Failed to list uploads' });
  }
}));

uploadManagmentRouter.delete('/upload/:filename', MyRequestHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { filename } = req.params;
    await fileStorage.deleteFile(filename);
    Logger.info('File deleted by admin', { adminId: req.user!.id, filename });
    return res.json({ message: 'File deleted successfully' });
  } catch (error: any) {
    Logger.error('Error deleting file:', { error: error.message, adminId: req.user!.id });
    return res.status(500).json({ error: 'Failed to delete file' });
  }
}));

// Configure multer for memory storage (not disk)
const uploadOther = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB limit for other files
  }
}).single('file');

// Wrap multer middleware in a Promise
const handleUpload = (req: AuthenticatedRequest, res: Response): Promise<void> => {
  return new Promise((resolve, reject) => {
    uploadOther(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

// Upload management routes
uploadManagmentRouter.post('/upload/other', MyRequestHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    await handleUpload(req, res);
    
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const result = await fileStorage.saveFile(file, 'others', undefined, req.user!.id);
    Logger.info('File uploaded by admin', { adminId: req.user!.id, filename: result.filename });
    return res.json(result);
  } catch (err) {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        Logger.warn('File size limit exceeded', { adminId: req.user!.id, error: err.message });
        return res.status(413).json({ error: 'File size exceeds the limit (500MB)' });
      }
      Logger.error('Multer error:', { adminId: req.user!.id, error: err.message });
      return res.status(400).json({ error: err.message });
    }
    Logger.error('Error uploading file:', { adminId: req.user!.id, error: err });
    return res.status(500).json({ error: 'Failed to upload file' });
  }
}));

uploadManagmentRouter.get('/uploads/storage', MyRequestHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const config = Config.getInstance();
    const uploadDir = path.join(config.storage.appDir, config.storage.uploadsDir);
    
    // Get total size of upload directory
    let totalSize = 0;
    const getDirectorySize = (dirPath: string): number => {
      const files = fs.readdirSync(dirPath);
      let size = 0;
      files.forEach(file => {
        const filePath = path.join(dirPath, file);
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
          size += getDirectorySize(filePath);
        } else {
          size += stats.size;
        }
      });
      return size;
    };

    totalSize = getDirectorySize(uploadDir);

    // Get disk information
    const disks = await getDiskInfo();
    const rootDisk = disks.find(disk => disk.mounted === '/');
    
    const response = {
      uploadStorage: {
        total: totalSize,
        byDirectory: {
          avatars: getDirectorySize(path.join(uploadDir, config.storage.avatarsDir)),
          icons: getDirectorySize(path.join(uploadDir, config.storage.iconsDir)),
          messages: getDirectorySize(path.join(uploadDir, config.storage.messagesDir)),
          others: getDirectorySize(path.join(uploadDir, config.storage.othersDir))
        }
      },
      diskInfo: rootDisk ? {
        total: rootDisk.blocks,
        used: rootDisk.blocks - rootDisk.available,
        available: rootDisk.available,
        usagePercentage: ((rootDisk.blocks - rootDisk.available) / rootDisk.blocks) * 100
      } : null
    };

    return res.json(response);
  } catch (error: any) {
    Logger.error('Error getting storage info:', { error: error.message, adminId: req.user!.id });
    return res.status(500).json({ error: 'Failed to get storage information' });
  }
}));

uploadManagmentRouter.delete('/upload/:type/:filename', MyRequestHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { type, filename } = req.params;
    
    // Validate type
    if (!['avatars', 'icons', 'messages', 'others'].includes(type)) {
      return res.status(400).json({ error: 'Invalid file type' });
    }

    await fileStorage.deleteFileFromDirectory(type, filename, req.user!.id);
    Logger.info('File deleted by admin', { adminId: req.user!.id, filename, type });
    return res.json({ message: 'File deleted successfully' });
  } catch (error: any) {
    Logger.error('Error deleting file:', { error: error.message, adminId: req.user!.id });
    return res.status(500).json({ error: 'Failed to delete file' });
  }
}));

// Add new route to view upload ledger
uploadManagmentRouter.get('/uploads', MyRequestHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;

    // Build query
    const query: any = {};
    if (req.query.type) {
      query.fileType = req.query.type;
    }
    if (req.query.active === 'true') {
      query.isActive = true;
    }
    if (req.query.userId) {
      query.userId = new mongoose.Types.ObjectId(req.query.userId as string);
    }

    // Get items with pagination
    const { items, total } = await FileUploadLedger.findWithPagination(query, {
      page,
      pageSize,
      sort: { createdAt: -1 }
    });

    return res.json({
      items,
      total,
      page,
      pageSize
    });
  } catch (error: any) {
    Logger.error('Error fetching upload ledger:', { error: error.message, adminId: req.user!.id });
    return res.status(500).json({ error: 'Failed to fetch upload ledger' });
  }
}));

export default uploadManagmentRouter;