import express from 'express';
import axios from 'axios';
import { addAllowedUser } from '../database.js';

const router = express.Router();

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || 'http://localhost:3000/api/auth/discord/callback';

// Discord OAuth login
router.get('/discord', (req, res) => {
  const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI)}&response_type=code&scope=identify%20guilds.members.read`;
  res.redirect(authUrl);
});

// Discord OAuth callback
router.get('/discord/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.redirect(`/?error=no_code`);
  }

  try {
    // Exchange code for token
    const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', 
      new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: DISCORD_REDIRECT_URI
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const { access_token } = tokenResponse.data;

    // Get user info
    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${access_token}`
      }
    });

    const user = userResponse.data;

    // Store in session
    req.session.user = {
      id: user.id,
      username: user.username,
      discriminator: user.discriminator,
      avatar: user.avatar,
      accessToken: access_token
    };

    // Check if admin (via password or specific user ID)
    const adminPassword = process.env.ADMIN_PASSWORD;
    const adminUserIds = (process.env.ADMIN_USER_IDS || '').split(',');
    req.session.isAdmin = adminUserIds.includes(user.id);

    res.redirect("/");
  } catch (error) {
    console.error('Discord OAuth error:', error.response?.data || error.message);
    res.redirect(`/?error=oauth_failed`);
  }
});

// Password login (admin only)
router.post('/password', (req, res) => {
  const { password } = req.body;

  if (password === process.env.ADMIN_PASSWORD) {
    req.session.user = {
      id: 'admin',
      username: 'Administrator'
    };
    req.session.isAdmin = true;

    return res.json({ success: true, user: req.session.user });
  }

  res.status(401).json({ error: 'Invalid password' });
});

// Get current user
router.get('/me', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  res.json({
    user: {
      id: req.session.user.id,
      username: req.session.user.username,
      discriminator: req.session.user.discriminator,
      avatar: req.session.user.avatar
    },
    isAdmin: req.session.isAdmin || false
  });
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.json({ success: true });
  });
});

export default router;
