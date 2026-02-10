import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const DB_PATH = './data/door.db';

let db;

export function initDatabase() {
  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS access_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      method TEXT NOT NULL
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

  console.log('Database initialized');
}

export function getDb() {
  return db;
}

// Access log functions
export function logAccess(userId, username, method) {
  const stmt = db.prepare('INSERT INTO access_logs (user_id, username, method) VALUES (?, ?, ?)');
  return stmt.run(userId, username, method);
}

export function getAccessLogs(limit = 100) {
  const stmt = db.prepare('SELECT * FROM access_logs ORDER BY timestamp DESC LIMIT ?');
  return stmt.all(limit);
}

// Role management functions
export function addAllowedRole(guildId, roleId, roleName) {
  const stmt = db.prepare('INSERT OR REPLACE INTO allowed_roles (guild_id, role_id, role_name) VALUES (?, ?, ?)');
  return stmt.run(guildId, roleId, roleName);
}

export function removeAllowedRole(guildId, roleId) {
  const stmt = db.prepare('DELETE FROM allowed_roles WHERE guild_id = ? AND role_id = ?');
  return stmt.run(guildId, roleId);
}

export function getAllowedRoles() {
  const stmt = db.prepare('SELECT * FROM allowed_roles');
  return stmt.all();
}

// User management functions
export function addAllowedUser(userId, username) {
  const stmt = db.prepare('INSERT OR REPLACE INTO allowed_users (user_id, username) VALUES (?, ?)');
  return stmt.run(userId, username);
}

export function removeAllowedUser(userId) {
  const stmt = db.prepare('DELETE FROM allowed_users WHERE user_id = ?');
  return stmt.run(userId);
}

export function getAllowedUsers() {
  const stmt = db.prepare('SELECT * FROM allowed_users');
  return stmt.all();
}

export function isUserAllowed(userId) {
  const stmt = db.prepare('SELECT * FROM allowed_users WHERE user_id = ?');
  return stmt.get(userId) !== undefined;
}
