import { getDatabase } from '../config/database.js';

export interface TrashItem {
  id: number;
  original_table: string;
  original_id: number;
  data: string;
  summary: string | null;
  user_id: number | null;
  deleted_by: number | null;
  restored: number;
  restored_at: string | null;
  created_at: string;
}

const TABLE_LABELS: Record<string, string> = {
  crm_customers: '客户',
  crm_sales_tasks: '销售任务',
  crm_todos: '待办事项',
  crm_calendar_events: '日历事件',
  crm_follow_ups: '跟进记录',
  crm_notifications: '通知',
  crm_pipeline_stages: '管道阶段',
  crm_deals: '商机',
  crm_assignment_rules: '分派规则',
  crm_user_skills: '员工技能',
  crm_user_territories: '负责地域',
  sales_crew_sessions: '销售作战会话',
  sales_crew_messages: '销售作战消息',
  sales_crew_analysis: '作战分析',
  conversations: '对话',
  messages: '消息',
  workflows: '工作流',
  agents: '智能体',
  crews: '作战编队',
  knowledge_bases: '知识库',
  knowledge_documents: '知识文档',
  crawler_tasks: '抓取任务',
  system_config: '系统配置',
  roles: '角色',
  browser_sessions: '浏览器会话',
  ai_providers: 'AI提供商',
  users: '用户',
};

// 哪些表支持恢复（必须提供table+insert语句）
const RESTORABLE_TABLES = new Set([
  'crm_customers', 'crm_sales_tasks', 'crm_todos', 'crm_calendar_events',
  'crm_follow_ups', 'crm_pipeline_stages', 'crm_deals', 'crm_assignment_rules',
  'crm_user_skills', 'crm_user_territories', 'conversations',
  'workflows', 'agents', 'crews', 'knowledge_bases', 'knowledge_documents',
  'crawler_tasks', 'roles', 'ai_providers', 'users',
  'sales_crew_sessions',
]);

export class TrashService {
  // 获取表的中文标签
  getTableLabel(table: string): string {
    return TABLE_LABELS[table] || table;
  }

  // 判断某张表是否可恢复
  isRestorable(table: string): boolean {
    return RESTORABLE_TABLES.has(table);
  }

  // 移动到回收站
  moveToTrash(
    table: string,
    originalId: number,
    data: any,
    summary?: string,
    userId?: number,
    deletedBy?: number
  ): number {
    const db = getDatabase();
    const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
    const result = db.prepare(
      `INSERT INTO trash_items (original_table, original_id, data, summary, user_id, deleted_by)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(table, originalId, dataStr, summary || null, userId || null, deletedBy || null);
    return Number(result.lastInsertRowid);
  }

  // 获取回收站列表
  getItems(userId?: number, table?: string, page = 1, pageSize = 50): { items: TrashItem[]; total: number } {
    const db = getDatabase();
    const conditions: string[] = ['restored = 0'];
    const params: any[] = [];

    if (userId) {
      conditions.push('(user_id = ? OR deleted_by = ?)');
      params.push(userId, userId);
    }
    if (table) {
      conditions.push('original_table = ?');
      params.push(table);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = db.prepare(`SELECT COUNT(*) as total FROM trash_items ${where}`).get(...params) as any;
    const total = countRow?.total || 0;

    const items = db.prepare(
      `SELECT * FROM trash_items ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(...params, pageSize, (page - 1) * pageSize) as TrashItem[];

    return { items, total };
  }

  // 从回收站恢复单条
  restoreItem(trashId: number): { success: boolean; error?: string } {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM trash_items WHERE id = ? AND restored = 0').get(trashId) as TrashItem | undefined;

    if (!row) {
      return { success: false, error: '记录不存在或已恢复' };
    }

    if (!this.isRestorable(row.original_table)) {
      return { success: false, error: `"${this.getTableLabel(row.original_table)}"类型暂不支持恢复` };
    }

    try {
      const data = JSON.parse(row.data);

      // Q1.21：特殊处理销售作战会话恢复（含嵌套messages）
      if (row.original_table === 'sales_crew_sessions') {
        const session = data.session;
        const messages = data.messages || [];
        // 恢复会话状态
        db.prepare(
          "UPDATE sales_crew_sessions SET status = 'active', deleted_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).run(session.id || row.original_id);
        // 如果有序列化消息，重新插入
        for (const msg of messages) {
          try {
            db.prepare(
              `INSERT INTO sales_crew_messages (session_id, user_id, role, content, agent_id, agent_name, latency_ms, tokens_input, tokens_output)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(msg.session_id, msg.user_id, msg.role, msg.content, msg.agent_id || null, msg.agent_name || null, msg.latency_ms || null, msg.tokens_input || null, msg.tokens_output || null);
          } catch { /* 消息可能已存在 */ }
        }
        db.prepare('UPDATE trash_items SET restored = 1, restored_at = CURRENT_TIMESTAMP WHERE id = ?').run(trashId);
        return { success: true };
      }

      // 解析列映射
      const columns = Object.keys(data);
      const placeholders = columns.map(() => '?').join(', ');
      const colNames = columns.map(c => `"${c}"`).join(', ');
      const values = columns.map(c => data[c]);

      db.prepare(
        `INSERT INTO "${row.original_table}" (${colNames}) VALUES (${placeholders})`
      ).run(...values);

      // 标记为已恢复
      db.prepare(
        'UPDATE trash_items SET restored = 1, restored_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(trashId);

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // 永久删除单条
  permanentDelete(trashId: number): void {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM trash_items WHERE id = ?').get(trashId) as TrashItem | undefined;
    if (!row) return;

    // 如果还没恢复，也尝试删除原始数据（如cascade遗漏的）
    try {
      if (!row.restored) {
        db.prepare(`DELETE FROM "${row.original_table}" WHERE id = ?`).run(row.original_id);
      }
    } catch { /* 原始数据可能已被cascade删除 */ }

    db.prepare('DELETE FROM trash_items WHERE id = ?').run(trashId);
  }

  // 批量永久删除
  emptyTrash(ids: number[]): number {
    const db = getDatabase();
    const placeholders = ids.map(() => '?').join(', ');
    const result = db.prepare(
      `DELETE FROM trash_items WHERE id IN (${placeholders})`
    ).run(...ids);
    return result.changes;
  }
}

export const trashService = new TrashService();