import express, { Application, ErrorRequestHandler, Request, Response, NextFunction } from 'express';
import { Database } from '@/Database';
import path from 'path';
import bcrypt from 'bcrypt';
import winston from 'winston';
import cors from 'cors';
import http from 'http';
import userRoutes from '@/routes/user/UserRoutes';
import adminRoutes from '@/routes/admin/AdminRoutes';
import logRoutes from '@/routes/app/LogRoutes';
import appRoutes from '@/routes/app/AppRoutes';
import authRoutes from '@/routes/user/AuthRoutes';
import messageRoutes from '@/routes/user/MessageRoute';
import notificationRouter from '@/routes/user/NotificationRoutes';
import { Config } from '@/config';
import { getLogsDir } from '@/Helper/FileStorage';
import { requestLogger } from '@/middleware/requestLogger';
import { User } from '@/models/User';
import { initializeDefaults } from '@/defaults/initializeDefaults';
import { Session } from '@/models/Session';
import { Logger } from './Helper/Logger';

const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
const SESSION_RETENTION_DAYS = 30; // Keep terminated sessions for 30 days


const app: Application = express();

// Fix for rate limiting security issue
// Instead of trusting all proxies, we'll only trust the specific proxy IPs
// This prevents IP spoofing attacks against rate limiting
app.set('trust proxy', (ip: string) => {
  // Only trust localhost and internal network IPs
  // You can customize this list based on your infrastructure
  const trustedIPs = ['127.0.0.1', '::1', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'];
  
  // Check if the IP is in the trusted list
  return trustedIPs.some(trustedIP => {
    if (trustedIP.includes('/')) {
      // Handle CIDR notation
      const [subnet, bits] = trustedIP.split('/');
      const ipParts = ip.split('.').map(Number);
      const subnetParts = subnet.split('.').map(Number);
      const mask = ~((1 << (32 - Number(bits))) - 1);
      
      const ipNum = (ipParts[0] << 24) + (ipParts[1] << 16) + (ipParts[2] << 8) + ipParts[3];
      const subnetNum = (subnetParts[0] << 24) + (subnetParts[1] << 16) + (subnetParts[2] << 8) + subnetParts[3];
      
      return (ipNum & mask) === (subnetNum & mask);
    } else {
      return ip === trustedIP;
    }
  });
});

const logDir = getLogsDir();
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: path.join(logDir, 'error.log'), level: 'error' }),
    new winston.transports.File({ filename: path.join(logDir, 'combined.log') }),
  ],
});

const isDebug = process.env.NODE_ENV === 'development';



app.use(cors());

// Increase payload size limits for file uploads
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ limit: '5mb', extended: true }));

app.use(requestLogger());

// Return 404 for root endpoints
app.get('/', (req, res) => {
  res.status(200).send('');
});

app.post('/', (req, res) => {
  res.status(200).send('');
});

app.use('/admin', adminRoutes);
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
app.use('/avatars', express.static(path.join(process.cwd(), 'uploads', 'avatars')));
app.use('/auth', authRoutes);
app.use('/user', userRoutes);
app.use('/app', appRoutes);
app.use('/notifications', notificationRouter);
app.use('/messages', messageRoutes);
app.use('/logs', logRoutes);

const createInitialAdmin = async (username:string,email:string,password:string): Promise<void> => {
  try {
    const existingAdmin = await User.findOne({ email: email });
    if (existingAdmin) {
      return;
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const admin = new User({
      username: username,
      email: email,
      isVerified: true,
      password: hashedPassword,
      isAdmin: true,
    });
    await admin.save();
    logger.info('Initial admin created successfully');
  } catch (error: any) {
    logger.error('Failed to create initial admin', { error: error.message });
  }
};

const errorHandler: ErrorRequestHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });
  
  if (res.headersSent) {
    return next(err);
  }
  
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: err.message || 'Something went wrong'
  });
};

app.use(errorHandler);

const connectDB = async () => {
  try {
    await Database.initialize(logger);
    await initializeDefaults();
    await createInitialAdmin("admin","admin@domain.com","adminPass@123457");

    logger.info('App initialization completed');
  } catch (error: any) {
    logger.error('App initialization failed:', { error: error.message });
    process.exit(1);
  }
};

const startServer = async () => {
  try {
    Config.loadConfig();
    await connectDB();
    
    if (!Database.isConnected()) {
      throw new Error('Database connection not established');
    }
    startSessionCleanup();
    const PORT = Config.getInstance().port;
    // if (isDebug) {
      // Create HTTP server for development
      const httpServer = http.createServer(app);
      httpServer.listen(PORT, () => {
        console.log(`HTTP Server running on port ${PORT} (Debug Mode)`);
      });
    // } else {
    //   // Create HTTPS server for production
    //   const httpsServer = https.createServer(sslOptions, app);
    //   httpsServer.listen(PORT, () => {
    //     console.log(`HTTPS Server running on port ${PORT}`);
    //   });
    // }
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle process termination
process.on('SIGINT', async () => {
  await Database.disconnect();
  process.exit(0);
});

// Start the server if this file is run directly
if (require.main === module) {
  startServer();
}





export const startSessionCleanup = () => {
  setInterval(async () => {
    try {
      const cutoffDate = Date.now() - (SESSION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
      
      const result = await Session.deleteMany({
        isTerminated: true,
        lastActive: { $lt: cutoffDate }
      });

      Logger.info('Session cleanup completed', {
        deletedCount: result.deletedCount,
        cutoffDate: new Date(cutoffDate).toISOString()
      });
    } catch (error) {
      Logger.error('Session cleanup failed', { error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }, CLEANUP_INTERVAL);

  // Logger.info('Session cleanup job started', {
  //   interval: CLEANUP_INTERVAL,
  //   retentionDays: SESSION_RETENTION_DAYS
  // });
}; 

export { app, connectDB, createInitialAdmin, logger, startServer };