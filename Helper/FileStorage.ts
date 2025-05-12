import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Config } from '@/config';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { FileUploadLedger, IFileUploadLedger } from '@/models/FileUploadLedger';
import mongoose from 'mongoose';
import multer from 'multer';

export class FileStorage {
  private appDir: string;
  private uploadDir: string;
  private avatarsDir: string;
  private iconsDir: string;
  private baseUrl: string;
  private messagesDir: string;
  private othersDir: string;
  constructor() {
    const config = Config.getInstance();
    this.baseUrl = config.server.baseUrl;
    this.appDir = config.storage.appDir;
    this.uploadDir = path.join(this.appDir, config.storage.uploadsDir);
    this.messagesDir = path.join(this.uploadDir, config.storage.messagesDir);
    this.avatarsDir = path.join(this.uploadDir, config.storage.avatarsDir);
    this.iconsDir = path.join(this.uploadDir, config.storage.iconsDir);
    this.othersDir = path.join(this.uploadDir, config.storage.othersDir);
    this.ensureDirectoryExists(this.uploadDir);
    this.ensureDirectoryExists(this.avatarsDir);
    this.ensureDirectoryExists(this.iconsDir);
    this.ensureDirectoryExists(this.messagesDir);
    this.ensureDirectoryExists(this.othersDir);
  }

  private ensureDirectoryExists(directory: string): void {
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }
  }

  // async uploadImage(buffer: Buffer, mimeType: string): Promise<{ filename: string; path: string; url: string }> {
  //   // Generate unique filename
  //   const hash = crypto.createHash('md5').update(buffer).digest('hex');
  //   const ext = mimeType.split('/')[1];
  //   const filename = `${hash}-${Date.now()}.${ext}`;
    
  //   // Write file
  //   const filePath = path.join(this.uploadDir, filename);
  //   await fs.promises.writeFile(filePath, buffer);
    
  //   return filePath;
  // }

  async uploadMessagePhoto(buffer: Buffer, mimeType: string): Promise<{ filename: string; path: string; url: string; width: number; height: number }> {
    // Generate unique filename
    const hash = crypto.createHash('md5').update(buffer).digest('hex');
    const ext = mimeType.split('/')[1];
    const filename = `${hash}-${Date.now()}.${ext}`;
    
    // Write file
    const filePath = path.join(this.messagesDir, filename);
    await fs.promises.writeFile(filePath, buffer);
    const dimensions = await sharp(buffer).metadata();
    return {
      filename: filename,
      path: filePath,
      url: `${Config.getInstance().storage.uploadsDir}/${Config.getInstance().storage.messagesDir}/${filename}`,
      width: dimensions.width || 0,
      height: dimensions.height || 0
    };
  }

  /**
   * Upload an avatar image with optimizations
   * @param buffer Image buffer
   * @param mimeType Image mime type
   * @returns Object containing the URL and key for the stored file
   */
  async uploadAvatar(buffer: Buffer): Promise<{ filename: string; path: string; url: string; width: number; height: number , isExternal: boolean}> {  
    try {
      // Process the image: resize and convert to webp format
      const processedImage = await sharp(buffer)
        .resize(250, 250, {
          fit: 'cover',
          position: 'center'
        })
        .webp({ quality: 80 })
        .toBuffer();
      
      // Generate unique filename
      const fileName = `${uuidv4()}.webp`;
      const filePath = path.join(this.avatarsDir, fileName);
      const dimensions = await sharp(buffer).metadata();

      await fs.promises.writeFile(filePath, processedImage);
      return {
        filename: fileName,
        path: filePath,
        url: `${Config.getInstance().storage.uploadsDir}/${Config.getInstance().storage.avatarsDir}/${fileName}`,
        width: dimensions.width || 0,
        height: dimensions.height || 0,
        isExternal: false
      };
    } catch (error) {
      console.error('Error uploading avatar:', error);
      throw new Error('Failed to process and upload avatar image');
    }
  }

  /**
   * Upload an icon image
   * @param buffer Image buffer
   * @param mimeType Image mime type
   * @returns The filename of the uploaded icon
   */
  async uploadIcon(buffer: Buffer, mimeType: string): Promise<{ filename: string; path: string; url: string; width: number; height: number }> {
    const extension = mimeType.split('/')[1];
    const filename = `${uuidv4()}.${extension}`;
    const filePath = path.join(this.iconsDir, filename);

    await fs.promises.writeFile(filePath, buffer);
    const dimensions = await sharp(buffer).metadata();
    return {
      filename: filename,
      path: filePath,
      url: `${Config.getInstance().storage.uploadsDir}/${Config.getInstance().storage.iconsDir}/${filename}`,
      width: dimensions.width || 0,
      height: dimensions.height || 0
    };
  }

  getImageUrl(filename: string): string {
    return `${this.baseUrl}/uploads/${filename}`;
  }

  async deleteImage(filename: string): Promise<void> {
    const filePath = path.join(this.uploadDir, filename);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }

  /**
   * Save a file and record it in the ledger
   */
  async saveFile(
    file: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
      size: number;
    },
    type: 'avatars' | 'messages' | 'others' | 'icons',
    userId?: string,
    adminId?: string
  ): Promise<{ filename: string }> {
    try {
      const filename = this.generateUniqueFilename(file.originalname);
      const targetDir = this.getDirectoryForType(type);
      const filePath = path.join(targetDir, filename);

      // Ensure directory exists
      await fs.promises.mkdir(targetDir, { recursive: true });

      // Write file
      await fs.promises.writeFile(filePath, file.buffer);

      // Create ledger entry
      await FileUploadLedger.create({
        filename,
        originalFilename: file.originalname,
        fileType: type,
        mimeType: file.mimetype,
        fileSize: file.size,
        userId: userId ? new mongoose.Types.ObjectId(userId) : undefined,
        adminId: adminId ? new mongoose.Types.ObjectId(adminId) : undefined,
        isActive: true
      });

      return { filename };
    } catch (error) {
      console.error('Error saving file:', error);
      throw error;
    }
  }

  /**
   * Delete a file and update the ledger
   */
  async deleteFileFromDirectory(type: string, filename: string, deletedBy?: string): Promise<void> {
    try {
      const dir = this.getDirectoryForType(type);
      const filePath = path.join(dir, filename);

      // Delete physical file if it exists
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }

      // Update ledger
      await FileUploadLedger.markAsDeleted(filename, deletedBy);
    } catch (error) {
      console.error(`Error deleting file ${filename}:`, error);
      throw error;
    }
  }

  private getDirectoryForType(type: string): string {
    const directories: { [key: string]: string } = {
      avatars: this.avatarsDir,
      messages: this.messagesDir,
      others: this.othersDir,
      icons: this.iconsDir
    };

    const dir = directories[type];
    if (!dir) {
      throw new Error(`Invalid directory type: ${type}`);
    }

    return dir;
  }

  /**
   * @deprecated Use deleteFileFromDirectory instead
   */
  async deleteFile(filename: string): Promise<void> {
    try {
      // Check in all possible directories
      const directories = {
        avatars: this.avatarsDir,
        icons: this.iconsDir,
        messages: this.messagesDir,
        others: this.othersDir
      };

      for (const [type, dir] of Object.entries(directories)) {
        const filePath = path.join(dir, filename);
        if (fs.existsSync(filePath)) {
          await fs.promises.unlink(filePath);
          return;
        }
      }

      throw new Error('File not found in any upload directory');
    } catch (error) {
      console.error(`Error deleting file ${filename}:`, error);
      throw new Error('Failed to delete file');
    }
  }

  /**
   * Upload any type of file to the others directory
   * @param buffer File buffer
   * @param originalname Original file name
   * @param mimeType File mime type
   * @returns Object containing file information
   */
  async uploadOtherFile(buffer: Buffer, originalname: string, mimeType: string): Promise<{ 
    filename: string; 
    path: string; 
    url: string; 
    size: number;
    mimeType: string;
  }> {
    try {
      // Keep original file extension
      const ext = path.extname(originalname);
      const filename = `${uuidv4()}${ext}`;
      const filePath = path.join(this.othersDir, filename);

      await fs.promises.writeFile(filePath, buffer);
      const stats = await fs.promises.stat(filePath);

      return {
        filename,
        path: filePath,
        url: `${Config.getInstance().storage.uploadsDir}/others/${filename}`,
        size: stats.size,
        mimeType
      };
    } catch (error) {
      console.error('Error uploading file:', error);
      throw new Error('Failed to upload file');
    }
  }

  private generateUniqueFilename(originalname: string): string {
    const ext = path.extname(originalname);
    return `${uuidv4()}${ext}`;
  }
}

export const getLogsDir = (): string => {
  const logDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  return logDir;
};

// export const upload = multer({
//   storage: multer.memoryStorage(),
//   limits: {
//     fileSize: 5 * 1024 * 1024
//   },
//   fileFilter: (req, file, cb) => {
//     if (!file.mimetype.startsWith('image/')) {
//       return cb(new Error('Only images are allowed'));
//     }
//     cb(null, true);
//   }
// });
export const fileStorage = new FileStorage(); 