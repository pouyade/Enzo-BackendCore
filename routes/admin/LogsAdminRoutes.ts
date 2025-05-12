// Admin endpoint to query logs
import { Router,Request,Response } from "express";
import { MyRequestHandler } from "@/Helper/MyRequestHandler";
import { Logger } from "@/Helper/Logger";
import { RequestLog, Log } from '@/models';
const logsAdminRouter = Router();

logsAdminRouter.get('/query', MyRequestHandler(async (req: Request, res: Response) => {
  try {
    const {
      userId,
      startDate,
      endDate,
      deviceOs,
      appVersion,
      limit = 100,
      page = 1
    } = req.query;

    const query: any = {};

    if (userId) query.userId = userId;
    if (deviceOs) query['device.os'] = deviceOs;
    if (appVersion) query['device.appVersion'] = appVersion;

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate as string).getTime();
      if (endDate) query.timestamp.$lte = new Date(endDate as string).getTime();
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [logs, total] = await Promise.all([
      Log.find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Log.countDocuments(query)
    ]);

    return res.json({
      logs,
      pagination: {
        current: Number(page),
        pages: Math.ceil(total / Number(limit)),
        total
      }
    });
  } catch (error: any) {
    Logger.error('Failed to query logs', { error: error.message });
    return res.status(500).json({ message: 'Failed to query logs' });
  }
}));

// Log management routes

logsAdminRouter.get('/logs/:id/content', MyRequestHandler(async (req,res)=>{
  try {
    const log = await Log.findById(req.params.id);
    if (!log) {
      return res.status(404).json({ error: 'Log not found' });
    }
    
    // Get the decompressed content using the virtual getter
    const content = await log.logContent;
    
    if (!content) {
      return res.json({ content: 'No log content available' });
    }
    
    return res.json({ content });
  } catch (err) {
    console.error('Error fetching log content:', err);
    return res.status(500).json({ error: 'Failed to fetch log content' });
  }
})); 

logsAdminRouter.get('/logs', MyRequestHandler(async (req,res)=>{
  try {
    const logs = await Log.find()
      .select('-logContent')
      .sort({ timestamp: -1 })
      .limit(1000);  // Limit to last 1000 logs for performance

    return res.json(logs);
  } catch (error: any) {
    Logger.error('Failed to fetch logs', { error: error.message });
    return res.status(500).json({ message: 'Failed to fetch logs' });
  }
}));
logsAdminRouter.delete('/logs', MyRequestHandler(async (req,res)=>{
  try {
    await Log.deleteMany({});
    return res.json({ message: 'All logs cleared successfully' });
  } catch (error: any) {
    Logger.error('Failed to clear logs', { error: error.message });
    return res.status(500).json({ message: 'Failed to clear logs' });
  }
}));
logsAdminRouter.get('/logs/installations', MyRequestHandler(async (req,res)=>{
  try {
    const installations = await Log.distinct('installationId');
    return res.json(installations);
  } catch (error: any) {
    Logger.error('Failed to fetch installations', { error: error.message });
    return res.status(500).json({ message: 'Failed to fetch installations' });
  }
}));
logsAdminRouter.get('/logs/stats', MyRequestHandler(async (req,res)=>{
  try {
    const [totalLogs, installations, deviceTypes] = await Promise.all([
      Log.countDocuments(),
      Log.distinct('installationId'),
      Log.distinct('device.model')
    ]);

    const recentLogs = await Log.find()
      .sort({ timestamp: -1 })
      .limit(100);

    const osVersions = new Set(recentLogs.map(log => `${log.device.os} ${log.device.osVersion}`));
    const appVersions = new Set(recentLogs.map(log => log.device.appVersion));

    return res.json({
      totalLogs,
      uniqueInstallations: installations.length,
      uniqueDevices: deviceTypes.length,
      osVersions: Array.from(osVersions),
      appVersions: Array.from(appVersions)
    });
  } catch (error: any) {
    Logger.error('Failed to fetch log stats', { error: error.message });
    return res.status(500).json({ message: 'Failed to fetch log stats' });
  }
}));

logsAdminRouter.delete('/logs/:id', MyRequestHandler(async (req,res)=>{
  try {
    const log = await Log.findByIdAndDelete(req.params.id);
    if (!log) {
      Logger.warn('Log not found for deletion', { adminId: req.user!.id, logId: req.params.id });
      return res.status(404).json({ error: 'Log not found' });
    }

    Logger.info('Admin deleted log', { adminId: req.user!.id, logId: req.params.id });
    return res.json({ message: 'Log deleted successfully' });
  } catch (err) {
    Logger.error('Failed to delete log', { adminId: req.user!.id, logId: req.params.id, error: err });
    return res.status(500).json({ error: 'Failed to delete log' });
  }
}));


logsAdminRouter.get('/request-logs', MyRequestHandler(async (req,res)=>{
  try {
    const {
      startDate,
      endDate,
      method,
      statusCode,
      endpoint,
      userId,
      userAgent, // Add userAgent parameter
      ip, // Add IP parameter
      error,
      minDuration,
      maxDuration,
      tags,
      page = 1,
      limit = 50,
      sort = '-timestamp'
    } = req.query;

    const query: any = {};

    // Apply filters
    if (startDate) {
      query.timestamp = { $gte: parseInt(startDate as string) };
    }
    if (endDate) {
      query.timestamp = { ...query.timestamp, $lte: parseInt(endDate as string) };
    }
    if (method) {
      query.method = method;
    }
    if (statusCode) {
      query['responseData.statusCode'] = parseInt(statusCode as string);
    }
    if (endpoint) {
      query.endpoint = { $regex: endpoint, $options: 'i' };
    }
    if (userId) {
      query.userId = userId;
    }
    // Add userAgent filter with case-insensitive regex
    if (userAgent) {
      query.userAgent = { $regex: userAgent, $options: 'i' };
    }
    // Add IP filter
    if (ip) {
      query.ip = { $regex: ip, $options: 'i' };
    }
    if (error === 'true') {
      query.error = { $exists: true };
    }
    if (minDuration) {
      query.duration = { $gte: parseInt(minDuration as string) };
    }
    if (maxDuration) {
      query.duration = { ...query.duration, $lte: parseInt(maxDuration as string) };
    }
    if (tags) {
      query.tags = { $in: (tags as string).split(',') };
    }

    // Count total documents for pagination
    const total = await RequestLog.countDocuments(query);

    // Get paginated results
    const logs = await RequestLog.find(query)
      .sort(sort as string)
      .skip((parseInt(page as string) - 1) * parseInt(limit as string))
      .limit(parseInt(limit as string))
      .populate('userId', 'email name');

    Logger.info('Admin fetched request logs', { 
      adminId: req.user!.id, 
      filters: { startDate, endDate, method, statusCode, endpoint, userId, userAgent, ip, error, minDuration, maxDuration, tags },
      total
    });

    return res.status(200).json({
      logs,
      pagination: {
        total,
        page: parseInt(page as string),
        pages: Math.ceil(total / parseInt(limit as string))
      }
    });
  } catch (error: any) {
    Logger.error('Failed to fetch request logs', { adminId: req.user!.id, error: error.message });
    return res.status(500).json({ error: error.message });
  }
}));
logsAdminRouter.get('/request-logs/stats', MyRequestHandler(async (req,res)=>{
  try {
    const { startDate, endDate } = req.query;

    const timeRange: any = {};
    if (startDate) {
      timeRange.$gte = parseInt(startDate as string);
    }
    if (endDate) {
      timeRange.$lte = parseInt(endDate as string);
    }

    const query = Object.keys(timeRange).length > 0 ? { timestamp: timeRange } : {};

    const [
      totalRequests,
      averageDuration,
      statusCodeStats,
      methodStats,
      errorCount,
      endpointStats
    ] = await Promise.all([
      RequestLog.countDocuments(query),
      RequestLog.aggregate([
        { $match: query },
        { $group: { _id: null, avg: { $avg: '$duration' } } }
      ]),
      RequestLog.aggregate([
        { $match: query },
        { $group: { _id: '$responseData.statusCode', count: { $sum: 1 } } }
      ]),
      RequestLog.aggregate([
        { $match: query },
        { $group: { _id: '$method', count: { $sum: 1 } } }
      ]),
      RequestLog.countDocuments({ ...query, error: { $exists: true } }),
      RequestLog.aggregate([
        { $match: query },
        { $group: { _id: '$endpoint', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ])
    ]);

    Logger.info('Admin fetched request log statistics', { 
      adminId: req.user!.id, 
      filters: { startDate, endDate },
      stats: { totalRequests, errorCount }
    });

    return res.status(200).json({
      totalRequests,
      averageDuration: averageDuration[0]?.avg || 0,
      statusCodeStats: statusCodeStats.reduce((acc: any, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {}),
      methodStats: methodStats.reduce((acc: any, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {}),
      errorCount,
      topEndpoints: endpointStats
    });
  } catch (error: any) {
    Logger.error('Failed to fetch request log statistics', { adminId: req.user!.id, error: error.message });
    return res.status(500).json({ error: error.message });
  }
}));
logsAdminRouter.get('/request-logs/chart-data', MyRequestHandler(async (req,res)=>{
  try {
    const { timeframe = 'day' } = req.query;


    // Calculate time ranges based on timeframe
    const now = new Date(); // Use Date object for easier manipulation
    let startTime: Date;
    let groupByFormat: string;
    let intervalMs: number;
    let outputFormatOptions: Intl.DateTimeFormatOptions; // For formatting output timestamps

    switch (timeframe) {
      case 'hour':
        startTime = new Date(now.getTime() - 60 * 60 * 1000); // 1 hour ago
        groupByFormat = '%Y-%m-%d %H:%M'; // Group by minute
        intervalMs = 5 * 60 * 1000; // 5-minute intervals
        outputFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false };
        break;
      case 'day':
      default: // Default to day
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago
        groupByFormat = '%Y-%m-%d %H'; // Group by hour
        intervalMs = 60 * 60 * 1000; // 1-hour intervals
        outputFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false };
        break;
      case 'week':
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
        groupByFormat = '%Y-%m-%d'; // Group by day
        intervalMs = 24 * 60 * 60 * 1000; // 1-day intervals
        outputFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit' };
        break;
      case 'month':
        startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
        groupByFormat = '%Y-%m-%d'; // Group by day
        intervalMs = 24 * 60 * 60 * 1000; // 1-day intervals
        outputFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit' };
        break;
    }

    const startTimeMs = startTime.getTime(); // Use milliseconds for DB query


    // First, check if we have any logs in the time range
    const logCount = await RequestLog.countDocuments({ timestamp: { $gte: startTimeMs } });

    if (logCount === 0) {
      console.log('No logs found in the time range, returning empty data');
      // Still generate empty slots for the chart
    }

    // Query for duration data
    const durationData = await RequestLog.aggregate([
      {
        $match: {
          timestamp: { $gte: startTimeMs }
        }
      },
      {
        $group: {
          _id: { // Use the calculated start time of the interval
            $subtract: [
              '$timestamp',
              { $mod: ['$timestamp', intervalMs] }
            ]
          },
          avgDuration: { $avg: '$duration' },
          minDuration: { $min: '$duration' },
          maxDuration: { $max: '$duration' },
          count: { $sum: 1 },
          successCount: {
            $sum: {
              $cond: [
                { $and: [
                  { $gte: ['$responseData.statusCode', 200] },
                  { $lt: ['$responseData.statusCode', 400] }
                ]},
                1,
                0
              ]
            }
          }
        }
      },
      { $sort: { '_id': 1 } } // Sort by the timestamp interval start
    ]);

    // Create a Map for efficient lookup of aggregated data
    const dataMap = new Map(durationData.map(item => [
      item._id, // Key is the interval start timestamp (ms)
      {
        avgDuration: Math.round(item.avgDuration || 0),
        minDuration: item.minDuration || 0,
        maxDuration: item.maxDuration || 0,
        requestCount: item.count,
        successCount: item.successCount,
        successRate: Math.round((item.count > 0 ? (item.successCount / item.count) * 100 : 0) * 100) / 100
      }
    ]));

    // --- Corrected Gap Filling Logic ---
    const filledChartData = [];
    // Align loop start time to the beginning of an interval
    let currentIntervalStart = startTimeMs - (startTimeMs % intervalMs);
    const nowMs = now.getTime();

    while (currentIntervalStart <= nowMs) {
      const existingData = dataMap.get(currentIntervalStart);

      // Format the timestamp for the response label
      const formattedTimestamp = new Date(currentIntervalStart).toLocaleString('sv-SE', outputFormatOptions); // Use Swedish locale for YYYY-MM-DD HH:mm format consistency

      if (existingData) {
        filledChartData.push({
          timestamp: formattedTimestamp,
          ...existingData
        });
      } else {
        filledChartData.push({
          timestamp: formattedTimestamp,
          avgDuration: 0,
          minDuration: 0,
          maxDuration: 0,
          requestCount: 0,
          successCount: 0,
          successRate: 0
        });
      }

      currentIntervalStart += intervalMs;
    }


    Logger.info('Admin fetched chart data', {
      adminId: req.user!.id,
      timeframe,
      dataPoints: filledChartData.length,
      foundLogs: logCount
    });

    return res.status(200).json({
      timeframe,
      data: filledChartData
    });
  } catch (error: any) {
    console.error('Error in chart-data endpoint:', error);
    Logger.error('Error fetching chart data', { adminId: req.user!.id, error: error.message });
    return res.status(500).json({ error: error.message });
  }
}));
logsAdminRouter.get('/request-logs/:id', MyRequestHandler(async (req,res)=>{
  try {
    const log = await RequestLog.findById(req.params.id)
      .populate('userId', 'email name');
    
    if (!log) {
      Logger.warn('Request log not found', { adminId: req.user!.id, logId: req.params.id });
      return res.status(404).json({ error: 'Log not found' });
    }

    Logger.info('Admin fetched specific request log', { adminId: req.user!.id, logId: req.params.id });
    return res.status(200).json(log);
  } catch (error: any) {
    Logger.error('Failed to fetch specific request log', { adminId: req.user!.id, logId: req.params.id, error: error.message });
    return res.status(500).json({ error: error.message });
  }
}));
logsAdminRouter.delete('/request-logs/clear', MyRequestHandler(async (req,res)=>{
  try {
    const result = await RequestLog.deleteMany({});
    
    Logger.info('Admin cleared all request logs', { 
      adminId: req.user!.id, 
      deletedCount: result.deletedCount 
    });
    
    return res.status(200).json({ 
      message: 'All request logs cleared successfully',
      deletedCount: result.deletedCount
    });
  } catch (error: any) {
    Logger.error('Failed to clear request logs', { 
      adminId: req.user!.id, 
      error: error.message 
    });
    return res.status(500).json({ message: 'Failed to clear request logs' });
  }
}));

export default logsAdminRouter;