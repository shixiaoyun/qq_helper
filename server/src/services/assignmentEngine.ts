import { getDatabase } from '../config/database.js';

// ==========================================
// CRM任务分派引擎 (Q1.18)
// 支持多种分派规则：轮询、负载均衡、能力匹配、地域、优先级
// ==========================================

export interface AssignmentContext {
  customer: any;
  rules: any[];
  users: any[];
  userSkills: Map<number, any[]>;
  userWorkloads: Map<number, number>;
}

export interface AssignmentResult {
  success: boolean;
  customerId?: number;
  assignedTo?: number;
  assignedBy?: number;
  assignmentType?: string;
  ruleId?: number;
  reason?: string;
  taskId?: number;
  notificationId?: number;
}

// 获取所有激活的分派规则，按优先级排序
function getActiveRulesSortedByPriority(): any[] {
  const db = getDatabase();
  return db.prepare(
    'SELECT * FROM crm_assignment_rules WHERE is_active = 1 ORDER BY priority ASC, created_at ASC'
  ).all() as any[];
}

// 获取所有激活的销售员工
function getActiveSalesUsers(): any[] {
  const db = getDatabase();
  return db.prepare(
    "SELECT id, username, nickname, role, status FROM users WHERE status = 1 AND role IN ('user', 'admin') ORDER BY nickname"
  ).all() as any[];
}

// 获取员工当前工作负载（分配的客户数）
function getUserWorkloads(): Map<number, number> {
  const db = getDatabase();
  const rows = db.prepare(
    "SELECT assigned_to, COUNT(*) as count FROM crm_customers WHERE assigned_to IS NOT NULL AND status NOT IN ('won', 'lost') GROUP BY assigned_to"
  ).all() as any[];

  const workloads = new Map<number, number>();
  for (const row of rows) {
    workloads.set(row.assigned_to, row.count);
  }
  return workloads;
}

// 获取员工技能
function getUserSkills(): Map<number, any[]> {
  const db = getDatabase();
  const rows = db.prepare('SELECT * FROM crm_user_skills').all() as any[];

  const skills = new Map<number, any[]>();
  for (const row of rows) {
    if (!skills.has(row.user_id)) {
      skills.set(row.user_id, []);
    }
    skills.get(row.user_id)!.push(row);
  }
  return skills;
}

// 检查规则是否适用于客户
function isRuleApplicable(rule: any, customer: any): boolean {
  // 厂商过滤
  if (rule.vendor_filter && customer.vendor !== rule.vendor_filter) {
    return false;
  }
  // 状态过滤
  if (rule.status_filter && customer.status !== rule.status_filter) {
    return false;
  }
  return true;
}

// 轮询分派
function roundRobinAssign(rule: any, context: AssignmentContext): any | null {
  const config = JSON.parse(rule.config || '{}');
  const userIds: number[] = config.user_ids || [];
  let currentIndex: number = config.current_index || 0;

  if (userIds.length === 0) return null;

  const targetUserId = userIds[currentIndex % userIds.length];

  // 更新current_index
  const db = getDatabase();
  db.prepare(
    'UPDATE crm_assignment_rules SET config = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(
    JSON.stringify({ ...config, current_index: (currentIndex + 1) % userIds.length }),
    rule.id
  );

  return context.users.find((u: any) => u.id === targetUserId) || null;
}

// 负载均衡分派
function loadBalanceAssign(rule: any, context: AssignmentContext): any | null {
  const config = JSON.parse(rule.config || '{}');
  const userIds: number[] = config.user_ids || [];
  const maxPerUser: number = config.max_per_user || 50;

  let minLoad = Infinity;
  let targetUser: any | null = null;

  for (const userId of userIds) {
    const load = context.userWorkloads.get(userId) || 0;
    if (load < minLoad && load < maxPerUser) {
      minLoad = load;
      targetUser = context.users.find((u: any) => u.id === userId) || null;
    }
  }

  return targetUser;
}

// 能力匹配分派
function skillMatchAssign(rule: any, context: AssignmentContext): any | null {
  const config = JSON.parse(rule.config || '{}');
  const vendor = context.customer.vendor;
  const vendorUserIds: number[] = (config.vendor_user_map || {})[vendor] || [];

  if (vendorUserIds.length === 0) return null;

  // 找出该厂商的专家，按熟练度排序
  const experts = vendorUserIds
    .map((uid: number) => ({
      user: context.users.find((u: any) => u.id === uid),
      skill: context.userSkills.get(uid)?.find((s: any) => s.vendor === vendor),
    }))
    .filter((e: any) => e.user && e.skill)
    .sort((a: any, b: any) => (b.skill?.proficiency_level || 0) - (a.skill?.proficiency_level || 0));

  return experts[0]?.user || null;
}

// 地域分派
function territoryAssign(rule: any, context: AssignmentContext): any | null {
  const config = JSON.parse(rule.config || '{}');
  const regionUserMap: Record<string, number[]> = config.region_user_map || {};

  // 从客户地址中提取省份（简化处理）
  const address = context.customer.address || '';
  let matchedRegion: string | null = null;

  for (const region of Object.keys(regionUserMap)) {
    if (address.includes(region)) {
      matchedRegion = region;
      break;
    }
  }

  if (!matchedRegion) return null;

  const userIds = regionUserMap[matchedRegion];
  if (!userIds || userIds.length === 0) return null;

  // 轮询选择
  const targetUserId = userIds[0];
  return context.users.find((u: any) => u.id === targetUserId) || null;
}

// 优先级分派
function priorityAssign(rule: any, context: AssignmentContext): any | null {
  const config = JSON.parse(rule.config || '{}');
  const highValueUsers: number[] = config.high_value_users || [];
  const threshold: number = config.threshold || 100000;

  // 解析预算
  const budgetRange = context.customer.budget_range || '';
  const budgetMatch = budgetRange.match(/(\d+)/);
  const budget = budgetMatch ? parseInt(budgetMatch[1]) : 0;

  if (budget >= threshold && highValueUsers.length > 0) {
    return context.users.find((u: any) => u.id === highValueUsers[0]) || null;
  }

  return null;
}

// 应用分派规则
function applyRule(rule: any, context: AssignmentContext): any | null {
  switch (rule.rule_type) {
    case 'round_robin':
      return roundRobinAssign(rule, context);
    case 'load_balance':
      return loadBalanceAssign(rule, context);
    case 'skill_match':
      return skillMatchAssign(rule, context);
    case 'territory':
      return territoryAssign(rule, context);
    case 'priority':
      return priorityAssign(rule, context);
    default:
      return null;
  }
}

// 执行分派
function executeAssignment(
  customer: any,
  targetUser: any,
  rule: any,
  assignmentType: string,
  assignedBy: number = 1
): AssignmentResult {
  const db = getDatabase();

  // 1. 更新客户负责人
  const oldAssignedTo = customer.assigned_to;
  db.prepare('UPDATE crm_customers SET assigned_to = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
    targetUser.id,
    customer.id
  );

  // 2. 记录分派历史
  db.prepare(
    `INSERT INTO crm_assignment_history (customer_id, from_user_id, to_user_id, assigned_by, assignment_type, rule_id, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    customer.id,
    oldAssignedTo,
    targetUser.id,
    assignedBy,
    assignmentType,
    rule?.id || null,
    assignmentType === 'auto' ? `自动分派: ${rule?.name || '默认规则'}` : '手动分派'
  );

  // 3. 自动创建跟进任务
  const taskResult = db.prepare(
    `INSERT INTO crm_sales_tasks (title, description, customer_id, assigned_to, assigned_by, priority, due_date)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+3 days'))`
  ).run(
    `跟进客户: ${customer.name}`,
    `新分派的客户，来自${customer.company || '未知公司'}，请及时联系`,
    customer.id,
    targetUser.id,
    assignedBy,
    customer.urgency_level >= 4 ? 'high' : 'medium'
  );

  // 4. 创建通知
  const notificationResult = db.prepare(
    `INSERT INTO crm_notifications (user_id, type, title, content, related_customer_id, related_task_id)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    targetUser.id,
    'new_assignment',
    `您被分派了新客户: ${customer.name}`,
    `客户: ${customer.name}\n公司: ${customer.company || '未知'}\n厂商: ${customer.vendor}\n请尽快跟进`,
    customer.id,
    taskResult.lastInsertRowid
  );

  return {
    success: true,
    customerId: customer.id,
    assignedTo: targetUser.id,
    assignedBy,
    assignmentType,
    ruleId: rule?.id,
    reason: assignmentType === 'auto' ? `自动分派: ${rule?.name || '默认规则'}` : '手动分派',
    taskId: Number(taskResult.lastInsertRowid),
    notificationId: Number(notificationResult.lastInsertRowid),
  };
}

// 自动分派客户
export async function autoAssignCustomer(customerId: number, assignedBy: number = 1): Promise<AssignmentResult> {
  const db = getDatabase();

  // 1. 获取客户信息
  const customer = db.prepare('SELECT * FROM crm_customers WHERE id = ?').get(customerId) as any;
  if (!customer) {
    return { success: false, reason: '客户不存在' };
  }

  // 2. 检查是否已分派
  if (customer.assigned_to) {
    return { success: false, reason: '客户已被分派' };
  }

  // 3. 检查自动分派是否启用
  const autoAssignSetting = db.prepare("SELECT value FROM crm_settings WHERE key = 'auto_assign_enabled'").get() as any;
  if (!autoAssignSetting || autoAssignSetting.value !== '1') {
    return { success: false, reason: '自动分派未启用' };
  }

  // 4. 获取所有激活的分派规则
  const rules = getActiveRulesSortedByPriority();
  if (rules.length === 0) {
    return { success: false, reason: '没有激活的分派规则' };
  }

  // 5. 获取候选员工列表
  const users = getActiveSalesUsers();
  if (users.length === 0) {
    return { success: false, reason: '没有可用的销售员工' };
  }

  // 6. 获取员工工作负载和技能
  const workloads = getUserWorkloads();
  const skills = getUserSkills();

  const context: AssignmentContext = {
    customer,
    rules,
    users,
    userSkills: skills,
    userWorkloads: workloads,
  };

  // 7. 按规则顺序尝试分派
  for (const rule of rules) {
    if (!isRuleApplicable(rule, customer)) continue;

    const targetUser = applyRule(rule, context);
    if (targetUser) {
      return executeAssignment(customer, targetUser, rule, 'auto', assignedBy);
    }
  }

  // 8. 没有匹配规则，留在客户池
  return { success: false, reason: '没有匹配的分派规则' };
}

// 手动分派客户
export async function manualAssignCustomer(
  customerId: number,
  toUserId: number,
  assignedBy: number,
  _reason?: string
): Promise<AssignmentResult> {
  const db = getDatabase();

  const customer = db.prepare('SELECT * FROM crm_customers WHERE id = ?').get(customerId) as any;
  if (!customer) {
    return { success: false, reason: '客户不存在' };
  }

  const targetUser = db.prepare('SELECT * FROM users WHERE id = ? AND status = 1').get(toUserId) as any;
  if (!targetUser) {
    return { success: false, reason: '目标员工不存在或未激活' };
  }

  return executeAssignment(customer, targetUser, null, 'manual', assignedBy);
}

// 重新分派客户
export async function reassignCustomer(
  customerId: number,
  toUserId: number,
  assignedBy: number,
  _reason?: string
): Promise<AssignmentResult> {
  const db = getDatabase();

  const customer = db.prepare('SELECT * FROM crm_customers WHERE id = ?').get(customerId) as any;
  if (!customer) {
    return { success: false, reason: '客户不存在' };
  }

  const targetUser = db.prepare('SELECT * FROM users WHERE id = ? AND status = 1').get(toUserId) as any;
  if (!targetUser) {
    return { success: false, reason: '目标员工不存在或未激活' };
  }

  return executeAssignment(customer, targetUser, null, 'reassign', assignedBy);
}

// 批量分派客户
export async function batchAssignCustomers(
  customerIds: number[],
  toUserId: number,
  assignedBy: number,
  reason?: string
): Promise<AssignmentResult[]> {
  const results: AssignmentResult[] = [];

  for (const customerId of customerIds) {
    const result = await manualAssignCustomer(customerId, toUserId, assignedBy, reason);
    results.push(result);
  }

  return results;
}

// 获取员工工作量统计
export function getUserWorkloadStats(): any[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT
      u.id,
      u.nickname,
      u.username,
      COUNT(DISTINCT c.id) as customer_count,
      SUM(CASE WHEN c.status = 'lead' THEN 1 ELSE 0 END) as lead_count,
      SUM(CASE WHEN c.status = 'contacted' THEN 1 ELSE 0 END) as contacted_count,
      SUM(CASE WHEN c.status = 'negotiating' THEN 1 ELSE 0 END) as negotiating_count,
      SUM(CASE WHEN c.status = 'won' THEN 1 ELSE 0 END) as won_count,
      SUM(CASE WHEN c.status = 'lost' THEN 1 ELSE 0 END) as lost_count,
      SUM(CASE WHEN c.status NOT IN ('won', 'lost') AND (c.last_contact_at IS NULL OR datetime(c.last_contact_at, '+3 days') < datetime('now')) THEN 1 ELSE 0 END) as overdue_count,
      COUNT(DISTINCT d.id) as deal_count,
      COALESCE(SUM(DISTINCT d.value), 0) as deal_value,
      COUNT(DISTINCT t.id) as task_count,
      COUNT(DISTINCT CASE WHEN t.status = 'pending' THEN t.id END) as pending_tasks,
      COUNT(DISTINCT CASE WHEN t.status = 'completed' THEN t.id END) as completed_tasks,
      COUNT(DISTINCT fu.id) as follow_up_count
    FROM users u
    LEFT JOIN crm_customers c ON c.assigned_to = u.id
    LEFT JOIN crm_deals d ON d.assigned_to = u.id AND d.status = 'open'
    LEFT JOIN crm_sales_tasks t ON t.assigned_to = u.id
    LEFT JOIN crm_follow_ups fu ON fu.user_id = u.id AND fu.created_at >= date('now', '-30 days')
    WHERE u.status = 1
    GROUP BY u.id
    ORDER BY customer_count DESC
  `).all() as any[];
}

// 获取超时未跟进客户
export function getOverdueCustomers(days: number = 3): any[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT c.*, u.nickname as assigned_name
    FROM crm_customers c
    LEFT JOIN users u ON c.assigned_to = u.id
    WHERE c.assigned_to IS NOT NULL
      AND c.status NOT IN ('won', 'lost')
      AND (
        c.last_contact_at IS NULL
        OR datetime(c.last_contact_at, '+${days} days') < datetime('now')
      )
    ORDER BY c.assigned_to, c.urgency_level DESC
  `).all() as any[];
}

// 获取客户转化漏斗
export function getConversionFunnel(): any {
  const db = getDatabase();

  const stats = db.prepare(`
    SELECT status, COUNT(*) as count
    FROM crm_customers
    GROUP BY status
  `).all() as any[];

  const result: Record<string, number> = {};
  let total = 0;
  for (const row of stats) {
    result[row.status] = row.count;
    total += row.count;
  }

  const activeTotal = total - (result.won || 0) - (result.lost || 0);

  const closed = (result.won || 0) + (result.lost || 0);

  return {
    funnel: result,
    total,
    active: activeTotal,
    closed,
    rates: {
      win_rate: total > 0 ? `${Math.round(((result.won || 0) / total) * 100)}%` : '0%',
      active_rate: total > 0 ? `${Math.round((activeTotal / total) * 100)}%` : '0%',
      closed_rate: total > 0 ? `${Math.round((closed / total) * 100)}%` : '0%',
    },
  };
}
