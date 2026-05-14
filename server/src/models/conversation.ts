import { getDatabase } from '../config/database.js';

export interface Conversation {
  id: number;
  user_id: number;
  title: string | null;
  provider_id: number | null;
  model: string | null;
  system_prompt: string | null;
  temperature: number | null;
  max_tokens: number | null;
  status: number;
  message_count: number;
  total_tokens: number;
  total_input_tokens: number;
  total_output_tokens: number;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: number;
  conversation_id: number;
  user_id: number;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls: string | null;
  tool_results: string | null;
  tokens_input: number;
  tokens_output: number;
  provider: string | null;
  model: string | null;
  latency_ms: number | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

export interface CreateConversationInput {
  userId: number;
  title?: string;
  providerId?: number;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface CreateMessageInput {
  conversationId: number;
  userId: number;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: unknown;
  toolResults?: unknown;
  tokensInput?: number;
  tokensOutput?: number;
  provider?: string;
  model?: string;
  latencyMs?: number;
  status?: string;
  errorMessage?: string;
}

export function createConversation(input: CreateConversationInput): Conversation {
  const db = getDatabase();
  const stmt = db.prepare(
    'INSERT INTO conversations (user_id, title, provider_id, model, system_prompt, temperature, max_tokens) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const result = stmt.run(
    input.userId,
    input.title || '新对话',
    input.providerId || null,
    input.model || null,
    input.systemPrompt || null,
    input.temperature ?? null,
    input.maxTokens ?? null
  );
  return getConversationById(Number(result.lastInsertRowid))!;
}

export function getConversationById(id: number): Conversation | null {
  const db = getDatabase();
  return db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as Conversation | null;
}

export function getConversationsByUser(userId: number, options: { status?: number; search?: string; page?: number; pageSize?: number } = {}): { conversations: Conversation[]; total: number } {
  const db = getDatabase();
  const page = options.page || 1;
  const pageSize = options.pageSize || 50;
  const offset = (page - 1) * pageSize;

  const conditions: string[] = ['user_id = ?'];
  const params: unknown[] = [userId];

  if (options.status !== undefined) {
    conditions.push('status = ?');
    params.push(options.status);
  }
  if (options.search) {
    conditions.push('title LIKE ?');
    params.push(`%${options.search}%`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM conversations ${whereClause}`).get(...params) as { total: number };

  const rows = db.prepare(
    `SELECT * FROM conversations ${whereClause} ORDER BY last_message_at DESC, updated_at DESC LIMIT ? OFFSET ?`
  ).all(...params, pageSize, offset) as Conversation[];

  return { conversations: rows, total: countRow.total };
}

export function updateConversation(id: number, input: Partial<Omit<Conversation, 'id' | 'user_id' | 'created_at' | 'updated_at'>>): boolean {
  const db = getDatabase();
  const existing = getConversationById(id);
  if (!existing) return false;

  const fields: string[] = [];
  const values: unknown[] = [];

  if (input.title !== undefined) { fields.push('title = ?'); values.push(input.title); }
  if (input.provider_id !== undefined) { fields.push('provider_id = ?'); values.push(input.provider_id); }
  if (input.model !== undefined) { fields.push('model = ?'); values.push(input.model); }
  if (input.system_prompt !== undefined) { fields.push('system_prompt = ?'); values.push(input.system_prompt); }
  if (input.temperature !== undefined) { fields.push('temperature = ?'); values.push(input.temperature); }
  if (input.max_tokens !== undefined) { fields.push('max_tokens = ?'); values.push(input.max_tokens); }
  if (input.status !== undefined) { fields.push('status = ?'); values.push(input.status); }

  if (fields.length === 0) return false;

  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);

  db.prepare(`UPDATE conversations SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return true;
}

export function deleteConversation(id: number): boolean {
  const db = getDatabase();
  const existing = getConversationById(id);
  if (!existing) return false;

  // 先删除关联的token_usage记录，避免外键约束冲突
  db.prepare('DELETE FROM token_usage WHERE conversation_id = ?').run(id);
  // 再删除messages（即使有ON DELETE CASCADE也显式删除更安全）
  db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(id);
  // 最后删除会话
  db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
  return true;
}

export function createMessage(input: CreateMessageInput): Message {
  const db = getDatabase();
  const stmt = db.prepare(
    'INSERT INTO messages (conversation_id, user_id, role, content, tool_calls, tool_results, tokens_input, tokens_output, provider, model, latency_ms, status, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const result = stmt.run(
    input.conversationId,
    input.userId,
    input.role,
    input.content,
    input.toolCalls ? JSON.stringify(input.toolCalls) : null,
    input.toolResults ? JSON.stringify(input.toolResults) : null,
    input.tokensInput || 0,
    input.tokensOutput || 0,
    input.provider || null,
    input.model || null,
    input.latencyMs || null,
    input.status || 'success',
    input.errorMessage || null
  );

  // 更新会话统计
  const totalTokens = (input.tokensInput || 0) + (input.tokensOutput || 0);
  db.prepare(
    'UPDATE conversations SET message_count = message_count + 1, total_tokens = total_tokens + ?, total_input_tokens = total_input_tokens + ?, total_output_tokens = total_output_tokens + ?, last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(totalTokens, input.tokensInput || 0, input.tokensOutput || 0, input.conversationId);

  return getMessageById(Number(result.lastInsertRowid))!;
}

export function getMessageById(id: number): Message | null {
  const db = getDatabase();
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as Message | null;
}

export function getMessagesByConversation(conversationId: number): Message[] {
  const db = getDatabase();
  return db.prepare(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
  ).all(conversationId) as Message[];
}

export function getMessagesForContext(conversationId: number, limit: number = 20): Message[] {
  const db = getDatabase();
  const rows = db.prepare(
    "SELECT * FROM messages WHERE conversation_id = ? AND role IN ('user', 'assistant', 'tool') ORDER BY created_at DESC LIMIT ?"
  ).all(conversationId, limit) as Message[];
  return rows.reverse();
}

export function clearConversationMessages(id: number): boolean {
  const db = getDatabase();
  db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(id);
  db.prepare(
    'UPDATE conversations SET message_count = 0, total_tokens = 0, total_input_tokens = 0, total_output_tokens = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(id);
  return true;
}

// 清空用户所有对话和消息
export function clearAllUserConversations(userId: number): boolean {
  const db = getDatabase();
  // 先删除该用户的所有消息
  db.prepare('DELETE FROM messages WHERE user_id = ?').run(userId);
  // 再删除该用户的所有对话
  db.prepare('DELETE FROM conversations WHERE user_id = ?').run(userId);
  return true;
}

// 获取用户存储统计
export function getUserStorageStats(userId: number) {
  const db = getDatabase();

  const conversationCount = db.prepare('SELECT COUNT(*) as count FROM conversations WHERE user_id = ?').get(userId) as { count: number };
  const messageCount = db.prepare('SELECT COUNT(*) as count FROM messages WHERE user_id = ?').get(userId) as { count: number };
  const tokenUsageCount = db.prepare('SELECT COUNT(*) as count FROM token_usage WHERE user_id = ?').get(userId) as { count: number };

  // 估算存储大小（SQLite 不直接提供表大小，用内容长度估算）
  const messageSize = db.prepare(
    "SELECT COALESCE(SUM(LENGTH(content)), 0) as total_chars FROM messages WHERE user_id = ?"
  ).get(userId) as { total_chars: number };

  const conversationSize = db.prepare(
    "SELECT COALESCE(SUM(LENGTH(title) + LENGTH(system_prompt)), 0) as total_chars FROM conversations WHERE user_id = ?"
  ).get(userId) as { total_chars: number };

  const estimatedBytes = (messageSize.total_chars + conversationSize.total_chars) * 2; // UTF-8 估算

  return {
    conversationCount: conversationCount.count,
    messageCount: messageCount.count,
    tokenUsageCount: tokenUsageCount.count,
    estimatedBytes,
    estimatedKB: Math.round(estimatedBytes / 1024 * 100) / 100,
    estimatedMB: Math.round(estimatedBytes / 1024 / 1024 * 100) / 100,
  };
}

// 自动清理用户旧数据（当超过存储限制时，删除最早的约100MB内容）
export function autoCleanupUserStorage(userId: number, storageLimitMB: number): { cleaned: boolean; freedMB: number; deletedConversations: number } {
  const db = getDatabase();
  const stats = getUserStorageStats(userId);
  const limitBytes = storageLimitMB * 1024 * 1024;

  if (stats.estimatedBytes <= limitBytes) {
    return { cleaned: false, freedMB: 0, deletedConversations: 0 };
  }

  // 需要清理的目标：释放约100MB
  const targetFreeBytes = 100 * 1024 * 1024;
  let freedBytes = 0;
  let deletedCount = 0;

  // 获取用户最早的对话，按创建时间排序
  const oldConversations = db.prepare(
    'SELECT id, title, created_at FROM conversations WHERE user_id = ? ORDER BY created_at ASC'
  ).all(userId) as Array<{ id: number; title: string; created_at: string }>;

  for (const conv of oldConversations) {
    if (freedBytes >= targetFreeBytes) break;

    // 计算该对话占用的估算空间
    const convMsgSize = db.prepare(
      "SELECT COALESCE(SUM(LENGTH(content)), 0) as total_chars FROM messages WHERE conversation_id = ?"
    ).get(conv.id) as { total_chars: number };

    const convSize = db.prepare(
      "SELECT COALESCE(SUM(LENGTH(title) + LENGTH(system_prompt)), 0) as total_chars FROM conversations WHERE id = ?"
    ).get(conv.id) as { total_chars: number };

    const convBytes = (convMsgSize.total_chars + convSize.total_chars) * 2;

    // 删除该对话及其消息
    db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(conv.id);
    db.prepare('DELETE FROM conversations WHERE id = ?').run(conv.id);

    freedBytes += convBytes;
    deletedCount++;
  }

  return {
    cleaned: true,
    freedMB: Math.round(freedBytes / 1024 / 1024 * 100) / 100,
    deletedConversations: deletedCount,
  };
}
