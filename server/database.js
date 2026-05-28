import Database from "better-sqlite3";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";

const DB_PATH = "./data/door.db";
const PHYSICAL_PASSWORD_KEY_LENGTH = 32;

let db;

const hashPhysicalPassword = (password, salt = randomBytes(16).toString("hex")) => {
	const hash = scryptSync(password, salt, PHYSICAL_PASSWORD_KEY_LENGTH).toString("hex");
	return { hash, salt };
};

const verifyPhysicalPassword = (password, salt, expectedHash) => {
	const candidate = scryptSync(password, salt, PHYSICAL_PASSWORD_KEY_LENGTH);
	const expected = Buffer.from(expectedHash, "hex");

	if (candidate.length !== expected.length) {
		return false;
	}

	return timingSafeEqual(candidate, expected);
};

export const initDatabase = () => {
	const dir = dirname(DB_PATH);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}

	db = new Database(DB_PATH);
	db.pragma("journal_mode = WAL");

	// Create tables
	db.exec(`
    CREATE TABLE IF NOT EXISTS access_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      method TEXT NOT NULL,
      ip_address TEXT
    );

    CREATE TABLE IF NOT EXISTS allowed_roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      role_name TEXT NOT NULL,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(guild_id, role_id)
    );

    CREATE TABLE IF NOT EXISTS allowed_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS api_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS physical_passwords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      created_by_user_id TEXT NOT NULL,
      created_by_username TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      revoked_at DATETIME,
      revoked_by_user_id TEXT,
      revoked_by_username TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_physical_passwords_window
      ON physical_passwords (starts_at, ends_at, revoked_at);

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id TEXT NOT NULL,
      actor_username TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      details TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
      ON audit_logs (created_at);

    CREATE INDEX IF NOT EXISTS idx_audit_logs_target
      ON audit_logs (target_type, target_id);
  `);

	// Check if ip_address column exists in access_logs, if not add it (migration)
	try {
		const tableInfo = db.prepare("PRAGMA table_info(access_logs)").all();
		const hasIpAddress = tableInfo.some(col => col.name === "ip_address");
		if (!hasIpAddress) {
			db.exec("ALTER TABLE access_logs ADD COLUMN ip_address TEXT");
			console.log("Database migrated: added ip_address column to access_logs");
		}
	} catch (error) {
		console.warn("Database migration check failed:", error);
	}

	console.log("Database initialized");
};

export const getDb = () => {
	return db;
};

// Access log functions
export const logAccess = (userId, username, method, ipAddress = null) => {
	const stmt = db.prepare("INSERT INTO access_logs (user_id, username, method, ip_address) VALUES (?, ?, ?, ?)");
	return stmt.run(userId, username, method, ipAddress);
};

export const getAccessLogs = (limit = 100) => {
	const stmt = db.prepare("SELECT * FROM access_logs ORDER BY timestamp DESC LIMIT ?");
	return stmt.all(limit);
};

// Audit log functions
export const logAudit = ({ actorUserId, actorUsername, action, targetType = null, targetId = null, details = null, ipAddress = null }) => {
	const stmt = db.prepare("INSERT INTO audit_logs (actor_user_id, actor_username, action, target_type, target_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?)");
	return stmt.run(actorUserId, actorUsername, action, targetType, targetId, details ? JSON.stringify(details) : null, ipAddress);
};

export const getAuditLogs = ({ limit = 100, targetType = null } = {}) => {
	const parsedLimit = Number.isFinite(Number(limit)) ? Math.min(Math.max(parseInt(limit), 1), 500) : 100;

	if (targetType) {
		const stmt = db.prepare("SELECT * FROM audit_logs WHERE target_type = ? ORDER BY created_at DESC, id DESC LIMIT ?");
		return stmt.all(targetType, parsedLimit);
	}

	const stmt = db.prepare("SELECT * FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT ?");
	return stmt.all(parsedLimit);
};

// Role management functions
export const addAllowedRole = (guildId, roleId, roleName) => {
	const stmt = db.prepare("INSERT OR REPLACE INTO allowed_roles (guild_id, role_id, role_name) VALUES (?, ?, ?)");
	return stmt.run(guildId, roleId, roleName);
};

export const removeAllowedRole = (guildId, roleId) => {
	const stmt = db.prepare("DELETE FROM allowed_roles WHERE guild_id = ? AND role_id = ?");
	return stmt.run(guildId, roleId);
};

export const getAllowedRoles = () => {
	const stmt = db.prepare("SELECT * FROM allowed_roles");
	return stmt.all();
};

// User management functions
export const addAllowedUser = (userId, username) => {
	const stmt = db.prepare("INSERT OR REPLACE INTO allowed_users (user_id, username) VALUES (?, ?)");
	return stmt.run(userId, username);
};

export const removeAllowedUser = userId => {
	const stmt = db.prepare("DELETE FROM allowed_users WHERE user_id = ?");
	return stmt.run(userId);
};

export const getAllowedUsers = () => {
	const stmt = db.prepare("SELECT * FROM allowed_users");
	return stmt.all();
};

export const isUserAllowed = userId => {
	const stmt = db.prepare("SELECT * FROM allowed_users WHERE user_id = ?");
	return stmt.get(userId) !== undefined;
};

// API token functions
export const upsertApiToken = (userId, username, tokenHash) => {
	const stmt = db.prepare(
		"INSERT INTO api_tokens (user_id, username, token_hash) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET username = excluded.username, token_hash = excluded.token_hash, created_at = CURRENT_TIMESTAMP"
	);
	return stmt.run(userId, username, tokenHash);
};

export const getUserByTokenHash = tokenHash => {
	const stmt = db.prepare("SELECT user_id, username FROM api_tokens WHERE token_hash = ?");
	return stmt.get(tokenHash);
};

export const getApiTokenMeta = userId => {
	const stmt = db.prepare("SELECT user_id, username, created_at FROM api_tokens WHERE user_id = ?");
	return stmt.get(userId);
};

export const deleteApiToken = userId => {
	const stmt = db.prepare("DELETE FROM api_tokens WHERE user_id = ?");
	return stmt.run(userId);
};

// Physical keypad password functions
export const createPhysicalPassword = ({ label, password, startsAt, endsAt, createdByUserId, createdByUsername }) => {
	const { hash, salt } = hashPhysicalPassword(password);
	const stmt = db.prepare(`
    INSERT INTO physical_passwords (
      label,
      password_hash,
      password_salt,
      starts_at,
      ends_at,
      created_by_user_id,
      created_by_username
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

	return stmt.run(label, hash, salt, startsAt, endsAt, createdByUserId, createdByUsername);
};

export const getPhysicalPasswords = () => {
	const stmt = db.prepare(`
    SELECT
      id,
      label,
      starts_at,
      ends_at,
      created_by_user_id,
      created_by_username,
      created_at,
      revoked_at,
      revoked_by_user_id,
      revoked_by_username
    FROM physical_passwords
    ORDER BY
      CASE WHEN revoked_at IS NULL THEN 0 ELSE 1 END,
      starts_at DESC,
      id DESC
  `);
	return stmt.all();
};

export const getPhysicalPasswordById = id => {
	const stmt = db.prepare(`
    SELECT
      id,
      label,
      starts_at,
      ends_at,
      created_by_user_id,
      created_by_username,
      created_at,
      revoked_at,
      revoked_by_user_id,
      revoked_by_username
    FROM physical_passwords
    WHERE id = ?
  `);
	return stmt.get(id);
};

export const revokePhysicalPassword = ({ id, revokedByUserId, revokedByUsername }) => {
	const stmt = db.prepare(`
    UPDATE physical_passwords
    SET
      revoked_at = CURRENT_TIMESTAMP,
      revoked_by_user_id = ?,
      revoked_by_username = ?
    WHERE id = ? AND revoked_at IS NULL
  `);
	return stmt.run(revokedByUserId, revokedByUsername, id);
};

export const findValidPhysicalPassword = password => {
	const stmt = db.prepare(`
    SELECT *
    FROM physical_passwords
    WHERE revoked_at IS NULL
  `);
	const rows = stmt.all();
	const now = Date.now();

	return rows.find(row => {
		const startsAt = Date.parse(row.starts_at);
		const endsAt = Date.parse(row.ends_at);

		if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || now < startsAt || now > endsAt) {
			return false;
		}

		return verifyPhysicalPassword(password, row.password_salt, row.password_hash);
	});
};
