const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { body, validationResult } = require('express-validator');

const router = express.Router();
const prisma = new PrismaClient();

const ApiError = require('../utils/ApiError');

// @route   POST /api/reports
// @desc    Create a report for inappropriate content or user
// @access  Private
router.post('/', [
  body('reportedUserId').optional().isUUID().withMessage('Invalid user ID'),
  body('skillId').optional().isUUID().withMessage('Invalid skill ID'),
  body('reason').trim().notEmpty().withMessage('Reason is required'),
  body('description').optional().trim().isLength({ max: 1000 }).withMessage('Description too long')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, 'Validation failed', errors.array()));
    }

    const { reportedUserId, skillId, reason, description } = req.body;
    const reporterId = req.user.id;

    // Must report either a user or a skill
    if (!reportedUserId && !skillId) {
      return next(new ApiError(400, 'Must report either a user or a skill'));
    }

    // Cannot report yourself
    if (reportedUserId === reporterId) {
      return next(new ApiError(400, 'Cannot report yourself'));
    }

    // Verify reported user exists if provided
    if (reportedUserId) {
      const reportedUser = await prisma.user.findUnique({
        where: { id: reportedUserId },
        select: { id: true }
      });
      if (!reportedUser) {
        return next(new ApiError(404, 'Reported user not found'));
      }
    }

    // Verify skill exists if provided
    if (skillId) {
      const skill = await prisma.skill.findUnique({
        where: { id: skillId },
        select: { id: true, userId: true }
      });
      if (!skill) {
        return next(new ApiError(404, 'Reported skill not found'));
      }
      // Cannot report your own skill
      if (skill.userId === reporterId) {
        return next(new ApiError(400, 'Cannot report your own skill'));
      }
    }

    // Check if user has already reported this user/skill
    const existingReport = await prisma.report.findFirst({
      where: {
        reporterId,
        OR: [
          { reportedUserId: reportedUserId || undefined },
          { skillId: skillId || undefined }
        ],
        status: { in: ['PENDING', 'REVIEWED'] }
      }
    });

    if (existingReport) {
      return next(new ApiError(400, 'You have already reported this user/skill'));
    }

    const report = await prisma.report.create({
      data: {
        reporterId,
        reportedUserId,
        skillId,
        reason: reason.trim(),
        description: description?.trim() || null,
        status: 'PENDING'
      },
      include: {
        reportedUser: {
          select: { id: true, name: true }
        },
        skill: {
          select: { id: true, name: true }
        }
      }
    });

    res.status(201).json({
      message: 'Report submitted successfully',
      report
    });
  } catch (error) {
    console.error('Create report error:', error);
    next(new ApiError(500, 'Failed to submit report'));
  }
});

// @route   GET /api/reports/my
// @desc    Get user's submitted reports
// @access  Private
router.get('/my', async (req, res, next) => {
  try {
    const reporterId = req.user.id;

    const reports = await prisma.report.findMany({
      where: { reporterId },
      orderBy: { createdAt: 'desc' },
      include: {
        reportedUser: {
          select: { id: true, name: true }
        },
        skill: {
          select: { id: true, name: true }
        }
      }
    });

    res.json({ reports });
  } catch (error) {
    console.error('Get my reports error:', error);
    next(new ApiError(500, 'Failed to fetch reports'));
  }
});

module.exports = router;
