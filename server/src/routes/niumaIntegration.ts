/**
 * 牛马AI引擎集成路由
 * 提供客户导入、连接配置、映射规则、同步策略、监控等API
 */

import { Router } from 'express';
import { getDatabase } from '../config/database.js';
import { authMiddleware, requireSupervisor } from '../utils/auth.js';
import {
  fetchAdvancedAnalysis,
  fetchAnalysisFields,
  checkNiumaEngineHealth,
  setConnectionConfig,
  getConnectionConfig,
  type NiumaAdvancedFilterParams,
} from '../services/niumaEngineClient.js';
import {
  mapEnterprisesToCustomers,
  getMappingRules,
  setMappingRules,
  getAvailableSourceFields,
  getAvailableTargetFields,
  type MappingRule,
} from '../services/niumaDataMapper.js';
import {
  autoAssignCustomer,
} from '../services/assignmentEngine.js';

const router = Router();

// ==========================================
// 连接配置管理
// ==========================================

// 获取连接配置
router.get('/niuma/config', authMiddleware, requireSupervisor, (_req, res) => {
  try {
    const config = getConnectionConfig();
    res.json({ success: true, data: config });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新连接配置
router.put('/niuma/config', authMiddleware, requireSupervisor, (req, res) => {
  try {
    const { baseUrl, timeout, enabled } = req.body;
    setConnectionConfig({ baseUrl, timeout, enabled });
    res.json({ success: true, data: getConnectionConfig() });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 健康检查
router.get('/niuma/health', authMiddleware, async (_req, res) => {
  try {
    const health = await checkNiumaEngineHealth();
    res.json({ success: true, data: health });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 数据映射规则管理
// ==========================================

// 获取当前映射规则
router.get('/niuma/mapping-rules', authMiddleware, requireSupervisor, (_req, res) => {
  try {
    const rules = getMappingRules();
    res.json({ success: true, data: rules });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新映射规则
router.put('/niuma/mapping-rules', authMiddleware, requireSupervisor, (req, res) => {
  try {
    const { rules } = req.body;
    if (!Array.isArray(rules)) {
      res.status(400).json({ success: false, error: 'rules必须是数组' });
      return;
    }
    setMappingRules(rules as MappingRule[]);
    res.json({ success: true, data: getMappingRules() });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 重置为默认映射规则
router.post('/niuma/mapping-rules/reset', authMiddleware, requireSupervisor, (_req, res) => {
  try {
    const { resetMappingRules } = require('../services/niumaDataMapper.js');
    resetMappingRules();
    res.json({ success: true, data: getMappingRules() });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取可用字段列表
router.get('/niuma/fields', authMiddleware, async (_req, res) => {
  try {
    const sourceFields = getAvailableSourceFields();
    const targetFields = getAvailableTargetFields();
    res.json({
      success: true,
      data: { sourceFields, targetFields },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取牛马引擎字段信息
router.get('/niuma/engine-fields', authMiddleware, async (_req, res) => {
  try {
    const fields = await fetchAnalysisFields();
    res.json({ success: true, data: fields });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 客户导入功能
// ==========================================

// 预览导入（不写入数据库）
router.post('/niuma/import/preview', authMiddleware, requireSupervisor, async (req, res) => {
  try {
    const filters: NiumaAdvancedFilterParams = req.body.filters || {};
    const page = Math.max(1, filters.page || 1);
    const pageSize = Math.min(100, Math.max(1, filters.page_size || 20));

    const result = await fetchAdvancedAnalysis({ ...filters, page, page_size: pageSize });

    if (result.error) {
      res.status(500).json({ success: false, error: result.error });
      return;
    }

    const mapped = mapEnterprisesToCustomers(result.data);

    res.json({
      success: true,
      data: {
        total: result.total,
        page: result.page,
        page_size: result.page_size,
        preview: mapped,
        raw: result.data,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 执行导入
router.post('/niuma/import', authMiddleware, requireSupervisor, async (req, res) => {
  try {
    const db = getDatabase();
    const userId = (req as any).user.id;
    const {
      filters,
      auto_assign = false,
      assign_to_user_id,
      max_import = 500,
    } = req.body;

    // 先获取总数
    const countResult = await fetchAdvancedAnalysis({ ...filters, page: 1, page_size: 1 });
    const totalAvailable = countResult.total;
    const importLimit = Math.min(max_import, 500, totalAvailable);

    // 分批获取数据
    const allData: any[] = [];
    const batchSize = 100;
    const batches = Math.ceil(importLimit / batchSize);

    for (let i = 0; i < batches; i++) {
      const page = i + 1;
      const currentBatchSize = Math.min(batchSize, importLimit - allData.length);
      if (currentBatchSize <= 0) break;

      const batchResult = await fetchAdvancedAnalysis({
        ...filters,
        page,
        page_size: currentBatchSize,
      });

      if (batchResult.data) {
        allData.push(...batchResult.data);
      }
    }

    const mapped = mapEnterprisesToCustomers(allData);
    const importedIds: number[] = [];
    const assignedIds: number[] = [];
    const errors: string[] = [];

    for (const customer of mapped) {
      try {
        // 检查是否已存在（通过niuma_id去重）
        const existing = db.prepare('SELECT id FROM crm_customers WHERE niuma_id = ?').get(customer.niuma_id);
        if (existing) {
          continue; // 跳过已存在
        }

        const result = db.prepare(
          `INSERT INTO crm_customers (
            name, company, industry, phone, email, address,
            vendor, product_interest, budget_range, urgency_level,
            status, source, notes, assigned_to, niuma_id, niuma_metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          customer.name,
          customer.company,
          customer.industry,
          customer.phone,
          customer.email,
          customer.address,
          customer.vendor,
          JSON.stringify(customer.product_interest),
          customer.budget_range,
          customer.urgency_level,
          customer.status,
          customer.source,
          customer.notes,
          assign_to_user_id || null,
          customer.niuma_id,
          customer.niuma_metadata
        );

        const newId = Number(result.lastInsertRowid);
        importedIds.push(newId);

        // 记录导入历史
        db.prepare(
          `INSERT INTO niuma_import_history (customer_id, niuma_id, imported_by, import_filters, raw_data)
           VALUES (?, ?, ?, ?, ?)`
        ).run(newId, customer.niuma_id, userId, JSON.stringify(filters), customer.niuma_metadata);
      } catch (err: any) {
        errors.push(`企业 ${customer.company}: ${err.message}`);
      }
    }

    // 自动分派
    if (auto_assign && importedIds.length > 0) {
      for (const customerId of importedIds) {
        try {
          await autoAssignCustomer(customerId, userId);
          assignedIds.push(customerId);
        } catch (err: any) {
          errors.push(`分派客户 ${customerId} 失败: ${err.message}`);
        }
      }
    }

    res.json({
      success: true,
      data: {
        total_available: totalAvailable,
        imported_count: importedIds.length,
        assigned_count: assignedIds.length,
        skipped_count: allData.length - importedIds.length,
        error_count: errors.length,
        imported_ids: importedIds,
        assigned_ids: assignedIds,
        errors: errors.slice(0, 20),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 批量导入并分派
router.post('/niuma/import-and-assign', authMiddleware, requireSupervisor, async (req, res) => {
  try {
    const db = getDatabase();
    const userId = (req as any).user.id;
    const { filters, assign_strategy = 'auto', assign_to_users = [] } = req.body;

    // 获取数据
    const result = await fetchAdvancedAnalysis({ ...filters, page: 1, page_size: 100 });
    const mapped = mapEnterprisesToCustomers(result.data);

    const importedIds: number[] = [];
    const errors: string[] = [];

    for (const customer of mapped) {
      try {
        const existing = db.prepare('SELECT id FROM crm_customers WHERE niuma_id = ?').get(customer.niuma_id);
        if (existing) continue;

        const insertResult = db.prepare(
          `INSERT INTO crm_customers (
            name, company, industry, phone, email, address,
            vendor, product_interest, budget_range, urgency_level,
            status, source, notes, niuma_id, niuma_metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          customer.name, customer.company, customer.industry,
          customer.phone, customer.email, customer.address,
          customer.vendor, JSON.stringify(customer.product_interest),
          customer.budget_range, customer.urgency_level,
          customer.status, customer.source, customer.notes,
          customer.niuma_id, customer.niuma_metadata
        );

        importedIds.push(Number(insertResult.lastInsertRowid));
      } catch (err: any) {
        errors.push(err.message);
      }
    }

    // 分派策略
    let assignedCount = 0;
    if (assign_strategy === 'auto') {
      for (const id of importedIds) {
        try {
          await autoAssignCustomer(id, userId);
          assignedCount++;
        } catch { /* ignore */ }
      }
    } else if (assign_strategy === 'round_robin' && assign_to_users.length > 0) {
      for (let i = 0; i < importedIds.length; i++) {
        const userIdTarget = assign_to_users[i % assign_to_users.length];
        try {
          db.prepare('UPDATE crm_customers SET assigned_to = ? WHERE id = ?').run(userIdTarget, importedIds[i]);
          assignedCount++;
        } catch { /* ignore */ }
      }
    } else if (assign_strategy === 'manual' && assign_to_users.length > 0) {
      const targetUser = assign_to_users[0];
      for (const id of importedIds) {
        try {
          db.prepare('UPDATE crm_customers SET assigned_to = ? WHERE id = ?').run(targetUser, id);
          assignedCount++;
        } catch { /* ignore */ }
      }
    }

    res.json({
      success: true,
      data: {
        imported_count: importedIds.length,
        assigned_count: assignedCount,
        strategy: assign_strategy,
        errors: errors.slice(0, 10),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 导入历史
// ==========================================

// 获取导入历史
router.get('/niuma/import-history', authMiddleware, requireSupervisor, (req, res) => {
  try {
    const db = getDatabase();
    const { page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
    const offset = (pageNum - 1) * limitNum;

    const total = db.prepare('SELECT COUNT(*) as total FROM niuma_import_history').get() as any;
    const history = db.prepare(
      `SELECT h.*, c.name as customer_name, c.company as customer_company, u.nickname as imported_by_name
       FROM niuma_import_history h
       LEFT JOIN crm_customers c ON h.customer_id = c.id
       LEFT JOIN users u ON h.imported_by = u.id
       ORDER BY h.created_at DESC
       LIMIT ? OFFSET ?`
    ).all(limitNum, offset);

    res.json({
      success: true,
      data: {
        list: history,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: total.total,
          totalPages: Math.ceil(total.total / limitNum),
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 同步策略管理
// ==========================================

// 获取同步策略
router.get('/niuma/sync-strategy', authMiddleware, requireSupervisor, (_req, res) => {
  try {
    const db = getDatabase();
    const strategy = db.prepare('SELECT * FROM niuma_sync_strategy ORDER BY id DESC LIMIT 1').get();
    res.json({ success: true, data: strategy || null });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新同步策略
router.put('/niuma/sync-strategy', authMiddleware, requireSupervisor, (req, res) => {
  try {
    const db = getDatabase();
    const {
      auto_sync_enabled,
      sync_interval_hours,
      sync_filters,
      auto_assign_enabled,
      assign_strategy,
      deduplication_enabled,
      dedup_field,
    } = req.body;

    const existing = db.prepare('SELECT id FROM niuma_sync_strategy ORDER BY id DESC LIMIT 1').get() as any;
    if (existing) {
      db.prepare(
        `UPDATE niuma_sync_strategy SET
          auto_sync_enabled = ?,
          sync_interval_hours = ?,
          sync_filters = ?,
          auto_assign_enabled = ?,
          assign_strategy = ?,
          deduplication_enabled = ?,
          dedup_field = ?,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).run(
        auto_sync_enabled ? 1 : 0,
        sync_interval_hours || 24,
        JSON.stringify(sync_filters || {}),
        auto_assign_enabled ? 1 : 0,
        assign_strategy || 'auto',
        deduplication_enabled ? 1 : 0,
        dedup_field || 'niuma_id',
        existing.id
      );
    } else {
      db.prepare(
        `INSERT INTO niuma_sync_strategy (
          auto_sync_enabled, sync_interval_hours, sync_filters,
          auto_assign_enabled, assign_strategy, deduplication_enabled, dedup_field
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        auto_sync_enabled ? 1 : 0,
        sync_interval_hours || 24,
        JSON.stringify(sync_filters || {}),
        auto_assign_enabled ? 1 : 0,
        assign_strategy || 'auto',
        deduplication_enabled ? 1 : 0,
        dedup_field || 'niuma_id'
      );
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 监控面板API
// ==========================================

// 获取集成监控数据
router.get('/niuma/monitor', authMiddleware, requireSupervisor, async (_req, res) => {
  try {
    const db = getDatabase();
    const health = await checkNiumaEngineHealth();

    // 统计
    const totalImported = db.prepare('SELECT COUNT(*) as count FROM niuma_import_history').get() as any;
    const todayImported = db.prepare(
      "SELECT COUNT(*) as count FROM niuma_import_history WHERE date(created_at) = date('now')"
    ).get() as any;
    const totalNiumaCustomers = db.prepare('SELECT COUNT(*) as count FROM crm_customers WHERE niuma_id IS NOT NULL').get() as any;
    const assignedNiumaCustomers = db.prepare(
      'SELECT COUNT(*) as count FROM crm_customers WHERE niuma_id IS NOT NULL AND assigned_to IS NOT NULL'
    ).get() as any;

    // 最近导入
    const recentImports = db.prepare(
      `SELECT h.*, c.name, c.company, u.nickname as imported_by_name
       FROM niuma_import_history h
       LEFT JOIN crm_customers c ON h.customer_id = c.id
       LEFT JOIN users u ON h.imported_by = u.id
       ORDER BY h.created_at DESC LIMIT 10`
    ).all();

    // 分派状态分布
    const statusDistribution = db.prepare(
      `SELECT status, COUNT(*) as count FROM crm_customers WHERE niuma_id IS NOT NULL GROUP BY status`
    ).all();

    // 员工处理进度
    const userProgress = db.prepare(
      `SELECT
        u.id, u.nickname,
        COUNT(DISTINCT c.id) as customer_count,
        COUNT(DISTINCT CASE WHEN c.status = 'closed' THEN c.id END) as closed_count,
        COUNT(DISTINCT t.id) as task_count,
        COUNT(DISTINCT CASE WHEN t.status = 'completed' THEN t.id END) as completed_task_count
       FROM users u
       LEFT JOIN crm_customers c ON u.id = c.assigned_to AND c.niuma_id IS NOT NULL
       LEFT JOIN crm_sales_tasks t ON u.id = t.assigned_to
       WHERE u.status = 1
       GROUP BY u.id
       ORDER BY customer_count DESC`
    ).all();

    res.json({
      success: true,
      data: {
        health,
        stats: {
          totalImported: totalImported.count,
          todayImported: todayImported.count,
          totalNiumaCustomers: totalNiumaCustomers.count,
          assignedNiumaCustomers: assignedNiumaCustomers.count,
          assignmentRate: totalNiumaCustomers.count > 0
            ? Math.round((assignedNiumaCustomers.count / totalNiumaCustomers.count) * 100)
            : 0,
        },
        recentImports,
        statusDistribution,
        userProgress,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取员工任务监控
router.get('/niuma/monitor/tasks', authMiddleware, requireSupervisor, (req, res) => {
  try {
    const db = getDatabase();
    const { user_id, status, page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
    const offset = (pageNum - 1) * limitNum;

    let sql = `SELECT t.*, c.name as customer_name, c.company as customer_company,
                      u1.nickname as assigned_name, u2.nickname as assigner_name
               FROM crm_sales_tasks t
               LEFT JOIN crm_customers c ON t.customer_id = c.id
               LEFT JOIN users u1 ON t.assigned_to = u1.id
               LEFT JOIN users u2 ON t.assigned_by = u2.id
               WHERE c.niuma_id IS NOT NULL`;
    const params: any[] = [];

    if (user_id) { sql += ' AND t.assigned_to = ?'; params.push(user_id); }
    if (status) { sql += ' AND t.status = ?'; params.push(status); }

    sql += ' ORDER BY t.created_at DESC';

    const countSql = sql.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM');
    const totalResult = db.prepare(countSql).get(...params) as any;

    sql += ' LIMIT ? OFFSET ?';
    params.push(limitNum, offset);

    const tasks = db.prepare(sql).all(...params);

    res.json({
      success: true,
      data: {
        list: tasks,
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

// 获取客户处理进度详情
router.get('/niuma/monitor/customers/:id/progress', authMiddleware, requireSupervisor, (req, res) => {
  try {
    const db = getDatabase();
    const customerId = req.params.id;

    const customer = db.prepare(
      'SELECT c.*, u.nickname as assigned_name FROM crm_customers c LEFT JOIN users u ON c.assigned_to = u.id WHERE c.id = ? AND c.niuma_id IS NOT NULL'
    ).get(customerId);

    if (!customer) {
      res.status(404).json({ success: false, error: '客户不存在或非牛马来源' });
      return;
    }

    const tasks = db.prepare(
      `SELECT t.*, u.nickname as assigned_name FROM crm_sales_tasks t
       LEFT JOIN users u ON t.assigned_to = u.id
       WHERE t.customer_id = ? ORDER BY t.created_at DESC`
    ).all(customerId);

    const followUps = db.prepare(
      `SELECT f.*, u.nickname as user_name FROM crm_follow_ups f
       LEFT JOIN users u ON f.user_id = u.id
       WHERE f.customer_id = ? ORDER BY f.created_at DESC`
    ).all(customerId);

    const statusHistory = db.prepare(
      `SELECT h.*, u.nickname as changed_by_name FROM crm_customer_status_history h
       LEFT JOIN users u ON h.changed_by = u.id
       WHERE h.customer_id = ? ORDER BY h.created_at DESC`
    ).all(customerId);

    res.json({
      success: true,
      data: {
        customer,
        tasks,
        followUps,
        statusHistory,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 压力测试API
// ==========================================

// 执行压力测试
router.post('/niuma/stress-test', authMiddleware, requireSupervisor, async (req, res) => {
  try {
    const {
      concurrent_requests = 10,
      total_requests = 100,
      filters = {},
    } = req.body;

    const results: any[] = [];
    const errors: any[] = [];
    let completed = 0;
    const startTime = Date.now();

    // 并发执行请求
    const runRequest = async (index: number) => {
      const reqStart = Date.now();
      try {
        const page = (index % 5) + 1;
        const result = await fetchAdvancedAnalysis({ ...filters, page, page_size: 20 });
        const latency = Date.now() - reqStart;
        results.push({ index, latency, success: true, total: result.total });
      } catch (err: any) {
        const latency = Date.now() - reqStart;
        errors.push({ index, latency, success: false, error: err.message });
      }
      completed++;
    };

    // 分批并发执行
    const batchSize = Math.min(concurrent_requests, 50);
    for (let i = 0; i < total_requests; i += batchSize) {
      const batch = [];
      for (let j = i; j < Math.min(i + batchSize, total_requests); j++) {
        batch.push(runRequest(j));
      }
      await Promise.all(batch);
    }

    const totalTime = Date.now() - startTime;
    const successCount = results.length;
    const errorCount = errors.length;
    const avgLatency = successCount > 0 ? results.reduce((s, r) => s + r.latency, 0) / successCount : 0;
    const maxLatency = successCount > 0 ? Math.max(...results.map(r => r.latency)) : 0;
    const minLatency = successCount > 0 ? Math.min(...results.map(r => r.latency)) : 0;
    const throughput = totalTime > 0 ? (total_requests / (totalTime / 1000)).toFixed(2) : '0';

    res.json({
      success: true,
      data: {
        summary: {
          total_requests: total_requests,
          concurrent: concurrent_requests,
          success_count: successCount,
          error_count: errorCount,
          success_rate: total_requests > 0 ? ((successCount / total_requests) * 100).toFixed(2) + '%' : '0%',
          total_time_ms: totalTime,
          avg_latency_ms: Math.round(avgLatency),
          min_latency_ms: minLatency,
          max_latency_ms: maxLatency,
          throughput_rps: throughput,
        },
        errors: errors.slice(0, 20),
        latency_distribution: {
          '0-100ms': results.filter(r => r.latency <= 100).length,
          '100-300ms': results.filter(r => r.latency > 100 && r.latency <= 300).length,
          '300-500ms': results.filter(r => r.latency > 300 && r.latency <= 500).length,
          '500-1000ms': results.filter(r => r.latency > 500 && r.latency <= 1000).length,
          '>1000ms': results.filter(r => r.latency > 1000).length,
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 全功能压力测试
router.post('/niuma/stress-test/full', authMiddleware, requireSupervisor, async (_req, res) => {
  try {
    const db = getDatabase();
    const startTime = Date.now();
    const testResults: any = {};

    // 1. API连接测试
    const health = await checkNiumaEngineHealth();
    testResults.connection = {
      name: 'API连接测试',
      success: health.ok,
      latency: health.latency,
      error: health.error,
    };

    // 2. 高级筛选测试（多种条件组合）
    const filterTests = [
      { name: '无筛选', filters: {} },
      { name: '省份筛选', filters: { province: '广东省' } },
      { name: '盗版指数筛选', filters: { piracy_min: 50, piracy_max: 100 } },
      { name: '综合筛选', filters: { piracy_min: 30, score_min: 60, insurance_min: 10 } },
      { name: '分页筛选', filters: { page: 2, page_size: 50 } },
    ];

    testResults.advancedFilter = [];
    for (const test of filterTests) {
      const tStart = Date.now();
      try {
        const result = await fetchAdvancedAnalysis(test.filters);
        testResults.advancedFilter.push({
          name: test.name,
          success: true,
          latency: Date.now() - tStart,
          total: result.total,
          returned: result.data?.length || 0,
        });
      } catch (err: any) {
        testResults.advancedFilter.push({
          name: test.name,
          success: false,
          latency: Date.now() - tStart,
          error: err.message,
        });
      }
    }

    // 3. 数据映射测试
    const mapStart = Date.now();
    try {
      const sample = await fetchAdvancedAnalysis({ page_size: 10 });
      const mapped = mapEnterprisesToCustomers(sample.data);
      testResults.dataMapping = {
        name: '数据映射测试',
        success: true,
        latency: Date.now() - mapStart,
        input_count: sample.data.length,
        output_count: mapped.length,
        sample: mapped[0] || null,
      };
    } catch (err: any) {
      testResults.dataMapping = {
        name: '数据映射测试',
        success: false,
        latency: Date.now() - mapStart,
        error: err.message,
      };
    }

    // 4. 并发压力测试
    const concurrentStart = Date.now();
    const concurrentRequests = 20;
    const concurrentTasks = [];
    for (let i = 0; i < concurrentRequests; i++) {
      concurrentTasks.push(
        fetchAdvancedAnalysis({ page: (i % 3) + 1, page_size: 20 }).catch((e: any) => ({ error: e.message }))
      );
    }
    const concurrentResults = await Promise.all(concurrentTasks);
    const concurrentSuccess = concurrentResults.filter((r: any) => !r.error).length;
    testResults.concurrent = {
      name: '并发压力测试',
      success: concurrentSuccess === concurrentRequests,
      latency: Date.now() - concurrentStart,
      total: concurrentRequests,
      success_count: concurrentSuccess,
      error_count: concurrentRequests - concurrentSuccess,
    };

    // 5. 导入流程测试（预览模式）
    const importStart = Date.now();
    try {
      const previewData = await fetchAdvancedAnalysis({ page_size: 5 });
      const mapped = mapEnterprisesToCustomers(previewData.data);
      testResults.importFlow = {
        name: '导入流程测试',
        success: true,
        latency: Date.now() - importStart,
        fetched: previewData.data.length,
        mapped: mapped.length,
      };
    } catch (err: any) {
      testResults.importFlow = {
        name: '导入流程测试',
        success: false,
        latency: Date.now() - importStart,
        error: err.message,
      };
    }

    // 6. 数据库写入测试
    const dbStart = Date.now();
    try {
      const previewData = await fetchAdvancedAnalysis({ page_size: 3 });
      const mapped = mapEnterprisesToCustomers(previewData.data);
      let inserted = 0;
      for (const customer of mapped) {
        const existing = db.prepare('SELECT id FROM crm_customers WHERE niuma_id = ?').get(customer.niuma_id);
        if (!existing) {
          db.prepare(
            `INSERT INTO crm_customers (name, company, phone, email, status, source, niuma_id, niuma_metadata)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            customer.name, customer.company, customer.phone, customer.email,
            customer.status, customer.source, customer.niuma_id, customer.niuma_metadata
          );
          inserted++;
        }
      }
      testResults.databaseWrite = {
        name: '数据库写入测试',
        success: true,
        latency: Date.now() - dbStart,
        inserted,
      };
    } catch (err: any) {
      testResults.databaseWrite = {
        name: '数据库写入测试',
        success: false,
        latency: Date.now() - dbStart,
        error: err.message,
      };
    }

    const totalTime = Date.now() - startTime;
    const allTests = Object.values(testResults);
    const allSuccess = allTests.every((t: any) => t.success);

    res.json({
      success: true,
      data: {
        overall: {
          all_passed: allSuccess,
          total_time_ms: totalTime,
          test_count: allTests.length,
          pass_count: allTests.filter((t: any) => t.success).length,
          fail_count: allTests.filter((t: any) => !t.success).length,
        },
        tests: testResults,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 盗版分析 - 单企业分析
// ==========================================

// 单企业盗版分析 - 带本地Mock回退
router.get('/niuma/analysis/single', authMiddleware, async (req, res) => {
  try {
    const { keyword, recalculate, vendor } = req.query;
    if (!keyword) {
      res.status(400).json({ success: false, error: '请输入企业名称' });
      return;
    }

    const config = getConnectionConfig();
    const url = `${config.baseUrl}/api/analysis/single?keyword=${encodeURIComponent(keyword as string)}${recalculate ? '&recalculate=true' : ''}${vendor ? `&vendor=${encodeURIComponent(vendor as string)}` : ''}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(config.timeout),
      });

      if (response.ok) {
        const result = await response.json();
        res.json({ success: true, data: result });
        return;
      }
    } catch {
      // 外部引擎不可用，回退到本地Mock引擎
    }

    // 回退：调用本地Mock引擎
    const mockUrl = `http://localhost:${process.env.PORT || 1031}/api/analysis/single?keyword=${encodeURIComponent(keyword as string)}`;
    const mockResponse = await fetch(mockUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    const mockResult = await mockResponse.json();
    const innerData = mockResult?.data || mockResult;
    res.json({ success: true, data: innerData, _fallback: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 盗版分析 - 批量分析
// ==========================================

// 批量企业盗版分析
router.post('/niuma/analysis/batch', authMiddleware, async (req, res) => {
  try {
    const { names, vendor } = req.body;
    if (!Array.isArray(names) || names.length === 0) {
      res.status(400).json({ success: false, error: '请提供企业名称列表' });
      return;
    }

    const config = getConnectionConfig();
    const CONCURRENCY = 2;
    const results: any[] = [];

    for (let i = 0; i < names.length; i += CONCURRENCY) {
      const batch = names.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(batch.map(async (name: string) => {
        try {
          const url = `${config.baseUrl}/api/analysis/single?keyword=${encodeURIComponent(name)}&batch=1${vendor ? `&vendor=${encodeURIComponent(vendor)}` : ''}`;
          const response = await fetch(url, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(config.timeout),
          });
          const data = await response.json();
          if (data.data) {
            return { _name: name, _found: true, _companyName: data.data.company_name, data: data.data };
          } else {
            return { _name: name, _found: false, _error: data.error || '未找到该企业' };
          }
        } catch (e: any) {
          return { _name: name, _found: false, _error: e.message || '分析失败' };
        }
      }));
      results.push(...batchResults);
    }

    res.json({ success: true, data: { results, total: names.length, found: results.filter((r: any) => r._found).length } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 盗版分析 - 高级筛选（扩展）
// ==========================================

// 高级筛选 - 获取省份列表
router.get('/niuma/provinces', authMiddleware, async (_req, res) => {
  try {
    const config = getConnectionConfig();
    const response = await fetch(`${config.baseUrl}/api/enterprise/provinces`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(config.timeout),
    });

    if (!response.ok) {
      throw new Error(`牛马AI引擎返回错误: ${response.status}`);
    }

    const result = await response.json();
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 高级筛选 - 获取行业列表
router.get('/niuma/industries', authMiddleware, async (_req, res) => {
  try {
    const config = getConnectionConfig();
    const response = await fetch(`${config.baseUrl}/api/enterprise/industries`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(config.timeout),
    });

    if (!response.ok) {
      throw new Error(`牛马AI引擎返回错误: ${response.status}`);
    }

    const result = await response.json();
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 企业搜索
router.get('/niuma/enterprise/search', authMiddleware, async (req, res) => {
  try {
    const { keyword, province, city, industry, page = '1', page_size = '20' } = req.query;
    const config = getConnectionConfig();
    
    const params = new URLSearchParams();
    if (keyword) params.append('keyword', keyword as string);
    if (province) params.append('province', province as string);
    if (city) params.append('city', city as string);
    if (industry) params.append('industry', industry as string);
    params.append('page', page as string);
    params.append('page_size', page_size as string);

    const url = `${config.baseUrl}/api/enterprise/search?${params.toString()}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(config.timeout),
    });

    if (!response.ok) {
      throw new Error(`牛马AI引擎返回错误: ${response.status}`);
    }

    const result = await response.json();
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 批量获取企业名称（通过ID）
router.post('/niuma/enterprise/batch-names', authMiddleware, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ success: false, error: '请提供企业ID列表' });
      return;
    }

    const config = getConnectionConfig();
    const response = await fetch(`${config.baseUrl}/api/enterprise/batch-names`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
      signal: AbortSignal.timeout(config.timeout),
    });

    if (!response.ok) {
      throw new Error(`牛马AI引擎返回错误: ${response.status}`);
    }

    const result = await response.json();
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 联网信息查询 - 带本地Mock回退
router.post('/niuma/online-info', authMiddleware, async (req, res) => {
  try {
    const { enterpriseName, cardType } = req.body;
    if (!enterpriseName) {
      res.status(400).json({ success: false, error: '缺少企业名称' });
      return;
    }

    const config = getConnectionConfig();
    try {
      const response = await fetch(`${config.baseUrl}/api/ai/online-info/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enterpriseName, cardType }),
        signal: AbortSignal.timeout(config.timeout),
      });

      if (response.ok) {
        const result = await response.json();
        res.json({ success: true, data: result });
        return;
      }
    } catch {
      // 外部引擎不可用，回退到本地Mock引擎
    }

    const mockUrl = `http://localhost:${process.env.PORT || 1031}/api/ai/online-info/query`;
    const mockResponse = await fetch(mockUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enterpriseName }),
      signal: AbortSignal.timeout(10000),
    });
    const mockResult = await mockResponse.json();
    res.json({ success: true, data: mockResult, _fallback: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 联系方式分析
router.post('/niuma/contact-analyze', authMiddleware, async (req, res) => {
  try {
    const { enterpriseName } = req.body;
    if (!enterpriseName) {
      res.status(400).json({ success: false, error: '缺少企业名称' });
      return;
    }

    const config = getConnectionConfig();
    const response = await fetch(`${config.baseUrl}/api/enterprise/contact-analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enterpriseName }),
      signal: AbortSignal.timeout(config.timeout),
    });

    if (!response.ok) {
      throw new Error(`牛马AI引擎返回错误: ${response.status}`);
    }

    const result = await response.json();
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 知识库同步
// ==========================================

// 获取牛马AI引擎知识库列表
router.get('/niuma/knowledge', authMiddleware, async (req, res) => {
  try {
    const { category, search, page = '1', limit = '20', vendor } = req.query;
    const config = getConnectionConfig();

    const params = new URLSearchParams();
    if (category) params.append('category', category as string);
    if (search) params.append('search', search as string);
    params.append('page', page as string);
    params.append('limit', limit as string);

    const response = await fetch(`${config.baseUrl}/api/knowledge?${params.toString()}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(config.timeout),
    });

    if (!response.ok) {
      throw new Error(`牛马AI引擎返回错误: ${response.status}`);
    }

    const result = await response.json();

    // 按厂商过滤（通过knowledge_id前缀）
    if (vendor && result.data?.items) {
      const vendorPrefix = `PIRACY_${(vendor as string).toUpperCase()}_`;
      result.data.items = result.data.items.filter((item: any) =>
        item.knowledge_id?.startsWith(vendorPrefix)
      );
      result.data.total = result.data.items.length;
    }

    // 添加厂商统计
    if (result.data?.items) {
      const vendorStats: Record<string, number> = {};
      result.data.items.forEach((item: any) => {
        const match = item.knowledge_id?.match(/^PIRACY_(\w+)_/);
        const v = match ? match[1].toLowerCase() : 'unknown';
        vendorStats[v] = (vendorStats[v] || 0) + 1;
      });
      result.data.vendor_stats = vendorStats;
    }

    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 同步知识库到本地
router.post('/niuma/knowledge/sync', authMiddleware, requireSupervisor, async (_req, res) => {
  try {
    const db = getDatabase();
    const config = getConnectionConfig();

    // 1. 从牛马引擎获取全部知识库数据
    const response = await fetch(`${config.baseUrl}/api/knowledge?limit=1000`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(config.timeout * 2),
    });

    if (!response.ok) {
      throw new Error(`牛马AI引擎返回错误: ${response.status}`);
    }

    const result = await response.json();
    const items = result.data?.items || [];

    // 2. 创建本地知识库表（如果不存在）
    db.prepare(`
      CREATE TABLE IF NOT EXISTS niuma_knowledge (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        knowledge_id TEXT UNIQUE,
        category TEXT,
        sub_category TEXT,
        title TEXT,
        content TEXT,
        detection_methods TEXT,
        risk_indicators TEXT,
        licensing_strategies TEXT,
        confidence_score REAL,
        parent_knowledge_id TEXT,
        source_vendor TEXT,
        synced_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // 3. 清空旧数据并插入新数据
    db.prepare('DELETE FROM niuma_knowledge').run();

    let inserted = 0;
    for (const item of items) {
      try {
        // 从knowledge_id提取厂商信息，如 PIRACY_AUTODESK_001 -> autodesk
        const vendorMatch = item.knowledge_id?.match(/^PIRACY_(\w+)_/);
        const sourceVendor = vendorMatch ? vendorMatch[1].toLowerCase() : 'unknown';

        db.prepare(`
          INSERT INTO niuma_knowledge (
            knowledge_id, category, sub_category, title, content,
            detection_methods, risk_indicators, licensing_strategies,
            confidence_score, parent_knowledge_id, source_vendor, synced_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          item.knowledge_id || '',
          item.category || '',
          item.sub_category || '',
          item.title || '',
          item.content || '',
          item.detection_methods || '',
          item.risk_indicators || '',
          item.licensing_strategies || '',
          item.confidence_score || 0,
          item.parent_knowledge_id || '',
          sourceVendor,
          new Date().toISOString()
        );
        inserted++;
      } catch { /* ignore duplicate */ }
    }

    // 4. 记录同步历史
    db.prepare(`
      CREATE TABLE IF NOT EXISTS niuma_knowledge_sync_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        total_items INTEGER,
        inserted_items INTEGER,
        sync_status TEXT,
        error_message TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    db.prepare(`
      INSERT INTO niuma_knowledge_sync_history (total_items, inserted_items, sync_status)
      VALUES (?, ?, ?)
    `).run(items.length, inserted, 'success');

    res.json({
      success: true,
      data: {
        total: items.length,
        inserted,
        categories: result.data?.categories || [],
        synced_at: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取本地同步的知识库
router.get('/niuma/knowledge/local', authMiddleware, async (req, res) => {
  try {
    const db = getDatabase();
    const { category, search, page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
    const offset = (pageNum - 1) * limitNum;

    let sql = 'SELECT * FROM niuma_knowledge WHERE 1=1';
    const params: any[] = [];

    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }
    if (search) {
      sql += ' AND (title LIKE ? OR content LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const totalResult = db.prepare(countSql).get(...params) as any;

    sql += ' ORDER BY synced_at DESC LIMIT ? OFFSET ?';
    params.push(limitNum, offset);

    const items = db.prepare(sql).all(...params);

    res.json({
      success: true,
      data: {
        items,
        total: totalResult.total,
        page: pageNum,
        limit: limitNum,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取知识库同步历史
router.get('/niuma/knowledge/sync-history', authMiddleware, requireSupervisor, (_req, res) => {
  try {
    const db = getDatabase();
    const history = db.prepare(
      'SELECT * FROM niuma_knowledge_sync_history ORDER BY created_at DESC LIMIT 20'
    ).all();
    res.json({ success: true, data: history });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
