import express from "express";
import { createHash } from "crypto";
import { checkUserAccess } from "../bot.js";
import { getDoorStatus, unlockDoor } from "../controller.js";
import { getUserByTokenHash, isUserAllowed, logAccess } from "../database.js";

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

// Middleware to check authentication (session or Bearer API token)
const resolveUser = (req, res, next) => {
	if (req.session.user) {
		req.doorUser = {
			id: req.session.user.id,
			username: req.session.user.username,
			isAdmin: !!req.session.isAdmin,
			viaToken: false
		};
		return next();
	}

	const authHeader = req.headers.authorization;
	if (authHeader?.startsWith("Bearer ")) {
		const token = authHeader.slice(7);
		const hash = createHash("sha256").update(token).digest("hex");
		const record = getUserByTokenHash(hash);
		if (record) {
			req.doorUser = {
				id: record.user_id,
				username: record.username,
				isAdmin: false,
				viaToken: true
			};
			return next();
		}
	}

	return res.status(401).json({ error: "Not authenticated" });
};

// Middleware to check authentication (session only)
const requireAuth = (req, res, next) => {
	if (!req.session.user) {
		return res.status(401).json({ error: "Not authenticated" });
	}
	next();
};

// Middleware to check access permission
const requireAccess = async (req, res, next) => {
	const { id, isAdmin } = req.doorUser;

	// Admin always has access
	if (isAdmin) {
		return next();
	}

	// Check if user is explicitly allowed
	if (isUserAllowed(id)) {
		return next();
	}

	// Check if user has allowed role in any guild
	try {
		const hasAccess = await checkUserAccess(id);
		if (hasAccess) {
			return next();
		}
	} catch (error) {
		console.error("Error checking user access:", error);
	}

	res.status(403).json({ error: "Access denied" });
};

// Unlock door
router.post("/unlock", resolveUser, requireAccess, async (req, res) => {
	const { id: userId, username, viaToken } = req.doorUser;
	const ipAddress = req.ip || req.connection.remoteAddress;

	try {
		// Check rate limit
		const rateLimit = checkRateLimit(userId);
		if (!rateLimit.allowed) {
			console.log(`[${viaToken ? "API" : "WEB"}] unlock rate-limited for user ${username} (${userId})`);
			return res.status(429).json({
				error: "Rate limit exceeded",
				message: rateLimit.message,
				waitTime: rateLimit.waitTime
			});
		}

		// Attempt to unlock
		const result = await unlockDoor({ userId, source: viaToken ? "api" : "web" });

		if (!result.success) {
			console.log(`[${viaToken ? "API" : "WEB"}] unlock rejected for user ${username}: ${result.message}`);
			return res.status(409).json({
				error: result.message,
				timeRemaining: result.timeRemaining
			});
		}

		// Update rate limit tracker
		userLastUnlock.set(userId, Date.now());

		// Log the access with IP
		logAccess(userId, username, viaToken ? "api" : "web", ipAddress);

		console.log(`[${viaToken ? "API" : "WEB"}] door unlocked by ${username} (${userId}) from ${ipAddress}`);

		res.json({
			success: true,
			message: "Door unlocked successfully",
			duration: result.duration,
			simulated: result.simulated
		});
	} catch (error) {
		console.error(`[${viaToken ? "API" : "WEB"}] error unlocking door for user ${username}:`, error);
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
