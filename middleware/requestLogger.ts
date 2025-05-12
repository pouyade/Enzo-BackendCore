import { Request, Response, NextFunction } from 'express';
import { Database } from '../Database';
import { RequestLog } from '../models';
export const requestLogger = () => {
  console.log('Request logger middleware initialized');
  
  return async (req: Request, res: Response, next: NextFunction) => {
    // Only log requests that start with '/user' or '/admin' or '/api'
    // if (!req.originalUrl.startsWith('/user') && !req.originalUrl.startsWith('/admin') && !req.originalUrl.startsWith('/api')) {
    //   return next();
    // }
    if(req.originalUrl.startsWith('/avatars') || req.originalUrl.startsWith('/uploads')){ 
      return next();
    }
    
    const startTime = Date.now();
    const originalJson = res.json;
    const originalSend = res.send;
    let responseBody: any;

    res.json = function (body: any) {
      responseBody = body;
      return originalJson.call(this, body);
    };

    res.send = function (body: any) {
      responseBody = body;
      return originalSend.call(this, body);
    };

    // Handle response finishing
    res.on('finish', async () => {
      try {
        const duration = Date.now() - startTime;
        // Check if database is connected before trying to save
        if (!Database.isConnected()) {
          console.error('Database not connected, skipping request log');
          return;
        }

        // Create log entry
        const logEntry = {
          timestamp: startTime,
          method: req.method as any,
          endpoint: req.originalUrl,
          userId: (req as any).user?.id, // Changed from _id to id to match the format in the request object
          requestData: {
            body: req.body,
            query: req.query,
            params: req.params
          },
          responseData: {
            statusCode: res.statusCode,
            body: responseBody
          },
          duration,
          ip: req.ip || '127.0.0.1',
          userAgent: req.get('user-agent'),
          tags: [(req as any).routeTag] // Optional tag from route
        };

        await RequestLog.create(logEntry);
      } catch (error: any) {
        console.error('Error logging request:', error.message, error.stack);
      }
    });

    // Error handling
    const handleError = async (error: any) => {
      try {
        const duration = Date.now() - startTime;
        console.log(`Request error: ${req.method} ${req.originalUrl} - ${error.message}`);
        
        // Check if database is connected before trying to save
        if (!Database.isConnected()) {
          console.error('Database not connected, skipping error log');
          return;
        }
        
        await RequestLog.create({
          timestamp: startTime,
          method: req.method as any,
          endpoint: req.originalUrl,
          userId: (req as any).user?.id, // Changed from _id to id
          requestData: {
            body: req.body,
            query: req.query,
            params: req.params
          },
          responseData: {
            statusCode: res.statusCode,
            body: responseBody
          },
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack,
            code: error.code
          },
          duration,
          ip: req.ip || '127.0.0.1',
          userAgent: req.get('user-agent'),
          tags: [(req as any).routeTag, 'error']
        });
        console.log('Error log entry created successfully');
      } catch (logError: any) {
        console.error('Error logging error:', logError.message, logError.stack);
      }
    };

    // Handle errors
    res.on('error', handleError);

    // Continue with request
    try {
      await next();
    } catch (error: any) {
      await handleError(error);
      throw error;
    }
  };
}; 