import { getDatabase } from '../config/database.js';
import type Database from 'better-sqlite3';

export enum AuditAction {
  // auth
  LOGIN = 'login',
  LOGOUT = 'logout',
  REGISTER = 'register',
  PASSWORD_CHANGE = 'password_change',
  // chat
  CHAT_START = 'chat_start',
  CHAT_MESSAGE = 'chat_message',
  CHAT_END = 'chat_end',
  // agent
  AGENT_CREATE = 'agent_create',
  AGENT_RUN = 'agent_run',
  AGENT_DELETE = 'agent_delete',
  // mcp
  TOOL_EXECUTE = 'tool_execute',
  // file
  FILE_READ = 'file_read',
  FILE_WRITE = 'file_write',
  FILE_DELETE = 'file_delete',
  // admin
  CONFIG_CHANGE = 'config_change',
  USER_MANAGE = 'user_manage',
  MODEL_CHANGE = 'model_change',
}

export interface AuditLogEntry {
  id?: number;
  timestamp: string;
  userId: number | null;
  username: string | null;
  action: string;
  resource: string;
  details: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  status: string;
  durationMs: number | null;
}

export interface AuditQueryOptions {
  userId?: number;
  action?: string;
  resource?: string;
  status?: string;
  startTime?: string;
  endTime?: string;
  page?: number;
  pageSize?: number;
}

class AuditLogService {
  private db: Database.Database;

  constructor() {
    this.db = getDatabase();
    this.initTable();
  }

  private initTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        user_id INTEGER,
        username TEXT,
        action TEXT NOT NULL,
        resource TEXT NOT NULL,
        details TEXT,
        ip_address TEXT,
        user_agent TEXT,
        status TEXT DEFAULT 'success',
        duration_ms INTEGER,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource)
    `);
  }

  log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): number {
    const stmt = this.db.prepare(`
      INSERT INTO audit_logs (timestamp, user_id, username, action, resource, details, ip_address, user_agent, status, duration_ms)
      VALUES (datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      entry.userId ?? null,
      entry.username ?? null,
      entry.action,
      entry.resource,
      entry.details ?? null,
      entry.ipAddress ?? null,
      entry.userAgent ?? null,
      entry.status,
      entry.durationMs ?? null
    );

    return Number(result.lastInsertRowid);
  }

  query(options: AuditQueryOptions = {}): { logs: AuditLogEntry[]; total: number } {
    const {
      userId,
      action,
      resource,
      status,
      startTime,
      endTime,
      page = 1,
      pageSize = 50,
    } = options;

    const conditions: string[] = [];
    const params: (string | number | null)[] = [];

    if (userId !== undefined) {
      conditions.push('user_id = ?');
      params.push(userId);
    }
    if (action) {
      conditions.push('action = ?');
      params.push(action);
    }
    if (resource) {
      conditions.push('resource = ?');
      params.push(resource);
    }
    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }
    if (startTime) {
      conditions.push('timestamp >= ?');
      params.push(startTime);
    }
    if (endTime) {
      conditions.push('timestamp <= ?');
      params.push(endTime);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countStmt = this.db.prepare(`SELECT COUNT(*) as total FROM audit_logs ${whereClause}`);
    const countResult = countStmt.get(...params) as { total: number };

    const offset = (page - 1) * pageSize;
    const queryStmt = this.db.prepare(`
      SELECT * FROM audit_logs
      ${whereClause}
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `);

    const rows = queryStmt.all(...params, pageSize, offset) as Array<{
      id: number;
      timestamp: string;
      user_id: number | null;
      username: string | null;
      action: string;
      resource: string;
      details: string | null;
      ip_address: string | null;
      user_agent: string | null;
      status: string;
      duration_ms: number | null;
    }>;

    const logs: AuditLogEntry[] = rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      userId: row.user_id,
      username: row.username,
      action: row.action,
      resource: row.resource,
      details: row.details,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      status: row.status,
      durationMs: row.duration_ms,
    }));

    return { logs, total: countResult.total };
  }

  getStats(days: number = 7): Record<string, any> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startTime = startDate.toISOString();

    const actionStats = this.db.prepare(`
      SELECT action, COUNT(*) as count
      FROM audit_logs
      WHERE timestamp >= ?
      GROUP BY action
      ORDER BY count DESC
    `).all(startTime) as Array<{ action: string; count: number }>;

    const dailyStats = this.db.prepare(`
      SELECT date(timestamp) as date, COUNT(*) as count
      FROM audit_logs
      WHERE timestamp >= ?
      GROUP BY date(timestamp)
      ORDER BY date DESC
    `).all(startTime) as Array<{ date: string; count: number }>;

    const statusStats = this.db.prepare(`
      SELECT status, COUNT(*) as count
      FROM audit_logs
      WHERE timestamp >= ?
      GROUP BY status
    `).all(startTime) as Array<{ status: string; count: number }>;

    const topUsers = this.db.prepare(`
      SELECT username, COUNT(*) as count
      FROM audit_logs
      WHERE timestamp >= ? AND username IS NOT NULL
      GROUP BY username
      ORDER BY count DESC
      LIMIT 10
    `).all(startTime) as Array<{ username: string; count: number }>;

    const totalCount = this.db.prepare(`
      SELECT COUNT(*) as total FROM audit_logs WHERE timestamp >= ?
    `).get(startTime) as { total: number };

    return {
      period: `${days} days`,
      total: totalCount.total,
      byAction: actionStats,
      byDay: dailyStats,
      byStatus: statusStats,
      topUsers,
    };
  }

  cleanup(days: number = 90): number {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const stmt = this.db.prepare(`
      DELETE FROM audit_logs WHERE timestamp < ?
    `);
    const result = stmt.run(cutoff.toISOString());
    return result.changes;
  }
}

let auditLogService: AuditLogService | null = null;

export function getAuditLogService(): AuditLogService {
  if (!auditLogService) {
    auditLogService = new AuditLogService();
  }
  return auditLogService;
}

export function logAudit(
  action: string | AuditAction,
  userId: number | null,
  details: unknown,
  ip?: string,
  options?: {
    username?: string;
    resource?: string;
    status?: string;
    durationMs?: number;
    userAgent?: string;
  }
): void {
  try {
    const service = getAuditLogService();
    const actionStr = typeof action === 'string' ? action : String(action);

    let detailsStr: string;
    try {
      detailsStr = JSON.stringify(details);
    } catch {
      detailsStr = String(details);
    }

    service.log({
      userId: userId ?? null,
      username: options?.username ?? null,
      action: actionStr,
      resource: options?.resource ?? 'system',
      details: detailsStr,
      ipAddress: ip || null,
      userAgent: options?.userAgent || null,
      status: options?.status || 'success',
      durationMs: options?.durationMs ?? null,
    });

    if (process.env.NODE_ENV === 'development') {
      console.log(`[AUDIT] ${actionStr} | 用户:${userId ?? 'unknown'} | IP:${ip ?? 'unknown'}`);
    }
  } catch (err) {
    console.error('[AuditLog] 记录审计日志失败:', err);
  }
}

export function queryAuditLogs(options: AuditQueryOptions): { logs: AuditLogEntry[]; total: number } {
  return getAuditLogService().query(options);
}

export function getAuditStats(days?: number): Record<string, any> {
  return getAuditLogService().getStats(days);
}
