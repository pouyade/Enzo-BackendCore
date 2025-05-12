import { Router } from "express";
import { MyRequestHandler } from "@/Helper/MyRequestHandler";
import { Logger } from "@/Helper/Logger";
import { getDiskInfo } from 'node-disk-info';
import mongoose from "mongoose";
import { User,Session,Payment,RequestLog } from "@/models";
import os from "os";
// Add activity endpoint
const analyticsRouter = Router();

analyticsRouter.get('/activity', MyRequestHandler(async (req,res)=>{
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const filter = req.query.filter as string || 'all';
    const skip = (page - 1) * limit;

    Logger.info('Fetching activities', { page, limit, filter });

    // Aggregate recent activities from various sources
    const activities = [];
    
    try {
      // Get user registrations
      const recentUsers = await User.find()
        .sort({ createdAt: -1 })
        .limit(5);

      Logger.info('Found recent users', { count: recentUsers.length });

      activities.push(...recentUsers.map(user => ({
        id: user._id.toString(),
        type: 'user',
        action: 'New user registration',
        status: 'success',
        user: user.email,
        details: 'User account created',
        timestamp: new Date(user.createdAt || Date.now()).toISOString()
      })));
    } catch (userError: any) {
      Logger.error('Error fetching recent users', { error: userError.message });
    }

    try {
      // Get recent sessions
      const recentSessions = await Session.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('userId', 'email');

      Logger.info('Found recent sessions', { count: recentSessions.length });

      activities.push(...recentSessions.map(session => ({
        id: (session._id as mongoose.Types.ObjectId).toString(),
        type: 'system',
        action: 'User session',
        status: session.isTerminated ? 'error' : 'success',
        user: (session.userId as any)?.email || 'Unknown',
        details: `Session ${session.isTerminated ? 'ended' : 'started'}`,
        timestamp: new Date(session.createdAt || Date.now()).toISOString()
      })));
    } catch (sessionError: any) {
      Logger.error('Error fetching recent sessions', { error: sessionError.message });
    }

    // Filter activities if needed
    let filteredActivities = activities;
    if (filter !== 'all') {
      filteredActivities = activities.filter(activity => activity.type === filter);
    }

    // Sort by timestamp
    filteredActivities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Implement pagination
    const paginatedActivities = filteredActivities.slice(skip, skip + limit);

    Logger.info('Sending activity response', { 
      totalActivities: filteredActivities.length,
      paginatedCount: paginatedActivities.length,
      page,
      limit
    });

    return res.status(200).json({
      activities: paginatedActivities,
      total: filteredActivities.length,
      page,
      limit
    });
  } catch (error: any) {
    Logger.error('Failed to get activity data', { 
      adminId: req.user!.id, 
      error: error.message,
      stack: error.stack 
    });
    return res.status(500).json({ message: 'Failed to get activity data', error: error.message });
  }
}));

// Add dashboard statistics endpoint
analyticsRouter.get('/stats', MyRequestHandler(async (req,res)=>{
  try {
    Logger.info('Fetching dashboard stats');

    // Get real user counts and trends
    const totalUsers = await User.countDocuments();
    Logger.info('Total users count', { totalUsers });

    const lastWeekUsers = await User.countDocuments({
      createdAt: { $gte: Date.now() - 7 * 24 * 60 * 60 * 1000 }
    });
    Logger.info('Last week users count', { lastWeekUsers });

    const userTrend = totalUsers > 0 ? (lastWeekUsers / totalUsers) * 100 : 0;

    // Get active sessions count as active jobs
    const activeJobs = await Session.countDocuments({ isTerminated: false });
    const completedJobs = await Session.countDocuments({ isTerminated: true });
    const totalJobs = activeJobs + completedJobs;
    const jobSuccessRate = totalJobs > 0 ? (completedJobs / totalJobs) * 100 : 100;

    Logger.info('Jobs stats', { activeJobs, completedJobs, jobSuccessRate });

    // Get subscription stats (if available)
    const activeSubscriptions = await User.countDocuments({ 'subscription.isActive': true });
    
    // Get revenue data from payments
    const lastMonthStart = new Date();
    lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);
    lastMonthStart.setDate(1);
    lastMonthStart.setHours(0, 0, 0, 0);

    const prevMonthStart = new Date(lastMonthStart);
    prevMonthStart.setMonth(prevMonthStart.getMonth() - 1);

    const lastMonthRevenue = await Payment.aggregate([
      {
        $match: {
          status: 'success',
          createdAt: { $gte: lastMonthStart.getTime() }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]).then(result => (result[0]?.total || 0));

    const prevMonthRevenue = await Payment.aggregate([
      {
        $match: {
          status: 'success',
          createdAt: {
            $gte: prevMonthStart.getTime(),
            $lt: lastMonthStart.getTime()
          }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]).then(result => (result[0]?.total || 0));

    const revenueTrend = prevMonthRevenue > 0 
      ? ((lastMonthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100 
      : 0;

    Logger.info('Revenue stats', { 
      lastMonthRevenue, 
      prevMonthRevenue, 
      revenueTrend,
      activeSubscriptions 
    });

    const stats = {
      totalUsers,
      userTrend,
      activeJobs,
      completedJobs,
      jobSuccessRate,
      monthlyRevenue: lastMonthRevenue,
      revenueTrend,
      activeSubscriptions
    };

    Logger.info('Sending stats response', { stats });
    return res.status(200).json(stats);
  } catch (error: any) {
    Logger.error('Failed to get dashboard stats', { 
      adminId: req.user!.id, 
      error: error.message,
      stack: error.stack 
    });
    return res.status(500).json({ message: 'Failed to get dashboard statistics', error: error.message });
  }
}));

// Add health metrics endpoint
analyticsRouter.get('/health', MyRequestHandler(async (req,res)=>{
  try {
    // Get CPU usage
    const cpus = os.cpus();
    const cpuCount = cpus.length;
    const cpuModel = cpus[0].model;
    const loadAvg = os.loadavg();
    const cpuUsage = (loadAvg[0] / cpuCount) * 100;

    // Get memory usage
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryUsage = (usedMemory / totalMemory) * 100;

    // Get disk usage
    const disks = await getDiskInfo();
    const rootDisk = disks.find(disk => disk.mounted === '/');
    const diskUsage = rootDisk ? ((rootDisk.blocks - rootDisk.available) / rootDisk.blocks) * 100 : 0;

    // Get uptime
    const uptimeSeconds = os.uptime();
    const days = Math.floor(uptimeSeconds / (24 * 60 * 60));
    const hours = Math.floor((uptimeSeconds % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((uptimeSeconds % (60 * 60)) / 60);
    const uptime = `${days}d ${hours}h ${minutes}m`;

    // Determine system status based on thresholds
    let systemStatus = 'Healthy';
    if (cpuUsage > 90 || memoryUsage > 90 || diskUsage > 90) {
      systemStatus = 'Critical';
    } else if (cpuUsage > 70 || memoryUsage > 70 || diskUsage > 70) {
      systemStatus = 'Warning';
    }

    Logger.info('Admin fetched health metrics', { adminId: req.user!.id });
    return res.status(200).json({
      systemStatus,
      uptime,
      cpu: {
        usage: Math.round(cpuUsage),
        cores: cpuCount,
        model: cpuModel,
        loadAverage: loadAvg
      },
      memory: {
        usage: Math.round(memoryUsage),
        total: totalMemory,
        free: freeMemory,
        used: usedMemory
      },
      disk: {
        usage: Math.round(diskUsage),
        total: rootDisk?.blocks || 0,
        free: rootDisk?.available || 0,
        used: rootDisk ? (rootDisk.blocks - rootDisk.available) : 0
      }
    });
  } catch (error: any) {
    Logger.error('Failed to get health metrics', { adminId: req.user!.id, error: error.message });
    return res.status(500).json({ message: 'Failed to get system health metrics' });
  }
}));


// Request Log Analytics
analyticsRouter.get('/requests', MyRequestHandler(async (req,res)=>{
  try {
    const { 
      startDate, 
      endDate, 
      sortBy = 'totalCount', // Default sort
      sortOrder = 'desc',   // Default order
      hasErrors // New parameter
    } = req.query;
    
    // Base match condition for timestamp
    const matchCondition: any = {};
    if (startDate) {
      matchCondition.timestamp = { $gte: parseInt(startDate as string) };
    }
    if (endDate) {
      matchCondition.timestamp = { ...matchCondition.timestamp, $lte: parseInt(endDate as string) };
    }

    // Aggregate pipeline for endpoint analytics
    const pipeline: any[] = [
      { $match: matchCondition },
      {
        $group: {
          _id: {
            endpoint: '$endpoint',
            method: '$method'
          },
          totalCount: { $sum: 1 },
          successCount: {
            $sum: {
              $cond: [{ $lt: ['$responseData.statusCode', 400] }, 1, 0]
            }
          },
          errorCount: {
            $sum: {
              $cond: [{ $gte: ['$responseData.statusCode', 400] }, 1, 0]
            }
          },
          avgDuration: { $avg: '$duration' },
          minDuration: { $min: '$duration' },
          maxDuration: { $max: '$duration' },
          statusCodes: {
            $addToSet: '$responseData.statusCode'
          }
        }
      },
      {
        $project: {
          _id: 0, // Remove the default _id
          endpoint: '$_id.endpoint',
          method: '$_id.method',
          totalCount: 1,
          successCount: 1,
          errorCount: 1,
          errorRate: {
            $cond: { // Avoid division by zero
              if: { $gt: ['$totalCount', 0] },
              then: { $multiply: [ { $divide: ['$errorCount', '$totalCount'] }, 100 ] },
              else: 0
            }
          },
          avgDuration: { $round: ['$avgDuration', 2] },
          minDuration: 1,
          maxDuration: 1,
          statusCodes: 1
        }
      }
    ];

    // Add filter stage if hasErrors is true
    if (hasErrors === 'true') {
      pipeline.push({ $match: { errorCount: { $gt: 0 } } });
    }

    // Add sorting stage
    const sortField = sortBy as string;
    const sortMultiplier = sortOrder === 'desc' ? -1 : 1;
    pipeline.push({ $sort: { [sortField]: sortMultiplier } });
    
    const analytics = await RequestLog.aggregate(pipeline);

    Logger.info('Admin fetched request analytics', { 
        adminId: req.user!.id,
        filters: { startDate, endDate, hasErrors },
        sort: { sortBy, sortOrder }
    });

    return res.status(200).json(analytics);
  } catch (error: any) {
    Logger.error('Failed to fetch request analytics', { adminId: req.user!.id, error: error.message });
    return res.status(500).json({ message: 'Failed to fetch request analytics' });
  }
}));

// Get detailed analytics for a specific endpoint
analyticsRouter.get('/requests/:endpoint', MyRequestHandler(async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const endpoint = decodeURIComponent(req.params.endpoint);

    // Base match condition
    const matchCondition: any = { endpoint };
    if (startDate) {
      matchCondition.timestamp = { $gte: parseInt(startDate as string) };
    }
    if (endDate) {
      matchCondition.timestamp = { ...matchCondition.timestamp, $lte: parseInt(endDate as string) };
    }

    // Get time series data
    const timeSeriesData = await RequestLog.aggregate([
      { $match: matchCondition },
      {
        $group: {
          _id: {
            date: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: { $toDate: '$timestamp' }
              }
            }
          },
          totalCount: { $sum: 1 },
          successCount: {
            $sum: {
              $cond: [{ $lt: ['$responseData.statusCode', 400] }, 1, 0]
            }
          },
          errorCount: {
            $sum: {
              $cond: [{ $gte: ['$responseData.statusCode', 400] }, 1, 0]
            }
          },
          avgDuration: { $avg: '$duration' }
        }
      },
      { $sort: { '_id.date': 1 } }
    ]);

    // Get error details
    const errorDetails = await RequestLog.aggregate([
      {
        $match: {
          ...matchCondition,
          'responseData.statusCode': { $gte: 400 }
        }
      },
      {
        $group: {
          _id: '$responseData.statusCode',
          count: { $sum: 1 },
          errors: {
            $push: {
              timestamp: '$timestamp',
              error: '$error',
              duration: '$duration',
              ip: '$ip'  // Include IP address
            }
          }
        }
      }
    ]);

    // Get request info and common IPs
    const requestInfo = await RequestLog.aggregate([
      { $match: matchCondition },
      {
        $facet: {
          // Get common body types
          bodyTypes: [
            { $match: { 'requestData.body': { $exists: true } } },
            { $project: { contentType: { $type: '$requestData.body' } } },
            { $group: { _id: '$contentType', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 },
            { $project: { _id: 0, type: '$_id' } }
          ],
          // Get common query parameters
          commonParams: [
            { $match: { 'requestData.query': { $exists: true } } },
            { $project: { params: { $objectToArray: '$requestData.query' } } },
            { $unwind: '$params' },
            { $group: { _id: '$params.k', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 },
            { $project: { _id: 0, param: '$_id' } }
          ],
          // Get common IPs
          commonIPs: [
            { $group: { _id: '$ip', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 },
            { $project: { _id: 0, ip: '$_id' } }
          ]
        }
      },
      {
        // Transform the results into a more usable format
        $project: {
          bodyTypes: { $map: { input: '$bodyTypes', as: 'type', in: '$$type.type' } },
          commonParams: { $map: { input: '$commonParams', as: 'param', in: '$$param.param' } },
          commonIPs: { $map: { input: '$commonIPs', as: 'ip', in: '$$ip.ip' } }
        }
      }
    ]);

    Logger.info('Admin fetched endpoint analytics details', { 
      adminId: req.user!.id, 
      endpoint, 
      dataPoints: timeSeriesData.length 
    });

    return res.status(200).json({
      timeSeriesData: timeSeriesData as any[],
      errorDetails: errorDetails as any[],
      requestInfo: requestInfo[0] || { bodyTypes: [], commonParams: [], commonIPs: [] }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    Logger.error('Failed to fetch endpoint analytics', { 
      adminId: req.user!.id, 
      endpoint: req.params.endpoint,
      error: errorMessage
    });
    return res.status(500).json({ message: 'Failed to fetch endpoint analytics' });
  }
}));

analyticsRouter.get('/daily-stats', MyRequestHandler(async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const totalUsers = await User.countDocuments({ isDeleted: false });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const activeToday = await User.countDocuments({
      lastLoginAt: { $gte: today },
      isDeleted: false
    });

    const dailyStats = [];
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const nextDate = new Date(date);
      nextDate.setDate(date.getDate() + 1);

      // Active users for this day
      const activeUsers = await User.countDocuments({
        lastLoginAt: { $gte: date, $lt: nextDate },
        isDeleted: false
      });

      // New registrations for this day
      const newUsers = await User.countDocuments({
        createdAt: { $gte: date, $lt: nextDate },
        isDeleted: false
      });

      dailyStats.unshift({
        date: date.toISOString().split('T')[0],
        activeUsers,
        newUsers
      });
    }

    // Calculate growth rate
    const currentPeriodUsers = dailyStats.reduce((sum, stat) => sum + stat.newUsers, 0);
    const previousStartDate = new Date();
    previousStartDate.setDate(previousStartDate.getDate() - (days * 2));
    const previousPeriodUsers = await User.countDocuments({
      createdAt: { 
        $gte: previousStartDate,
        $lt: new Date(Date.now() - (days * 24 * 60 * 60 * 1000))
      },
      isDeleted: false
    });
    
    const growthRate = previousPeriodUsers === 0 
      ? 100 
      : ((currentPeriodUsers - previousPeriodUsers) / previousPeriodUsers) * 100;

    // Calculate average daily active users
    const avgDailyActiveUsers = Math.round(
      dailyStats.reduce((sum, stat) => sum + stat.activeUsers, 0) / days
    );

    Logger.info('Daily user stats fetched', {
      days,
      totalUsers,
      activeToday,
      growthRate
    });

    return res.json({
      dailyStats,
      totalUsers,
      activeToday,
      growthRate: Math.round(growthRate * 100) / 100,
      avgDailyActiveUsers
    });
  } catch (error) {
    Logger.error('Failed to fetch daily user stats', { error });
    return res.status(500).json({ error: 'Failed to fetch user statistics' });
  }
}));

export default analyticsRouter;