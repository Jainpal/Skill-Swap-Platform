const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { body, validationResult } = require('express-validator');
const NotificationService = require('../services/NotificationService');

const router = express.Router();
const prisma = new PrismaClient();

const ApiError = require('../utils/ApiError');

// @route   GET /api/swaps
// @desc    Get user's swap requests (sent and received)
// @access  Private
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { status, page = 1, limit = 10 } = req.query;

    // Build filter conditions
    const whereConditions = {};
    if (status && ['PENDING', 'ACCEPTED', 'REJECTED', 'COMPLETED', 'CANCELLED'].includes(status.toUpperCase())) {
      whereConditions.status = status.toUpperCase();
    }

    // Get sent swap requests
    const sent = await prisma.swapRequest.findMany({
      where: { 
        senderId: userId,
        ...whereConditions
      },
      include: {
        receiver: {
          select: { 
            id: true, 
            name: true, 
            email: true, 
            profilePhoto: true,
            availability: true 
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Get received swap requests
    const received = await prisma.swapRequest.findMany({
      where: { 
        receiverId: userId,
        ...whereConditions
      },
      include: {
        sender: {
          select: { 
            id: true, 
            name: true, 
            email: true, 
            profilePhoto: true,
            availability: true 
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Get statistics
    const stats = {
      sent: {
        total: await prisma.swapRequest.count({ where: { senderId: userId } }),
        pending: await prisma.swapRequest.count({ where: { senderId: userId, status: 'PENDING' } }),
        accepted: await prisma.swapRequest.count({ where: { senderId: userId, status: 'ACCEPTED' } }),
        completed: await prisma.swapRequest.count({ where: { senderId: userId, status: 'COMPLETED' } })
      },
      received: {
        total: await prisma.swapRequest.count({ where: { receiverId: userId } }),
        pending: await prisma.swapRequest.count({ where: { receiverId: userId, status: 'PENDING' } }),
        accepted: await prisma.swapRequest.count({ where: { receiverId: userId, status: 'ACCEPTED' } }),
        completed: await prisma.swapRequest.count({ where: { receiverId: userId, status: 'COMPLETED' } })
      }
    };

    res.json({ 
      sent, 
      received, 
      stats,
      filter: { status: status || 'all' }
    });
  } catch (error) {
    console.error('Get swaps error:', error);
    next(new ApiError(500, 'Failed to fetch swap requests'));
  }
});

// Validation for creating swap requests
const createSwapValidation = [
  body('receiverId').notEmpty().withMessage('Receiver ID is required'),
  body('skillOffered').trim().notEmpty().withMessage('Skill offered is required'),
  body('skillRequested').trim().notEmpty().withMessage('Skill requested is required'),
  body('message').optional().trim().isLength({ max: 500 }).withMessage('Message must be less than 500 characters')
];

// @route   POST /api/swaps
// @desc    Create a new swap request
// @access  Private
router.post('/', createSwapValidation, async (req, res, next) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, 'Validation failed', errors.array()));
    }

    const { receiverId, skillOffered, skillRequested, message } = req.body;
    const senderId = req.user.id;

    // Prevent users from sending requests to themselves
    if (senderId === receiverId) {
      return next(new ApiError(400, 'You cannot send a swap request to yourself'));
    }

    // Check if receiver exists and is active
    const receiver = await prisma.user.findUnique({
      where: { id: receiverId },
      select: { id: true, isActive: true, isPublic: true }
    });

    if (!receiver) {
      return next(new ApiError(404, 'Receiver not found'));
    }

    if (!receiver.isActive) {
      return next(new ApiError(400, 'Cannot send request to inactive user'));
    }

    if (!receiver.isPublic) {
      return next(new ApiError(400, 'Cannot send request to private profile'));
    }

    // Check if there's already a pending request between these users for same skills
    const existingRequest = await prisma.swapRequest.findFirst({
      where: {
        OR: [
          {
            senderId: senderId,
            receiverId: receiverId,
            skillOffered: skillOffered,
            skillRequested: skillRequested,
            status: 'PENDING'
          },
          {
            senderId: receiverId,
            receiverId: senderId,
            skillOffered: skillRequested,
            skillRequested: skillOffered,
            status: 'PENDING'
          }
        ]
      }
    });

    if (existingRequest) {
      return next(new ApiError(400, 'A similar swap request already exists between you and this user'));
    }

    // Create the swap request
    const swap = await prisma.swapRequest.create({
      data: {
        senderId,
        receiverId,
        skillOffered: skillOffered.trim(),
        skillRequested: skillRequested.trim(),
        message: message?.trim() || null,
        status: 'PENDING'
      },
      include: {
        sender: {
          select: { id: true, name: true, profilePhoto: true }
        },
        receiver: {
          select: { id: true, name: true, profilePhoto: true }
        }
      }
    });

    // Send real-time notification
    if (req.io) {
      const notificationService = new NotificationService(req.io);
      await notificationService.notifySwapRequestReceived(
        receiverId,
        swap.sender.name,
        skillOffered,
        skillRequested,
        swap.id
      );
    }

    res.status(201).json({ 
      message: 'Swap request created successfully', 
      swap 
    });
  } catch (error) {
    console.error('Create swap error:', error);
    next(new ApiError(500, 'Failed to create swap request'));
  }
});

// @route   PUT /api/swaps/:id/accept
// @desc    Accept a swap request
// @access  Private
router.put('/:id/accept', async (req, res, next) => {
  try {
    const swapId = req.params.id;
    const userId = req.user.id;

    // Find the swap request
    const swapRequest = await prisma.swapRequest.findUnique({
      where: { id: swapId },
      include: {
        sender: { select: { id: true, name: true } },
        receiver: { select: { id: true, name: true } }
      }
    });

    if (!swapRequest) {
      return next(new ApiError(404, 'Swap request not found'));
    }

    // Only the receiver can accept
    if (swapRequest.receiverId !== userId) {
      return next(new ApiError(403, 'You can only accept requests sent to you'));
    }

    // Can only accept pending requests
    if (swapRequest.status !== 'PENDING') {
      return next(new ApiError(400, `Cannot accept request with status: ${swapRequest.status}`));
    }

    // Update the swap request
    const updatedSwap = await prisma.swapRequest.update({
      where: { id: swapId },
      data: { 
        status: 'ACCEPTED',
        updatedAt: new Date()
      },
      include: {
        sender: {
          select: { id: true, name: true, profilePhoto: true }
        },
        receiver: {
          select: { id: true, name: true, profilePhoto: true }
        }
      }
    });

    // Send notification to sender
    if (req.io) {
      const notificationService = new NotificationService(req.io);
      await notificationService.notifySwapRequestAccepted(
        swapRequest.senderId,
        swapRequest.receiver.name,
        updatedSwap.skillOffered,
        updatedSwap.skillRequested,
        updatedSwap.id
      );
    }

    res.json({ 
      message: 'Swap request accepted successfully', 
      swap: updatedSwap 
    });
  } catch (error) {
    console.error('Accept swap error:', error);
    next(new ApiError(500, 'Failed to accept swap request'));
  }
});

// @route   PUT /api/swaps/:id/reject
// @desc    Reject a swap request
// @access  Private
router.put('/:id/reject', async (req, res, next) => {
  try {
    const swapId = req.params.id;
    const userId = req.user.id;

    const swapRequest = await prisma.swapRequest.findUnique({
      where: { id: swapId },
      include: {
        sender: { select: { id: true, name: true } },
        receiver: { select: { id: true, name: true } }
      }
    });

    if (!swapRequest) {
      return next(new ApiError(404, 'Swap request not found'));
    }

    // Only the receiver can reject
    if (swapRequest.receiverId !== userId) {
      return next(new ApiError(403, 'You can only reject requests sent to you'));
    }

    // Can only reject pending requests
    if (swapRequest.status !== 'PENDING') {
      return next(new ApiError(400, `Cannot reject request with status: ${swapRequest.status}`));
    }

    const updatedSwap = await prisma.swapRequest.update({
      where: { id: swapId },
      data: { 
        status: 'REJECTED',
        updatedAt: new Date()
      }
    });

    // Send notification to sender
    if (req.io) {
      const notificationService = new NotificationService(req.io);
      await notificationService.notifySwapRequestRejected(
        swapRequest.senderId,
        swapRequest.receiver.name,
        updatedSwap.skillOffered,
        updatedSwap.skillRequested,
        updatedSwap.id
      );
    }

    res.json({ 
      message: 'Swap request rejected', 
      swap: updatedSwap 
    });
  } catch (error) {
    console.error('Reject swap error:', error);
    next(new ApiError(500, 'Failed to reject swap request'));
  }
});

// @route   PUT /api/swaps/:id/cancel
// @desc    Cancel a swap request (sender only)
// @access  Private
router.put('/:id/cancel', async (req, res, next) => {
  try {
    const swapId = req.params.id;
    const userId = req.user.id;

    const swapRequest = await prisma.swapRequest.findUnique({
      where: { id: swapId }
    });

    if (!swapRequest) {
      return next(new ApiError(404, 'Swap request not found'));
    }

    // Only the sender can cancel
    if (swapRequest.senderId !== userId) {
      return next(new ApiError(403, 'You can only cancel requests you sent'));
    }

    // Can only cancel pending requests
    if (swapRequest.status !== 'PENDING') {
      return next(new ApiError(400, `Cannot cancel request with status: ${swapRequest.status}`));
    }

    const updatedSwap = await prisma.swapRequest.update({
      where: { id: swapId },
      data: { 
        status: 'CANCELLED',
        updatedAt: new Date()
      }
    });

    res.json({ 
      message: 'Swap request cancelled', 
      swap: updatedSwap 
    });
  } catch (error) {
    console.error('Cancel swap error:', error);
    next(new ApiError(500, 'Failed to cancel swap request'));
  }
});

// @route   PUT /api/swaps/:id/complete
// @desc    Mark a swap as completed
// @access  Private
router.put('/:id/complete', async (req, res, next) => {
  try {
    const swapId = req.params.id;
    const userId = req.user.id;

    const swapRequest = await prisma.swapRequest.findUnique({
      where: { id: swapId },
      include: {
        sender: { select: { id: true, name: true } },
        receiver: { select: { id: true, name: true } }
      }
    });

    if (!swapRequest) {
      return next(new ApiError(404, 'Swap request not found'));
    }

    // Both sender and receiver can mark as complete
    if (swapRequest.senderId !== userId && swapRequest.receiverId !== userId) {
      return next(new ApiError(403, 'You can only complete swaps you are part of'));
    }

    // Can only complete accepted requests
    if (swapRequest.status !== 'ACCEPTED') {
      return next(new ApiError(400, 'Can only complete accepted swap requests'));
    }

    const updatedSwap = await prisma.swapRequest.update({
      where: { id: swapId },
      data: { 
        status: 'COMPLETED',
        completedAt: new Date(),
        updatedAt: new Date()
      }
    });

    // Send notifications to both parties
    if (req.io) {
      const notificationService = new NotificationService(req.io);
      
      // Notify the sender
      await notificationService.notifySwapCompleted(
        swapRequest.senderId,
        swapRequest.receiver.name,
        updatedSwap.skillOffered,
        updatedSwap.skillRequested,
        updatedSwap.id
      );

      // Notify the receiver
      await notificationService.notifySwapCompleted(
        swapRequest.receiverId,
        swapRequest.sender.name,
        updatedSwap.skillRequested,
        updatedSwap.skillOffered,
        updatedSwap.id
      );
    }

    res.json({ 
      message: 'Swap marked as completed', 
      swap: updatedSwap 
    });
  } catch (error) {
    console.error('Complete swap error:', error);
    next(new ApiError(500, 'Failed to complete swap request'));
  }
});

// @route   GET /api/swaps/:id
// @desc    Get a specific swap request details
// @access  Private
router.get('/:id', async (req, res, next) => {
  try {
    const swapId = req.params.id;
    const userId = req.user.id;

    const swap = await prisma.swapRequest.findUnique({
      where: { id: swapId },
      include: {
        sender: {
          select: { 
            id: true, 
            name: true, 
            email: true, 
            profilePhoto: true,
            availability: true 
          }
        },
        receiver: {
          select: { 
            id: true, 
            name: true, 
            email: true, 
            profilePhoto: true,
            availability: true 
          }
        },
        feedback: {
          include: {
            giver: {
              select: { id: true, name: true, profilePhoto: true }
            },
            receiver: {
              select: { id: true, name: true, profilePhoto: true }
            }
          }
        }
      }
    });

    if (!swap) {
      return next(new ApiError(404, 'Swap request not found'));
    }

    // Only participants can view the details
    if (swap.senderId !== userId && swap.receiverId !== userId) {
      return next(new ApiError(403, 'You can only view swaps you are part of'));
    }

    res.json({ swap });
  } catch (error) {
    console.error('Get swap details error:', error);
    next(new ApiError(500, 'Failed to get swap details'));
  }
});

module.exports = router;
