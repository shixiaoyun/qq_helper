import { getDatabase } from '../config/database.js';

export interface TokenLimit {
  id: number;
  user_id: number;
  daily_limit: number;
  weekly_limit: number;
  monthly_limit: number;
  created_at: string;
  updated_at: string;
}

export interface TokenCheckResult {
  allowed: boolean;
  message: string;
  current: number;
  limit: number;
  period: 'daily' | 'weekly' | 'monthly' | null;
}

function getDateRange(period: 'daily' | 'weekly' | 'monthly'): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString().split('T')[0];

  if (period === 'daily') {
    return { start: end, end };
  } else if (period === 'weekly') {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    return { start: weekStart.toISOString().split('T')[0], end };
  } else {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: monthStart.toISOString().split('T')[0], end };
  }
}

function getTokenUsageForPeriod(userId: number, period: 'daily' | 'weekly' | 'monthly'): number {
  const db = getDatabase();
  const { start, end } = getDateRange(period);

  const row = db.prepare(
    `SELECT COALESCE(SUM(total_tokens), 0) as total FROM token_usage
     WHERE user_id = ? AND date(created_at) >= ? AND date(created_at) <= ?`
  ).get(userId, start, end) as { total: number } | undefined;

  return row?.total || 0;
}

export function getUserTokenLimits(userId: number): TokenLimit {
  const db = getDatabase();

  let row = db.prepare('SELECT * FROM token_limits WHERE user_id = ?').get(userId) as TokenLimit | undefined;

  if (!row) {
    db.prepare('INSERT INTO token_limits (user_id) VALUES (?)').run(userId);
    row = db.prepare('SELECT * FROM token_limits WHERE user_id = ?').get(userId) as TokenLimit;
  }

  return row;
}

export function updateUserTokenLimits(userId: number, limits: { daily_limit?: number; weekly_limit?: number; monthly_limit?: number }): TokenLimit {
  const db = getDatabase();

  getUserTokenLimits(userId);
  const sets: string[] = [];
  const params: any[] = [];

  if (limits.daily_limit !== undefined) { sets.push('daily_limit = ?'); params.push(limits.daily_limit); }
  if (limits.weekly_limit !== undefined) { sets.push('weekly_limit = ?'); params.push(limits.weekly_limit); }
  if (limits.monthly_limit !== undefined) { sets.push('monthly_limit = ?'); params.push(limits.monthly_limit); }

  if (sets.length > 0) {
    sets.push('updated_at = CURRENT_TIMESTAMP');
    db.prepare(`UPDATE token_limits SET ${sets.join(', ')} WHERE user_id = ?`).run(...params, userId);
  }

  return getUserTokenLimits(userId);
}

export function checkUserTokenLimits(userId: number): TokenCheckResult {
  const limits = getUserTokenLimits(userId);

  const dailyUsage = getTokenUsageForPeriod(userId, 'daily');
  if (dailyUsage >= limits.daily_limit) {
    return {
      allowed: false,
      message: 'Token消耗量达到上限，明日再试',
      current: dailyUsage,
      limit: limits.daily_limit,
      period: 'daily',
    };
  }

  const weeklyUsage = getTokenUsageForPeriod(userId, 'weekly');
  if (weeklyUsage >= limits.weekly_limit) {
    return {
      allowed: false,
      message: 'Token消耗量达到本周上限，请下周再试',
      current: weeklyUsage,
      limit: limits.weekly_limit,
      period: 'weekly',
    };
  }

  const monthlyUsage = getTokenUsageForPeriod(userId, 'monthly');
  if (monthlyUsage >= limits.monthly_limit) {
    return {
      allowed: false,
      message: 'Token消耗量达到本月上限，请下月再试',
      current: monthlyUsage,
      limit: limits.monthly_limit,
      period: 'monthly',
    };
  }

  return {
    allowed: true,
    message: '',
    current: dailyUsage,
    limit: limits.daily_limit,
    period: null,
  };
}

export function getAllUsersTokenLimits(): Array<{
  user_id: number;
  username: string;
  nickname: string;
  daily_limit: number;
  weekly_limit: number;
  monthly_limit: number;
  daily_usage: number;
  weekly_usage: number;
  monthly_usage: number;
}> {
  const db = getDatabase();

  const rows = db.prepare(`
    SELECT
      u.id as user_id,
      u.username,
      u.nickname,
      COALESCE(tl.daily_limit, 1000000) as daily_limit,
      COALESCE(tl.weekly_limit, 5000000) as weekly_limit,
      COALESCE(tl.monthly_limit, 10000000) as monthly_limit
    FROM users u
    LEFT JOIN token_limits tl ON u.id = tl.user_id
    ORDER BY u.id
  `).all() as Array<{
    user_id: number;
    username: string;
    nickname: string;
    daily_limit: number;
    weekly_limit: number;
    monthly_limit: number;
  }>;

  return rows.map(row => {
    const today = new Date().toISOString().split('T')[0];
    const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const dailyUsage = (db.prepare(
      "SELECT COALESCE(SUM(total_tokens), 0) as total FROM token_usage WHERE user_id = ? AND date(created_at) = ?"
    ).get(row.user_id, today) as { total: number })?.total || 0;

    const weeklyUsage = (db.prepare(
      "SELECT COALESCE(SUM(total_tokens), 0) as total FROM token_usage WHERE user_id = ? AND date(created_at) >= ? AND date(created_at) <= ?"
    ).get(row.user_id, weekStart.toISOString().split('T')[0], today) as { total: number })?.total || 0;

    const monthlyUsage = (db.prepare(
      "SELECT COALESCE(SUM(total_tokens), 0) as total FROM token_usage WHERE user_id = ? AND date(created_at) >= ? AND date(created_at) <= ?"
    ).get(row.user_id, monthStart.toISOString().split('T')[0], today) as { total: number })?.total || 0;

    return {
      ...row,
      daily_usage: dailyUsage,
      weekly_usage: weeklyUsage,
      monthly_usage: monthlyUsage,
    };
  });
}

export function getAllUsersTotalTokenUsage(): {
  total_tokens_all: number;
  total_tokens_today: number;
  total_tokens_this_week: number;
  total_tokens_this_month: number;
} {
  const db = getDatabase();
  const today = new Date().toISOString().split('T')[0];
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const all = (db.prepare('SELECT COALESCE(SUM(total_tokens), 0) as total FROM token_usage').get() as { total: number })?.total || 0;
  const daily = (db.prepare("SELECT COALESCE(SUM(total_tokens), 0) as total FROM token_usage WHERE date(created_at) = ?").get(today) as { total: number })?.total || 0;
  const weekly = (db.prepare("SELECT COALESCE(SUM(total_tokens), 0) as total FROM token_usage WHERE date(created_at) >= ? AND date(created_at) <= ?").get(weekStart.toISOString().split('T')[0], today) as { total: number })?.total || 0;
  const monthly = (db.prepare("SELECT COALESCE(SUM(total_tokens), 0) as total FROM token_usage WHERE date(created_at) >= ? AND date(created_at) <= ?").get(monthStart.toISOString().split('T')[0], today) as { total: number })?.total || 0;

  return {
    total_tokens_all: all,
    total_tokens_today: daily,
    total_tokens_this_week: weekly,
    total_tokens_this_month: monthly,
  };
}
