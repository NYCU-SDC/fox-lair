import express from 'express';
import { unlockDoor, getDoorStatus } from '../controller.js';
import { logAccess, isUserAllowed } from '../database.js';
import { checkUserAccess } from '../bot.js';

const router = express.Router();

// Middleware to check authentication
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// Middleware to check access permission
async function requireAccess(req, res, next) {
  const userId = req.session.user.id;

  // Admin always has access
  if (req.session.isAdmin) {
    return next();
  }

  // Check if user is explicitly allowed
  if (isUserAllowed(userId)) {
    return next();
  }

  // Check if user has allowed role in any guild
  try {
    const hasAccess = await checkUserAccess(userId);
    if (hasAccess) {
      return next();
    }
  } catch (error) {
    console.error('Error checking user access:', error);
  }

  res.status(403).json({ error: 'Access denied' });
}

// Unlock door
router.post('/unlock', requireAuth, requireAccess, async (req, res) => {
  try {
    const result = await unlockDoor();
    
    // Log the access
    logAccess(
      req.session.user.id,
      req.session.user.username,
      'web'
    );

    res.json({
      success: true,
      message: 'Door unlocked',
      duration: result.duration || 8000,
      simulated: result.simulated || false
    });
  } catch (error) {
    console.error('Error unlocking door:', error);
    res.status(500).json({ error: 'Failed to unlock door' });
  }
});

// Get door status
router.get('/status', requireAuth, (req, res) => {
  const status = getDoorStatus();
  res.json(status);
});

export default router;
