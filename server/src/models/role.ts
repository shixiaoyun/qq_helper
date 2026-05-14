import { getDatabase } from '../config/database.js';

export interface Role {
  id: number;
  name: string;
  label: string;
  permissions: string;
  description: string | null;
  created_at: string;
}

export interface CreateRoleInput {
  name: string;
  label: string;
  permissions: string[];
  description?: string;
}

export interface UpdateRoleInput {
  label?: string;
  permissions?: string[];
  description?: string;
}

export function getAllRoles(): Role[] {
  const db = getDatabase();
  return db.prepare('SELECT * FROM roles ORDER BY id ASC').all() as Role[];
}

export function getRoleById(id: number): Role | null {
  const db = getDatabase();
  return db.prepare('SELECT * FROM roles WHERE id = ?').get(id) as Role | null;
}

export function getRoleByName(name: string): Role | null {
  const db = getDatabase();
  return db.prepare('SELECT * FROM roles WHERE name = ?').get(name) as Role | null;
}

export function createRole(input: CreateRoleInput): Role {
  const db = getDatabase();
  const stmt = db.prepare(
    'INSERT INTO roles (name, label, permissions, description) VALUES (?, ?, ?, ?)'
  );
  const result = stmt.run(
    input.name,
    input.label,
    JSON.stringify(input.permissions),
    input.description || null
  );
  return getRoleById(Number(result.lastInsertRowid))!;
}

export function updateRole(id: number, input: UpdateRoleInput): boolean {
  const db = getDatabase();
  const existing = getRoleById(id);
  if (!existing) return false;

  const fields: string[] = [];
  const values: unknown[] = [];

  if (input.label !== undefined) { fields.push('label = ?'); values.push(input.label); }
  if (input.permissions !== undefined) { fields.push('permissions = ?'); values.push(JSON.stringify(input.permissions)); }
  if (input.description !== undefined) { fields.push('description = ?'); values.push(input.description); }

  if (fields.length === 0) return false;

  values.push(id);
  db.prepare(`UPDATE roles SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return true;
}

export function deleteRole(id: number): boolean {
  const db = getDatabase();
  const existing = getRoleById(id);
  if (!existing) return false;

  // 检查是否有用户在使用此角色
  const userCount = (db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get(existing.name) as { count: number }).count;
  if (userCount > 0) {
    throw new Error('该角色下还有用户，无法删除');
  }

  db.prepare('DELETE FROM roles WHERE id = ?').run(id);
  return true;
}

export function getUserPermissions(roleName: string): string[] {
  const db = getDatabase();
  const role = db.prepare('SELECT permissions FROM roles WHERE name = ?').get(roleName) as { permissions: string } | undefined;
  if (!role) return [];
  try {
    return JSON.parse(role.permissions) as string[];
  } catch {
    return [];
  }
}

export function hasPermission(roleName: string, permission: string): boolean {
  const permissions = getUserPermissions(roleName);
  if (permissions.includes('*')) return true;
  return permissions.includes(permission);
}
