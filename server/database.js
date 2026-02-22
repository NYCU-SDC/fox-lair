import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";

const DB_PATH = "./data/door.db";

let db;

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
