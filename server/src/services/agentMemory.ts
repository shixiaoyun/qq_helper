/**
 * Agent记忆系统
 * 参考MetaGPT Memory设计，实现工作记忆+长期记忆
 * 支持数据库存储，服务重启后记忆不丢失
 */

import { getDatabase } from '../config/database';

export interface MemoryMessage {
  id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: number;
  causeBy?: string;      // 触发该消息的动作/工具
  metadata?: Record<string, any>;
}

export interface MemoryIndex {
  byRole: Map<string, MemoryMessage[]>;
  byCause: Map<string, MemoryMessage[]>;
  byKeyword: Map<string, MemoryMessage[]>;
}

export class AgentMemory {
  private storage: MemoryMessage[] = [];
  private index: MemoryIndex = {
    byRole: new Map(),
    byCause: new Map(),
    byKeyword: new Map(),
  };
  private maxStorageSize: number;
  private workingMemorySize: number;
  private agentId: string;
  private sessionKey: string;
  private db: ReturnType<typeof getDatabase>;

  constructor(
    agentId: string,
    sessionKey: string = 'default',
    options: { maxStorageSize?: number; workingMemorySize?: number } = {}
  ) {
    this.agentId = agentId;
    this.sessionKey = sessionKey;
    this.maxStorageSize = options.maxStorageSize || 1000;
    this.workingMemorySize = options.workingMemorySize || 20;
    this.db = getDatabase();
    this.loadFromDB();
  }

  /**
   * 从数据库加载记忆
   */
  loadFromDB(): void {
    try {
      const rows = this.db
        .prepare(
          `SELECT id, role, content, cause_by, timestamp 
           FROM agent_memories 
           WHERE agent_id = ? AND session_key = ? 
           ORDER BY timestamp ASC`
        )
        .all(this.agentId, this.sessionKey) as Array<{
          id: number;
          role: string;
          content: string;
          cause_by: string | null;
          timestamp: string;
        }>;

      for (const row of rows) {
        const msg: MemoryMessage = {
          id: `mem-${row.id}`,
          role: row.role as MemoryMessage['role'],
          content: row.content,
          timestamp: new Date(row.timestamp).getTime(),
          causeBy: row.cause_by || undefined,
        };
        this.storage.push(msg);
        this.updateIndex(msg);
      }
    } catch (error) {
      console.error('Failed to load agent memories from DB:', error);
    }
  }

  /**
   * 保存单条记忆到数据库
   */
  saveToDB(message: MemoryMessage): void {
    try {
      this.db
        .prepare(
          `INSERT INTO agent_memories (agent_id, session_key, role, content, cause_by, timestamp)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          this.agentId,
          this.sessionKey,
          message.role,
          message.content,
          message.causeBy || null,
          new Date(message.timestamp).toISOString()
        );
    } catch (error) {
      console.error('Failed to save agent memory to DB:', error);
    }
  }

  /**
   * 清空数据库中的记忆
   */
  clearDB(): void {
    try {
      this.db
        .prepare(
          `DELETE FROM agent_memories WHERE agent_id = ? AND session_key = ?`
        )
        .run(this.agentId, this.sessionKey);
    } catch (error) {
      console.error('Failed to clear agent memories from DB:', error);
    }
  }

  /**
   * 清理超过指定天数的旧记忆
   */
  cleanup(maxAgeDays: number = 7): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);
    const cutoffIso = cutoffDate.toISOString();

    try {
      const result = this.db
        .prepare(
          `DELETE FROM agent_memories 
           WHERE agent_id = ? AND session_key = ? AND timestamp < ?`
        )
        .run(this.agentId, this.sessionKey, cutoffIso);

      const deletedCount = Number(result.changes);

      // 同步内存中的数据
      this.storage = this.storage.filter(
        (m) => new Date(m.timestamp).toISOString() >= cutoffIso
      );
      this.rebuildIndex();

      return deletedCount;
    } catch (error) {
      console.error('Failed to cleanup old agent memories:', error);
      return 0;
    }
  }

  /**
   * 添加消息到记忆
   */
  add(message: Omit<MemoryMessage, 'id' | 'timestamp'>): MemoryMessage {
    const msg: MemoryMessage = {
      ...message,
      id: this.generateId(),
      timestamp: Date.now(),
    };

    // 检查重复
    const isDuplicate = this.storage.some(
      (m) => m.role === msg.role && m.content === msg.content && m.causeBy === msg.causeBy
    );
    if (isDuplicate) {
      return msg;
    }

    this.storage.push(msg);
    this.updateIndex(msg);
    this.saveToDB(msg);

    // 限制存储大小
    if (this.storage.length > this.maxStorageSize) {
      this.removeOldest();
    }

    return msg;
  }

  /**
   * 批量添加消息
   */
  addBatch(messages: Omit<MemoryMessage, 'id' | 'timestamp'>[]): MemoryMessage[] {
    return messages.map((m) => this.add(m));
  }

  /**
   * 获取工作记忆（最近K条）
   */
  getWorkingMemory(k?: number): MemoryMessage[] {
    const size = k || this.workingMemorySize;
    return this.storage.slice(-size);
  }

  /**
   * 获取全部记忆
   */
  getAll(): MemoryMessage[] {
    return [...this.storage];
  }

  /**
   * 按角色检索
   */
  getByRole(role: string): MemoryMessage[] {
    return this.storage.filter((m) => m.role === role);
  }

  /**
   * 按触发动作检索
   */
  getByCause(causeBy: string): MemoryMessage[] {
    return this.index.byCause.get(causeBy) || [];
  }

  /**
   * 按关键词检索（简单文本匹配）
   */
  searchByKeyword(keyword: string): MemoryMessage[] {
    const lowerKeyword = keyword.toLowerCase();
    return this.storage.filter((m) => m.content.toLowerCase().includes(lowerKeyword));
  }

  /**
   * 获取最近K条记忆
   */
  getRecent(k: number): MemoryMessage[] {
    return this.storage.slice(-k);
  }

  /**
   * 删除指定消息
   */
  delete(messageId: string): boolean {
    const idx = this.storage.findIndex((m) => m.id === messageId);
    if (idx === -1) return false;

    const msg = this.storage[idx];
    this.storage.splice(idx, 1);
    this.removeFromIndex(msg);

    // 同时从数据库删除
    try {
      const dbId = messageId.replace('mem-', '');
      this.db.prepare('DELETE FROM agent_memories WHERE id = ?').run(dbId);
    } catch (error) {
      console.error('Failed to delete agent memory from DB:', error);
    }

    return true;
  }

  /**
   * 删除最新的一条消息
   */
  deleteNewest(): MemoryMessage | null {
    if (this.storage.length === 0) return null;
    const msg = this.storage.pop()!;
    this.removeFromIndex(msg);

    // 同时从数据库删除
    try {
      const dbId = msg.id.replace('mem-', '');
      this.db.prepare('DELETE FROM agent_memories WHERE id = ?').run(dbId);
    } catch (error) {
      console.error('Failed to delete newest agent memory from DB:', error);
    }

    return msg;
  }

  /**
   * 清空记忆
   */
  clear(): void {
    this.storage = [];
    this.index = {
      byRole: new Map(),
      byCause: new Map(),
      byKeyword: new Map(),
    };
    this.clearDB();
  }

  /**
   * 获取记忆数量
   */
  count(): number {
    return this.storage.length;
  }

  /**
   * 生成记忆摘要（用于长期记忆压缩）
   */
  generateSummary(): string {
    const roles = ['system', 'user', 'assistant', 'tool'] as const;
    const summary: string[] = [];

    for (const role of roles) {
      const msgs = this.getByRole(role);
      if (msgs.length > 0) {
        summary.push(`${role}: ${msgs.length}条消息`);
      }
    }

    return summary.join(', ');
  }

  /**
   * 导出为LLM可用的消息格式
   */
  toLLMMessages(): Array<{ role: string; content: string }> {
    return this.storage.map((m) => ({
      role: m.role,
      content: m.content,
    }));
  }

  /**
   * 从LLM消息格式导入
   */
  fromLLMMessages(messages: Array<{ role: string; content: string }>): void {
    this.clear();
    for (const msg of messages) {
      this.add({
        role: msg.role as any,
        content: msg.content,
      });
    }
  }

  private generateId(): string {
    return `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private updateIndex(msg: MemoryMessage): void {
    // 按角色索引
    const roleList = this.index.byRole.get(msg.role) || [];
    roleList.push(msg);
    this.index.byRole.set(msg.role, roleList);

    // 按触发动作索引
    if (msg.causeBy) {
      const causeList = this.index.byCause.get(msg.causeBy) || [];
      causeList.push(msg);
      this.index.byCause.set(msg.causeBy, causeList);
    }
  }

  private removeFromIndex(msg: MemoryMessage): void {
    // 从角色索引中移除
    const roleList = this.index.byRole.get(msg.role);
    if (roleList) {
      const idx = roleList.findIndex((m) => m.id === msg.id);
      if (idx !== -1) roleList.splice(idx, 1);
    }

    // 从触发动作索引中移除
    if (msg.causeBy) {
      const causeList = this.index.byCause.get(msg.causeBy);
      if (causeList) {
        const idx = causeList.findIndex((m) => m.id === msg.id);
        if (idx !== -1) causeList.splice(idx, 1);
      }
    }
  }

  private removeOldest(): void {
    const msg = this.storage.shift();
    if (msg) {
      this.removeFromIndex(msg);
      // 同时从数据库删除最旧的一条
      try {
        const dbId = msg.id.replace('mem-', '');
        this.db.prepare('DELETE FROM agent_memories WHERE id = ?').run(dbId);
      } catch (error) {
        console.error('Failed to remove oldest agent memory from DB:', error);
      }
    }
  }

  private rebuildIndex(): void {
    this.index = {
      byRole: new Map(),
      byCause: new Map(),
      byKeyword: new Map(),
    };
    for (const msg of this.storage) {
      this.updateIndex(msg);
    }
  }
}

// 全局Agent记忆存储
const agentMemories = new Map<string, AgentMemory>();

export function getAgentMemory(
  agentId: string,
  sessionKey: string = 'default',
  options?: { maxStorageSize?: number; workingMemorySize?: number }
): AgentMemory {
  const key = `${agentId}:${sessionKey}`;
  if (!agentMemories.has(key)) {
    agentMemories.set(key, new AgentMemory(agentId, sessionKey, options));
  }
  return agentMemories.get(key)!;
}

export function deleteAgentMemory(agentId: string, sessionKey?: string): boolean {
  if (sessionKey) {
    const key = `${agentId}:${sessionKey}`;
    const memory = agentMemories.get(key);
    if (memory) {
      memory.clearDB();
      return agentMemories.delete(key);
    }
    return false;
  }

  // 删除该 agentId 下的所有 session
  let deleted = false;
  for (const [key, memory] of agentMemories.entries()) {
    if (key.startsWith(`${agentId}:`)) {
      memory.clearDB();
      agentMemories.delete(key);
      deleted = true;
    }
  }
  return deleted;
}

export function clearAllAgentMemories(): void {
  for (const memory of agentMemories.values()) {
    memory.clearDB();
  }
  agentMemories.clear();
}
