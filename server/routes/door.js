import express from "express";
import { checkUserAccess } from "../bot.js";
import { getDoorStatus, unlockDoor } from "../controller.js";
import { isUserAllowed, logAccess } from "../database.js";

const router = express.Router();

// Rate limiting: Track last unlock time per user
const userLastUnlock = new Map();
const RATE_LIMIT_MS = 0; // 30 seconds between unlocks per user

/**
 * Check if user can unlock (rate limit)
 */
const checkRateLimit = userId => {
	const lastUnlock = userLastUnlock.get(userId);
	if (!lastUnlock) return { allowed: true };

	const timeSince = Date.now() - lastUnlock;
	if (timeSince < RATE_LIMIT_MS) {
		const waitTime = Math.ceil((RATE_LIMIT_MS - timeSince) / 1000);
		return {
			allowed: false,
			waitTime,
			message: `Please wait ${waitTime} seconds before unlocking again`
		};
	}

	return { allowed: true };
};

// Middleware to check authentication
const requireAuth = (req, res, next) => {
	if (!req.session.user) {
		return res.status(401).json({ error: "Not authenticated" });
	}
	next();
};

// Middleware to check access permission
const requireAccess = async (req, res, next) => {
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
		console.error("Error checking user access:", error);
	}

	res.status(403).json({ error: "Access denied" });
};

// Unlock door
router.post("/unlock", requireAuth, requireAccess, async (req, res) => {
	const userId = req.session.user.id;
	const username = req.session.user.username;
	const ipAddress = req.ip || req.connection.remoteAddress;

	try {
		// Check rate limit
		const rateLimit = checkRateLimit(userId);
		if (!rateLimit.allowed) {
			console.log(`[WEB] unlock rate-limited for user ${username} (${userId})`);
			return res.status(429).json({
				error: "Rate limit exceeded",
				message: rateLimit.message,
				waitTime: rateLimit.waitTime
			});
		}

		// Attempt to unlock
		const result = await unlockDoor({ userId, source: "web" });

		if (!result.success) {
			console.log(`[WEB] unlock rejected for user ${username}: ${result.message}`);
			return res.status(409).json({
				error: result.message,
				timeRemaining: result.timeRemaining
			});
		}

		// Update rate limit tracker
		userLastUnlock.set(userId, Date.now());

		// Log the access with IP
		logAccess(userId, username, "web", ipAddress);

		console.log(`[WEB] door unlocked by ${username} (${userId}) from ${ipAddress}`);

		res.json({
			success: true,
			message: "Door unlocked successfully",
			duration: result.duration,
			simulated: result.simulated
		});
	} catch (error) {
		console.error(`[WEB] error unlocking door for user ${username}:`, error);
		res.status(500).json({
			error: "Failed to unlock door",
			message: "An internal error occurred. Please try again."
		});
	}
});

// Get door status
router.get("/status", requireAuth, (req, res) => {
	const status = getDoorStatus();
	res.json(status);
});

export default router;
