import { getDatabase } from '../config/database.js';

export interface TokenUsageRecord {
  id: number;
  user_id: number;
  conversation_id: number | null;
  message_id: number | null;
  provider: string;
  model: string;
  tokens_input: number;
  tokens_output: number;
  total_tokens: number;
  cost_estimate: number | null;
  created_at: string;
}

export interface UsageStats {
  totalUsers: number;
  totalConversations: number;
  totalMessages: number;
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  todayTokens: number;
  todayMessages: number;
  todayUsers: number;
}

export function recordTokenUsage(data: {
  userId: number;
  conversationId?: number;
  messageId?: number;
  provider: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  costEstimate?: number;
}): TokenUsageRecord {
  const db = getDatabase();
  const totalTokens = data.tokensInput + data.tokensOutput;

  const stmt = db.prepare(
    'INSERT INTO token_usage (user_id, conversation_id, message_id, provider, model, tokens_input, tokens_output, total_tokens, cost_estimate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const result = stmt.run(
    data.userId,
    data.conversationId || null,
    data.messageId || null,
    data.provider,
    data.model,
    data.tokensInput,
    data.tokensOutput,
    totalTokens,
    data.costEstimate || null
  );

  return getTokenUsageById(Number(result.lastInsertRowid))!;
}

export function getTokenUsageById(id: number): TokenUsageRecord | null {
  const db = getDatabase();
  return db.prepare('SELECT * FROM token_usage WHERE id = ?').get(id) as TokenUsageRecord | null;
}

export function getUsageStats(): UsageStats {
  const db = getDatabase();

  const totalUsers = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
  const totalConversations = (db.prepare('SELECT COUNT(*) as count FROM conversations').get() as { count: number }).count;
  const totalMessages = (db.prepare('SELECT COUNT(*) as count FROM messages').get() as { count: number }).count;

  const tokenStats = db.prepare(
    'SELECT COALESCE(SUM(tokens_input), 0) as input, COALESCE(SUM(tokens_output), 0) as output, COALESCE(SUM(total_tokens), 0) as total FROM token_usage'
  ).get() as { input: number; output: number; total: number };

  const today = new Date().toISOString().split('T')[0];
  const todayStats = db.prepare(
    'SELECT COALESCE(SUM(total_tokens), 0) as tokens, COUNT(*) as messages FROM token_usage WHERE date(created_at) = ?'
  ).get(today) as { tokens: number; messages: number };

  const todayUsers = (db.prepare(
    'SELECT COUNT(DISTINCT user_id) as count FROM token_usage WHERE date(created_at) = ?'
  ).get(today) as { count: number }).count;

  return {
    totalUsers,
    totalConversations,
    totalMessages,
    totalTokens: tokenStats.total,
    totalInputTokens: tokenStats.input,
    totalOutputTokens: tokenStats.output,
    todayTokens: todayStats.tokens,
    todayMessages: todayStats.messages,
    todayUsers: todayUsers,
  };
}

export function getUserUsageStats(userId: number): {
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalMessages: number;
  totalConversations: number;
} {
  const db = getDatabase();

  const tokenStats = db.prepare(
    'SELECT COALESCE(SUM(tokens_input), 0) as input, COALESCE(SUM(tokens_output), 0) as output, COALESCE(SUM(total_tokens), 0) as total FROM token_usage WHERE user_id = ?'
  ).get(userId) as { input: number; output: number; total: number };

  const messageCount = (db.prepare(
    'SELECT COUNT(*) as count FROM messages WHERE user_id = ?'
  ).get(userId) as { count: number }).count;

  const conversationCount = (db.prepare(
    'SELECT COUNT(*) as count FROM conversations WHERE user_id = ?'
  ).get(userId) as { count: number }).count;

  return {
    totalTokens: tokenStats.total,
    totalInputTokens: tokenStats.input,
    totalOutputTokens: tokenStats.output,
    totalMessages: messageCount,
    totalConversations: conversationCount,
  };
}

export function getDailyUsageStats(days: number = 30): Array<{
  date: string;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  messages: number;
  users: number;
}> {
  const db = getDatabase();

  return db.prepare(
    `SELECT
      date(created_at) as date,
      COALESCE(SUM(total_tokens), 0) as tokens,
      COALESCE(SUM(tokens_input), 0) as inputTokens,
      COALESCE(SUM(tokens_output), 0) as outputTokens,
      COUNT(*) as messages,
      COUNT(DISTINCT user_id) as users
    FROM token_usage
    WHERE date(created_at) >= date('now', '-${days} days')
    GROUP BY date(created_at)
    ORDER BY date DESC`
  ).all() as Array<{
    date: string;
    tokens: number;
    inputTokens: number;
    outputTokens: number;
    messages: number;
    users: number;
  }>;
}

export function getModelUsageStats(): Array<{
  model: string;
  provider: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  messageCount: number;
}> {
  const db = getDatabase();

  return db.prepare(
    `SELECT
      model,
      provider,
      COALESCE(SUM(total_tokens), 0) as totalTokens,
      COALESCE(SUM(tokens_input), 0) as inputTokens,
      COALESCE(SUM(tokens_output), 0) as outputTokens,
      COUNT(*) as messageCount
    FROM token_usage
    GROUP BY model, provider
    ORDER BY totalTokens DESC`
  ).all() as Array<{
    model: string;
    provider: string;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    messageCount: number;
  }>;
}

export function getUserRanking(limit: number = 50): Array<{
  userId: number;
  username: string;
  nickname: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  messageCount: number;
  conversationCount: number;
}> {
  const db = getDatabase();

  return db.prepare(
    `SELECT
      u.id as userId,
      u.username,
      u.nickname,
      COALESCE(SUM(t.total_tokens), 0) as totalTokens,
      COALESCE(SUM(t.tokens_input), 0) as inputTokens,
      COALESCE(SUM(t.tokens_output), 0) as outputTokens,
      COUNT(t.id) as messageCount,
      (SELECT COUNT(*) FROM conversations WHERE user_id = u.id) as conversationCount
    FROM users u
    LEFT JOIN token_usage t ON u.id = t.user_id
    GROUP BY u.id
    ORDER BY totalTokens DESC
    LIMIT ?`
  ).all(limit) as Array<{
    userId: number;
    username: string;
    nickname: string;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    messageCount: number;
    conversationCount: number;
  }>;
}

// 获取所有用户的存储空间统计（用于管理员）
export function getAllUsersStorageStats(): Array<{
  userId: number;
  username: string;
  nickname: string;
  role: string;
  conversationCount: number;
  messageCount: number;
  tokenUsageCount: number;
  estimatedBytes: number;
  estimatedKB: number;
  estimatedMB: number;
}> {
  const db = getDatabase();

  return db.prepare(
    `SELECT
      u.id as userId,
      u.username,
      u.nickname,
      u.role,
      (SELECT COUNT(*) FROM conversations WHERE user_id = u.id) as conversationCount,
      (SELECT COUNT(*) FROM messages WHERE user_id = u.id) as messageCount,
      (SELECT COUNT(*) FROM token_usage WHERE user_id = u.id) as tokenUsageCount,
      COALESCE((SELECT SUM(LENGTH(content)) FROM messages WHERE user_id = u.id), 0) * 2 +
      COALESCE((SELECT SUM(LENGTH(title) + LENGTH(system_prompt)) FROM conversations WHERE user_id = u.id), 0) * 2 as estimatedBytes
    FROM users u
    ORDER BY estimatedBytes DESC`
  ).all() as Array<{
    userId: number;
    username: string;
    nickname: string;
    role: string;
    conversationCount: number;
    messageCount: number;
    tokenUsageCount: number;
    estimatedBytes: number;
    estimatedKB: number;
    estimatedMB: number;
  }>;
}

// 清空用户所有数据（管理员使用）
export function clearUserAllData(userId: number): boolean {
  const db = getDatabase();
  db.prepare('DELETE FROM messages WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM conversations WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM token_usage WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM login_logs WHERE user_id = ?').run(userId);
  return true;
}
