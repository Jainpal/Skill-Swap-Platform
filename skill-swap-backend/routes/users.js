const express = require('express');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();
const getPaginationParams = require('../utils/paginate');

const ApiError = require('../utils/ApiError');

// @route   GET /api/users/profile
// @desc    Get user profile
// @access  Private
router.get('/profile', async (req, res, next) => {
  try {
    const userId = req.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        location: true,
        profilePhoto: true,
        availability: true,
        isPublic: true,
        bio: true,
        role: true,
        createdAt: true,
        lastActive: true,
        skills: {
          select: {
            id: true,
            name: true,
            description: true,
            type: true,
            level: true,
            isApproved: true,
            createdAt: true
          },
          where: {
            isApproved: true
          },
          orderBy: {
            createdAt: 'desc'
          }
        },
        receivedFeedback: {
          select: {
            id: true,
            rating: true,
            comment: true,
            createdAt: true,
            giver: {
              select: {
                id: true,
                name: true,
                profilePhoto: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 10 // Limit to recent 10 feedback
        },
        _count: {
          select: {
            skills: {
              where: { isApproved: true }
            },
            sentSwapRequests: true,
            receivedSwapRequests: true,
            receivedFeedback: true
          }
        }
      }
    });

    if (!user) {
        return next(new ApiError(404, 'User not found'));
    }

    // Calculate average rating
    const avgRating = user.receivedFeedback.length > 0 
      ? user.receivedFeedback.reduce((sum, feedback) => sum + feedback.rating, 0) / user.receivedFeedback.length 
      : 0;

    // Separate skills by type
    const offeredSkills = user.skills.filter(skill => skill.type === 'OFFERED');
    const wantedSkills = user.skills.filter(skill => skill.type === 'WANTED');

    const responseData = {
      ...user,
      stats: {
        totalSkills: user._count.skills,
        totalSwapsSent: user._count.sentSwapRequests,
        totalSwapsReceived: user._count.receivedSwapRequests,
        totalFeedback: user._count.receivedFeedback,
        averageRating: Math.round(avgRating * 10) / 10 // Round to 1 decimal
      },
      offeredSkills,
      wantedSkills
    };

    // Remove the original skills array and _count to avoid duplication
    delete responseData.skills;
    delete responseData._count;

    res.json({ user: responseData });
  } catch (error) {
    // console.error('Get profile error:', error);
    next(new ApiError(500, 'Failed to fetch users'));
  }
});

// @route   PUT /api/users/profile
// @desc    Update logged-in user's profile and skills
// @access  Private
router.put('/profile', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const {
      name,
      location,
      profilePhoto,
      availability,
      isPublic,
      bio,
      offeredSkills,
      wantedSkills
    } = req.body;

    // Validate availability
    const allowedAvailability = ["Available", "Busy", "Away", "Weekends", "Evenings"];
    if (availability && !allowedAvailability.includes(availability)) {
      return next(new ApiError(400, `Invalid availability value. Allowed: ${allowedAvailability.join(', ')}`));
    }

    // Validate skills arrays if provided
    const allowedSkillLevels = ["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"];
    
    // Validate profile photo if provided (base64 image)
    if (profilePhoto) {
      // Check if it's a valid base64 image
      if (typeof profilePhoto !== 'string') {
        return next(new ApiError(400, 'Profile photo must be a string'));
      }
      
      // Check if it's a data URL (data:image/...)
      const base64Regex = /^data:image\/(jpeg|jpg|png|gif|webp);base64,/;
      if (!base64Regex.test(profilePhoto)) {
        return next(new ApiError(400, 'Profile photo must be a valid base64 image (jpeg, jpg, png, gif, webp)'));
      }
      
      // Check image size (limit to 5MB)
      const base64Data = profilePhoto.split(',')[1];
      const imageSizeInBytes = (base64Data.length * 3) / 4;
      const maxSizeInMB = 5;
      if (imageSizeInBytes > maxSizeInMB * 1024 * 1024) {
        return next(new ApiError(400, `Profile photo must be smaller than ${maxSizeInMB}MB`));
      }
    }
    
    if (offeredSkills && Array.isArray(offeredSkills)) {
      for (const skill of offeredSkills) {
        if (!skill.name || skill.name.trim().length === 0) {
          return next(new ApiError(400, 'Skill name is required'));
        }
        if (skill.name.length > 100) {
          return next(new ApiError(400, 'Skill name must be less than 100 characters'));
        }
        if (skill.level && !allowedSkillLevels.includes(skill.level)) {
          return next(new ApiError(400, `Invalid skill level. Allowed: ${allowedSkillLevels.join(', ')}`));
        }
      }
    }

    if (wantedSkills && Array.isArray(wantedSkills)) {
      for (const skill of wantedSkills) {
        if (!skill.name || skill.name.trim().length === 0) {
          return next(new ApiError(400, 'Skill name is required'));
        }
        if (skill.name.length > 100) {
          return next(new ApiError(400, 'Skill name must be less than 100 characters'));
        }
        if (skill.level && !allowedSkillLevels.includes(skill.level)) {
          return next(new ApiError(400, `Invalid skill level. Allowed: ${allowedSkillLevels.join(', ')}`));
        }
      }
    }

    // Check if user is active
    const userExists = await prisma.user.findUnique({
      where: { id: userId },
      select: { isActive: true }
    });

    if (!userExists || !userExists.isActive) {
      return next(new ApiError(403, 'Your account is inactive. Update not allowed.'));
    }

    // Use transaction to update profile and skills together
    const result = await prisma.$transaction(async (tx) => {
      // Update user profile
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          ...(name !== undefined && { name }),
          ...(location !== undefined && { location }),
          ...(profilePhoto !== undefined && { profilePhoto }),
          ...(availability !== undefined && { availability }),
          ...(isPublic !== undefined && { isPublic }),
          ...(bio !== undefined && { bio }),
          lastActive: new Date() // Update last active time
        }
      });

      // Handle skills update if provided
      if (offeredSkills !== undefined || wantedSkills !== undefined) {
        // Delete existing skills if new skills are provided
        if (offeredSkills !== undefined) {
          await tx.skill.deleteMany({
            where: {
              userId: userId,
              type: 'OFFERED'
            }
          });

          // Add new offered skills
          if (offeredSkills.length > 0) {
            await tx.skill.createMany({
              data: offeredSkills.map(skill => ({
                userId: userId,
                name: skill.name.trim(), // Keep original case for display
                description: skill.description?.trim() || null,
                type: 'OFFERED',
                level: skill.level || null,
                isApproved: true // Auto-approve for now, admin can review later
              }))
            });
          }
        }

        if (wantedSkills !== undefined) {
          await tx.skill.deleteMany({
            where: {
              userId: userId,
              type: 'WANTED'
            }
          });

          // Add new wanted skills
          if (wantedSkills.length > 0) {
            await tx.skill.createMany({
              data: wantedSkills.map(skill => ({
                userId: userId,
                name: skill.name.trim(), // Keep original case for display  
                description: skill.description?.trim() || null,
                type: 'WANTED',
                level: skill.level || null,
                isApproved: true // Auto-approve for now, admin can review later
              }))
            });
          }
        }
      }

      // Fetch the complete updated user data with skills
      const completeUser = await tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          location: true,
          profilePhoto: true,
          availability: true,
          isPublic: true,
          bio: true,
          role: true,
          createdAt: true,
          lastActive: true,
          skills: {
            select: {
              id: true,
              name: true,
              description: true,
              type: true,
              level: true,
              isApproved: true,
              createdAt: true
            },
            where: {
              isApproved: true
            },
            orderBy: {
              createdAt: 'desc'
            }
          },
          _count: {
            select: {
              skills: {
                where: { isApproved: true }
              },
              sentSwapRequests: true,
              receivedSwapRequests: true,
              receivedFeedback: true
            }
          }
        }
      });

      return completeUser;
    });

    // Format response similar to GET profile
    const offeredSkillsResponse = result.skills.filter(skill => skill.type === 'OFFERED');
    const wantedSkillsResponse = result.skills.filter(skill => skill.type === 'WANTED');

    const responseData = {
      ...result,
      stats: {
        totalSkills: result._count.skills,
        totalSwapsSent: result._count.sentSwapRequests,
        totalSwapsReceived: result._count.receivedSwapRequests,
        totalFeedback: result._count.receivedFeedback
      },
      offeredSkills: offeredSkillsResponse,
      wantedSkills: wantedSkillsResponse
    };

    // Clean up response
    delete responseData.skills;
    delete responseData._count;

    res.json({ 
      message: 'Profile updated successfully',
      user: responseData 
    });
  } catch (error) {
    console.error('Profile update error:', error);
    next(new ApiError(500, 'Failed to update profile'));
  }
});


// @route   GET /api/users/public
// @desc    Get all users (public)
// @access  Public
router.get('/public', async (req, res, next) => {
  try {
    const { page, limit, skip } = getPaginationParams(req.query);

    // Count total public users
    const totalUsers = await prisma.user.count({
      where: { isPublic: true }
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
        // email: true,
        // location: true,
        profilePhoto: true,
        // availability: true,
        // isPublic: true,
        // bio: true,
        // createdAt: true,
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

// @route   GET /api/users/getUserById?id=<userId>
// @desc    Get public user profile by ID
// @access  Public
router.get('/getUserById', async (req, res, next) => {
  try {
    const userId = req.query.id;
    if (!userId) {
        return next(new ApiError(400, 'Missing user id'));
    }
    // console.log(userId);
    const user = await prisma.user.findUnique({
      where: {     
        id: userId
      },
      select: {
        id: true,
        name: true,
        // email: true,
        location: true,
        profilePhoto: true,
        availability: true,
        // isPublic: true,
        bio: true,
        // createdAt: true,
        // lastActive: true,
        isActive: true,
        skills: {
          select: {
            // id: true,
            name: true,
            // description: true,
            type: true,
            level: true,
            // isApproved: true,
            // createdAt: true
          },
          where: {
            isApproved: true
          },
          orderBy: [
            { type: 'asc' }, // OFFERED first, then WANTED
            { createdAt: 'desc' }
          ]
        },
        receivedFeedback: {
          select: {
            id: true,
            rating: true,
            comment: true,
            createdAt: true,
            giver: {
              select: {
                id: true,
                name: true,
                profilePhoto: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 20 // Show more feedback on individual profile
        },
        _count: {
          select: {
            skills: {
              where: { isApproved: true }
            },
            sentSwapRequests: {
              where: { status: 'COMPLETED' }
            },
            receivedSwapRequests: {
              where: { status: 'COMPLETED' }
            },
            receivedFeedback: true
          }
        }
      }
    });
    if (!user) {
      // User not found or profile private
      return next(new ApiError(404, 'User not found or profile is private'));
    }

    // Check if user is active (not banned)
    if (!user.isActive) {
      return next(new ApiError(403, 'User profile is not available'));
    }

    // Calculate average rating and other stats
    const avgRating = user.receivedFeedback.length > 0 
      ? user.receivedFeedback.reduce((sum, feedback) => sum + feedback.rating, 0) / user.receivedFeedback.length 
      : 0;

    // Separate skills by type
    const offeredSkills = user.skills.filter(skill => skill.type === 'OFFERED');
    const wantedSkills = user.skills.filter(skill => skill.type === 'WANTED');

    // Group feedback by rating for distribution
    const ratingDistribution = [1, 2, 3, 4, 5].map(rating => ({
      rating,
      count: user.receivedFeedback.filter(feedback => feedback.rating === rating).length
    }));

    const responseData = {
      ...user,
      stats: {
        totalSkills: user._count.skills,
        totalCompletedSwaps: user._count.sentSwapRequests + user._count.receivedSwapRequests,
        totalFeedback: user._count.receivedFeedback,
        averageRating: Math.round(avgRating * 10) / 10,
        ratingDistribution
      },
      offeredSkills,
      wantedSkills,
      recentFeedback: user.receivedFeedback
    };

    // Remove internal data to avoid duplication
    delete responseData.skills;
    delete responseData._count;
    delete responseData.receivedFeedback;
    delete responseData.isActive; // Don't expose internal status

    res.json({ user: responseData });
  } catch (error) {
    next(new ApiError(500, 'Failed to fetch user profile'));
  }
});

// @route   GET /api/users/search/public
// @desc    Search users by skills, location, or name
// @access  Public
router.get('/search/public', async (req, res, next) => {
  try {
    const { skill, location, name, skillType, page = 1, limit = 10 } = req.query;
    const { skip } = getPaginationParams({ page, limit });

    // Build search conditions
    const whereConditions = {
      isPublic: true,
      isActive: true,
      AND: []
    };

    // Search by name (case insensitive)
    if (name) {
      whereConditions.AND.push({
        name: {
          contains: name,
          mode: 'insensitive'
        }
      });
    }

    // Search by location (case insensitive)
    if (location) {
      whereConditions.AND.push({
        location: {
          contains: location,
          mode: 'insensitive'
        }
      });
    }

    // Search by skills
    if (skill) {
      const skillCondition = {
        skills: {
          some: {
            name: {
              contains: skill,
              mode: 'insensitive'
            },
            isApproved: true
          }
        }
      };

      // Filter by skill type if specified
      if (skillType && ['OFFERED', 'WANTED'].includes(skillType.toUpperCase())) {
        skillCondition.skills.some.type = skillType.toUpperCase();
      }

      whereConditions.AND.push(skillCondition);
    }

    // If no search conditions, remove empty AND array
    if (whereConditions.AND.length === 0) {
      delete whereConditions.AND;
    }

    const totalUsers = await prisma.user.count({
      where: whereConditions
    });

    const users = await prisma.user.findMany({
      where: whereConditions,
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
            isApproved: true,
            ...(skill && {
              name: {
                contains: skill,
                mode: 'insensitive'
              }
            }),
            ...(skillType && ['OFFERED', 'WANTED'].includes(skillType.toUpperCase()) && {
              type: skillType.toUpperCase()
            })
          }
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
        lastActive: 'desc'
      }
    });

    // Calculate stats for each user
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
        _count: undefined,
        receivedFeedback: undefined
      };
    });

    res.json({
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(totalUsers / limit),
      totalUsers,
      searchParams: { skill, location, name, skillType },
      users: usersWithStats
    });
  } catch (error) {
    next(new ApiError(500, 'Failed to search users'));
  }
});


module.exports = router;
