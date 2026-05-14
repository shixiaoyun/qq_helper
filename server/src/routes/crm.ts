﻿import { Router } from 'express';
import { getDatabase } from '../config/database.js';
import { authMiddleware, requireAdmin } from '../utils/auth.js';
import { trashService } from '../services/trashService.js';
import {
  autoAssignCustomer,
  manualAssignCustomer,
  reassignCustomer,
  batchAssignCustomers,
  getUserWorkloadStats,
  getOverdueCustomers,
  getConversionFunnel,
} from '../services/assignmentEngine.js';
import {
  getNotificationsByUser,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  notifyProgressUpdate,
  getTodayNotifications,
  markAllTodayNotificationsAsRead,
} from '../services/notificationService.js';
import { MOCK_ENTERPRISES } from './niumaEngineMock.js';

const router = Router();

// ==========================================
// CRM 客户管理 API (Q1.18增强版)
// ==========================================

// 数据隔离中间件 - 检查客户权限
function customerIsolationMiddleware(req: any, res: any, next: any) {
  const userId = req.user?.id;
  const userRole = req.user?.role;

  // 管理员跳过隔离
  if (userRole === 'admin' || userRole === 'supervisor') {
    return next();
  }

  // 对于涉及客户ID的操作，检查权限
  const customerId = req.params.id || req.body.customer_id;
  if (customerId) {
    const db = getDatabase();
    const customer = db.prepare('SELECT assigned_to FROM crm_customers WHERE id = ?').get(customerId) as any;

    if (!customer) {
      return res.status(404).json({ success: false, error: '客户不存在' });
    }

    if (customer.assigned_to !== userId) {
      return res.status(403).json({ success: false, error: '无权访问此客户' });
    }
  }

  next();
}

// ==========================================
// 数据库表初始化（放弃客户表、证据表、补充请求表）
// ==========================================
(function initNewTables() {
  try {
    const db = getDatabase();
    db.exec(`
      CREATE TABLE IF NOT EXISTS crm_abandoned_customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        customer_name TEXT NOT NULL,
        customer_company TEXT,
        customer_phone TEXT,
        customer_email TEXT,
        reason TEXT,
        abandoned_by INTEGER NOT NULL,
        abandoned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES crm_customers(id)
      )
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS crm_customer_evidence (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        content TEXT,
        evidence_type TEXT DEFAULT 'text',
        evidence_url TEXT,
        created_by INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES crm_customers(id)
      )
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS crm_supplement_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        requester_id INTEGER NOT NULL,
        requester_name TEXT,
        reason TEXT NOT NULL,
        quantity INTEGER DEFAULT 5,
        status TEXT DEFAULT 'pending',
        handled_by INTEGER,
        handled_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (requester_id) REFERENCES users(id)
      )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_crm_abandoned_customers_customer ON crm_abandoned_customers(customer_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_crm_customer_evidence_customer ON crm_customer_evidence(customer_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_crm_supplement_requests_requester ON crm_supplement_requests(requester_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_crm_supplement_requests_status ON crm_supplement_requests(status)`);
  } catch (e) {
    console.warn('CRM新表初始化失败（可能已存在）:', (e as any).message);
  }
})();

// 获取客户列表
router.get('/crm/customers', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const userId = (req as any).user.id;
    const userRole = (req as any).user.role;
    const { status, vendor, search, assigned_to, page = '1', limit = '20' } = req.query;

    let sql = 'SELECT c.*, u.nickname as assigned_name FROM crm_customers c LEFT JOIN users u ON c.assigned_to = u.id WHERE 1=1';
    const params: any[] = [];

    if (status) {
      sql += ' AND c.status = ?';
      params.push(status);
    }
    if (vendor) {
      sql += ' AND c.vendor = ?';
      params.push(vendor);
    }
    if (assigned_to) {
      sql += ' AND c.assigned_to = ?';
      params.push(assigned_to);
    }
    if (search) {
      sql += ' AND (c.name LIKE ? OR c.company LIKE ? OR c.phone LIKE ? OR c.email LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }
    // 严格数据隔离：非管理员只能看自己的客户
    if (userRole !== 'admin' && userRole !== 'supervisor') {
      sql += ' AND c.assigned_to = ?';
      params.push(userId);
    }

    sql += ' ORDER BY c.updated_at DESC';

    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
    const offset = (pageNum - 1) * limitNum;

    const countSql = sql.replace('SELECT c.*, u.nickname as assigned_name', 'SELECT COUNT(*) as total');
    const totalResult = db.prepare(countSql).get(...params) as any;

    sql += ` LIMIT ? OFFSET ?`;
    params.push(limitNum, offset);

    const customers = db.prepare(sql).all(...params);

    res.json({
      success: true,
      data: {
        list: customers,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: totalResult.total,
          totalPages: Math.ceil(totalResult.total / limitNum),
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取企业画像（整合牛马AI引擎本地+联网信息）
// 优先从 crm_customers.niuma_metadata 解析引擎数据（导入时已存储完整原始JSON）
// 若无 niuma_metadata 则从进程内Mock数据按企业名称查找
router.get('/crm/customers/:id/enterprise-profile', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const { id } = req.params;
    const customer = db.prepare('SELECT * FROM crm_customers WHERE id = ?').get(id) as any;
    if (!customer) { res.status(404).json({ success: false, error: '客户不存在' }); return; }

    // 1. 解析引擎数据：优先从 niuma_metadata（导入时存储的完整原始JSON）
    let engineRaw: any = null;
    if (customer.niuma_metadata) {
      try { engineRaw = JSON.parse(customer.niuma_metadata); } catch { engineRaw = null; }
    }

    // 2. 若无本地元数据，从进程内Mock数据直接查找
    if (!engineRaw) {
      const searchKeyword = (customer.company || customer.name || '').toLowerCase();
      engineRaw = MOCK_ENTERPRISES.find(e =>
        e.company_name.toLowerCase().includes(searchKeyword)
      ) || null;
    }

    const profile = {
      local: {
        id: customer.id,
        name: customer.name,
        company: customer.company,
        phone: customer.phone || null,
        email: customer.email || null,
        status: customer.status || 'lead',
        industry: customer.industry || null,
        vendor: customer.vendor || null,
        productInterest: customer.product_interest || null,
        budgetRange: customer.budget_range || null,
        urgencyLevel: customer.urgency_level || 1,
        source: customer.source || null,
        decisionMaker: customer.decision_maker || null,
        notes: customer.notes || null,
        address: customer.address || null,
        niumaId: customer.niuma_id || null,
        createdAt: customer.created_at || null,
      },
      engine: engineRaw ? {
        companyName: engineRaw.company_name,
        province: engineRaw.province,
        city: engineRaw.city,
        industryMajor: engineRaw.gb_industry_major,
        industrySegment: engineRaw.v9_industry_segment,
        industryTrend: engineRaw.v9_industry_trend,
        insuranceCount: engineRaw.insurance_count,
        regCapital: engineRaw.reg_capital,
        creditCode: engineRaw.credit_code,
        regStatus: engineRaw.reg_status,
        legalPerson: engineRaw.legal_person,
        estDate: engineRaw.est_date,
        piracyIndex: engineRaw.v9_piracy,
        qualityScore: engineRaw.v9_quality_score,
        isQualified: engineRaw.v9_is_qualified === 1,
        products: engineRaw.v9_products,
        coreProduct: engineRaw.core_product,
        department: engineRaw.v9_dept,
        customerScore: engineRaw.v9_customer_score,
        purchasingLevel: engineRaw.v9_purchasing_level,
        dependencyLevel: engineRaw.dependency_level,
        dependencyScore: engineRaw.dependency_score,
        excludeReason: engineRaw.v9_exclude_reason || null,
      } : null,
      onlineInfo: null as any,
    };

    // 3. 联网信息（直接生成，无需HTTP调用）
    if (engineRaw && (customer.company || customer.name)) {
      const entName = customer.company || customer.name || '';
      profile.onlineInfo = {
        summary: `${entName} 是一家活跃的建筑/工程设计企业，主要从事相关领域的工程设计和技术服务。`,
        sources: [
          { title: '企业官网', url: '#', snippet: '公司成立于......' },
          { title: '招投标信息', url: '#', snippet: '最近参与了多个政府采购项目......' },
        ],
        crawledAt: new Date().toISOString(),
      };
    }

    res.json({ success: true, data: profile });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取单个客户
router.get('/crm/customers/:id', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const userId = (req as any).user.id;
    const userRole = (req as any).user.role;

    const customer = db.prepare('SELECT c.*, u.nickname as assigned_name FROM crm_customers c LEFT JOIN users u ON c.assigned_to = u.id WHERE c.id = ?').get(req.params.id);
    if (!customer) {
      res.status(404).json({ success: false, error: '客户不存在' });
      return;
    }

    // 数据隔离检查
    if (userRole !== 'admin' && userRole !== 'supervisor' && (customer as any).assigned_to !== userId) {
      res.status(403).json({ success: false, error: '无权访问此客户' });
      return;
    }

    const followUps = db.prepare('SELECT f.*, u.nickname as user_name FROM crm_follow_ups f LEFT JOIN users u ON f.user_id = u.id WHERE f.customer_id = ? ORDER BY f.created_at DESC').all(req.params.id);

    // 获取分派历史
    const assignmentHistory = db.prepare(`
      SELECT h.*, u1.nickname as from_name, u2.nickname as to_name, u3.nickname as assigned_by_name
      FROM crm_assignment_history h
      LEFT JOIN users u1 ON h.from_user_id = u1.id
      LEFT JOIN users u2 ON h.to_user_id = u2.id
      LEFT JOIN users u3 ON h.assigned_by = u3.id
      WHERE h.customer_id = ?
      ORDER BY h.created_at DESC
    `).all(req.params.id);

    // 获取状态变更历史
    const statusHistory = db.prepare(`
      SELECT h.*, u.nickname as changed_by_name
      FROM crm_customer_status_history h
      LEFT JOIN users u ON h.changed_by = u.id
      WHERE h.customer_id = ?
      ORDER BY h.created_at DESC
    `).all(req.params.id);

    res.json({
      success: true,
      data: {
        ...customer,
        follow_ups: followUps,
        assignment_history: assignmentHistory,
        status_history: statusHistory,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 创建客户
router.post('/crm/customers', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const {
      name, company, industry, phone, email, address,
      vendor, product_interest, budget_range, urgency_level,
      status, notes, assigned_to,
    } = req.body;

    const result = db.prepare(
      `INSERT INTO crm_customers (name, company, industry, phone, email, address, vendor, product_interest, budget_range, urgency_level, status, notes, assigned_to)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      name, company || null, industry || null, phone || null, email || null, address || null,
      vendor || 'autodesk', JSON.stringify(product_interest || []), budget_range || null,
      urgency_level || 3, status || 'lead', notes || null, assigned_to || null
    );

    res.json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新客户
router.put('/crm/customers/:id', authMiddleware, customerIsolationMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const userId = (req as any).user.id;
    const fields = req.body;
    const allowedFields = ['name','company','industry','phone','email','address','vendor','product_interest','budget_range','decision_maker','urgency_level','status','assigned_to','notes','last_contact_at','next_follow_up_at'];
    const updates: string[] = [];
    const values: any[] = [];

    // 记录旧状态用于状态变更历史
    const oldCustomer = db.prepare('SELECT status FROM crm_customers WHERE id = ?').get(req.params.id) as any;

    for (const key of allowedFields) {
      if (fields[key] !== undefined) {
        updates.push(`${key} = ?`);
        values.push(key === 'product_interest' ? JSON.stringify(fields[key]) : fields[key]);
      }
    }
    if (updates.length === 0) {
      res.status(400).json({ success: false, error: '无有效更新字段' });
      return;
    }
    values.push(req.params.id);

    db.prepare(`UPDATE crm_customers SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values);

    // 如果状态变更，记录历史
    if (fields.status && oldCustomer && oldCustomer.status !== fields.status) {
      db.prepare(
        `INSERT INTO crm_customer_status_history (customer_id, old_status, new_status, changed_by, reason)
         VALUES (?, ?, ?, ?, ?)`
      ).run(req.params.id, oldCustomer.status, fields.status, userId, fields.status_reason || '');

      // 通知管理员
      notifyProgressUpdate(parseInt(req.params.id as string), oldCustomer.status, fields.status, userId);
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除客户
router.delete('/crm/customers/:id', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const userRole = (req as any).user.role;

    // 只有管理员可以删除客户
    if (userRole !== 'admin' && userRole !== 'supervisor') {
      res.status(403).json({ success: false, error: '无权删除客户' });
      return;
    }

    const userId = (req as any).user.id;
    const customer = db.prepare('SELECT * FROM crm_customers WHERE id = ?').get(req.params.id) as any;
    if (customer) {
      trashService.moveToTrash('crm_customers', customer.id, customer, customer.name, customer.assigned_to, userId);
    }
    db.prepare('DELETE FROM crm_customers WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: '已移入回收站' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取所有跟进记录
router.get('/crm/follow-ups', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const userId = (req as any).user.id;
    const userRole = (req as any).user.role;
    const { customer_id, limit = '50' } = req.query;

    let sql = `SELECT f.*, u.nickname as user_name, c.name as customer_name, c.company as customer_company
               FROM crm_follow_ups f
               LEFT JOIN users u ON f.user_id = u.id
               LEFT JOIN crm_customers c ON f.customer_id = c.id
               WHERE 1=1`;
    const params: any[] = [];

    if (customer_id) {
      sql += ' AND f.customer_id = ?';
      params.push(customer_id);
    }

    // 非管理员只能看自己负责的客户的跟进记录
    if (userRole !== 'admin' && userRole !== 'supervisor') {
      sql += ' AND (f.user_id = ? OR c.assigned_to = ?)';
      params.push(userId, userId);
    }

    sql += ' ORDER BY f.created_at DESC LIMIT ?';
    params.push(parseInt(limit as string));

    const followUps = db.prepare(sql).all(...params);
    res.json({ success: true, data: followUps });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 客户分派 API (Q1.18新增)
// ==========================================

// 自动分派客户
router.post('/crm/customers/:id/auto-assign', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const result = await autoAssignCustomer(parseInt(req.params.id as string), userId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 手动分派客户
router.post('/crm/customers/:id/assign', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { to_user_id, reason } = req.body;

    if (!to_user_id) {
      res.status(400).json({ success: false, error: '请指定目标员工' });
      return;
    }

    const result = await manualAssignCustomer(parseInt(req.params.id as string), to_user_id, userId, reason);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 重新分派客户
router.post('/crm/customers/:id/reassign', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { to_user_id, reason } = req.body;

    if (!to_user_id) {
      res.status(400).json({ success: false, error: '请指定目标员工' });
      return;
    }

    const result = await reassignCustomer(parseInt(req.params.id as string), to_user_id, userId, reason);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 批量分派客户
router.post('/crm/customers/batch-assign', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { customer_ids, to_user_id, reason } = req.body;

    if (!customer_ids || !Array.isArray(customer_ids) || customer_ids.length === 0) {
      res.status(400).json({ success: false, error: '请指定客户列表' });
      return;
    }

    if (!to_user_id) {
      res.status(400).json({ success: false, error: '请指定目标员工' });
      return;
    }

    const results = await batchAssignCustomers(customer_ids, to_user_id, userId, reason);
    res.json({ success: true, data: results });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 分派规则管理 API (Q1.18新增)
// ==========================================

// 获取分派规则列表
router.get('/crm/assignment-rules', authMiddleware, (_req, res) => {
  try {
    const db = getDatabase();
    const rules = db.prepare('SELECT * FROM crm_assignment_rules ORDER BY priority ASC, created_at ASC').all();
    res.json({ success: true, data: rules });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 创建分派规则
router.post('/crm/assignment-rules', authMiddleware, requireAdmin, (req, res) => {
  try {
    const db = getDatabase();
    const userId = (req as any).user.id;
    const { name, rule_type, priority, config, vendor_filter, status_filter } = req.body;

    const result = db.prepare(
      `INSERT INTO crm_assignment_rules (name, rule_type, priority, config, vendor_filter, status_filter, is_active, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
    ).run(name, rule_type, priority || 0, JSON.stringify(config || {}), vendor_filter || null, status_filter || null, userId);

    res.json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新分派规则
router.put('/crm/assignment-rules/:id', authMiddleware, requireAdmin, (req, res) => {
  try {
    const db = getDatabase();
    const { name, rule_type, is_active, priority, config, vendor_filter, status_filter } = req.body;
    const updates: string[] = [];
    const values: any[] = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (rule_type !== undefined) { updates.push('rule_type = ?'); values.push(rule_type); }
    if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active); }
    if (priority !== undefined) { updates.push('priority = ?'); values.push(priority); }
    if (config !== undefined) { updates.push('config = ?'); values.push(JSON.stringify(config)); }
    if (vendor_filter !== undefined) { updates.push('vendor_filter = ?'); values.push(vendor_filter); }
    if (status_filter !== undefined) { updates.push('status_filter = ?'); values.push(status_filter); }

    if (updates.length === 0) {
      res.status(400).json({ success: false, error: '无有效更新字段' });
      return;
    }
    values.push(req.params.id);

    db.prepare(`UPDATE crm_assignment_rules SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除分派规则
router.delete('/crm/assignment-rules/:id', authMiddleware, requireAdmin, (req, res) => {
  try {
    const db = getDatabase();
    const userId = (req as any).user.id;
    const rule = db.prepare('SELECT * FROM crm_assignment_rules WHERE id = ?').get(req.params.id) as any;
    if (rule) {
      trashService.moveToTrash('crm_assignment_rules', rule.id, rule, rule.name, rule.created_by, userId);
    }
    db.prepare('DELETE FROM crm_assignment_rules WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: '已移入回收站' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 执行分派规则 - 对未分派客户批量应用规则
router.post('/crm/assignment-rules/:id/execute', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const db = getDatabase();
    const userId = (req as any).user.id;
    const ruleId = parseInt(req.params.id as string);

    // 获取规则
    const rule = db.prepare('SELECT * FROM crm_assignment_rules WHERE id = ?').get(ruleId) as any;
    if (!rule) {
      res.status(404).json({ success: false, error: '规则不存在' });
      return;
    }

    if (!rule.is_active) {
      res.status(400).json({ success: false, error: '规则未启用' });
      return;
    }

    // 获取所有未分派的客户
    const unassignedCustomers = db.prepare(
      "SELECT * FROM crm_customers WHERE assigned_to IS NULL AND status NOT IN ('won', 'lost', 'churned')"
    ).all() as any[];

    if (unassignedCustomers.length === 0) {
      res.json({ success: true, data: { assigned: 0, message: '没有需要分派的客户' } });
      return;
    }

    // 批量自动分派
    const results = [];
    for (const customer of unassignedCustomers) {
      try {
        const result = await autoAssignCustomer(customer.id, userId);
        results.push(result);
      } catch (err: any) {
        results.push({ success: false, customerId: customer.id, reason: err.message });
      }
    }

    const successCount = results.filter((r: any) => r.success).length;
    const failCount = results.length - successCount;

    res.json({
      success: true,
      data: {
        assigned: successCount,
        failed: failCount,
        total: unassignedCustomers.length,
        results,
        message: `分派完成: ${successCount} 成功, ${failCount} 失败`,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 员工技能管理 API (Q1.18新增)
// ==========================================

// 获取员工技能
router.get('/crm/users/:id/skills', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const skills = db.prepare('SELECT * FROM crm_user_skills WHERE user_id = ?').all(req.params.id);
    res.json({ success: true, data: skills });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 设置员工技能
router.post('/crm/users/:id/skills', authMiddleware, requireAdmin, (req, res) => {
  try {
    const db = getDatabase();
    const { vendor, proficiency_level, is_primary } = req.body;

    const existing = db.prepare('SELECT id FROM crm_user_skills WHERE user_id = ? AND vendor = ?').get(req.params.id, vendor);
    if (existing) {
      db.prepare(
        'UPDATE crm_user_skills SET proficiency_level = ?, is_primary = ? WHERE user_id = ? AND vendor = ?'
      ).run(proficiency_level, is_primary ? 1 : 0, req.params.id, vendor);
    } else {
      db.prepare(
        'INSERT INTO crm_user_skills (user_id, vendor, proficiency_level, is_primary) VALUES (?, ?, ?, ?)'
      ).run(req.params.id, vendor, proficiency_level, is_primary ? 1 : 0);
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除员工技能
router.delete('/crm/users/:id/skills/:vendor', authMiddleware, requireAdmin, (req, res) => {
  try {
    const db = getDatabase();
    const userId = (req as any).user.id;
    const skill = db.prepare('SELECT * FROM crm_user_skills WHERE user_id = ? AND vendor = ?').get(req.params.id, req.params.vendor) as any;
    if (skill) {
      trashService.moveToTrash('crm_user_skills', skill.id, skill, `${skill.vendor}技能`, skill.user_id, userId);
    }
    db.prepare('DELETE FROM crm_user_skills WHERE user_id = ? AND vendor = ?').run(req.params.id, req.params.vendor);
    res.json({ success: true, message: '已移入回收站' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 通知提醒 API (Q1.18新增)
// ==========================================

// 获取通知列表
router.get('/crm/notifications', authMiddleware, (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { unread_only, limit = '20' } = req.query;

    const notifications = getNotificationsByUser(userId, {
      unreadOnly: unread_only === 'true',
      limit: parseInt(limit as string),
    });

    res.json({ success: true, data: notifications });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取未读通知数量
router.get('/crm/notifications/unread-count', authMiddleware, (req, res) => {
  try {
    const userId = (req as any).user.id;
    const count = getUnreadNotificationCount(userId);
    res.json({ success: true, data: { count } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 标记通知已读
router.put('/crm/notifications/:id/read', authMiddleware, (req, res) => {
  try {
    const userId = (req as any).user.id;
    const success = markNotificationAsRead(parseInt(req.params.id as string), userId);
    res.json({ success });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 标记所有通知已读
router.post('/crm/notifications/mark-all-read', authMiddleware, (req, res) => {
  try {
    const userId = (req as any).user.id;
    markAllNotificationsAsRead(userId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取今日所有未读通知（含通知表、今日任务、今日待办）
router.get('/crm/notifications/today-unread', authMiddleware, (req, res) => {
  try {
    const userId = (req as any).user.id;
    const notifications = getTodayNotifications(userId);
    res.json({ success: true, data: notifications, count: notifications.length });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 一键清空所有今日未读通知
router.post('/crm/notifications/mark-today-read', authMiddleware, (req, res) => {
  try {
    const userId = (req as any).user.id;
    markAllTodayNotificationsAsRead(userId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除通知
router.delete('/crm/notifications/:id', authMiddleware, (req, res) => {
  try {
    const userId = (req as any).user.id;
    const success = deleteNotification(parseInt(req.params.id as string), userId);
    res.json({ success });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// Discovery上下文 API - 客户一键转入销售作战
// ==========================================

router.get('/crm/customers/:id/discovery-context', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const customerId = req.params.id;
    const customer = db.prepare(`
      SELECT c.*, u.nickname as assigned_name
      FROM crm_customers c
      LEFT JOIN users u ON c.assigned_to = u.id
      WHERE c.id = ?
    `).get(customerId) as any;

    if (!customer) {
      res.status(404).json({ success: false, error: '客户不存在' });
      return;
    }

    const followUps = db.prepare(`
      SELECT f.*, u.nickname as user_name
      FROM crm_follow_ups f
      LEFT JOIN users u ON f.user_id = u.id
      WHERE f.customer_id = ?
      ORDER BY f.created_at DESC
      LIMIT 10
    `).all(customerId) || [];

    const followUpSummary = followUps.length > 0
      ? followUps.map((f: any, i: number) =>
          `${i + 1}. [${f.created_at?.slice(0, 10)}] ${f.user_name}: ${f.content || f.notes || '无记录'}`
        ).join('\n')
      : '暂无跟进记录';

    const products = (() => {
      try { return JSON.parse(customer.product_interest || '[]'); } catch { return []; }
    })();
    const productStr = products.length > 0 ? products.join('、') : (customer.product_interest || '未指定');

    const urgencyMap: Record<number, string> = { 1: '不紧急', 2: '低', 3: '一般', 4: '高', 5: '非常紧急' };
    const urgencyLabel = urgencyMap[customer.urgency_level] || '一般';

    const statusMap: Record<string, string> = {
      lead: '线索', contact: '已联系', negotiation: '谈判中',
      trial: '试用中', deal: '已成单', lost: '已丢失',
    };
    const statusLabel = statusMap[customer.status] || customer.status;

    const discoveryContext = `📋 客户分析：${customer.name}${customer.company ? `（${customer.company}）` : ''}

📍 行业：${customer.industry || '未知'}
🏢 供应商：${customer.vendor || 'autodesk'}
📦 感兴趣产品：${productStr}
💰 预算范围：${customer.budget_range || '未透露'}
📊 紧急程度：${urgencyLabel}
📌 当前状态：${statusLabel}
${customer.decision_maker ? `👤 决策人：${customer.decision_maker}` : ''}
${customer.phone ? `📞 电话：${customer.phone}` : ''}
${customer.email ? `📧 邮箱：${customer.email}` : ''}
${customer.notes ? `📝 备注：${customer.notes}` : ''}

📜 最近跟进记录：
${followUpSummary}

---
请使用Discovery教练分析此客户，帮我制定精准的Discôvery通话策略：
1. 基于SPIN Selling框架，设计针对此客户的Problem问题和Implication问题
2. 使用Gap Selling方法，分析客户当前状态与理想状态的差距
3. 建议开场前置约定话术和30分钟通话结构
4. 预判可能的异议并准备AECR应对方案`;

    const customerSummary = {
      id: customer.id,
      name: customer.name,
      company: customer.company,
      industry: customer.industry,
      vendor: customer.vendor,
      productInterest: productStr,
      budgetRange: customer.budget_range,
      urgencyLevel: customer.urgency_level,
      status: customer.status,
      statusLabel,
      followUpCount: customer.followUpCount || 0,
    };

    res.json({
      success: true,
      data: {
        customer: customerSummary,
        discoveryContext,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 销售任务 API
// ==========================================

// 获取任务列表
router.get('/crm/tasks', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const userId = (req as any).user.id;
    const userRole = (req as any).user.role;
    const { status, assigned_to, page = '1', limit = '20' } = req.query;

    let sql = `SELECT t.*, c.name as customer_name, u1.nickname as assigned_name, u2.nickname as assigner_name
               FROM crm_sales_tasks t
               LEFT JOIN crm_customers c ON t.customer_id = c.id
               LEFT JOIN users u1 ON t.assigned_to = u1.id
               LEFT JOIN users u2 ON t.assigned_by = u2.id
               WHERE 1=1`;
    const params: any[] = [];

    if (status) { sql += ' AND t.status = ?'; params.push(status); }
    if (assigned_to) { sql += ' AND t.assigned_to = ?'; params.push(assigned_to); }
    // 严格数据隔离：非管理员只能看自己的任务
    if (userRole !== 'admin' && userRole !== 'supervisor') {
      sql += ' AND t.assigned_to = ?';
      params.push(userId);
    }

    sql += ' ORDER BY t.due_date ASC, t.created_at DESC';

    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
    const offset = (pageNum - 1) * limitNum;

    const countSql = sql.replace(/SELECT.*?FROM/, 'SELECT COUNT(*) as total FROM');
    const totalResult = db.prepare(countSql).get(...params) as any;

    sql += ` LIMIT ? OFFSET ?`;
    params.push(limitNum, offset);

    const tasks = db.prepare(sql).all(...params);
    res.json({ success: true, data: { list: tasks, pagination: { page: pageNum, limit: limitNum, total: totalResult.total, totalPages: Math.ceil(totalResult.total / limitNum) } } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 创建任务
router.post('/crm/tasks', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const userId = (req as any).user.id;
    const { title, description, customer_id, assigned_to, priority, due_date } = req.body;

    const result = db.prepare(
      `INSERT INTO crm_sales_tasks (title, description, customer_id, assigned_to, assigned_by, priority, due_date)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(title, description || null, customer_id || null, assigned_to, userId, priority || 'medium', due_date || null);

    res.json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新任务
router.put('/crm/tasks/:id', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const { status, result_notes } = req.body;
    const updates: string[] = [];
    const values: any[] = [];

    if (status !== undefined) { updates.push('status = ?'); values.push(status); }
    if (result_notes !== undefined) { updates.push('result_notes = ?'); values.push(result_notes); }
    if (status === 'completed') { updates.push('completed_at = CURRENT_TIMESTAMP'); }

    if (updates.length === 0) {
      res.status(400).json({ success: false, error: '无有效更新字段' });
      return;
    }
    values.push(req.params.id);

    db.prepare(`UPDATE crm_sales_tasks SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 待办事项 API
// ==========================================

// 获取待办列表
router.get('/crm/todos', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const userId = (req as any).user.id;
    const { status, category } = req.query;

    let sql = `SELECT t.*, c.name as customer_name FROM crm_todos t LEFT JOIN crm_customers c ON t.related_customer_id = c.id WHERE t.user_id = ?`;
    const params: any[] = [userId];

    if (status) { sql += ' AND t.status = ?'; params.push(status); }
    if (category) { sql += ' AND t.category = ?'; params.push(category); }

    sql += ' ORDER BY t.due_date ASC, t.priority DESC, t.created_at DESC';

    const todos = db.prepare(sql).all(...params);
    res.json({ success: true, data: todos });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 创建待办
router.post('/crm/todos', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const userId = (req as any).user.id;
    const { title, description, category, priority, related_customer_id, related_task_id, due_date, reminder_at } = req.body;

    const result = db.prepare(
      `INSERT INTO crm_todos (user_id, title, description, category, priority, related_customer_id, related_task_id, due_date, reminder_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(userId, title, description || null, category || 'general', priority || 'medium', related_customer_id || null, related_task_id || null, due_date || null, reminder_at || null);

    res.json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新待办
router.put('/crm/todos/:id', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const userId = (req as any).user.id;
    const { status } = req.body;

    const todo = db.prepare('SELECT * FROM crm_todos WHERE id = ? AND user_id = ?').get(req.params.id, userId);
    if (!todo) {
      res.status(404).json({ success: false, error: '待办不存在或无权限' });
      return;
    }

    if (status === 'completed') {
      db.prepare('UPDATE crm_todos SET status = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, req.params.id);
    } else {
      db.prepare('UPDATE crm_todos SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, req.params.id);
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除待办
router.delete('/crm/todos/:id', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const userId = (req as any).user.id;
    const todo = db.prepare('SELECT * FROM crm_todos WHERE id = ? AND user_id = ?').get(req.params.id, userId) as any;
    if (todo) {
      trashService.moveToTrash('crm_todos', todo.id, todo, todo.title, userId, userId);
    }
    db.prepare('DELETE FROM crm_todos WHERE id = ? AND user_id = ?').run(req.params.id, userId);
    res.json({ success: true, message: '已移入回收站' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 日历事件 API
// ==========================================

// 获取日历事件
router.get('/crm/calendar', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const userId = (req as any).user.id;
    const { start, end } = req.query;

    let sql = `SELECT e.*, c.name as customer_name FROM crm_calendar_events e LEFT JOIN crm_customers c ON e.related_customer_id = c.id WHERE e.user_id = ?`;
    const params: any[] = [userId];

    if (start && end) {
      sql += ' AND e.start_time >= ? AND e.start_time <= ?';
      params.push(start, end);
    }

    sql += ' ORDER BY e.start_time ASC';

    const events = db.prepare(sql).all(...params);
    res.json({ success: true, data: events });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 创建日历事件
router.post('/crm/calendar', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const userId = (req as any).user.id;
    const { title, description, event_type, related_customer_id, related_task_id, start_time, end_time, is_all_day, location, reminder_minutes, recurrence_rule } = req.body;

    const result = db.prepare(
      `INSERT INTO crm_calendar_events (user_id, title, description, event_type, related_customer_id, related_task_id, start_time, end_time, is_all_day, location, reminder_minutes, recurrence_rule)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(userId, title, description || null, event_type || 'follow_up', related_customer_id || null, related_task_id || null, start_time, end_time || null, is_all_day ? 1 : 0, location || null, reminder_minutes || 15, recurrence_rule || null);

    res.json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新日历事件
router.put('/crm/calendar/:id', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const userId = (req as any).user.id;
    const fields = req.body;
    const allowedFields = ['title','description','event_type','start_time','end_time','is_all_day','location','reminder_minutes','status'];
    const updates: string[] = [];
    const values: any[] = [];

    for (const key of allowedFields) {
      if (fields[key] !== undefined) {
        updates.push(`${key} = ?`);
        values.push(fields[key]);
      }
    }
    if (updates.length === 0) {
      res.status(400).json({ success: false, error: '无有效更新字段' });
      return;
    }
    values.push(req.params.id, userId);

    db.prepare(`UPDATE crm_calendar_events SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`).run(...values);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除日历事件
router.delete('/crm/calendar/:id', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const userId = (req as any).user.id;
    const event = db.prepare('SELECT * FROM crm_calendar_events WHERE id = ? AND user_id = ?').get(req.params.id, userId) as any;
    if (event) {
      trashService.moveToTrash('crm_calendar_events', event.id, event, event.title, userId, userId);
    }
    db.prepare('DELETE FROM crm_calendar_events WHERE id = ? AND user_id = ?').run(req.params.id, userId);
    res.json({ success: true, message: '已移入回收站' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 跟进记录 API
// ==========================================

// 创建跟进记录
router.post('/crm/follow-ups', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const userId = (req as any).user.id;
    const { customer_id, follow_up_type, content, outcome, next_action, next_follow_up_date } = req.body;

    const result = db.prepare(
      `INSERT INTO crm_follow_ups (customer_id, user_id, follow_up_type, content, outcome, next_action, next_follow_up_date)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(customer_id, userId, follow_up_type || 'phone', content, outcome || null, next_action || null, next_follow_up_date || null);

    db.prepare('UPDATE crm_customers SET last_contact_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(customer_id);

    res.json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// CRM 设置 API
// ==========================================

// 获取设置
router.get('/crm/settings', authMiddleware, (_req, res) => {
  try {
    const db = getDatabase();
    const settings = db.prepare('SELECT * FROM crm_settings').all();
    res.json({ success: true, data: settings });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新设置
router.put('/crm/settings/:key', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const { value } = req.body;
    db.prepare('UPDATE crm_settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?').run(value, req.params.key);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// CRM 统计 API (Q1.18增强)
// ==========================================

router.get('/crm/stats', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const userId = (req as any).user.id;
    const userRole = (req as any).user.role;
    const isAdmin = userRole === 'admin' || userRole === 'supervisor';

    // 客户总数
    let totalCustomerSql = 'SELECT COUNT(*) as count FROM crm_customers';
    if (!isAdmin) totalCustomerSql += ' WHERE assigned_to = ?';
    const totalCustomers = db.prepare(totalCustomerSql).get(...(isAdmin ? [] : [userId])) as any;

    // 待办总数
    const totalTodos = db.prepare('SELECT COUNT(*) as count FROM crm_todos WHERE user_id = ?').get(userId) as any;

    // 任务总数
    let totalTaskSql = 'SELECT COUNT(*) as count FROM crm_sales_tasks';
    if (!isAdmin) totalTaskSql += ' WHERE assigned_to = ?';
    const totalTasks = db.prepare(totalTaskSql).get(...(isAdmin ? [] : [userId])) as any;

    // 今日日程
    const todayEvents = db.prepare(
      `SELECT COUNT(*) as count FROM crm_calendar_events WHERE user_id = ? AND date(start_time) = date('now')`
    ).get(userId);

    // 客户增长趋势（最近30天）
    const customerTrend = db.prepare(`
      SELECT date(created_at) as date, COUNT(*) as count
      FROM crm_customers
      WHERE created_at >= date('now', '-30 days')
      ${!isAdmin ? 'AND assigned_to = ?' : ''}
      GROUP BY date(created_at)
      ORDER BY date DESC
      LIMIT 30
    `).all(...(isAdmin ? [] : [userId]));

    res.json({
      success: true,
      data: {
        totalCustomers: totalCustomers?.count || 0,
        totalTodos: totalTodos?.count || 0,
        totalTasks: totalTasks?.count || 0,
        todaySchedules: (todayEvents as any)?.count || 0,
        customerTrend: customerTrend || [],
        customerLimit: 100,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 管理员监控 API (Q1.18新增)
// ==========================================

// 获取全局客户视图
router.get('/crm/admin/customers', authMiddleware, (req, res) => {
  try {
    const userRole = (req as any).user.role;
    if (userRole !== 'admin' && userRole !== 'supervisor') {
      res.status(403).json({ success: false, error: '无权访问' });
      return;
    }

    const db = getDatabase();
    const { status, assigned_to, page = '1', limit = '20' } = req.query;

    let sql = 'SELECT c.*, u.nickname as assigned_name FROM crm_customers c LEFT JOIN users u ON c.assigned_to = u.id WHERE 1=1';
    const params: any[] = [];

    if (status) { sql += ' AND c.status = ?'; params.push(status); }
    if (assigned_to) { sql += ' AND c.assigned_to = ?'; params.push(assigned_to); }

    sql += ' ORDER BY c.updated_at DESC';

    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
    const offset = (pageNum - 1) * limitNum;

    const countSql = sql.replace('SELECT c.*, u.nickname as assigned_name', 'SELECT COUNT(*) as total');
    const totalResult = db.prepare(countSql).get(...params) as any;

    sql += ` LIMIT ? OFFSET ?`;
    params.push(limitNum, offset);

    const customers = db.prepare(sql).all(...params);

    res.json({
      success: true,
      data: {
        list: customers,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: totalResult.total,
          totalPages: Math.ceil(totalResult.total / limitNum),
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取员工工作量统计
router.get('/crm/admin/user-workload', authMiddleware, (req, res) => {
  try {
    const userRole = (req as any).user.role;
    if (userRole !== 'admin' && userRole !== 'supervisor') {
      res.status(403).json({ success: false, error: '无权访问' });
      return;
    }

    const stats = getUserWorkloadStats();
    res.json({ success: true, data: stats });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取超时未跟进客户
router.get('/crm/admin/overdue-customers', authMiddleware, (req, res) => {
  try {
    const userRole = (req as any).user.role;
    if (userRole !== 'admin' && userRole !== 'supervisor') {
      res.status(403).json({ success: false, error: '无权访问' });
      return;
    }

    const days = parseInt(req.query.days as string) || 3;
    const customers = getOverdueCustomers(days);
    res.json({ success: true, data: customers });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取客户转化漏斗
router.get('/crm/admin/conversion-funnel', authMiddleware, (req, res) => {
  try {
    const userRole = (req as any).user.role;
    if (userRole !== 'admin' && userRole !== 'supervisor') {
      res.status(403).json({ success: false, error: '无权访问' });
      return;
    }

    const funnel = getConversionFunnel();
    res.json({ success: true, data: funnel });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 用户列表(用于委派)
// ==========================================
router.get('/crm/users', authMiddleware, (_req, res) => {
  try {
    const db = getDatabase();
    const users = db.prepare('SELECT id, username, nickname, role, status FROM users WHERE status = 1 ORDER BY nickname').all();
    res.json({ success: true, data: users });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// Q1.20新增：销售管道 API
// ==========================================

// 获取管道阶段列表
router.get('/crm/pipeline/stages', authMiddleware, (_req, res) => {
  try {
    const db = getDatabase();
    const stages = db.prepare('SELECT * FROM crm_pipeline_stages WHERE is_active = 1 ORDER BY order_index').all();
    res.json({ success: true, data: stages });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 创建管道阶段
router.post('/crm/pipeline/stages', authMiddleware, requireAdmin, (req, res) => {
  try {
    const db = getDatabase();
    const { name, order_index, color, probability } = req.body;
    const result = db.prepare(
      'INSERT INTO crm_pipeline_stages (name, order_index, color, probability) VALUES (?, ?, ?, ?)'
    ).run(name, order_index, color || '#3b82f6', probability || 0);
    res.json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新管道阶段
router.put('/crm/pipeline/stages/:id', authMiddleware, requireAdmin, (req, res) => {
  try {
    const db = getDatabase();
    const { name, order_index, color, probability, is_active } = req.body;
    const updates: string[] = [];
    const values: any[] = [];
    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (order_index !== undefined) { updates.push('order_index = ?'); values.push(order_index); }
    if (color !== undefined) { updates.push('color = ?'); values.push(color); }
    if (probability !== undefined) { updates.push('probability = ?'); values.push(probability); }
    if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active); }
    if (updates.length === 0) {
      res.status(400).json({ success: false, error: '无有效更新字段' });
      return;
    }
    values.push(req.params.id);
    db.prepare(`UPDATE crm_pipeline_stages SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除管道阶段
router.delete('/crm/pipeline/stages/:id', authMiddleware, requireAdmin, (req, res) => {
  try {
    const db = getDatabase();
    const stageId = req.params.id;

    // Q1.20 P1修复：删除前检查是否有关联商机
    const dealCount = db.prepare(
      'SELECT COUNT(*) as count FROM crm_deals WHERE stage_id = ?'
    ).get(stageId) as { count: number };
    if (dealCount.count > 0) {
      res.status(400).json({
        success: false,
        error: `该阶段下还有 ${dealCount.count} 个商机，请先迁移或删除相关商机后再删除阶段`,
      });
      return;
    }

    const stage = db.prepare('SELECT * FROM crm_pipeline_stages WHERE id = ?').get(stageId) as any;
    if (stage) {
      trashService.moveToTrash('crm_pipeline_stages', stage.id, stage, stage.name, stage.created_by, (req as any).user.id);
    }
    db.prepare('DELETE FROM crm_pipeline_stages WHERE id = ?').run(stageId);
    res.json({ success: true, message: '已移入回收站' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取商机列表
router.get('/crm/pipeline/deals', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const userId = (req as any).user.id;
    const userRole = (req as any).user.role;
    const { stage_id, assigned_to, status, search } = req.query;

    let sql = `SELECT d.*, c.name as customer_name, c.company as customer_company, c.phone as customer_phone,
               s.name as stage_name, s.color as stage_color, s.probability as stage_probability,
               u.nickname as assigned_name
               FROM crm_deals d
               LEFT JOIN crm_customers c ON d.customer_id = c.id
               LEFT JOIN crm_pipeline_stages s ON d.stage_id = s.id
               LEFT JOIN users u ON d.assigned_to = u.id
               WHERE 1=1`;
    const params: any[] = [];

    if (stage_id) { sql += ' AND d.stage_id = ?'; params.push(stage_id); }
    if (assigned_to) { sql += ' AND d.assigned_to = ?'; params.push(assigned_to); }
    if (status) { sql += ' AND d.status = ?'; params.push(status); }
    if (search) {
      sql += ' AND (d.title LIKE ? OR c.name LIKE ? OR c.company LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like, like);
    }
    if (userRole !== 'admin' && userRole !== 'supervisor') {
      sql += ' AND d.assigned_to = ?';
      params.push(userId);
    }

    sql += ' ORDER BY d.updated_at DESC';
    const deals = db.prepare(sql).all(...params);
    res.json({ success: true, data: deals });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 创建商机
router.post('/crm/pipeline/deals', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const userId = (req as any).user.id;
    const { title, customer_id, stage_id, value, expected_close_date, assigned_to, priority, notes } = req.body;

    const stage = db.prepare('SELECT probability FROM crm_pipeline_stages WHERE id = ?').get(stage_id) as any;

    const result = db.prepare(
      `INSERT INTO crm_deals (title, customer_id, stage_id, value, expected_close_date, assigned_to, priority, probability, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(title, customer_id, stage_id, value || 0, expected_close_date || null, assigned_to || userId, priority || 'medium', stage?.probability || 0, notes || null, userId);

    res.json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新商机
router.put('/crm/pipeline/deals/:id', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const fields = req.body;
    const allowedFields = ['title','customer_id','stage_id','value','expected_close_date','assigned_to','priority','probability','notes','lost_reason','status'];
    const updates: string[] = [];
    const values: any[] = [];

    for (const key of allowedFields) {
      if (fields[key] !== undefined) {
        updates.push(`${key} = ?`);
        values.push(fields[key]);
      }
    }
    if (updates.length === 0) {
      res.status(400).json({ success: false, error: '无有效更新字段' });
      return;
    }
    values.push(req.params.id);
    db.prepare(`UPDATE crm_deals SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 拖拽移动商机到不同阶段
router.post('/crm/pipeline/deals/:id/move', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const { stage_id } = req.body;
    const dealId = req.params.id;

    const stage = db.prepare('SELECT probability FROM crm_pipeline_stages WHERE id = ?').get(stage_id) as any;
    if (!stage) {
      res.status(400).json({ success: false, error: '阶段不存在' });
      return;
    }

    db.prepare('UPDATE crm_deals SET stage_id = ?, probability = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(stage_id, stage.probability, dealId);

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除商机
router.delete('/crm/pipeline/deals/:id', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const userId = (req as any).user.id;
    const deal = db.prepare('SELECT * FROM crm_deals WHERE id = ?').get(req.params.id) as any;
    if (deal) {
      trashService.moveToTrash('crm_deals', deal.id, deal, deal.title, deal.assigned_to, userId);
    }
    db.prepare('DELETE FROM crm_deals WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: '已移入回收站' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取管道统计
router.get('/crm/pipeline/stats', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const userId = (req as any).user.id;
    const userRole = (req as any).user.role;

    let sql = `SELECT s.id, s.name, s.color, s.probability, COUNT(d.id) as deal_count, COALESCE(SUM(d.value), 0) as total_value
               FROM crm_pipeline_stages s
               LEFT JOIN crm_deals d ON s.id = d.stage_id AND d.status = 'open'`;
    if (userRole !== 'admin' && userRole !== 'supervisor') {
      sql += ' AND d.assigned_to = ?';
    }
    sql += ' WHERE s.is_active = 1 GROUP BY s.id ORDER BY s.order_index';

    const stats = db.prepare(sql).all(...(userRole !== 'admin' && userRole !== 'supervisor' ? [userId] : []));

    const totalDeals = db.prepare('SELECT COUNT(*) as count, COALESCE(SUM(value), 0) as value FROM crm_deals WHERE status = ?').get('open');

    res.json({
      success: true,
      data: {
        stages: stats,
        total: { count: (totalDeals as any).count, value: (totalDeals as any).value },
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// Q1.20新增：团队协作与工作量管理 API
// ==========================================

// 获取团队成员工作量统计
router.get('/crm/team/workload', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const userRole = (req as any).user.role;
    if (userRole !== 'admin' && userRole !== 'supervisor') {
      res.status(403).json({ success: false, error: '无权限' });
      return;
    }

    const sql = `
      SELECT
        u.id,
        u.nickname,
        u.username,
        COUNT(DISTINCT c.id) as customer_count,
        COUNT(DISTINCT d.id) as deal_count,
        COALESCE(SUM(DISTINCT d.value), 0) as deal_value,
        COUNT(DISTINCT t.id) as task_count,
        COUNT(DISTINCT CASE WHEN t.status = 'pending' THEN t.id END) as pending_tasks,
        COUNT(DISTINCT CASE WHEN t.status = 'completed' THEN t.id END) as completed_tasks,
        COUNT(DISTINCT fu.id) as follow_up_count
      FROM users u
      LEFT JOIN crm_customers c ON u.id = c.assigned_to AND c.status != 'closed'
      LEFT JOIN crm_deals d ON u.id = d.assigned_to AND d.status = 'open'
      LEFT JOIN crm_sales_tasks t ON u.id = t.assigned_to
      LEFT JOIN crm_follow_ups fu ON u.id = fu.user_id
      WHERE u.status = 1
      GROUP BY u.id
      ORDER BY deal_value DESC
    `;
    const stats = db.prepare(sql).all();
    res.json({ success: true, data: stats });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取团队成员详细数据（含7天新增统计）
router.get('/crm/team/members-detailed', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const userRole = (req as any).user.role;
    if (userRole !== 'admin' && userRole !== 'supervisor') {
      res.status(403).json({ success: false, error: '无权限' });
      return;
    }

    const period = (req.query.period as string) || 'month';
    let dateFilter: string;
    switch (period) {
      case 'week': dateFilter = "date('now', '-7 days')"; break;
      case 'month': dateFilter = "date('now', '-30 days')"; break;
      case 'quarter': dateFilter = "date('now', '-90 days')"; break;
      case 'year': dateFilter = "date('now', '-365 days')"; break;
      default: dateFilter = "date('now', '-30 days')";
    }

    const sql = `
      SELECT
        u.id,
        u.nickname,
        u.username,
        u.role,
        u.last_login_at,
        COUNT(DISTINCT c.id) as customer_count,
        COUNT(DISTINCT CASE WHEN c.created_at >= ${dateFilter} THEN c.id END) as new_customers_7d,
        COUNT(DISTINCT d.id) as deal_count,
        COALESCE(SUM(DISTINCT d.value), 0) as deal_value,
        COUNT(DISTINCT t.id) as task_count,
        COUNT(DISTINCT CASE WHEN t.status = 'completed' THEN t.id END) as tasks_completed,
        COUNT(DISTINCT CASE WHEN t.status = 'pending' AND t.due_date < date('now') THEN t.id END) as tasks_overdue,
        COUNT(DISTINCT fu.id) as follow_up_count,
        COUNT(DISTINCT CASE WHEN fu.created_at >= ${dateFilter} THEN fu.id END) as follow_ups_7d
      FROM users u
      LEFT JOIN crm_customers c ON u.id = c.assigned_to AND c.status != 'closed'
      LEFT JOIN crm_deals d ON u.id = d.assigned_to AND d.status = 'open'
      LEFT JOIN crm_sales_tasks t ON u.id = t.assigned_to
      LEFT JOIN crm_follow_ups fu ON u.id = fu.user_id
      WHERE u.status = 1
      GROUP BY u.id
      ORDER BY deal_value DESC
    `;
    const stats = db.prepare(sql).all();
    res.json({ success: true, data: stats });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取单个成员详情
router.get('/crm/team/member/:id', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const memberId = parseInt(req.params.id as string);

    const member = db.prepare('SELECT id, nickname, username, role, status FROM users WHERE id = ?').get(memberId);
    if (!member) {
      res.status(404).json({ success: false, error: '成员不存在' });
      return;
    }

    const skills = db.prepare('SELECT vendor, proficiency_level, is_primary FROM crm_user_skills WHERE user_id = ?').all(memberId);
    const territories = db.prepare('SELECT province, city, is_primary FROM crm_user_territories WHERE user_id = ?').all(memberId);
    const customers = db.prepare('SELECT id, name, company, status, vendor FROM crm_customers WHERE assigned_to = ? AND status != ? ORDER BY updated_at DESC LIMIT 10').all(memberId, 'closed');
    const deals = db.prepare('SELECT d.id, d.title, d.value, s.name as stage_name, s.color as stage_color FROM crm_deals d LEFT JOIN crm_pipeline_stages s ON d.stage_id = s.id WHERE d.assigned_to = ? AND d.status = ? ORDER BY d.updated_at DESC LIMIT 10').all(memberId, 'open');
    const tasks = db.prepare('SELECT id, title, status, priority, due_date FROM crm_sales_tasks WHERE assigned_to = ? ORDER BY due_date ASC LIMIT 10').all(memberId);

    res.json({
      success: true,
      data: { member, skills, territories, customers, deals, tasks },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 设置成员技能专长
router.post('/crm/team/member/:id/skills', authMiddleware, requireAdmin, (req, res) => {
  try {
    const db = getDatabase();
    const userRole = (req as any).user.role;
    if (userRole !== 'admin' && userRole !== 'supervisor') {
      res.status(403).json({ success: false, error: '无权限' });
      return;
    }
    const memberId = parseInt(req.params.id as string);
    const { vendor, proficiency_level, is_primary } = req.body;

    const exists = db.prepare('SELECT id FROM crm_user_skills WHERE user_id = ? AND vendor = ?').get(memberId, vendor);
    if (exists) {
      db.prepare('UPDATE crm_user_skills SET proficiency_level = ?, is_primary = ? WHERE user_id = ? AND vendor = ?')
        .run(proficiency_level, is_primary ? 1 : 0, memberId, vendor);
    } else {
      db.prepare('INSERT INTO crm_user_skills (user_id, vendor, proficiency_level, is_primary) VALUES (?, ?, ?, ?)')
        .run(memberId, vendor, proficiency_level, is_primary ? 1 : 0);
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 设置成员负责地域
router.post('/crm/team/member/:id/territories', authMiddleware, requireAdmin, (req, res) => {
  try {
    const db = getDatabase();
    const userRole = (req as any).user.role;
    if (userRole !== 'admin' && userRole !== 'supervisor') {
      res.status(403).json({ success: false, error: '无权限' });
      return;
    }
    const memberId = parseInt(req.params.id as string);
    const { province, city, is_primary } = req.body;

    db.prepare('INSERT INTO crm_user_territories (user_id, province, city, is_primary) VALUES (?, ?, ?, ?)')
      .run(memberId, province, city || null, is_primary ? 1 : 0);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除成员地域
router.delete('/crm/team/member/:id/territories/:tid', authMiddleware, requireAdmin, (req, res) => {
  try {
    const db = getDatabase();
    const userRole = (req as any).user.role;
    if (userRole !== 'admin' && userRole !== 'supervisor') {
      res.status(403).json({ success: false, error: '无权限' });
      return;
    }
    const territory = db.prepare('SELECT * FROM crm_user_territories WHERE id = ? AND user_id = ?').get(req.params.tid, req.params.id) as any;
    if (territory) {
      trashService.moveToTrash('crm_user_territories', territory.id, territory, `${territory.province || ''}${territory.city || ''}`, territory.user_id, (req as any).user.id);
    }
    db.prepare('DELETE FROM crm_user_territories WHERE id = ? AND user_id = ?').run(req.params.tid, req.params.id);
    res.json({ success: true, message: '已移入回收站' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取团队整体统计
router.get('/crm/team/stats', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const userRole = (req as any).user.role;
    if (userRole !== 'admin' && userRole !== 'supervisor') {
      res.status(403).json({ success: false, error: '无权限' });
      return;
    }

    const totalCustomers = db.prepare("SELECT COUNT(*) as count FROM crm_customers WHERE status != 'closed'").get() as any;
    const totalDeals = db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(value), 0) as value FROM crm_deals WHERE status = 'open'").get() as any;
    const totalTasks = db.prepare("SELECT COUNT(*) as count, COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending FROM crm_sales_tasks").get() as any;
    const overdueTasks = db.prepare("SELECT COUNT(*) as count FROM crm_sales_tasks WHERE status = 'pending' AND due_date < date('now')").get() as any;
    const memberCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE status = 1").get() as any;

    const vendorDistribution = db.prepare(`
      SELECT vendor, COUNT(*) as count FROM crm_customers WHERE status != 'closed' GROUP BY vendor
    `).all();

    const stageDistribution = db.prepare(`
      SELECT s.name, s.color, COUNT(d.id) as count, COALESCE(SUM(d.value), 0) as value
      FROM crm_pipeline_stages s
      LEFT JOIN crm_deals d ON s.id = d.stage_id AND d.status = 'open'
      WHERE s.is_active = 1
      GROUP BY s.id
      ORDER BY s.order_index
    `).all();

    res.json({
      success: true,
      data: {
        overview: {
          members: memberCount.count,
          customers: totalCustomers.count,
          deals: totalDeals.count,
          dealValue: totalDeals.value,
          tasks: totalTasks.count,
          pendingTasks: totalTasks.pending,
          overdueTasks: overdueTasks.count,
        },
        vendorDistribution,
        stageDistribution,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取成员详细统计（含所有工作数据）
router.get('/crm/member/:id/detailed-stats', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const memberId = parseInt(req.params.id as string);
    const userId = (req as any).user.id;
    const userRole = (req as any).user.role;

    if (userRole !== 'admin' && userRole !== 'supervisor' && userId !== memberId) {
      res.status(403).json({ success: false, error: '无权限查看此成员统计' });
      return;
    }

    const member = db.prepare('SELECT id, nickname, username, role, avatar, last_login_at FROM users WHERE id = ?').get(memberId);
    if (!member) {
      res.status(404).json({ success: false, error: '成员不存在' });
      return;
    }

    // 并行查询各项统计数据
    const totalCustomers = (db.prepare('SELECT COUNT(*) as count FROM crm_customers WHERE assigned_to = ?').get(memberId) as any).count;
    const newCustomers = (db.prepare("SELECT COUNT(*) as count FROM crm_customers WHERE assigned_to = ? AND created_at >= date('now', '-30 days')").get(memberId) as any).count;
    const followUps = (db.prepare('SELECT COUNT(*) as count FROM crm_follow_ups WHERE user_id = ?').get(memberId) as any).count;
    const totalTasks = (db.prepare('SELECT COUNT(*) as count FROM crm_sales_tasks WHERE assigned_to = ?').get(memberId) as any).count;
    const completedTasks = (db.prepare("SELECT COUNT(*) as count FROM crm_sales_tasks WHERE assigned_to = ? AND status = 'completed'").get(memberId) as any).count;
    const overdueTasks = (db.prepare("SELECT COUNT(*) as count FROM crm_sales_tasks WHERE assigned_to = ? AND status = 'pending' AND due_date < date('now')").get(memberId) as any).count;
    const totalDeals = (db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(value), 0) as value FROM crm_deals WHERE assigned_to = ? AND status = 'open'").get(memberId) as any);
    const wonDeals = (db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(value), 0) as value FROM crm_deals WHERE assigned_to = ? AND status = 'won'").get(memberId) as any);
    const lostDeals = (db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(value), 0) as value FROM crm_deals WHERE assigned_to = ? AND status = 'lost'").get(memberId) as any);
    const totalTodos = (db.prepare('SELECT COUNT(*) as count FROM crm_todos WHERE user_id = ?').get(memberId) as any).count;
    const completedTodos = (db.prepare("SELECT COUNT(*) as count FROM crm_todos WHERE user_id = ? AND status = 'completed'").get(memberId) as any).count;
    const calendarEvents = (db.prepare('SELECT COUNT(*) as count FROM crm_calendar_events WHERE user_id = ?').get(memberId) as any).count;

    // 获取最近30天的工作统计快照
    const dailyStats = db.prepare(`
      SELECT * FROM crm_member_stats
      WHERE user_id = ? AND stat_date >= date('now', '-30 days')
      ORDER BY stat_date DESC
    `).all(memberId);

    // 获取最近活动日志
    const recentActivities = db.prepare(`
      SELECT * FROM crm_member_activities
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).all(memberId);

    res.json({
      success: true,
      data: {
        member,
        stats: {
          totalCustomers,
          newCustomers,
          followUps,
          totalTasks,
          completedTasks,
          overdueTasks,
          taskCompletionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
          totalDeals: totalDeals.count,
          dealValue: totalDeals.value,
          wonDeals: wonDeals.count,
          wonDealValue: wonDeals.value,
          lostDeals: lostDeals.count,
          lostDealValue: lostDeals.value,
          totalTodos,
          completedTodos,
          calendarEvents,
        },
        dailyStats,
        recentActivities,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 记录成员活动
router.post('/crm/member/activity', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const userId = (req as any).user.id;
    const { activity_type, activity_title, activity_detail, related_customer_id, related_deal_id, related_task_id } = req.body;

    db.prepare(`
      INSERT INTO crm_member_activities (user_id, activity_type, activity_title, activity_detail, related_customer_id, related_deal_id, related_task_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, activity_type, activity_title, activity_detail || null, related_customer_id || null, related_deal_id || null, related_task_id || null);

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取成员活动日志
router.get('/crm/member/activities', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const userId = (req as any).user.id;
    const userRole = (req as any).user.role;
    const { user_id, type, start_date, end_date, page = '1', limit = '20' } = req.query;

    let sql = 'SELECT a.*, u.nickname as user_name FROM crm_member_activities a LEFT JOIN users u ON a.user_id = u.id WHERE 1=1';
    const params: any[] = [];

    // 非管理员只能看自己的活动
    if (userRole !== 'admin' && userRole !== 'supervisor') {
      sql += ' AND a.user_id = ?';
      params.push(userId);
    } else if (user_id) {
      sql += ' AND a.user_id = ?';
      params.push(parseInt(user_id as string));
    }

    if (type) {
      sql += ' AND a.activity_type = ?';
      params.push(type);
    }
    if (start_date) {
      sql += ' AND a.created_at >= ?';
      params.push(start_date);
    }
    if (end_date) {
      sql += ' AND a.created_at <= ?';
      params.push(end_date);
    }

    sql += ' ORDER BY a.created_at DESC';

    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
    const offset = (pageNum - 1) * limitNum;

    const total = (db.prepare(sql.replace('SELECT a.*, u.nickname as user_name', 'SELECT COUNT(*) as count')).get(...params) as any).count;
    const activities = db.prepare(`${sql} LIMIT ? OFFSET ?`).all(...params, limitNum, offset);

    res.json({
      success: true,
      data: { items: activities, total, page: pageNum, limit: limitNum },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// Q1.31 新增：放弃客户、证据管理、补充名单
// ==========================================

// POST /crm/customers/:id/abandon - 放弃客户
router.post('/crm/customers/:id/abandon', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const userId = (req as any).user.id;
    const userRole = (req as any).user.role;
    const customerId = parseInt(req.params.id as string);
    const { reason } = req.body;

    if (!reason) {
      res.status(400).json({ success: false, error: '请填写放弃原因' });
      return;
    }

    const customer = db.prepare('SELECT * FROM crm_customers WHERE id = ?').get(customerId) as any;
    if (!customer) {
      res.status(404).json({ success: false, error: '客户不存在' });
      return;
    }

    if (userRole !== 'admin' && userRole !== 'supervisor' && customer.assigned_to !== userId) {
      res.status(403).json({ success: false, error: '无权操作此客户' });
      return;
    }

    const abandonStmt = db.prepare(`
      INSERT INTO crm_abandoned_customers (customer_id, customer_name, customer_company, customer_phone, customer_email, reason, abandoned_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    abandonStmt.run(customerId, customer.name, customer.company, customer.phone, customer.email, reason, userId);

    db.prepare('DELETE FROM crm_customers WHERE id = ?').run(customerId);

    const totalCustomers = db.prepare('SELECT COUNT(*) as count FROM crm_customers').get() as any;

    res.json({
      success: true,
      data: {
        message: '客户已放弃',
        totalCustomers: totalCustomers?.count || 0,
        customerLimit: 100,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /crm/abandoned-customers - 获取放弃客户列表
router.get('/crm/abandoned-customers', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const userId = (req as any).user.id;
    const userRole = (req as any).user.role;
    const { search, page = '1', limit = '20' } = req.query;

    let sql = 'SELECT a.*, u.nickname as abandoned_by_name FROM crm_abandoned_customers a LEFT JOIN users u ON a.abandoned_by = u.id WHERE 1=1';
    const params: any[] = [];

    if (userRole !== 'admin' && userRole !== 'supervisor') {
      sql += ' AND a.abandoned_by = ?';
      params.push(userId);
    }

    if (search) {
      sql += ' AND (a.customer_name LIKE ? OR a.customer_company LIKE ? OR a.customer_phone LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like, like);
    }

    sql += ' ORDER BY a.abandoned_at DESC';

    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
    const offset = (pageNum - 1) * limitNum;

    const total = (db.prepare(sql.replace('SELECT a.*, u.nickname as abandoned_by_name', 'SELECT COUNT(*) as count')).get(...params) as any).count;
    const items = db.prepare(`${sql} LIMIT ? OFFSET ?`).all(...params, limitNum, offset);

    res.json({
      success: true,
      data: { items, total, page: pageNum, limit: limitNum },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /crm/customers/:id/evidence - 添加客户使用证据
router.post('/crm/customers/:id/evidence', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const userId = (req as any).user.id;
    const customerId = parseInt(req.params.id as string);
    const { title, content, evidence_type, evidence_url } = req.body;

    if (!title) {
      res.status(400).json({ success: false, error: '请填写证据标题' });
      return;
    }

    const customer = db.prepare('SELECT id FROM crm_customers WHERE id = ?').get(customerId);
    if (!customer) {
      res.status(404).json({ success: false, error: '客户不存在' });
      return;
    }

    const result = db.prepare(`
      INSERT INTO crm_customer_evidence (customer_id, title, content, evidence_type, evidence_url, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(customerId, title, content || '', evidence_type || 'text', evidence_url || '', userId);

    const evidence = db.prepare('SELECT * FROM crm_customer_evidence WHERE id = ?').get(result.lastInsertRowid);

    res.json({ success: true, data: evidence });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /crm/customers/:id/evidence - 获取客户使用证据列表
router.get('/crm/customers/:id/evidence', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const customerId = parseInt(req.params.id as string);

    const customer = db.prepare('SELECT id FROM crm_customers WHERE id = ?').get(customerId);
    if (!customer) {
      res.status(404).json({ success: false, error: '客户不存在' });
      return;
    }

    const items = db.prepare(`
      SELECT e.*, u.nickname as created_by_name
      FROM crm_customer_evidence e
      LEFT JOIN users u ON e.created_by = u.id
      WHERE e.customer_id = ?
      ORDER BY e.created_at DESC
    `).all(customerId);

    res.json({ success: true, data: items });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /crm/customers/:id/evidence/:evidenceId - 删除证据
router.delete('/crm/customers/:id/evidence/:evidenceId', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const userId = (req as any).user.id;
    const userRole = (req as any).user.role;
    const customerId = parseInt(req.params.id as string);
    const evidenceId = parseInt(req.params.evidenceId as string);

    const evidence = db.prepare('SELECT * FROM crm_customer_evidence WHERE id = ? AND customer_id = ?').get(evidenceId, customerId) as any;
    if (!evidence) {
      res.status(404).json({ success: false, error: '证据不存在' });
      return;
    }

    if (userRole !== 'admin' && userRole !== 'supervisor' && evidence.created_by !== userId) {
      res.status(403).json({ success: false, error: '无权删除此证据' });
      return;
    }

    db.prepare('DELETE FROM crm_customer_evidence WHERE id = ?').run(evidenceId);

    res.json({ success: true, data: { message: '证据已删除' } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /crm/supplement-requests - 提交补充名单请求
router.post('/crm/supplement-requests', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const userId = (req as any).user.id;
    const user = (req as any).user;
    const { reason, quantity = 5 } = req.body;

    if (!reason) {
      res.status(400).json({ success: false, error: '请填写申请原因' });
      return;
    }

    const totalCustomers = (db.prepare('SELECT COUNT(*) as count FROM crm_customers WHERE assigned_to = ?').get(userId) as any).count;

    if (totalCustomers < 100) {
      res.status(400).json({
        success: false,
        error: `当前客户数 ${totalCustomers} 未达到上限 100，无需补充`,
        data: { totalCustomers, maxLimit: 100 },
      });
      return;
    }

    const result = db.prepare(`
      INSERT INTO crm_supplement_requests (requester_id, requester_name, reason, quantity)
      VALUES (?, ?, ?, ?)
    `).run(userId, user.username || user.nickname || '', reason, Math.min(50, Math.max(1, parseInt(String(quantity)) || 5)));

    const request = db.prepare('SELECT * FROM crm_supplement_requests WHERE id = ?').get(result.lastInsertRowid);

    res.json({ success: true, data: request });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /crm/supplement-requests - 获取补充名单请求列表
router.get('/crm/supplement-requests', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const userId = (req as any).user.id;
    const userRole = (req as any).user.role;
    const { status, page = '1', limit = '20' } = req.query;

    let sql = `
      SELECT r.*, u.nickname as requester_name, h.nickname as handler_name
      FROM crm_supplement_requests r
      LEFT JOIN users u ON r.requester_id = u.id
      LEFT JOIN users h ON r.handled_by = h.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (userRole !== 'admin' && userRole !== 'supervisor') {
      sql += ' AND r.requester_id = ?';
      params.push(userId);
    }

    if (status) {
      sql += ' AND r.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY r.created_at DESC';

    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
    const offset = (pageNum - 1) * limitNum;

    const countSql = `SELECT COUNT(*) as count FROM (${sql})`;
    const total = (db.prepare(countSql).get(...params) as any).count;
    const items = db.prepare(`${sql} LIMIT ? OFFSET ?`).all(...params, limitNum, offset);

    res.json({
      success: true,
      data: { items, total, page: pageNum, limit: limitNum },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /crm/supplement-requests/:id/handle - 管理员处理补充请求
router.put('/crm/supplement-requests/:id/handle', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const userId = (req as any).user.id;
    const userRole = (req as any).user.role;

    if (userRole !== 'admin' && userRole !== 'supervisor') {
      res.status(403).json({ success: false, error: '仅管理员可处理补充请求' });
      return;
    }

    const requestId = parseInt(req.params.id as string);
    const { status: newStatus, push_customer_ids } = req.body;

    if (!newStatus || !['approved', 'rejected'].includes(newStatus)) {
      res.status(400).json({ success: false, error: '状态必须为 approved 或 rejected' });
      return;
    }

    const request = db.prepare('SELECT * FROM crm_supplement_requests WHERE id = ?').get(requestId) as any;
    if (!request) {
      res.status(404).json({ success: false, error: '请求不存在' });
      return;
    }

    if (request.status !== 'pending') {
      res.status(400).json({ success: false, error: '该请求已被处理' });
      return;
    }

    db.prepare('UPDATE crm_supplement_requests SET status = ?, handled_by = ?, handled_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(newStatus, userId, requestId);

    if (newStatus === 'approved' && push_customer_ids && Array.isArray(push_customer_ids) && push_customer_ids.length > 0) {
      const updateStmt = db.prepare('UPDATE crm_customers SET assigned_to = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
      for (const cid of push_customer_ids) {
        const customer = db.prepare('SELECT id, assigned_to FROM crm_customers WHERE id = ?').get(cid) as any;
        if (customer) {
          if (customer.assigned_to === request.requester_id) continue;
          updateStmt.run(request.requester_id, cid);
        }
      }
    }

    const updated = db.prepare('SELECT * FROM crm_supplement_requests WHERE id = ?').get(requestId);

    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /crm/my-customer-count - 获取当前用户的客户数量及上限信息
router.get('/crm/my-customer-count', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const userId = (req as any).user.id;

    const totalCustomers = (db.prepare('SELECT COUNT(*) as count FROM crm_customers WHERE assigned_to = ?').get(userId) as any).count;

    res.json({
      success: true,
      data: { totalCustomers, maxLimit: 100 },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /crm/customers/:id/enterprise-profile - 获取企业信息
router.get('/crm/customers/:id/enterprise-profile', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const customerId = parseInt(req.params.id as string);

    const customer = db.prepare('SELECT * FROM crm_customers WHERE id = ?').get(customerId) as any;
    if (!customer) {
      res.status(404).json({ success: false, error: '客户不存在' });
      return;
    }

    const companyName = customer.company || customer.name;

    const existing = db.prepare("SELECT * FROM crm_customer_enterprise WHERE company_name = ?").get(companyName) as any;
    if (existing) {
      res.json({ success: true, data: existing });
      return;
    }

    const mockProfile = {
      company_name: companyName,
      industry: customer.industry || '未知',
      registered_capital: '500万元人民币',
      established_date: '2020-01-01',
      legal_representative: '张先生',
      registered_address: '北京市朝阳区',
      business_scope: '软件开发；技术服务；技术咨询',
      employee_count: '50-200人',
      credit_code: '91110108MA0XXXXXXXX',
      tax_qualification: '一般纳税人',
      intellectual_property: '软件著作权10项，商标5项',
      development_trends: '近年来业务持续增长，持续加大研发投入',
      source: 'mock',
    };

    res.json({ success: true, data: mockProfile });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
