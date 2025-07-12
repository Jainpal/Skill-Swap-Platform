const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { body, param, validationResult } = require('express-validator');
const NotificationService = require('../services/NotificationService');

const router = express.Router();
const prisma = new PrismaClient();

const ApiError = require('../utils/ApiError');

// Validation for creating feedback
const createFeedbackValidation = [
  body('swapId').isUUID().withMessage('Invalid swap ID'),
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('comment').optional().trim().isLength({ max: 500 }).withMessage('Comment must be less than 500 characters')
];

// @route   POST /api/feedback
// @desc    Create feedback for a completed swap
// @access  Private
router.post('/', createFeedbackValidation, async (req, res, next) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, 'Validation failed', errors.array()));
    }

    const { swapId, rating, comment } = req.body;
    const giverId = req.user.id;

    // Find the swap request
    const swap = await prisma.swapRequest.findUnique({
      where: { id: swapId },
      include: {
        sender: { select: { id: true, name: true } },
        receiver: { select: { id: true, name: true } }
      }
    });

    if (!swap) {
      return next(new ApiError(404, 'Swap request not found'));
    }

    // Check if user is part of this swap
    if (swap.senderId !== giverId && swap.receiverId !== giverId) {
      return next(new ApiError(403, 'You can only leave feedback for swaps you participated in'));
    }

    // Check if swap is completed
    if (swap.status !== 'COMPLETED') {
      return next(new ApiError(400, 'You can only leave feedback for completed swaps'));
    }

    // Determine the receiver of the feedback
    const receiverId = swap.senderId === giverId ? swap.receiverId : swap.senderId;
    const receiverName = swap.senderId === giverId ? swap.receiver.name : swap.sender.name;

    // Check if feedback already exists
    const existingFeedback = await prisma.feedback.findFirst({
      where: {
        swapId,
        giverId,
        receiverId
      }
    });

    if (existingFeedback) {
      return next(new ApiError(400, 'You have already left feedback for this swap'));
    }

    // Create the feedback
    const feedback = await prisma.feedback.create({
      data: {
        swapId,
        giverId,
        receiverId,
        rating,
        comment: comment?.trim() || null
      },
      include: {
        giver: {
          select: { id: true, name: true, profilePhoto: true }
        },
        receiver: {
          select: { id: true, name: true, profilePhoto: true }
        },
        swap: {
          select: { 
            id: true, 
            skillOffered: true, 
            skillRequested: true 
          }
        }
      }
    });

    // Send notification to the feedback receiver
    if (req.io) {
      const notificationService = new NotificationService(req.io);
      await notificationService.notifyFeedbackReceived(
        receiverId,
        req.user.name,
        rating,
        swapId
      );
    }

    res.status(201).json({
      message: 'Feedback submitted successfully',
      feedback
    });
  } catch (error) {
    console.error('Create feedback error:', error);
    next(new ApiError(500, 'Failed to create feedback'));
  }
});

// @route   GET /api/feedback/received
// @desc    Get feedback received by the user
// @access  Private
router.get('/received', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10 } = req.query;

    const feedback = await prisma.feedback.findMany({
      where: { receiverId: userId },
      include: {
        giver: {
          select: { id: true, name: true, profilePhoto: true }
        },
        swap: {
          select: { 
            id: true, 
            skillOffered: true, 
            skillRequested: true,
            createdAt: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: parseInt(limit)
    });

    const totalFeedback = await prisma.feedback.count({
      where: { receiverId: userId }
    });

    // Calculate average rating
    const avgRating = feedback.length > 0 
      ? feedback.reduce((sum, f) => sum + f.rating, 0) / feedback.length 
      : 0;

    res.json({
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(totalFeedback / limit),
      totalFeedback,
      averageRating: Math.round(avgRating * 10) / 10,
      feedback
    });
  } catch (error) {
    console.error('Get received feedback error:', error);
    next(new ApiError(500, 'Failed to fetch received feedback'));
  }
});

// @route   GET /api/feedback/given
// @desc    Get feedback given by the user
// @access  Private
router.get('/given', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10 } = req.query;

    const feedback = await prisma.feedback.findMany({
      where: { giverId: userId },
      include: {
        receiver: {
          select: { id: true, name: true, profilePhoto: true }
        },
        swap: {
          select: { 
            id: true, 
            skillOffered: true, 
            skillRequested: true,
            createdAt: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: parseInt(limit)
    });

    const totalFeedback = await prisma.feedback.count({
      where: { giverId: userId }
    });

    res.json({
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(totalFeedback / limit),
      totalFeedback,
      feedback
    });
  } catch (error) {
    console.error('Get given feedback error:', error);
    next(new ApiError(500, 'Failed to fetch given feedback'));
  }
});

// @route   GET /api/feedback/swap/:swapId
// @desc    Get feedback for a specific swap
// @access  Private
router.get('/swap/:swapId', [
  param('swapId').isUUID().withMessage('Invalid swap ID')
], async (req, res, next) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, 'Validation failed', errors.array()));
    }

    const swapId = req.params.swapId;
    const userId = req.user.id;

    // Check if user is part of this swap
    const swap = await prisma.swapRequest.findUnique({
      where: { id: swapId }
    });

    if (!swap) {
      return next(new ApiError(404, 'Swap request not found'));
    }

    if (swap.senderId !== userId && swap.receiverId !== userId) {
      return next(new ApiError(403, 'You can only view feedback for swaps you participated in'));
    }

    const feedback = await prisma.feedback.findMany({
      where: { swapId },
      include: {
        giver: {
          select: { id: true, name: true, profilePhoto: true }
        },
        receiver: {
          select: { id: true, name: true, profilePhoto: true }
        }
      }
    });

    res.json({ feedback });
  } catch (error) {
    console.error('Get swap feedback error:', error);
    next(new ApiError(500, 'Failed to fetch swap feedback'));
  }
});

// @route   PUT /api/feedback/:id
// @desc    Update feedback (only comment, rating cannot be changed)
// @access  Private
router.put('/:id', [
  param('id').isUUID().withMessage('Invalid feedback ID'),
  body('comment').optional().trim().isLength({ max: 500 }).withMessage('Comment must be less than 500 characters')
], async (req, res, next) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, 'Validation failed', errors.array()));
    }

    const feedbackId = req.params.id;
    const { comment } = req.body;
    const userId = req.user.id;

    // Find and update feedback
    const feedback = await prisma.feedback.findUnique({
      where: { id: feedbackId }
    });

    if (!feedback) {
      return next(new ApiError(404, 'Feedback not found'));
    }

    if (feedback.giverId !== userId) {
      return next(new ApiError(403, 'You can only edit your own feedback'));
    }

    const updatedFeedback = await prisma.feedback.update({
      where: { id: feedbackId },
      data: { 
        comment: comment?.trim() || null,
        updatedAt: new Date()
      },
      include: {
        giver: {
          select: { id: true, name: true, profilePhoto: true }
        },
        receiver: {
          select: { id: true, name: true, profilePhoto: true }
        }
      }
    });

    res.json({
      message: 'Feedback updated successfully',
      feedback: updatedFeedback
    });
  } catch (error) {
    console.error('Update feedback error:', error);
    next(new ApiError(500, 'Failed to update feedback'));
  }
});

module.exports = router;
