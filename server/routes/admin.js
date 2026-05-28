import express from "express";
import { getBot } from "../bot.js";
import {
	addAllowedRole,
	addAllowedUser,
	createPhysicalPassword,
	getAccessLogs,
	getAllowedRoles,
	getAllowedUsers,
	getAuditLogs,
	getPhysicalPasswordById,
	getPhysicalPasswords,
	logAudit,
	removeAllowedRole,
	removeAllowedUser,
	revokePhysicalPassword
} from "../database.js";

const router = express.Router();
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Middleware to check admin
const requireAdmin = (req, res, next) => {
	if (!req.session.isAdmin) {
		return res.status(403).json({ error: "Admin access required" });
	}
	next();
};

// Middleware to check backend session access
const requireBackendAuth = (req, res, next) => {
	if (!req.session.user) {
		return res.status(401).json({ error: "Not authenticated" });
	}
	next();
};

const getIpAddress = req => req.ip || req.connection.remoteAddress || null;

const getActor = req => ({
	userId: req.session.user.id,
	username: req.session.user.username
});

const parseDateInput = value => {
	if (!value) return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
};

const getPhysicalPasswordStatus = password => {
	if (password.revoked_at) return "revoked";

	const now = Date.now();
	const startsAt = Date.parse(password.starts_at);
	const endsAt = Date.parse(password.ends_at);

	if (Number.isFinite(startsAt) && now < startsAt) return "scheduled";
	if (Number.isFinite(endsAt) && now > endsAt) return "expired";
	return "active";
};

const parseAuditDetails = log => {
	if (!log.details) return { ...log, details: null };

	try {
		return { ...log, details: JSON.parse(log.details) };
	} catch {
		return { ...log, details: null };
	}
};

// Get access logs
router.get("/logs", requireAdmin, (req, res) => {
	const limit = parseInt(req.query.limit) || 100;
	const logs = getAccessLogs(limit);
	res.json(logs);
});

// Get recent physical password audit logs
router.get("/physical-password-logs", requireBackendAuth, (req, res) => {
	const limit = parseInt(req.query.limit) || 50;
	const logs = getAuditLogs({ limit, targetType: "physical_password" }).map(parseAuditDetails);
	res.json(logs);
});

// Get physical keypad passwords
router.get("/physical-passwords", requireBackendAuth, (req, res) => {
	const passwords = getPhysicalPasswords().map(password => ({
		...password,
		status: getPhysicalPasswordStatus(password)
	}));
	res.json(passwords);
});

// Add physical keypad password
router.post("/physical-passwords", requireBackendAuth, (req, res) => {
	const rawPassword = String(req.body.password || "").trim();
	const label =
		String(req.body.label || "Physical PIN")
			.trim()
			.slice(0, 80) || "Physical PIN";
	const startsAt = parseDateInput(req.body.startsAt) || new Date();
	const endsAt = parseDateInput(req.body.endsAt) || new Date(startsAt.getTime() + ONE_DAY_MS);
	const actor = getActor(req);
	const ipAddress = getIpAddress(req);

	if (!/^\d{4,12}$/.test(rawPassword)) {
		return res.status(400).json({ error: "PIN must be 4 to 12 digits" });
	}

	if (endsAt.getTime() <= startsAt.getTime()) {
		return res.status(400).json({ error: "End time must be after start time" });
	}

	try {
		const result = createPhysicalPassword({
			label,
			password: rawPassword,
			startsAt: startsAt.toISOString(),
			endsAt: endsAt.toISOString(),
			createdByUserId: actor.userId,
			createdByUsername: actor.username
		});

		logAudit({
			actorUserId: actor.userId,
			actorUsername: actor.username,
			action: "physical_password.create",
			targetType: "physical_password",
			targetId: String(result.lastInsertRowid),
			details: {
				label,
				startsAt: startsAt.toISOString(),
				endsAt: endsAt.toISOString()
			},
			ipAddress
		});

		res.status(201).json({ success: true, id: result.lastInsertRowid });
	} catch (error) {
		console.error("Error adding physical password:", error);
		res.status(500).json({ error: "Failed to add physical password" });
	}
});

// Revoke physical keypad password
router.delete("/physical-passwords/:id", requireBackendAuth, (req, res) => {
	const id = parseInt(req.params.id);
	const actor = getActor(req);
	const ipAddress = getIpAddress(req);

	if (!Number.isInteger(id)) {
		return res.status(400).json({ error: "Invalid password ID" });
	}

	const existing = getPhysicalPasswordById(id);
	if (!existing) {
		return res.status(404).json({ error: "Physical password not found" });
	}

	try {
		const result = revokePhysicalPassword({
			id,
			revokedByUserId: actor.userId,
			revokedByUsername: actor.username
		});

		if (result.changes > 0) {
			logAudit({
				actorUserId: actor.userId,
				actorUsername: actor.username,
				action: "physical_password.revoke",
				targetType: "physical_password",
				targetId: String(id),
				details: {
					label: existing.label
				},
				ipAddress
			});
		}

		res.json({ success: true });
	} catch (error) {
		console.error("Error revoking physical password:", error);
		res.status(500).json({ error: "Failed to revoke physical password" });
	}
});

// Get allowed roles
router.get("/roles", requireAdmin, (req, res) => {
	const roles = getAllowedRoles();
	res.json(roles);
});

// Add allowed role
router.post("/roles", requireAdmin, (req, res) => {
	const { guildId, roleId, roleName } = req.body;

	if (!guildId || !roleId || !roleName) {
		return res.status(400).json({ error: "Missing required fields" });
	}

	try {
		addAllowedRole(guildId, roleId, roleName);
		res.json({ success: true });
	} catch (error) {
		console.error("Error adding role:", error);
		res.status(500).json({ error: "Failed to add role" });
	}
});

// Remove allowed role
router.delete("/roles/:guildId/:roleId", requireAdmin, (req, res) => {
	const { guildId, roleId } = req.params;

	try {
		removeAllowedRole(guildId, roleId);
		res.json({ success: true });
	} catch (error) {
		console.error("Error removing role:", error);
		res.status(500).json({ error: "Failed to remove role" });
	}
});

// Get guilds and roles from Discord
router.get("/discord/guilds", requireAdmin, async (req, res) => {
	try {
		const bot = getBot();
		if (!bot) {
			return res.status(503).json({ error: "Discord bot not available" });
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
		console.error("Error fetching guilds:", error);
		res.status(500).json({ error: "Failed to fetch guilds" });
	}
});

// Get allowed users
router.get("/users", requireAdmin, (req, res) => {
	const users = getAllowedUsers();
	res.json(users);
});

// Add allowed user
router.post("/users", requireAdmin, (req, res) => {
	const { userId, username } = req.body;

	if (!userId || !username) {
		return res.status(400).json({ error: "Missing required fields" });
	}

	try {
		addAllowedUser(userId, username);
		res.json({ success: true });
	} catch (error) {
		console.error("Error adding user:", error);
		res.status(500).json({ error: "Failed to add user" });
	}
});

// Remove allowed user
router.delete("/users/:userId", requireAdmin, (req, res) => {
	const { userId } = req.params;

	try {
		removeAllowedUser(userId);
		res.json({ success: true });
	} catch (error) {
		console.error("Error removing user:", error);
		res.status(500).json({ error: "Failed to remove user" });
	}
});

export default router;
