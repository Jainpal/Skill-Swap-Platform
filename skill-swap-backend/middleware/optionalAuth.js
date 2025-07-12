/**
 * Optional authentication middleware
 * Adds user data to req.user if token is provided, but doesn't block the request
 */
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        const user = await prisma.user.findUnique({
          where: { id: decoded.userId },
          select: {
            id: true,
            name: true,
            email: true,
            location: true,
            profilePhoto: true,
            isPublic: true,
            availability: true,
            role: true
          }
        });

        if (user) {
          req.user = user; // Add user to request if valid token
        }
      } catch (error) {
        // Invalid token, but continue without user
        console.log('Invalid token in optional auth:', error.message);
      }
    }
    
    next();
  } catch (error) {
    console.error('Optional auth middleware error:', error);
    next(); // Continue even if there's an error
  }
};

module.exports = optionalAuth;
