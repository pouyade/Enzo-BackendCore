// Crash Report Management Endpoints

import { Router } from "express";
import { MyRequestHandler } from "@/Helper/MyRequestHandler";
import { CrashBug,CrashReport } from "@/models";
import { Logger } from "@/Helper/Logger";
import { Message } from "@/models";
const bugManagmentRouter = Router();

bugManagmentRouter.get('/crash-reports',  MyRequestHandler(async (req, res) => {
  const query: any = {}
  
  if (req.query.platform) {
    query.platform = req.query.platform
  }
  if (req.query.appVersion) {
    query.appVersion = req.query.appVersion
  }
  if (req.query.startDate) {
    query.timestamp = { $gte: parseInt(req.query.startDate as string) }
  }
  if (req.query.endDate) {
    query.timestamp = { ...query.timestamp, $lte: parseInt(req.query.endDate as string) }
  }
  if (req.query.viewed !== undefined) {
    query.isViewed = req.query.viewed === 'true'
  }

  const reports = await CrashReport.find(query)
    .populate('userId', 'name email')
    .sort({ timestamp: -1 })
    .lean()
  
  return res.json(reports)
}));

bugManagmentRouter.get('/crash-reports/stats',  MyRequestHandler(async (_req, res) => {
  const [
    totalReports,
    platformStats,
    versionStats,
    recentReports,
    unviewedReports
  ] = await Promise.all([
    CrashReport.countDocuments(),
    CrashReport.aggregate([
      { $group: { _id: '$platform', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    CrashReport.aggregate([
      { $group: { _id: '$appVersion', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    CrashReport.countDocuments({
      timestamp: { $gte: Date.now() - 24 * 60 * 60 * 1000 }
    }),
    CrashReport.countDocuments({ isViewed: false })
  ])

  return res.json({
    totalReports,
    platformStats,
    versionStats,
    recentReports,
    unviewedReports
  })
}));

bugManagmentRouter.delete('/crash-reports/:id',  MyRequestHandler(async (req, res) => {
  const { id } = req.params;
  await CrashReport.findOneAndDelete({ id });
  return res.json({ success: true });
}));

bugManagmentRouter.delete('/crash-reports',  MyRequestHandler(async (req, res) => {
  const { platform, before } = req.query;
  const filter: any = {};

  if (platform) {
    filter.platform = platform;
  }

  if (before) {
    filter.timestamp = { $lt: parseInt(before as string) };
  }

  await CrashReport.deleteMany(filter);
  return res.json({ success: true });
}));

// Mark crash report as viewed
bugManagmentRouter.patch('/crash-reports/:id/mark-viewed',  MyRequestHandler(async (req, res) => {
  const report = await CrashReport.findOneAndUpdate(
    { id: req.params.id },
    { $set: { isViewed: true } },
    { new: true }
  ).lean()

  if (!report) {
    throw new Error('Crash report not found')
  }

  return res.json(report)
}))

// Get crash bugs list with filters
bugManagmentRouter.get('/crash-bugs',  MyRequestHandler(async (req, res) => {
  const query: any = {}
  
  if (req.query.platform) {
    query.platform = req.query.platform
  }
  if (req.query.isResolved !== undefined) {
    query.isResolved = req.query.isResolved === 'true'
  }
  if (req.query.minOccurrences) {
    query.occurrences = { $gte: parseInt(req.query.minOccurrences as string) }
  }

  const bugs = await CrashBug.find(query)
    .sort({ occurrences: -1, lastSeen: -1 })
    .lean()
  
  return res.json(bugs)
}))

// Get crash bugs statistics
bugManagmentRouter.get('/crash-bugs/stats',  MyRequestHandler(async (_req, res) => {
  try {
    const [
      totalBugs,
      unresolvedBugs,
      unreadBugs,
      platformStats,
      topBugs
    ] = await Promise.all([
      CrashBug.countDocuments(),
      CrashBug.countDocuments({ isResolved: false }),
      CrashBug.countDocuments({ isViewed: false, isResolved: false }),
      CrashBug.aggregate([
        {
          $group: {
            _id: '$platform',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ]),
      CrashBug.find()
        .sort({ occurrences: -1 })
        .limit(5)
        .lean()
    ])

    return res.json({
      totalBugs,
      unresolvedBugs,
      unreadBugs,
      platformStats,
      topBugs
    })
  } catch (error) {
    Logger.error('Error fetching crash bug statistics', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })
    throw error
  }
}))

// Get unread crash bugs count
bugManagmentRouter.get('/crash-bugs/unread-count',  MyRequestHandler(async (_req, res) => {
  try {
    const count = await CrashBug.countDocuments({ 
      isViewed: false,
      isResolved: false
    })

    Logger.info('Fetched unread crash bugs count', { count })
    return res.json({ count })
  } catch (error) {
    Logger.error('Error fetching unread crash bugs count', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })
    throw error
  }
}))

// Get specific crash bug details with its reports
bugManagmentRouter.get('/crash-bugs/:id',  MyRequestHandler(async (req, res) => {
  const bug = await CrashBug.findById(req.params.id).lean()
  if (!bug) {
    throw new Error('Crash bug not found')
  }

  const reports = await CrashReport.find({ crashBugId: bug._id })
    .populate('userId', 'name email')
    .sort({ timestamp: -1 })
    .lean()

  return res.json({ bug, reports })
}))

// Update crash bug (mark as resolved/add notes)
bugManagmentRouter.patch('/crash-bugs/:id',  MyRequestHandler(async (req, res) => {
  const update: any = {}
  
  if (req.body.isResolved !== undefined) {
    update.isResolved = req.body.isResolved
    if (req.body.isResolved) {
      update.resolvedAt = new Date()
    } else {
      update.resolvedAt = null
    }
  }
  
  if (req.body.notes !== undefined) {
    update.notes = req.body.notes
  }

  const bug = await CrashBug.findByIdAndUpdate(
    req.params.id,
    { $set: update },
    { new: true }
  ).lean()

  if (!bug) {
    throw new Error('Crash bug not found')
  }

  return res.json(bug)
}))

// Delete all crash bugs and their associated reports
bugManagmentRouter.delete('/crash-bugs',  MyRequestHandler(async (_req, res) => {
  try {
    await Promise.all([
      CrashBug.deleteMany({}),
      CrashReport.deleteMany({})
    ]);

    Logger.info('Deleted all crash bugs and reports');

    return res.json({
      success: true,
      message: 'All crash bugs and reports have been deleted'
    });
  } catch (error) {
    Logger.error('Error deleting crash bugs', { error });
    throw error;
  }
}));

// Modify the existing crash report creation/update logic to handle CrashBug
const handleCrashReport = async (reportData: any) => {
  const bugQuery = {
    platform: reportData.platform,
    appVersionCode: reportData.appVersionCode,
    fileName: reportData.fileName,
    functionName: reportData.functionName,
    errorTitle: reportData.errorTitle
  }

  // Find or create the crash bug
  let crashBug = await CrashBug.findOne(bugQuery)
  
  if (!crashBug) {
    crashBug = await CrashBug.create({
      ...bugQuery,
      affectedDevices: [{
        deviceModel: reportData.deviceModel,
        osVersion: reportData.osVersion,
        count: 1
      }]
    })
  } else {
    // Update existing bug
    const deviceIndex = crashBug.affectedDevices.findIndex(
      d => d.deviceModel === reportData.deviceModel && d.osVersion === reportData.osVersion
    )

    if (deviceIndex === -1) {
      await CrashBug.findByIdAndUpdate(crashBug._id, {
        $inc: { occurrences: 1 },
        $set: { lastSeen: new Date() },
        $push: {
          affectedDevices: {
            deviceModel: reportData.deviceModel,
            osVersion: reportData.osVersion,
            count: 1
          }
        }
      })
    } else {
      await CrashBug.findByIdAndUpdate(crashBug._id, {
        $inc: { 
          occurrences: 1,
          [`affectedDevices.${deviceIndex}.count`]: 1
        },
        $set: { lastSeen: new Date() }
      })
    }
  }

  // Add crashBugId to the report data
  reportData.crashBugId = crashBug._id
  return reportData
}

// Modify your existing crash report creation endpoint to use handleCrashReport
// ... existing code ...

// Get unread support messages count
bugManagmentRouter.get('/support/unread-count',  MyRequestHandler(async (_req, res) => {
  try {
    const count = await Message.countDocuments({ 
      isViewed: false,
      status: { $ne: 'resolved' }
    });

    Logger.info('Fetched unread support messages count', { count });
    return res.json({ count });
  } catch (error) {
    Logger.error('Error fetching unread support count', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  }
}));

export default bugManagmentRouter;