const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const skillRoutes = require('./routes/skills');
const swapRoutes = require('./routes/swaps');
const notificationRoutes = require('./routes/notifications');
const feedbackRoutes = require('./routes/feedback');
const adminRoutes = require('./routes/admin');
const reportRoutes = require('./routes/reports');

// Create a public users route handler for just the GET all users endpoint
const publicUserRoutes = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const getPaginationParams = require('./utils/paginate');
const ApiError = require('./utils/ApiError');

// Public route - GET all users
publicUserRoutes.get('/', async (req, res, next) => {
  try {
    const { page, limit, skip } = getPaginationParams(req.query);

    // Count total public users
    const totalUsers = await prisma.user.count({
      where: { 
        isPublic: true,
        isActive: true
      }
    });

    // Fetch paginated users
    const users = await prisma.user.findMany({
      where: { 
        isPublic: true,
        isActive: true // Only show active users
      },
      skip,
      take: limit,
      select: {
        id: true,
        name: true,
        location: true,
        profilePhoto: true,
        availability: true,
        bio: true,
        createdAt: true,
        skills: {
          select: {
            id: true,
            name: true,
            type: true,
            level: true
          },
          where: {
            isApproved: true
          },
          take: 5 // Show only first 5 skills for listing
        },
        _count: {
          select: {
            skills: {
              where: { isApproved: true }
            },
            receivedFeedback: true
          }
        },
        receivedFeedback: {
          select: {
            rating: true
          }
        }
      },
      orderBy: {
        lastActive: 'desc' // Show most recently active users first
      }
    });

    // Calculate average ratings for each user
    const usersWithStats = users.map(user => {
      const avgRating = user.receivedFeedback.length > 0 
        ? user.receivedFeedback.reduce((sum, feedback) => sum + feedback.rating, 0) / user.receivedFeedback.length 
        : 0;

      return {
        ...user,
        stats: {
          totalSkills: user._count.skills,
          totalFeedback: user._count.receivedFeedback,
          averageRating: Math.round(avgRating * 10) / 10
        },
        // Remove internal data
        _count: undefined,
        receivedFeedback: undefined
      };
    });

    res.json({
      page,
      limit,
      totalPages: Math.ceil(totalUsers / limit),
      totalUsers,
      users: usersWithStats
    });
  } catch (error) {
    next(new ApiError(500, 'Failed to fetch users'));
  }
});

// Import middleware
const errorHandler = require('./middleware/errorHandler');
const authMiddleware = require('./middleware/auth');

const app = express();
const server = createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Security middleware
app.use(helmet());

// CORS configuration
// app.use(cors({
//   origin: process.env.FRONTEND_URL || "http://localhost:3000",
//   credentials: true
// }));
app.use(cors());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Make io accessible to routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Routes
app.use('/api/auth', authRoutes);

// Public route - only GET all users (no auth required)
app.use('/api/users/public', publicUserRoutes); 
app.use('/api/users/search/public', publicUserRoutes); 

// Protected user routes (all other user endpoints require auth)
app.use('/api/users', authMiddleware, userRoutes);

// Protected routes
app.use('/api/skills', authMiddleware, skillRoutes);
app.use('/api/swaps', authMiddleware, swapRoutes);
app.use('/api/notifications', authMiddleware, notificationRoutes);
app.use('/api/feedback', authMiddleware, feedbackRoutes);
app.use('/api/reports', authMiddleware, reportRoutes);
app.use('/api/admin', authMiddleware, adminRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Skill Swap API is running' });
});


// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use(errorHandler);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join user to their personal room for notifications
  socket.on('join', async (userId) => {
    try {
      socket.join(`user_${userId}`);
      console.log(`User ${userId} joined their notification room`);
      
      // Send current unread notification count
      const unreadCount = await prisma.notification.count({
        where: {
          userId,
          isRead: false
        }
      });
      
      socket.emit('notificationCount', { count: unreadCount });
    } catch (error) {
      console.error('Error joining user room:', error);
    }
  });

  // Handle user going online/offline status
  socket.on('user-online', async (userId) => {
    try {
      // Update user's last active timestamp
      await prisma.user.update({
        where: { id: userId },
        data: { lastActive: new Date() }
      });
      
      // Broadcast to other users that this user is online
      socket.broadcast.emit('user-status', { userId, status: 'online' });
    } catch (error) {
      console.error('Error updating user online status:', error);
    }
  });

  socket.on('disconnect', async () => {
    console.log('User disconnected:', socket.id);
    
    // You could implement offline status here if needed
    // Note: You'd need to track which userId was associated with this socket
  });

  // Handle typing indicators for direct messages (if implemented later)
  socket.on('typing', (data) => {
    socket.to(`user_${data.receiverId}`).emit('user-typing', {
      senderId: data.senderId,
      isTyping: data.isTyping
    });
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
