const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { query, param, validationResult } = require('express-validator');
const NotificationService = require('../services/NotificationService');

const router = express.Router();
const prisma = new PrismaClient();

const ApiError = require('../utils/ApiError');
const getPaginationParams = require('../utils/paginate');

// @route   GET /api/notifications
// @desc    Get user's notifications with pagination
// @access  Private
router.get('/', [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  query('unread').optional().isBoolean().toBoolean(),
  query('type').optional().isIn([
    'SWAP_REQUEST_RECEIVED',
    'SWAP_REQUEST_ACCEPTED', 
    'SWAP_REQUEST_REJECTED',
    'SWAP_COMPLETED',
    'FEEDBACK_RECEIVED',
    'SKILL_APPROVED',
    'SKILL_REJECTED',
    'PLATFORM_MESSAGE'
  ])
], async (req, res, next) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, 'Validation failed', errors.array()));
    }

    const userId = req.user.id;
    const { page, limit, skip } = getPaginationParams(req.query);
    const { unread, type } = req.query;

    // Build where conditions
    const whereConditions = { userId };
    
    if (unread !== undefined) {
      whereConditions.isRead = !unread;
    }
    
    if (type) {
      whereConditions.type = type;
    }

    // Get total count
    const totalNotifications = await prisma.notification.count({
      where: whereConditions
    });

    // Get notifications
    const notifications = await prisma.notification.findMany({
      where: whereConditions,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        data: true,
        isRead: true,
        readAt: true,
        createdAt: true
      }
    });

    // Parse data field for each notification
    const notificationsWithData = notifications.map(notification => ({
      ...notification,
      data: notification.data ? JSON.parse(notification.data) : null
    }));

    // Get unread count
    const unreadCount = await prisma.notification.count({
      where: {
        userId,
        isRead: false
      }
    });

    res.json({
      page,
      limit,
      totalPages: Math.ceil(totalNotifications / limit),
      totalNotifications,
      unreadCount,
      notifications: notificationsWithData
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    next(new ApiError(500, 'Failed to fetch notifications'));
  }
});

// @route   GET /api/notifications/unread-count
// @desc    Get user's unread notification count
// @access  Private
router.get('/unread-count', async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    const unreadCount = await prisma.notification.count({
      where: {
        userId,
        isRead: false
      }
    });

    res.json({ count: unreadCount });
  } catch (error) {
    console.error('Get unread count error:', error);
    next(new ApiError(500, 'Failed to get unread count'));
  }
});

// @route   PUT /api/notifications/:id/read
// @desc    Mark a notification as read
// @access  Private
router.put('/:id/read', [
  param('id').isUUID().withMessage('Invalid notification ID')
], async (req, res, next) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, 'Validation failed', errors.array()));
    }

    const notificationId = req.params.id;
    const userId = req.user.id;

    // Initialize notification service for real-time updates
    const notificationService = new NotificationService(req.io);
    
    const notification = await notificationService.markAsRead(notificationId, userId);

    res.json({ 
      message: 'Notification marked as read',
      notification
    });
  } catch (error) {
    console.error('Mark notification as read error:', error);
    if (error.code === 'P2025') {
      return next(new ApiError(404, 'Notification not found'));
    }
    next(new ApiError(500, 'Failed to mark notification as read'));
  }
});

// @route   PUT /api/notifications/mark-all-read
// @desc    Mark all notifications as read for the user
// @access  Private
router.put('/mark-all-read', async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Initialize notification service for real-time updates
    const notificationService = new NotificationService(req.io);
    
    await notificationService.markAllAsRead(userId);

    res.json({ 
      message: 'All notifications marked as read'
    });
  } catch (error) {
    console.error('Mark all notifications as read error:', error);
    next(new ApiError(500, 'Failed to mark all notifications as read'));
  }
});

// @route   DELETE /api/notifications/:id
// @desc    Delete a notification
// @access  Private
router.delete('/:id', [
  param('id').isUUID().withMessage('Invalid notification ID')
], async (req, res, next) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, 'Validation failed', errors.array()));
    }

    const notificationId = req.params.id;
    const userId = req.user.id;

    // Delete the notification (only if user owns it)
    await prisma.notification.delete({
      where: {
        id: notificationId,
        userId
      }
    });

    // Send updated count via socket
    if (req.io) {
      const unreadCount = await prisma.notification.count({
        where: {
          userId,
          isRead: false
        }
      });
      req.io.to(`user_${userId}`).emit('notificationCount', { count: unreadCount });
    }

    res.json({ 
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    console.error('Delete notification error:', error);
    if (error.code === 'P2025') {
      return next(new ApiError(404, 'Notification not found'));
    }
    next(new ApiError(500, 'Failed to delete notification'));
  }
});

// @route   DELETE /api/notifications/clear-all
// @desc    Delete all notifications for the user
// @access  Private
router.delete('/clear-all', async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Delete all notifications for the user
    const result = await prisma.notification.deleteMany({
      where: { userId }
    });

    // Send updated count via socket
    if (req.io) {
      req.io.to(`user_${userId}`).emit('notificationCount', { count: 0 });
    }

    res.json({ 
      message: `Cleared ${result.count} notifications`
    });
  } catch (error) {
    console.error('Clear all notifications error:', error);
    next(new ApiError(500, 'Failed to clear notifications'));
  }
});

module.exports = router;
