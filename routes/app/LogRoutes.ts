import express, { Request, Response, Router, RequestHandler } from 'express';
import { Log, ILog } from '@/models/Log';
import { Logger } from '@/Helper/Logger';
import { apiLimiter } from '@/middleware/rateLimiter';


const logRouter = express.Router();
logRouter.use(apiLimiter);

// Submit logs endpoint
logRouter.post('/upload', express.text({ type: '*/*', limit: '10mb' }), (async (req: Request, res: Response) => {
  try {
    // Get metadata from query parameters
    const data = req.body;

    // Transform flat structure to nested
    const logData = new Log({
      timestamp: Date.now(),
      installationId: data['installationId'],
      device: {
        model: data['device.model'],
        manufacturer: data['device.manufacturer'],
        os: data['device.os'],
        osVersion: data['device.osVersion'],
        screenSize: data['device.screenSize'],
        appVersion: data['device.appVersion'],
        appBuild: data['device.appBuild'],
      },
      metadata: {
        logFileName: data['metadata.logFileName'],
        logFileSize: data['metadata.logFileSize'],
        timestamp: data['metadata.timestamp']
      },
      context: {
        route: data['context.route'],
        action: data['context.action'],
        networkType: data['context.networkType'],
        batteryLevel: Number(data['context.batteryLevel'])
      }
    });
    logData.setLogContent(data['logContent']);
    await logData.save();
    res.status(202).json({ message: 'Log saved' });
  } catch (error: any) {
    Logger.error('Failed to process logs', { error: error.message });
    res.status(500).json({ message: 'Failed to process logs' });
  }
}) as RequestHandler);



export default logRouter;