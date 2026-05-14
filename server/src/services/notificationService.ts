import { getDatabase } from '../config/database.js';

// ==========================================
// CRM通知提醒服务 (Q1.18)
// 支持：新任务分派、进展更新、超时提醒、任务即将到期
// ==========================================

export interface NotificationData {
  userId: number;
  type: 'new_assignment' | 'progress_update' | 'overdue_reminder' | 'due_soon' | 'overdue_reminder_admin';
  title: string;
  content?: string;
  relatedCustomerId?: number;
  relatedTaskId?: number;
}

// 创建通知
export function createNotification(data: NotificationData): number {
  const db = getDatabase();
  const result = db.prepare(
    `INSERT INTO crm_notifications (user_id, type, title, content, related_customer_id, related_task_id)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    data.userId,
    data.type,
    data.title,
    data.content || '',
    data.relatedCustomerId || null,
    data.relatedTaskId || null
  );
  return Number(result.lastInsertRowid);
}

// 获取用户的通知列表
export function getNotificationsByUser(userId: number, options?: { unreadOnly?: boolean; limit?: number }): any[] {
  const db = getDatabase();
  let sql = 'SELECT * FROM crm_notifications WHERE user_id = ?';
  const params: any[] = [userId];

  if (options?.unreadOnly) {
    sql += ' AND is_read = 0';
  }

  sql += ' ORDER BY created_at DESC';

  if (options?.limit) {
    sql += ' LIMIT ?';
    params.push(options.limit);
  }

  return db.prepare(sql).all(...params) as any[];
}

// 获取今日未读通知（含通知表 + 今日任务 + 今日待办）
export function getTodayNotifications(userId: number): any[] {
  const db = getDatabase();
  const today = new Date().toISOString().slice(0, 10);

  const results: any[] = [];

  const notifications = db.prepare(`
    SELECT id, type, title, content, related_customer_id, related_task_id, is_read, created_at,
           'notification' AS source, NULL AS due_date
    FROM crm_notifications
    WHERE user_id = ? AND is_read = 0 AND date(created_at) = ?
    ORDER BY created_at DESC
  `).all(userId, today) as any[];
  results.push(...notifications);

  const tasks = db.prepare(`
    SELECT t.id, 'task_assigned' AS type, ('新任务: ' || t.title) AS title,
           t.description AS content, t.customer_id AS related_customer_id, t.id AS related_task_id,
           0 AS is_read, t.created_at, 'task' AS source, t.due_date,
           c.name AS customer_name, u.nickname AS assigned_by_name
    FROM crm_sales_tasks t
    LEFT JOIN crm_customers c ON t.customer_id = c.id
    LEFT JOIN users u ON t.assigned_by = u.id
    WHERE t.assigned_to = ? AND t.status != 'completed' AND date(t.created_at) = ?
    ORDER BY t.created_at DESC
  `).all(userId, today) as any[];
  results.push(...tasks);

  const todos = db.prepare(`
    SELECT td.id, 'todo_due' AS type, ('待办: ' || td.title) AS title,
           td.description AS content, td.related_customer_id, td.related_task_id,
           0 AS is_read, td.created_at, 'todo' AS source, td.due_date,
           c.name AS customer_name
    FROM crm_todos td
    LEFT JOIN crm_customers c ON td.related_customer_id = c.id
    WHERE td.user_id = ? AND td.status != 'completed' AND date(td.due_date) = ?
    ORDER BY td.due_date ASC
  `).all(userId, today) as any[];
  results.push(...todos);

  results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return results;
}

// 标记所有今日通知已读（含通知表记录 + 今日任务 + 今日待办）
export function markAllTodayNotificationsAsRead(userId: number): void {
  const db = getDatabase();
  const today = new Date().toISOString().slice(0, 10);

  db.prepare(`
    UPDATE crm_notifications SET is_read = 1, read_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND is_read = 0 AND date(created_at) = ?
  `).run(userId, today);

  // 任务不需要标记已读，它们有自己的状态管理系统
  // 待办也不需要标记已读，它们有 completed 状态
}
export function getUnreadNotificationCount(userId: number): number {
  const db = getDatabase();
  const result = db.prepare(
    'SELECT COUNT(*) as count FROM crm_notifications WHERE user_id = ? AND is_read = 0'
  ).get(userId) as any;
  return result?.count || 0;
}

// 标记通知已读
export function markNotificationAsRead(notificationId: number, userId: number): boolean {
  const db = getDatabase();
  const result = db.prepare(
    'UPDATE crm_notifications SET is_read = 1, read_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?'
  ).run(notificationId, userId);
  return result.changes > 0;
}

// 标记所有通知已读
export function markAllNotificationsAsRead(userId: number): void {
  const db = getDatabase();
  db.prepare(
    'UPDATE crm_notifications SET is_read = 1, read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND is_read = 0'
  ).run(userId);
}

// 删除通知
export function deleteNotification(notificationId: number, userId: number): boolean {
  const db = getDatabase();
  const result = db.prepare(
    'DELETE FROM crm_notifications WHERE id = ? AND user_id = ?'
  ).run(notificationId, userId);
  return result.changes > 0;
}

// ==========================================
// 定时提醒检查
// ==========================================

// 检查超时未跟进客户
export function checkOverdueCustomers(): void {
  const db = getDatabase();

  // 获取超时提醒天数设置
  const setting = db.prepare("SELECT value FROM crm_settings WHERE key = 'overdue_reminder_days'").get() as any;
  const overdueDays = parseInt(setting?.value || '3');

  // 查找超时未跟进的客户
  const overdueCustomers = db.prepare(`
    SELECT c.*, u.nickname as assigned_name
    FROM crm_customers c
    LEFT JOIN users u ON c.assigned_to = u.id
    WHERE c.assigned_to IS NOT NULL
      AND c.status NOT IN ('won', 'lost')
      AND (
        c.last_contact_at IS NULL
        OR datetime(c.last_contact_at, '+${overdueDays} days') < datetime('now')
      )
    ORDER BY c.assigned_to, c.urgency_level DESC
  `).all() as any[];

  // 按员工分组
  const groupedByUser = new Map<number, any[]>();
  for (const customer of overdueCustomers) {
    if (!groupedByUser.has(customer.assigned_to)) {
      groupedByUser.set(customer.assigned_to, []);
    }
    groupedByUser.get(customer.assigned_to)!.push(customer);
  }

  // 给每个员工发送提醒
  for (const [userId, customers] of groupedByUser) {
    // 检查今天是否已经发送过提醒
    const todayReminder = db.prepare(`
      SELECT id FROM crm_notifications
      WHERE user_id = ? AND type = 'overdue_reminder'
      AND date(created_at) = date('now')
      LIMIT 1
    `).get(userId) as any;

    if (!todayReminder) {
      createNotification({
        userId,
        type: 'overdue_reminder',
        title: `您有 ${customers.length} 个客户超过${overdueDays}天未跟进`,
        content: customers.map((c: any) => `• ${c.name} (${c.company || '未知公司'}) - ${c.vendor}`).join('\n'),
      });
    }

    // 给管理员发送提醒
    const admins = db.prepare("SELECT id FROM users WHERE role = 'admin'").all() as any[];
    for (const admin of admins) {
      const adminTodayReminder = db.prepare(`
        SELECT id FROM crm_notifications
        WHERE user_id = ? AND type = 'overdue_reminder_admin'
        AND date(created_at) = date('now')
        AND content LIKE ?
        LIMIT 1
      `).get(admin.id, `%${customers[0].assigned_name}%`) as any;

      if (!adminTodayReminder) {
        createNotification({
          userId: admin.id,
          type: 'overdue_reminder_admin',
          title: `员工 ${customers[0].assigned_name} 有 ${customers.length} 个客户超时未跟进`,
          content: customers.map((c: any) => `• ${c.name} (${c.company || '未知公司'})`).join('\n'),
        });
      }
    }
  }
}

// 检查即将到期的任务
export function checkDueSoonTasks(): void {
  const db = getDatabase();

  // 查找24小时内到期的任务
  const dueSoonTasks = db.prepare(`
    SELECT t.*, c.name as customer_name, u.nickname as assigned_name
    FROM crm_sales_tasks t
    LEFT JOIN crm_customers c ON t.customer_id = c.id
    LEFT JOIN users u ON t.assigned_to = u.id
    WHERE t.status = 'pending'
      AND t.due_date IS NOT NULL
      AND datetime(t.due_date) BETWEEN datetime('now') AND datetime('now', '+24 hours')
  `).all() as any[];

  for (const task of dueSoonTasks) {
    // 检查是否已经发送过提醒
    const existingReminder = db.prepare(`
      SELECT id FROM crm_notifications
      WHERE user_id = ? AND type = 'due_soon'
      AND related_task_id = ?
      AND date(created_at) = date('now')
      LIMIT 1
    `).get(task.assigned_to, task.id) as any;

    if (!existingReminder) {
      createNotification({
        userId: task.assigned_to,
        type: 'due_soon',
        title: `任务即将到期: ${task.title}`,
        content: `任务"${task.title}"将在24小时内到期，请尽快处理。`,
        relatedCustomerId: task.customer_id,
        relatedTaskId: task.id,
      });
    }
  }
}

// 客户进展更新时通知管理员
export function notifyProgressUpdate(customerId: number, oldStatus: string, newStatus: string, changedBy: number): void {
  const db = getDatabase();

  const customer = db.prepare('SELECT * FROM crm_customers WHERE id = ?').get(customerId) as any;
  const changer = db.prepare('SELECT nickname FROM users WHERE id = ?').get(changedBy) as any;

  if (!customer || !changer) return;

  // 通知管理员
  const admins = db.prepare("SELECT id FROM users WHERE role = 'admin'").all() as any[];
  for (const admin of admins) {
    createNotification({
      userId: admin.id,
      type: 'progress_update',
      title: `${changer.nickname} 更新了客户状态`,
      content: `客户: ${customer.name}\n状态: ${oldStatus} → ${newStatus}`,
      relatedCustomerId: customerId,
    });
  }
}

// 启动定时提醒服务（每30分钟检查一次）
export function startReminderService(intervalMinutes: number = 30): void {
  console.log(`[ReminderService] 启动定时提醒服务，间隔: ${intervalMinutes}分钟`);

  // 立即执行一次
  checkOverdueCustomers();
  checkDueSoonTasks();

  // 定时执行
  setInterval(() => {
    console.log('[ReminderService] 执行定时检查...');
    checkOverdueCustomers();
    checkDueSoonTasks();
  }, intervalMinutes * 60 * 1000);
}
