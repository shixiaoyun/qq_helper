import { getDatabase } from '../config/database.js';

export interface DailyChatUsage {
  id: number;
  user_id: number;
  usage_date: string;
  chat_count: number;
  created_at: string;
  updated_at: string;
}

// 获取用户今日对话次数
export function getTodayChatCount(userId: number): number {
  const db = getDatabase();
  const today = new Date().toISOString().split('T')[0];

  const row = db.prepare(
    'SELECT chat_count FROM daily_chat_limits WHERE user_id = ? AND chat_date = ?'
  ).get(userId, today) as { chat_count: number } | undefined;

  return row?.chat_count || 0;
}

// 增加用户今日对话次数
export function incrementTodayChatCount(userId: number): number {
  const db = getDatabase();
  const today = new Date().toISOString().split('T')[0];

  const existing = db.prepare(
    'SELECT id, chat_count FROM daily_chat_limits WHERE user_id = ? AND chat_date = ?'
  ).get(userId, today) as { id: number; chat_count: number } | undefined;

  if (existing) {
    db.prepare(
      'UPDATE daily_chat_limits SET chat_count = chat_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(existing.id);
    return existing.chat_count + 1;
  } else {
    db.prepare(
      'INSERT INTO daily_chat_limits (user_id, chat_date, chat_count) VALUES (?, ?, 1)'
    ).run(userId, today);
    return 1;
  }
}

// 检查用户是否超过每日对话限制
export function checkDailyChatLimit(userId: number, dailyLimit: number): { allowed: boolean; currentCount: number; remaining: number } {
  const currentCount = getTodayChatCount(userId);
  return {
    allowed: currentCount < dailyLimit,
    currentCount,
    remaining: Math.max(0, dailyLimit - currentCount),
  };
}

// 获取所有用户今日对话统计
export function getAllUsersTodayChatStats(): Array<{ user_id: number; username: string; chat_count: number; chat_date: string }> {
  const db = getDatabase();
  const today = new Date().toISOString().split('T')[0];

  const rows = db.prepare(`
    SELECT d.user_id, u.username, d.chat_count, d.chat_date
    FROM daily_chat_limits d
    JOIN users u ON d.user_id = u.id
    WHERE d.chat_date = ?
    ORDER BY d.chat_count DESC
  `).all(today) as Array<{ user_id: number; username: string; chat_count: number; chat_date: string }>;

  return rows || [];
}
