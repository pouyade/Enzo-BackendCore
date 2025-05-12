import express from 'express';
import { auth } from '@middleware/auth';
import { Block } from '@models/Block';
import { MyRequestHandler } from '@Helper/MyRequestHandler';
const blockManagmentRouter = express.Router();

// todo:checklater


// Get all blocks
blockManagmentRouter.get('/', MyRequestHandler(async (req, res) => {
  try {
    const blocks = await Block.find().populate('createdBy', 'username email');
    return res.status(200).json(blocks);
  } catch (error: any) {
    console.error('Failed to fetch blocks:', error);
    return res.status(500).json({ message: 'Failed to fetch blocks' });
  }
}));

// Create a new block
blockManagmentRouter.post('/', MyRequestHandler(async (req, res) => {
  try {
    const { type, value, reason, expiresAt, isActive } = req.body;
    
    // Get the user ID from the authenticated request
    const userId = (req as any).user.id;
    
    const block = new Block({
      type,
      value,
      reason,
      expiresAt,
      isActive,
      createdBy: userId
    });
    
    await block.save();
    
    return res.status(201).json(block);
  } catch (error: any) {
    console.error('Failed to create block:', error);
    return res.status(400).json({ message: error.message });
  }
}));

// Update a block
blockManagmentRouter.put('/:id', MyRequestHandler(async (req, res) => {
  try {
    const { type, value, reason, expiresAt, isActive } = req.body;
    
    const block = await Block.findByIdAndUpdate(
      req.params.id,
      { type, value, reason, expiresAt, isActive },
      { new: true }
    );
    
    if (!block) {
      return res.status(404).json({ message: 'Block not found' });
    }
    
    return res.status(200).json(block);
  } catch (error: any) {
    console.error('Failed to update block:', error);
    return res.status(400).json({ message: error.message });
  }
}));

// Delete a block
blockManagmentRouter.delete('/:id', MyRequestHandler(async (req, res) => {
  try {
    const block = await Block.findByIdAndDelete(req.params.id);
    if (!block) {
      return res.status(404).json({ message: 'Block not found' });
    }
    return res.status(200).json({ message: 'Block deleted successfully' });
  } catch (error: any) {
    console.error('Failed to delete block:', error);
    return res.status(500).json({ message: 'Failed to delete block' });
  }
}));

// // Block Management Routes
// blockManagmentRouter.post('/blocks', MyRequestHandler(async (req,res)=>{
//   try {
//     const { type, value, reason, expiresAt } = req.body;

//     // Validate IP or IP range if applicable
//     if (type === 'ip' || type === 'ip_range') {
//       const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(?:\/(?:3[0-2]|[1-2]?[0-9]))?$/;
//       if (!ipRegex.test(value)) {
//         return res.status(400).json({ message: 'Invalid IP address or range' });
//       }
//     }

//     // Validate email if applicable
//     if (type === 'email') {
//       const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
//       if (!emailRegex.test(value)) {
//         return res.status(400).json({ message: 'Invalid email address' });
//       }
//     }

//     const block = new Block({
//       type,
//       value,
//       reason,
//       expiresAt,
//       createdBy: req.user!.id,
//       isActive: true
//     });

//     await block.save();
//     Logger.info('New block created', { blockId: block._id, adminId: req.user!.id });
//     return res.status(201).json(block);
//   } catch (error: any) {
//     if (error.code === 11000) {
//       return res.status(400).json({ message: 'This value is already blocked' });
//     }
//     Logger.error('Failed to create block', { error: error.message });
//     return res.status(500).json({ message: 'Failed to create block' });
//   }
// }));

// blockManagmentRouter.get('/blocks', MyRequestHandler(async (req,res)=>{
//   try {
//     const blocks = await Block.find()
//       .sort({ createdAt: -1 })
//       .populate('createdBy', 'name email');
//     return res.status(200).json(blocks);
//   } catch (error: any) {
//     Logger.error('Failed to fetch blocks', { error: error.message });
//     return res.status(500).json({ message: 'Failed to fetch blocks' });
//   }
// }));

// blockManagmentRouter.put('/blocks/:id', MyRequestHandler(async (req,res)=>{
//   try {
//     const { isActive, reason, expiresAt } = req.body;
//     const blockId = req.params.id;

//     const block = await Block.findByIdAndUpdate(
//       blockId,
//       { isActive, reason, expiresAt },
//       { new: true }
//     );

//     if (!block) {
//       return res.status(404).json({ message: 'Block not found' });
//     }

//     Logger.info('Block updated', { blockId, adminId: req.user!.id });
//     return res.status(200).json(block);
//   } catch (error: any) {
//     Logger.error('Failed to update block', { error: error.message });
//     return res.status(500).json({ message: 'Failed to update block' });
//   }
// }));

// blockManagmentRouter.delete('/blocks/:id', MyRequestHandler(async (req,res)=>{
//   try {
//     const block = await Block.findByIdAndDelete(req.params.id);
    
//     if (!block) {
//       return res.status(404).json({ message: 'Block not found' });
      
//     }
//     Logger.info('Block deleted', { blockId: req.params.id, adminId: req.user!.id });
//     return res.status(200).json({ message: 'Block deleted successfully' });
//   } catch (error: any) {
//     Logger.error('Failed to delete block', { error: error.message });
//     return res.status(500).json({ message: 'Failed to delete block' });
//   }
// }));



export default blockManagmentRouter; 