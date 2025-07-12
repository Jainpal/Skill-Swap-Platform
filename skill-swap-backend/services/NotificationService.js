/**
 * Notification Service - Handles creating and sending real-time notifications
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

class NotificationService {
  constructor(io = null) {
    this.io = io;
  }

  /**
   * Create and send a notification
   * @param {string} userId - User ID to send notification to
   * @param {string} type - Notification type enum
   * @param {string} title - Notification title
   * @param {string} message - Notification message
   * @param {object} data - Additional data (optional)
   * @param {boolean} realtime - Send real-time notification (default: true)
   */
  async createNotification(userId, type, title, message, data = null, realtime = true) {
    try {
      // Create notification in database
      const notification = await prisma.notification.create({
        data: {
          userId,
          type,
          title,
          message,
          data: data ? JSON.stringify(data) : null,
          isRead: false
        }
      });

      // Send real-time notification if socket.io is available
      if (realtime && this.io) {
        this.io.to(`user_${userId}`).emit('notification', {
          id: notification.id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          data: data,
          createdAt: notification.createdAt,
          isRead: false
        });

        // Also emit notification count update
        const unreadCount = await this.getUnreadCount(userId);
        this.io.to(`user_${userId}`).emit('notificationCount', { count: unreadCount });
      }

      return notification;
    } catch (error) {
      console.error('Error creating notification:', error);
      throw error;
    }
  }

  /**
   * Get unread notification count for a user
   */
  async getUnreadCount(userId) {
    return await prisma.notification.count({
      where: {
        userId,
        isRead: false
      }
    });
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId, userId) {
    const notification = await prisma.notification.update({
      where: {
        id: notificationId,
        userId // Ensure user owns the notification
      },
      data: {
        isRead: true,
        readAt: new Date()
      }
    });

    // Send updated count
    if (this.io) {
      const unreadCount = await this.getUnreadCount(userId);
      this.io.to(`user_${userId}`).emit('notificationCount', { count: unreadCount });
    }

    return notification;
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId) {
    await prisma.notification.updateMany({
      where: {
        userId,
        isRead: false
      },
      data: {
        isRead: true,
        readAt: new Date()
      }
    });

    // Send updated count
    if (this.io) {
      this.io.to(`user_${userId}`).emit('notificationCount', { count: 0 });
    }
  }

  /**
   * Pre-built notification templates
   */
  async notifySwapRequestReceived(receiverId, senderName, skillOffered, skillRequested, swapId) {
    await this.createNotification(
      receiverId,
      'SWAP_REQUEST_RECEIVED',
      'New Swap Request',
      `${senderName} wants to swap ${skillRequested} for your ${skillOffered}`,
      { swapId, senderName, skillOffered, skillRequested }
    );
  }

  async notifySwapRequestAccepted(senderId, receiverName, skillOffered, skillRequested, swapId) {
    await this.createNotification(
      senderId,
      'SWAP_REQUEST_ACCEPTED',
      'Swap Request Accepted! 🎉',
      `${receiverName} accepted your request to swap ${skillOffered} for ${skillRequested}`,
      { swapId, receiverName, skillOffered, skillRequested }
    );
  }

  async notifySwapRequestRejected(senderId, receiverName, skillOffered, skillRequested, swapId) {
    await this.createNotification(
      senderId,
      'SWAP_REQUEST_REJECTED',
      'Swap Request Declined',
      `${receiverName} declined your request to swap ${skillOffered} for ${skillRequested}`,
      { swapId, receiverName, skillOffered, skillRequested }
    );
  }

  async notifySwapCompleted(userId, otherUserName, skillOffered, skillRequested, swapId) {
    await this.createNotification(
      userId,
      'SWAP_COMPLETED',
      'Swap Completed! ✨',
      `Your skill swap with ${otherUserName} has been completed. Don't forget to leave feedback!`,
      { swapId, otherUserName, skillOffered, skillRequested }
    );
  }

  async notifyFeedbackReceived(userId, giverName, rating, swapId) {
    const stars = '⭐'.repeat(rating);
    await this.createNotification(
      userId,
      'FEEDBACK_RECEIVED',
      'New Feedback Received',
      `${giverName} rated your skill swap ${stars} (${rating}/5)`,
      { swapId, giverName, rating }
    );
  }

  async notifySkillRemoved(userId, skillName, reason = null) {
    await this.createNotification(
      userId,
      'SKILL_REJECTED',
      'Skill Removed by Admin',
      `Your skill "${skillName}" has been removed by an administrator. ${reason ? `Reason: ${reason}` : 'Please contact support for more information.'}`,
      { skillName, reason, adminAction: true }
    );
  }

  async notifyAccountAction(userId, action, reason = null) {
    const titles = {
      'suspended': 'Account Suspended',
      'warning': 'Account Warning',
      'reactivated': 'Account Reactivated'
    };
    
    const messages = {
      'suspended': `Your account has been suspended. ${reason ? `Reason: ${reason}` : 'Please contact support for more information.'}`,
      'warning': `You have received a warning. ${reason ? `Reason: ${reason}` : 'Please review our community guidelines.'}`,
      'reactivated': 'Your account has been reactivated. Welcome back!'
    };

    await this.createNotification(
      userId,
      'SYSTEM_ALERT',
      titles[action] || 'Account Action',
      messages[action] || 'Your account status has been updated.',
      { action, reason, adminAction: true }
    );
  }

  async notifyPlatformMessage(userId, title, message, messageType = 'INFO', priority = 'NORMAL') {
    await this.createNotification(
      userId,
      'PLATFORM_MESSAGE',
      title,
      message,
      { messageType, priority, adminMessage: true }
    );
  }
}

module.exports = NotificationService;
