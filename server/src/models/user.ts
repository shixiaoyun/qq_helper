import { getDatabase } from '../config/database.js';
import { hashPassword } from '../utils/auth.js';

export interface User {
  id: number;
  username: string;
  email: string | null;
  phone: string | null;
  nickname: string | null;
  avatar: string | null;
  password_hash: string;
  role: string;
  status: number;
  email_verified: number;
  phone_verified: number;
  last_login_at: string | null;
  last_login_ip: string | null;
  storage_limit_mb: number;
  daily_chat_limit: number;
  created_at: string;
  updated_at: string;
}

export interface CreateUserInput {
  username: string;
  password: string;
  email?: string;
  phone?: string;
  nickname?: string;
  role?: string;
}

export interface UpdateUserInput {
  nickname?: string;
  email?: string;
  phone?: string;
  avatar?: string;
  role?: string;
  status?: number;
  storage_limit_mb?: number;
  daily_chat_limit?: number;
}

export function createUser(input: CreateUserInput): User {
  const db = getDatabase();
  const passwordHash = hashPassword(input.password);

  const stmt = db.prepare(
    'INSERT INTO users (username, email, phone, password_hash, nickname, role, status, daily_chat_limit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const result = stmt.run(
    input.username,
    input.email || null,
    input.phone || null,
    passwordHash,
    input.nickname || input.username,
    input.role || 'user',
    1,
    99
  );

  // 创建默认用户设置
  db.prepare(
    'INSERT INTO user_settings (user_id, temperature, max_tokens, theme, language) VALUES (?, ?, ?, ?, ?)'
  ).run(result.lastInsertRowid, 0.7, 2048, 'system', 'zh-CN');

  return getUserById(Number(result.lastInsertRowid))!;
}

export function getUserById(id: number): User | null {
  const db = getDatabase();
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | null;
}

export function getUserByUsername(username: string): User | null {
  const db = getDatabase();
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as User | null;
}

export function getUserByEmail(email: string): User | null {
  const db = getDatabase();
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email) as User | null;
}

export interface UserListOptions {
  page?: number;
  pageSize?: number;
  role?: string;
  status?: number;
  search?: string;
}

export function getAllUsers(options: UserListOptions = {}): { users: User[]; total: number } {
  const db = getDatabase();
  const page = options.page || 1;
  const pageSize = options.pageSize || 20;
  const offset = (page - 1) * pageSize;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.role) {
    conditions.push('role = ?');
    params.push(options.role);
  }
  if (options.status !== undefined) {
    conditions.push('status = ?');
    params.push(options.status);
  }
  if (options.search) {
    conditions.push('(username LIKE ? OR nickname LIKE ? OR email LIKE ?)');
    params.push(`%${options.search}%`, `%${options.search}%`, `%${options.search}%`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM users ${whereClause}`).get(...params) as { total: number };

  const rows = db.prepare(
    `SELECT * FROM users ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, pageSize, offset) as User[];

  return { users: rows, total: countRow.total };
}

export function updateUser(id: number, input: UpdateUserInput): boolean {
  const db = getDatabase();
  const existing = getUserById(id);
  if (!existing) return false;

  const fields: string[] = [];
  const values: unknown[] = [];

  if (input.nickname !== undefined) { fields.push('nickname = ?'); values.push(input.nickname); }
  if (input.email !== undefined) { fields.push('email = ?'); values.push(input.email); }
  if (input.phone !== undefined) { fields.push('phone = ?'); values.push(input.phone); }
  if (input.avatar !== undefined) { fields.push('avatar = ?'); values.push(input.avatar); }
  if (input.role !== undefined) { fields.push('role = ?'); values.push(input.role); }
  if (input.status !== undefined) { fields.push('status = ?'); values.push(input.status); }
  if (input.storage_limit_mb !== undefined) { fields.push('storage_limit_mb = ?'); values.push(input.storage_limit_mb); }
  if (input.daily_chat_limit !== undefined) { fields.push('daily_chat_limit = ?'); values.push(input.daily_chat_limit); }

  if (fields.length === 0) return false;

  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);

  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return true;
}

export function deleteUser(id: number): boolean {
  const db = getDatabase();
  const existing = getUserById(id);
  if (!existing) return false;

  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  return true;
}

export function updatePassword(id: number, newPassword: string): boolean {
  const db = getDatabase();
  const existing = getUserById(id);
  if (!existing) return false;

  const passwordHash = hashPassword(newPassword);
  db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(passwordHash, id);
  return true;
}

export function updateLastLogin(id: number, ip: string): void {
  const db = getDatabase();
  db.prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP, last_login_ip = ? WHERE id = ?').run(ip, id);
}
