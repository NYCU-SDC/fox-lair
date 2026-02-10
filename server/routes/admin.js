import express from 'express';
import { 
  getAccessLogs, 
  addAllowedRole, 
  removeAllowedRole, 
  getAllowedRoles,
  addAllowedUser,
  removeAllowedUser,
  getAllowedUsers
} from '../database.js';
import { getBot } from '../bot.js';

const router = express.Router();

// Middleware to check admin
function requireAdmin(req, res, next) {
  if (!req.session.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Get access logs
router.get('/logs', requireAdmin, (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const logs = getAccessLogs(limit);
  res.json(logs);
});

// Get allowed roles
router.get('/roles', requireAdmin, (req, res) => {
  const roles = getAllowedRoles();
  res.json(roles);
});

// Add allowed role
router.post('/roles', requireAdmin, (req, res) => {
  const { guildId, roleId, roleName } = req.body;
  
  if (!guildId || !roleId || !roleName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    addAllowedRole(guildId, roleId, roleName);
    res.json({ success: true });
  } catch (error) {
    console.error('Error adding role:', error);
    res.status(500).json({ error: 'Failed to add role' });
  }
});

// Remove allowed role
router.delete('/roles/:guildId/:roleId', requireAdmin, (req, res) => {
  const { guildId, roleId } = req.params;
  
  try {
    removeAllowedRole(guildId, roleId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error removing role:', error);
    res.status(500).json({ error: 'Failed to remove role' });
  }
});

// Get guilds and roles from Discord
router.get('/discord/guilds', requireAdmin, async (req, res) => {
  try {
    const bot = getBot();
    if (!bot) {
      return res.status(503).json({ error: 'Discord bot not available' });
    }

    const guilds = bot.guilds.cache.map(guild => ({
      id: guild.id,
      name: guild.name,
      icon: guild.iconURL(),
      roles: guild.roles.cache
        .filter(role => role.id !== guild.id) // Exclude @everyone
        .map(role => ({
          id: role.id,
          name: role.name,
          color: role.hexColor,
          position: role.position
        }))
        .sort((a, b) => b.position - a.position)
    }));

    res.json(guilds);
  } catch (error) {
    console.error('Error fetching guilds:', error);
    res.status(500).json({ error: 'Failed to fetch guilds' });
  }
});

// Get allowed users
router.get('/users', requireAdmin, (req, res) => {
  const users = getAllowedUsers();
  res.json(users);
});

// Add allowed user
router.post('/users', requireAdmin, (req, res) => {
  const { userId, username } = req.body;
  
  if (!userId || !username) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    addAllowedUser(userId, username);
    res.json({ success: true });
  } catch (error) {
    console.error('Error adding user:', error);
    res.status(500).json({ error: 'Failed to add user' });
  }
});

// Remove allowed user
router.delete('/users/:userId', requireAdmin, (req, res) => {
  const { userId } = req.params;
  
  try {
    removeAllowedUser(userId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error removing user:', error);
    res.status(500).json({ error: 'Failed to remove user' });
  }
});

export default router;
