const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { body, query, param, validationResult } = require('express-validator');
const NotificationService = require('../services/NotificationService');

const router = express.Router();
const prisma = new PrismaClient();

const ApiError = require('../utils/ApiError');
const getPaginationParams = require('../utils/paginate');

// Admin middleware - check if user is admin
const adminMiddleware = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, isActive: true }
    });

    if (!user || !user.isActive) {
      return next(new ApiError(403, 'Access denied: User not active'));
    }

    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return next(new ApiError(403, 'Access denied: Admin privileges required'));
    }

    req.isAdmin = true;
    req.isSuperAdmin = user.role === 'SUPER_ADMIN';
    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    next(new ApiError(500, 'Failed to verify admin privileges'));
  }
};

// Apply admin middleware to all routes
router.use(adminMiddleware);

// @route   GET /api/admin/dashboard
// @desc    Get admin dashboard statistics
// @access  Admin
router.get('/dashboard', async (req, res, next) => {
  try {
    const stats = {
      users: {
        total: await prisma.user.count(),
        active: await prisma.user.count({ where: { isActive: true } }),
        banned: await prisma.user.count({ where: { isActive: false } }),
        admins: await prisma.user.count({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } } })
      },
      swaps: {
        total: await prisma.swapRequest.count(),
        pending: await prisma.swapRequest.count({ where: { status: 'PENDING' } }),
        accepted: await prisma.swapRequest.count({ where: { status: 'ACCEPTED' } }),
        completed: await prisma.swapRequest.count({ where: { status: 'COMPLETED' } }),
        rejected: await prisma.swapRequest.count({ where: { status: 'REJECTED' } }),
        cancelled: await prisma.swapRequest.count({ where: { status: 'CANCELLED' } })
      },
      skills: {
        total: await prisma.skill.count(),
        approved: await prisma.skill.count({ where: { isApproved: true } }),
        pending: await prisma.skill.count({ where: { isApproved: false } }),
        offered: await prisma.skill.count({ where: { type: 'OFFERED' } }),
        wanted: await prisma.skill.count({ where: { type: 'WANTED' } })
      },
      reports: {
        total: await prisma.report.count(),
        pending: await prisma.report.count({ where: { status: 'PENDING' } }),
        reviewed: await prisma.report.count({ where: { status: 'REVIEWED' } }),
        resolved: await prisma.report.count({ where: { status: 'RESOLVED' } })
      },
      feedback: {
        total: await prisma.feedback.count(),
        averageRating: await prisma.feedback.aggregate({
          _avg: { rating: true }
        }).then(result => Math.round((result._avg.rating || 0) * 10) / 10)
      }
    };

    // Recent activity
    const recentSwaps = await prisma.swapRequest.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        sender: { select: { name: true, email: true } },
        receiver: { select: { name: true, email: true } }
      }
    });

    const recentReports = await prisma.report.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        reporter: { select: { name: true, email: true } },
        reportedUser: { select: { name: true, email: true } }
      }
    });

    res.json({
      stats,
      recentActivity: {
        swaps: recentSwaps,
        reports: recentReports
      }
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    next(new ApiError(500, 'Failed to load dashboard'));
  }
});

// @route   GET /api/admin/users
// @desc    Get all users with admin details
// @access  Admin
router.get('/users', [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('search').optional().trim(),
  query('status').optional().isIn(['active', 'banned', 'all']),
  query('role').optional().isIn(['USER', 'ADMIN', 'SUPER_ADMIN', 'all'])
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, 'Validation failed', errors.array()));
    }

    const { page, limit, skip } = getPaginationParams(req.query);
    const { search, status, role } = req.query;

    // Build where conditions
    const whereConditions = {};
    
    if (search) {
      whereConditions.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { location: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (status && status !== 'all') {
      whereConditions.isActive = status === 'active';
    }

    if (role && role !== 'all') {
      whereConditions.role = role;
    }

    const totalUsers = await prisma.user.count({ where: whereConditions });

    const users = await prisma.user.findMany({
      where: whereConditions,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        isPublic: true,
        location: true,
        createdAt: true,
        lastActive: true,
        _count: {
          select: {
            skills: true,
            sentRequests: true,
            receivedRequests: true,
            givenFeedback: true,
            receivedFeedback: true
          }
        }
      }
    });

    res.json({
      page,
      limit,
      totalPages: Math.ceil(totalUsers / limit),
      totalUsers,
      users
    });
  } catch (error) {
    console.error('Admin get users error:', error);
    next(new ApiError(500, 'Failed to fetch users'));
  }
});

// @route   PUT /api/admin/users/:id/ban
// @desc    Ban/unban a user
// @access  Admin
router.put('/users/:id/ban', [
  param('id').isUUID().withMessage('Invalid user ID'),
  body('reason').optional().trim().isLength({ max: 500 }).withMessage('Reason must be less than 500 characters'),
  body('banned').isBoolean().withMessage('Banned status must be a boolean')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, 'Validation failed', errors.array()));
    }

    const userId = req.params.id;
    const { banned, reason } = req.body;

    // Check if user exists and is not an admin
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true, isActive: true }
    });

    if (!targetUser) {
      return next(new ApiError(404, 'User not found'));
    }

    // Prevent banning other admins (unless super admin)
    if ((targetUser.role === 'ADMIN' || targetUser.role === 'SUPER_ADMIN') && !req.isSuperAdmin) {
      return next(new ApiError(403, 'Cannot ban admin users'));
    }

    // Prevent self-ban
    if (targetUser.id === req.user.id) {
      return next(new ApiError(400, 'Cannot ban yourself'));
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { isActive: !banned },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        role: true
      }
    });

    // Send notification to user if being banned
    if (banned && req.io) {
      const notificationService = new NotificationService(req.io);
      await notificationService.notifyAccountAction(
        userId,
        'suspended',
        reason
      );
    }

    res.json({
      message: `User ${banned ? 'banned' : 'unbanned'} successfully`,
      user: updatedUser
    });
  } catch (error) {
    console.error('Admin ban user error:', error);
    next(new ApiError(500, 'Failed to update user status'));
  }
});

// @route   GET /api/admin/swaps
// @desc    Monitor all swap requests
// @access  Admin
router.get('/swaps', [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('status').optional().isIn(['PENDING', 'ACCEPTED', 'REJECTED', 'COMPLETED', 'CANCELLED', 'all']),
  query('search').optional().trim()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, 'Validation failed', errors.array()));
    }

    const { page, limit, skip } = getPaginationParams(req.query);
    const { status, search } = req.query;

    const whereConditions = {};
    
    if (status && status !== 'all') {
      whereConditions.status = status;
    }

    if (search) {
      whereConditions.OR = [
        { skillOffered: { contains: search, mode: 'insensitive' } },
        { skillRequested: { contains: search, mode: 'insensitive' } },
        { sender: { name: { contains: search, mode: 'insensitive' } } },
        { receiver: { name: { contains: search, mode: 'insensitive' } } }
      ];
    }

    const totalSwaps = await prisma.swapRequest.count({ where: whereConditions });

    const swaps = await prisma.swapRequest.findMany({
      where: whereConditions,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        sender: {
          select: { id: true, name: true, email: true, isActive: true }
        },
        receiver: {
          select: { id: true, name: true, email: true, isActive: true }
        },
        feedback: {
          select: { rating: true, comment: true, createdAt: true }
        }
      }
    });

    res.json({
      page,
      limit,
      totalPages: Math.ceil(totalSwaps / limit),
      totalSwaps,
      swaps
    });
  } catch (error) {
    console.error('Admin get swaps error:', error);
    next(new ApiError(500, 'Failed to fetch swap requests'));
  }
});

// @route   GET /api/admin/skills
// @desc    Monitor and moderate skills
// @access  Admin
router.get('/skills', [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('approved').optional().isBoolean().toBoolean(),
  query('type').optional().isIn(['OFFERED', 'WANTED', 'all']),
  query('search').optional().trim()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, 'Validation failed', errors.array()));
    }

    const { page, limit, skip } = getPaginationParams(req.query);
    const { approved, type, search } = req.query;

    const whereConditions = {};
    
    if (approved !== undefined) {
      whereConditions.isApproved = approved;
    }

    if (type && type !== 'all') {
      whereConditions.type = type;
    }

    if (search) {
      whereConditions.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { user: { name: { contains: search, mode: 'insensitive' } } }
      ];
    }

    const totalSkills = await prisma.skill.count({ where: whereConditions });

    const skills = await prisma.skill.findMany({
      where: whereConditions,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, name: true, email: true, isActive: true }
        }
      }
    });

    res.json({
      page,
      limit,
      totalPages: Math.ceil(totalSkills / limit),
      totalSkills,
      skills
    });
  } catch (error) {
    console.error('Admin get skills error:', error);
    next(new ApiError(500, 'Failed to fetch skills'));
  }
});

// @route   PUT /api/admin/skills/:id/moderate
// @desc    Moderate a skill (remove if inappropriate)
// @access  Admin
router.put('/skills/:id/moderate', [
  param('id').isUUID().withMessage('Invalid skill ID'),
  body('remove').isBoolean().withMessage('Remove status must be a boolean'),
  body('reason').optional().trim().isLength({ max: 500 }).withMessage('Reason must be less than 500 characters')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, 'Validation failed', errors.array()));
    }

    const skillId = req.params.id;
    const { remove, reason } = req.body;

    // Get skill with user info
    const skill = await prisma.skill.findUnique({
      where: { id: skillId },
      include: { user: { select: { id: true, name: true } } }
    });

    if (!skill) {
      return next(new ApiError(404, 'Skill not found'));
    }

    if (remove) {
      // Delete the skill instead of just disapproving
      await prisma.skill.delete({
        where: { id: skillId }
      });

      // Send notification to user
      if (req.io) {
        const notificationService = new NotificationService(req.io);
        await notificationService.notifySkillRemoved(skill.user.id, skill.name, reason);
      }

      res.json({
        message: 'Skill removed successfully',
        action: 'removed',
        skillName: skill.name
      });
    } else {
      // Just return the skill info if not removing
      res.json({
        message: 'No action taken on skill',
        action: 'kept',
        skill
      });
    }
  } catch (error) {
    console.error('Admin skill moderation error:', error);
    next(new ApiError(500, 'Failed to moderate skill'));
  }
});

// @route   POST /api/admin/messages
// @desc    Send platform-wide message
// @access  Admin
router.post('/messages', [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('content').trim().notEmpty().withMessage('Content is required'),
  body('type').isIn(['INFO', 'WARNING', 'UPDATE', 'MAINTENANCE', 'ANNOUNCEMENT']).withMessage('Invalid message type'),
  body('priority').optional().isIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']).withMessage('Invalid priority'),
  body('expiresAt').optional().isISO8601().withMessage('Invalid expiration date')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, 'Validation failed', errors.array()));
    }

    const { title, content, type, priority = 'NORMAL', expiresAt } = req.body;

    // Create platform message
    const message = await prisma.platformMessage.create({
      data: {
        title,
        content,
        type,
        priority,
        expiresAt: expiresAt ? new Date(expiresAt) : null
      }
    });

    // Send notifications to all active users for high priority messages
    if ((priority === 'HIGH' || priority === 'URGENT') && req.io) {
      const activeUsers = await prisma.user.findMany({
        where: { isActive: true },
        select: { id: true }
      });

      const notificationService = new NotificationService(req.io);
      
      // Send to all users
      for (const user of activeUsers) {
        await notificationService.notifyPlatformMessage(
          user.id,
          title,
          content,
          type,
          priority
        );
      }
    }

    res.status(201).json({
      message: 'Platform message created successfully',
      platformMessage: message
    });
  } catch (error) {
    console.error('Admin create message error:', error);
    next(new ApiError(500, 'Failed to create platform message'));
  }
});

// @route   GET /api/admin/reports/download
// @desc    Download activity reports
// @access  Admin
router.get('/reports/download', [
  query('type').isIn(['users', 'swaps', 'feedback', 'activity']).withMessage('Invalid report type'),
  query('startDate').optional().isISO8601().withMessage('Invalid start date'),
  query('endDate').optional().isISO8601().withMessage('Invalid end date')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, 'Validation failed', errors.array()));
    }

    const { type, startDate, endDate } = req.query;
    const dateFilter = {};
    
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);

    let reportData = {};
    const filename = `${type}_report_${new Date().toISOString().split('T')[0]}.json`;

    switch (type) {
      case 'users':
        reportData = await prisma.user.findMany({
          where: startDate || endDate ? { createdAt: dateFilter } : {},
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            location: true,
            createdAt: true,
            lastActive: true,
            _count: {
              select: {
                skills: true,
                sentRequests: true,
                receivedRequests: true,
                givenFeedback: true,
                receivedFeedback: true
              }
            }
          }
        });
        break;

      case 'swaps':
        reportData = await prisma.swapRequest.findMany({
          where: startDate || endDate ? { createdAt: dateFilter } : {},
          include: {
            sender: { select: { name: true, email: true } },
            receiver: { select: { name: true, email: true } },
            feedback: { select: { rating: true, comment: true } }
          }
        });
        break;

      case 'feedback':
        reportData = await prisma.feedback.findMany({
          where: startDate || endDate ? { createdAt: dateFilter } : {},
          include: {
            giver: { select: { name: true, email: true } },
            receiver: { select: { name: true, email: true } },
            swapRequest: {
              select: { skillOffered: true, skillRequested: true }
            }
          }
        });
        break;

      case 'activity':
        reportData = {
          summary: {
            totalUsers: await prisma.user.count(),
            activeUsers: await prisma.user.count({ where: { isActive: true } }),
            totalSwaps: await prisma.swapRequest.count(),
            completedSwaps: await prisma.swapRequest.count({ where: { status: 'COMPLETED' } }),
            averageRating: await prisma.feedback.aggregate({ _avg: { rating: true } }),
            totalSkills: await prisma.skill.count(),
            reportPeriod: { startDate, endDate }
          },
          recentActivity: {
            newUsers: await prisma.user.count({
              where: startDate || endDate ? { createdAt: dateFilter } : {}
            }),
            newSwaps: await prisma.swapRequest.count({
              where: startDate || endDate ? { createdAt: dateFilter } : {}
            }),
            newFeedback: await prisma.feedback.count({
              where: startDate || endDate ? { createdAt: dateFilter } : {}
            })
          }
        };
        break;
    }

    // Set headers for file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.json(reportData);
  } catch (error) {
    console.error('Admin download report error:', error);
    next(new ApiError(500, 'Failed to generate report'));
  }
});

// @route   GET /api/admin/reports
// @desc    Get pending reports for review
// @access  Admin
router.get('/reports', [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('status').optional().isIn(['PENDING', 'REVIEWED', 'RESOLVED', 'DISMISSED', 'all'])
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, 'Validation failed', errors.array()));
    }

    const { page, limit, skip } = getPaginationParams(req.query);
    const { status } = req.query;

    const whereConditions = {};
    if (status && status !== 'all') {
      whereConditions.status = status;
    }

    const totalReports = await prisma.report.count({ where: whereConditions });

    const reports = await prisma.report.findMany({
      where: whereConditions,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        reporter: { select: { id: true, name: true, email: true } },
        reportedUser: { select: { id: true, name: true, email: true } },
        skill: { select: { id: true, name: true, description: true } }
      }
    });

    res.json({
      page,
      limit,
      totalPages: Math.ceil(totalReports / limit),
      totalReports,
      reports
    });
  } catch (error) {
    console.error('Admin get reports error:', error);
    next(new ApiError(500, 'Failed to fetch reports'));
  }
});

// @route   PUT /api/admin/reports/:id
// @desc    Update report status
// @access  Admin
router.put('/reports/:id', [
  param('id').isUUID().withMessage('Invalid report ID'),
  body('status').isIn(['REVIEWED', 'RESOLVED', 'DISMISSED']).withMessage('Invalid status'),
  body('adminNotes').optional().trim().isLength({ max: 1000 }).withMessage('Admin notes too long')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, 'Validation failed', errors.array()));
    }

    const reportId = req.params.id;
    const { status, adminNotes } = req.body;

    const updatedReport = await prisma.report.update({
      where: { id: reportId },
      data: {
        status,
        adminNotes,
        updatedAt: new Date()
      },
      include: {
        reporter: { select: { id: true, name: true, email: true } },
        reportedUser: { select: { id: true, name: true, email: true } }
      }
    });

    res.json({
      message: 'Report updated successfully',
      report: updatedReport
    });
  } catch (error) {
    console.error('Admin update report error:', error);
    if (error.code === 'P2025') {
      return next(new ApiError(404, 'Report not found'));
    }
    next(new ApiError(500, 'Failed to update report'));
  }
});

module.exports = router;
