# Q1.18 CRM 系统集成方案

## 自研核心 + Twenty 增强混合架构

**版本**: Q1.18  
**日期**: 2026-05-10  
**状态**: 规划阶段

---

## 目录

1. [方案概述](#1-方案概述)
2. [架构设计](#2-架构设计)
3. [功能分工](#3-功能分工)
4. [技术实现](#4-技术实现)
5. [实施计划](#5-实施计划)
6. [风险与应对](#6-风险与应对)
7. [附录](#7-附录)

---

## 1. 方案概述

### 1.1 背景

Q1.18 系统已具备完善的 CRM 基础功能：
- ✅ 客户分派引擎（5种分派规则）
- ✅ AI Sales Crew（6个AI专家）
- ✅ 任务跟踪系统
- ✅ 团队人员管理
- ✅ 数据隔离与权限控制

但缺少：
- ❌ 可视化销售管道
- ❌ 高级报表分析
- ❌ 团队协作功能
- ❌ 邮件集成

### 1.2 目标

通过集成 **Twenty CRM**（开源，24.4k+ Stars），在保持自研核心优势的同时，快速获得现代化的 CRM 增强功能。

### 1.3 核心原则

1. **核心数据自主可控** - 客户、任务、分派规则保留在本地 SQLite
2. **增强功能借力** - 销售管道、报表、协作使用 Twenty
3. **用户体验统一** - 通过 iframe 嵌入，无缝切换
4. **双向数据同步** - 保持两边数据一致性

---

## 2. 架构设计

### 2.1 系统架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端层 (React + Vite)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   AI 对话     │  │   自研 CRM    │  │   Twenty CRM (嵌入)   │  │
│  │   界面       │  │   (核心功能)   │  │   (增强功能)          │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API 网关 (Express)                          │
│  /api/chat/*    /api/crm/*    /api/twenty/*    /api/sync/*       │
└─────────────────────────────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
   ┌──────────┐           ┌──────────┐           ┌──────────┐
   │  SQLite  │◄─────────►│  Twenty  │           │  Redis   │
   │ (主数据)  │   同步    │ (CRM增强) │           │ (缓存)   │
   └──────────┘           └──────────┘           └──────────┘
        │
   ┌──────────┐
   │ AI Sales │
   │  Crew    │
   └──────────┘
```

### 2.2 数据流向

```
客户录入 → 本地SQLite → 自动同步 → Twenty
                ↓
         AI Sales Crew 辅助
                ↓
         任务分派引擎
                ↓
         任务跟踪更新 ←→ Twenty 任务
```

### 2.3 部署架构

```
服务器
├── Q1.18 主应用 (Node.js + SQLite)
│   ├── API 服务 :102
│   ├── Web 前端 :3020
│   └── AI 引擎 :1078
│
├── Twenty CRM (Docker)
│   ├── API 服务 :3000
│   ├── PostgreSQL :5432
│   └── Redis :6379
│
└── Nginx 反向代理
    ├── / → Q1.18 Web
    ├── /api → Q1.18 API
    └── /twenty → Twenty CRM
```

---

## 3. 功能分工

### 3.1 自研 CRM（核心功能）

| 模块 | 功能 | 技术实现 | 优先级 |
|------|------|----------|--------|
| **客户分派引擎** | 轮询、负载均衡、能力匹配、地域、优先级 | assignmentEngine.ts | P0 |
| **AI Sales Crew** | 6个AI专家角色辅助销售 | MCP Tools + Agents | P0 |
| **软件产品库** | 产品管理、版本、授权类型 | 新增表 crm_products | P1 |
| **报价单管理** | 报价生成、审批、导出 | 新增表 crm_quotations | P1 |
| **数据隔离** | 权限控制、安全策略 | authMiddleware | P0 |
| **任务跟踪** | 销售任务、待办、日历 | 现有 crm_sales_tasks | P0 |

### 3.2 Twenty CRM（增强功能）

| 模块 | 功能 | 用途 | 优先级 |
|------|------|------|--------|
| **销售管道** | 可视化看板、拖拽变更阶段 | 销售流程管理 | P0 |
| **团队协作** | 评论、@提及、活动流 | 团队沟通 | P1 |
| **邮件集成** | 邮件追踪、模板、发送 | 客户触达 | P2 |
| **报表分析** | 高级图表、数据透视、漏斗 | 数据分析 | P1 |
| **移动端** | APP支持 | 移动办公 | P2 |

### 3.3 功能对照表

| 业务场景 | 自研实现 | Twenty 实现 | 备注 |
|----------|----------|-------------|------|
| 客户录入 | ✅ | - | 本地录入后同步 |
| 客户分派 | ✅ | - | 自研分派引擎 |
| 客户列表 | ✅ | - | 本地管理 |
| 销售管道 | - | ✅ | iframe 嵌入 |
| 任务创建 | ✅ | - | 本地创建后同步 |
| 任务看板 | - | ✅ | iframe 嵌入 |
| 跟进记录 | ✅ | - | 本地存储 |
| 团队协作 | - | ✅ | Twenty 功能 |
| 业绩统计 | ✅ | ✅ | 本地基础 + Twenty 高级 |
| 邮件发送 | - | ✅ | Twenty 功能 |
| 报表导出 | - | ✅ | Twenty 功能 |

---

## 4. 技术实现

### 4.1 数据库扩展

#### 4.1.1 新增表

```sql
-- 软件产品表
CREATE TABLE crm_products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                    -- 产品名称
  vendor TEXT NOT NULL,                  -- 厂商 (autodesk/adobe/etc)
  version TEXT,                          -- 版本
  license_type TEXT,                     -- 授权类型: subscription/perpetual/network
  list_price REAL,                       -- 官方价格
  cost_price REAL,                       -- 成本价
  description TEXT,                      -- 产品描述
  features TEXT,                         -- 功能特点 (JSON)
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 报价单表
CREATE TABLE crm_quotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_no TEXT UNIQUE NOT NULL,         -- 报价单号 Q-2024-001
  customer_id INTEGER NOT NULL,
  title TEXT NOT NULL,                   -- 报价标题
  items TEXT NOT NULL,                   -- 报价项 (JSON数组)
  subtotal REAL,                         -- 小计
  discount_rate REAL DEFAULT 0,          -- 折扣率
  discount_amount REAL DEFAULT 0,        -- 折扣金额
  tax_rate REAL DEFAULT 0,               -- 税率
  tax_amount REAL DEFAULT 0,             -- 税额
  total_amount REAL NOT NULL,            -- 总计
  validity_days INTEGER DEFAULT 30,      -- 有效期天数
  status TEXT DEFAULT 'draft',           -- draft/sent/approved/rejected/expired
  notes TEXT,                            -- 备注
  created_by INTEGER NOT NULL,
  approved_by INTEGER,                   -- 审批人
  approved_at DATETIME,                  -- 审批时间
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES crm_customers(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- 销售阶段表 (用于本地统计)
CREATE TABLE crm_sales_stages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                    -- 阶段名称
  order_index INTEGER NOT NULL,          -- 排序
  probability REAL,                      -- 成交概率
  color TEXT,                            -- 颜色标识
  is_active INTEGER DEFAULT 1
);

-- Twenty 同步日志表
CREATE TABLE crm_sync_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,             -- customer/task/company/person
  local_id INTEGER NOT NULL,
  twenty_id TEXT,
  operation TEXT NOT NULL,               -- create/update/delete
  status TEXT NOT NULL,                  -- pending/success/failed
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 初始化销售阶段
INSERT INTO crm_sales_stages (name, order_index, probability, color) VALUES
('线索', 1, 10, '#94a3b8'),
('初步接触', 2, 25, '#60a5fa'),
('需求确认', 3, 40, '#34d399'),
('方案演示', 4, 60, '#a78bfa'),
('商务谈判', 5, 80, '#fbbf24'),
('合同签署', 6, 95, '#f472b6'),
('成交', 7, 100, '#22c55e'),
('流失', 8, 0, '#ef4444');
```

#### 4.1.2 现有表扩展

```sql
-- 客户表添加 Twenty 同步字段
ALTER TABLE crm_customers ADD COLUMN twenty_company_id TEXT;
ALTER TABLE crm_customers ADD COLUMN twenty_synced_at DATETIME;
ALTER TABLE crm_customers ADD COLUMN twenty_sync_status TEXT DEFAULT 'pending';
ALTER TABLE crm_customers ADD COLUMN sales_stage TEXT DEFAULT 'lead';
ALTER TABLE crm_customers ADD COLUMN deal_value REAL;           -- 预估成交金额
ALTER TABLE crm_customers ADD COLUMN deal_probability INTEGER;  -- 成交概率

-- 任务表添加 Twenty 同步字段
ALTER TABLE crm_sales_tasks ADD COLUMN twenty_task_id TEXT;
ALTER TABLE crm_sales_tasks ADD COLUMN twenty_synced_at DATETIME;
ALTER TABLE crm_sales_tasks ADD COLUMN sales_stage TEXT;
```

### 4.2 同步服务实现

#### 4.2.1 TwentySyncService 完整代码

```typescript
// server/src/services/twentySync.ts

import { getDatabase } from '../config/database.js';

export interface SyncConfig {
  apiUrl: string;
  apiKey: string;
  enabled: boolean;
}

export class TwentySyncService {
  private config: SyncConfig;

  constructor() {
    this.config = {
      apiUrl: process.env.TWENTY_API_URL || 'http://localhost:3000',
      apiKey: process.env.TWENTY_API_KEY || '',
      enabled: process.env.TWENTY_SYNC_ENABLED === 'true',
    };
  }

  // ==================== GraphQL 基础请求 ====================

  private async graphqlRequest(query: string, variables?: any): Promise<any> {
    if (!this.config.enabled) {
      throw new Error('Twenty sync is disabled');
    }

    const response = await fetch(`${this.config.apiUrl}/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    
    if (result.errors) {
      throw new Error(result.errors[0].message);
    }

    return result.data;
  }

  // ==================== 客户同步 ====================

  async syncCustomer(customerId: number): Promise<{ success: boolean; twentyId?: string; error?: string }> {
    try {
      const db = getDatabase();
      const customer = db.prepare('SELECT * FROM crm_customers WHERE id = ?').get(customerId) as any;
      
      if (!customer) {
        return { success: false, error: 'Customer not found' };
      }

      // 检查是否已同步
      if (customer.twenty_company_id) {
        // 更新现有记录
        return this.updateCustomerInTwenty(customer);
      } else {
        // 创建新记录
        return this.createCustomerInTwenty(customer);
      }
    } catch (error: any) {
      this.logSync('customer', customerId, null, 'create', 'failed', error.message);
      return { success: false, error: error.message };
    }
  }

  private async createCustomerInTwenty(customer: any): Promise<{ success: boolean; twentyId?: string; error?: string }> {
    const query = `
      mutation CreateCompany($input: CompanyCreateInput!) {
        createCompany(data: $input) {
          id
          name
          domainName
          employees
          address
          createdAt
        }
      }
    `;

    const variables = {
      input: {
        name: customer.company || customer.name,
        domainName: customer.email ? customer.email.split('@')[1] : null,
        employees: null,
        address: customer.address,
      }
    };

    const result = await this.graphqlRequest(query, variables);
    const twentyId = result.createCompany.id;

    // 更新本地记录
    const db = getDatabase();
    db.prepare(
      'UPDATE crm_customers SET twenty_company_id = ?, twenty_synced_at = CURRENT_TIMESTAMP, twenty_sync_status = ? WHERE id = ?'
    ).run(twentyId, 'synced', customer.id);

    this.logSync('customer', customer.id, twentyId, 'create', 'success');

    return { success: true, twentyId };
  }

  private async updateCustomerInTwenty(customer: any): Promise<{ success: boolean; twentyId?: string; error?: string }> {
    const query = `
      mutation UpdateCompany($id: ID!, $input: CompanyUpdateInput!) {
        updateCompany(id: $id, data: $input) {
          id
          name
          domainName
          address
        }
      }
    `;

    const variables = {
      id: customer.twenty_company_id,
      input: {
        name: customer.company || customer.name,
        domainName: customer.email ? customer.email.split('@')[1] : null,
        address: customer.address,
      }
    };

    const result = await this.graphqlRequest(query, variables);
    const twentyId = result.updateCompany.id;

    // 更新本地记录
    const db = getDatabase();
    db.prepare(
      'UPDATE crm_customers SET twenty_synced_at = CURRENT_TIMESTAMP, twenty_sync_status = ? WHERE id = ?'
    ).run('synced', customer.id);

    this.logSync('customer', customer.id, twentyId, 'update', 'success');

    return { success: true, twentyId };
  }

  // ==================== 任务同步 ====================

  async syncTask(taskId: number): Promise<{ success: boolean; twentyId?: string; error?: string }> {
    try {
      const db = getDatabase();
      const task = db.prepare(`
        SELECT t.*, c.name as customer_name, u.nickname as assigned_name 
        FROM crm_sales_tasks t 
        LEFT JOIN crm_customers c ON t.customer_id = c.id
        LEFT JOIN users u ON t.assigned_to = u.id
        WHERE t.id = ?
      `).get(taskId) as any;

      if (!task) {
        return { success: false, error: 'Task not found' };
      }

      if (task.twenty_task_id) {
        return this.updateTaskInTwenty(task);
      } else {
        return this.createTaskInTwenty(task);
      }
    } catch (error: any) {
      this.logSync('task', taskId, null, 'create', 'failed', error.message);
      return { success: false, error: error.message };
    }
  }

  private async createTaskInTwenty(task: any): Promise<{ success: boolean; twentyId?: string; error?: string }> {
    const query = `
      mutation CreateTask($input: TaskCreateInput!) {
        createTask(data: $input) {
          id
          title
          body
          dueAt
          status
        }
      }
    `;

    const variables = {
      input: {
        title: task.title,
        body: task.description || '',
        dueAt: task.due_date,
        status: this.mapTaskStatus(task.status),
      }
    };

    const result = await this.graphqlRequest(query, variables);
    const twentyId = result.createTask.id;

    // 更新本地记录
    const db = getDatabase();
    db.prepare(
      'UPDATE crm_sales_tasks SET twenty_task_id = ?, twenty_synced_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(twentyId, task.id);

    this.logSync('task', task.id, twentyId, 'create', 'success');

    return { success: true, twentyId };
  }

  private async updateTaskInTwenty(task: any): Promise<{ success: boolean; twentyId?: string; error?: string }> {
    const query = `
      mutation UpdateTask($id: ID!, $input: TaskUpdateInput!) {
        updateTask(id: $id, data: $input) {
          id
          title
          status
        }
      }
    `;

    const variables = {
      id: task.twenty_task_id,
      input: {
        title: task.title,
        body: task.description || '',
        status: this.mapTaskStatus(task.status),
      }
    };

    const result = await this.graphqlRequest(query, variables);
    const twentyId = result.updateTask.id;

    // 更新本地记录
    const db = getDatabase();
    db.prepare(
      'UPDATE crm_sales_tasks SET twenty_synced_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(task.id);

    this.logSync('task', task.id, twentyId, 'update', 'success');

    return { success: true, twentyId };
  }

  // ==================== 批量同步 ====================

  async syncAllPending(): Promise<{ success: number; failed: number }> {
    const db = getDatabase();
    
    // 获取待同步的客户
    const pendingCustomers = db.prepare(
      "SELECT id FROM crm_customers WHERE twenty_sync_status = 'pending' OR twenty_sync_status = 'failed'"
    ).all() as any[];

    // 获取待同步的任务
    const pendingTasks = db.prepare(
      "SELECT id FROM crm_sales_tasks WHERE twenty_task_id IS NULL"
    ).all() as any[];

    let success = 0;
    let failed = 0;

    // 同步客户
    for (const { id } of pendingCustomers) {
      const result = await this.syncCustomer(id);
      if (result.success) success++;
      else failed++;
    }

    // 同步任务
    for (const { id } of pendingTasks) {
      const result = await this.syncTask(id);
      if (result.success) success++;
      else failed++;
    }

    return { success, failed };
  }

  // ==================== 从 Twenty 同步回来 ====================

  async syncFromTwenty(): Promise<void> {
    // 获取 Twenty 中的公司列表
    const query = `
      query GetCompanies {
        companies {
          edges {
            node {
              id
              name
              domainName
              createdAt
              updatedAt
            }
          }
        }
      }
    `;

    const result = await this.graphqlRequest(query);
    const companies = result.companies.edges.map((e: any) => e.node);

    // 更新本地数据库
    const db = getDatabase();
    for (const company of companies) {
      const existing = db.prepare('SELECT id FROM crm_customers WHERE twenty_company_id = ?').get(company.id);
      
      if (!existing) {
        // 新公司在 Twenty 中创建，可选择是否同步到本地
        // 这里仅记录，不自动创建，避免数据混乱
        console.log(`[TwentySync] New company in Twenty: ${company.name}`);
      }
    }
  }

  // ==================== 辅助方法 ====================

  private mapTaskStatus(status: string): string {
    const map: Record<string, string> = {
      'pending': 'TODO',
      'in_progress': 'IN_PROGRESS',
      'completed': 'DONE',
      'cancelled': 'CANCELED',
    };
    return map[status] || 'TODO';
  }

  private logSync(
    entityType: string,
    localId: number,
    twentyId: string | null,
    operation: string,
    status: string,
    errorMessage?: string
  ): void {
    const db = getDatabase();
    db.prepare(
      `INSERT INTO crm_sync_logs (entity_type, local_id, twenty_id, operation, status, error_message)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(entityType, localId, twentyId, operation, status, errorMessage || null);
  }
}

// 单例实例
export const twentySync = new TwentySyncService();
```

### 4.3 API 路由扩展

#### 4.3.1 同步相关路由

```typescript
// server/src/routes/twentySync.ts

import { Router } from 'express';
import { authMiddleware } from '../utils/auth.js';
import { twentySync } from '../services/twentySync.js';

const router = Router();

// 手动触发客户同步
router.post('/twenty/sync/customer/:id', authMiddleware, async (req, res) => {
  try {
    const result = await twentySync.syncCustomer(parseInt(req.params.id));
    res.json({ success: result.success, data: result, error: result.error });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 手动触发任务同步
router.post('/twenty/sync/task/:id', authMiddleware, async (req, res) => {
  try {
    const result = await twentySync.syncTask(parseInt(req.params.id));
    res.json({ success: result.success, data: result, error: result.error });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 批量同步所有待同步数据
router.post('/twenty/sync/all', authMiddleware, async (req, res) => {
  try {
    const result = await twentySync.syncAllPending();
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 从 Twenty 同步数据回来
router.post('/twenty/sync/from', authMiddleware, async (req, res) => {
  try {
    await twentySync.syncFromTwenty();
    res.json({ success: true, message: 'Sync from Twenty completed' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取同步日志
router.get('/twenty/sync/logs', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const { limit = '50', entity_type, status } = req.query;

    let sql = 'SELECT * FROM crm_sync_logs WHERE 1=1';
    const params: any[] = [];

    if (entity_type) {
      sql += ' AND entity_type = ?';
      params.push(entity_type);
    }
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit as string));

    const logs = db.prepare(sql).all(...params);
    res.json({ success: true, data: logs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
```

#### 4.3.2 产品管理路由

```typescript
// server/src/routes/products.ts

import { Router } from 'express';
import { authMiddleware } from '../utils/auth.js';
import { getDatabase } from '../config/database.js';

const router = Router();

// 获取产品列表
router.get('/crm/products', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const { vendor, is_active } = req.query;

    let sql = 'SELECT * FROM crm_products WHERE 1=1';
    const params: any[] = [];

    if (vendor) {
      sql += ' AND vendor = ?';
      params.push(vendor);
    }
    if (is_active !== undefined) {
      sql += ' AND is_active = ?';
      params.push(is_active);
    }

    sql += ' ORDER BY vendor, name';

    const products = db.prepare(sql).all(...params);
    res.json({ success: true, data: products });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 创建产品
router.post('/crm/products', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const { name, vendor, version, license_type, list_price, cost_price, description, features } = req.body;

    const result = db.prepare(
      `INSERT INTO crm_products (name, vendor, version, license_type, list_price, cost_price, description, features)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(name, vendor, version, license_type, list_price, cost_price, description, JSON.stringify(features || []));

    res.json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新产品
router.put('/crm/products/:id', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const fields = req.body;
    const allowedFields = ['name', 'vendor', 'version', 'license_type', 'list_price', 'cost_price', 'description', 'features', 'is_active'];
    
    const updates: string[] = [];
    const values: any[] = [];

    for (const key of allowedFields) {
      if (fields[key] !== undefined) {
        updates.push(`${key} = ?`);
        values.push(key === 'features' ? JSON.stringify(fields[key]) : fields[key]);
      }
    }

    if (updates.length === 0) {
      res.status(400).json({ success: false, error: 'No valid fields to update' });
      return;
    }

    values.push(req.params.id);
    db.prepare(`UPDATE crm_products SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values);

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
```

### 4.4 前端组件实现

#### 4.4.1 Twenty 嵌入组件

```tsx
// web/src/components/TwentyEmbed.tsx

import { useEffect, useRef, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';

interface TwentyEmbedProps {
  module: 'pipeline' | 'tasks' | 'companies' | 'people' | 'analytics';
  height?: string;
  onLoad?: () => void;
  onError?: (error: string) => void;
}

export default function TwentyEmbed({ 
  module, 
  height = '700px',
  onLoad,
  onError 
}: TwentyEmbedProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getTwentyUrl = () => {
    const baseUrl = import.meta.env.VITE_TWENTY_URL || 'http://localhost:3000';
    const paths: Record<string, string> = {
      pipeline: '/opportunities',
      tasks: '/tasks',
      companies: '/companies',
      people: '/people',
      analytics: '/analytics',
    };
    return `${baseUrl}${paths[module]}`;
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (loading) {
        setLoading(false);
        onLoad?.();
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [loading, onLoad]);

  const handleLoad = () => {
    setLoading(false);
    onLoad?.();
  };

  const handleError = () => {
    const errorMsg = 'Failed to load Twenty CRM';
    setError(errorMsg);
    setLoading(false);
    onError?.(errorMsg);
  };

  if (error) {
    return (
      <div 
        className="flex flex-col items-center justify-center bg-destructive/5 border border-destructive/20 rounded-lg"
        style={{ height }}
      >
        <AlertCircle className="w-12 h-12 text-destructive mb-4" />
        <p className="text-destructive font-medium">加载 Twenty CRM 失败</p>
        <p className="text-sm text-muted-foreground mt-2">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm"
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full rounded-lg border border-border overflow-hidden bg-background">
      {loading && (
        <div 
          className="absolute inset-0 flex flex-col items-center justify-center bg-background z-10"
          style={{ height }}
        >
          <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
          <p className="text-sm text-muted-foreground">正在加载 Twenty CRM...</p>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={getTwentyUrl()}
        style={{ width: '100%', height, border: 'none' }}
        onLoad={handleLoad}
        onError={handleError}
        allow="clipboard-write"
        sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
      />
    </div>
  );
}
```

#### 4.4.2 统一 CRM 界面

```tsx
// web/src/pages/CRMUnified.tsx

import { useState } from 'react';
import { 
  Users, GitBranch, ClipboardList, BarChart3, Settings,
  RefreshCw, ExternalLink
} from 'lucide-react';
import { useAuthStore } from '../stores/auth';
import CRMManage from './CRMManage';
import TwentyEmbed from '../components/TwentyEmbed';

const TABS = [
  { id: 'customers', label: '客户管理', icon: Users, type: 'native' },
  { id: 'assignment', label: '任务分派', icon: GitBranch, type: 'native' },
  { id: 'pipeline', label: '销售管道', icon: GitBranch, type: 'twenty', module: 'pipeline' as const },
  { id: 'tasks', label: '任务看板', icon: ClipboardList, type: 'twenty', module: 'tasks' as const },
  { id: 'analytics', label: '数据分析', icon: BarChart3, type: 'twenty', module: 'analytics' as const },
];

export default function CRMUnifiedPage() {
  const [activeTab, setActiveTab] = useState('customers');
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [syncing, setSyncing] = useState(false);
  const { isAdmin } = useAuthStore();

  const activeTabConfig = TABS.find(t => t.id === activeTab);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const response = await fetch('/api/twenty/sync/all', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const result = await response.json();
      if (result.success) {
        setLastSync(new Date());
        alert(`同步完成: ${result.data.success} 成功, ${result.data.failed} 失败`);
      }
    } catch (error) {
      alert('同步失败: ' + error);
    } finally {
      setSyncing(false);
    }
  };

  const openTwenty = () => {
    window.open(import.meta.env.VITE_TWENTY_URL || 'http://localhost:3000', '_blank');
  };

  return (
    <div className="space-y-6 p-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">CRM 客户管理</h1>
          <p className="text-sm text-muted-foreground mt-1">
            自研核心 + Twenty 增强
            {lastSync && (
              <span className="ml-2 text-xs">
                上次同步: {lastSync.toLocaleString()}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-secondary rounded-lg text-sm hover:bg-secondary/80 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? '同步中...' : '同步到 Twenty'}
          </button>
          <button
            onClick={openTwenty}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            打开 Twenty
          </button>
        </div>
      </div>

      {/* 标签页 */}
      <div className="border-b border-border">
        <div className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {tab.type === 'twenty' && (
                <span className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded">
                  Twenty
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 内容区 */}
      <div className="min-h-[600px]">
        {activeTab === 'customers' && <CRMManage />}
        {activeTab === 'assignment' && <AssignmentPanel />}
        {activeTabConfig?.type === 'twenty' && activeTabConfig.module && (
          <TwentyEmbed module={activeTabConfig.module} height="700px" />
        )}
      </div>
    </div>
  );
}

// 任务分派面板组件
function AssignmentPanel() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="font-medium mb-4">自动分派规则</h3>
          <AssignmentRulesList />
        </div>
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="font-medium mb-4">团队工作量</h3>
          <TeamWorkloadStats />
        </div>
      </div>
    </div>
  );
}
```

### 4.5 环境变量配置

```bash
# server/.env

# Twenty CRM 配置
TWENTY_API_URL=http://localhost:3000
TWENTY_API_KEY=your_twenty_api_key_here
TWENTY_SYNC_ENABLED=true

# 同步配置
TWENTY_SYNC_INTERVAL=300000  # 5分钟自动同步一次
TWENTY_SYNC_BATCH_SIZE=50    # 批量同步数量
```

```bash
# web/.env

# Twenty CRM 前端配置
VITE_TWENTY_URL=http://localhost:3000
```

---

## 5. 实施计划

### 5.1 阶段划分

#### 第一阶段：基础准备（Week 1）

| 任务 | 负责人 | 工期 | 产出 |
|------|--------|------|------|
| Twenty 部署 | 运维 | 2天 | Docker 环境运行 |
| 数据库迁移 | 后端 | 2天 | 新表结构创建 |
| 环境配置 | 后端 | 1天 | .env 配置完成 |

**交付物：**
- Twenty CRM 可访问（http://localhost:3000）
- 数据库迁移脚本执行完成
- 环境变量配置文档

#### 第二阶段：同步层开发（Week 2）

| 任务 | 负责人 | 工期 | 产出 |
|------|--------|------|------|
| TwentySyncService | 后端 | 3天 | 同步服务代码 |
| 同步路由 API | 后端 | 2天 | REST API 接口 |
| 触发器集成 | 后端 | 2天 | 自动同步逻辑 |

**交付物：**
- `twentySync.ts` 服务代码
- 同步相关 API 路由
- 单元测试用例

#### 第三阶段：前端整合（Week 3）

| 任务 | 负责人 | 工期 | 产出 |
|------|--------|------|------|
| TwentyEmbed 组件 | 前端 | 2天 | 嵌入组件 |
| CRMUnified 页面 | 前端 | 3天 | 统一界面 |
| 产品管理界面 | 前端 | 2天 | 产品库页面 |

**交付物：**
- 前端组件代码
- 统一 CRM 界面
- 产品管理功能

#### 第四阶段：测试优化（Week 4）

| 任务 | 负责人 | 工期 | 产出 |
|------|--------|------|------|
| 集成测试 | 测试 | 3天 | 测试报告 |
| 性能优化 | 后端 | 2天 | 优化后的代码 |
| 文档编写 | 产品 | 2天 | 用户手册 |

**交付物：**
- 测试报告
- 性能优化记录
- 用户操作手册

### 5.2 详细时间表

```
Week 1: 基础准备
├── Day 1-2: Twenty Docker 部署
│   └── 安装 Docker、docker-compose
│   └── 配置 Twenty 环境变量
│   └── 启动服务并验证
│
├── Day 3-4: 数据库迁移
│   └── 创建迁移脚本
│   └── 执行迁移并验证
│   └── 回滚方案准备
│
└── Day 5: 环境配置
    └── 配置 .env 文件
    └── 编写配置文档

Week 2: 同步层开发
├── Day 1-3: TwentySyncService
│   └── 实现 GraphQL 请求方法
│   └── 实现客户同步逻辑
│   └── 实现任务同步逻辑
│
├── Day 4-5: 同步路由 API
│   └── 创建 twentySync.ts 路由
│   └── 实现手动同步接口
│   └── 实现批量同步接口
│
└── Day 6-7: 触发器集成
    └── 修改 CRM 路由添加同步触发
    └── 实现异步同步机制
    └── 错误处理和重试逻辑

Week 3: 前端整合
├── Day 1-2: TwentyEmbed 组件
│   └── 实现 iframe 嵌入
│   └── 添加加载状态
│   └── 错误处理
│
├── Day 3-5: CRMUnified 页面
│   └── 实现 Tab 切换
│   └── 整合自研和 Twenty 界面
│   └── 添加同步按钮
│
└── Day 6-7: 产品管理界面
    └── 产品列表页面
    └── 产品表单组件
    └── 与后端 API 对接

Week 4: 测试优化
├── Day 1-3: 集成测试
│   └── 端到端测试
│   └── 性能测试
│   └── 安全测试
│
├── Day 4-5: 性能优化
│   └── 同步性能优化
│   └── 前端加载优化
│
└── Day 6-7: 文档编写
    └── 用户操作手册
    └── 开发文档
    └── 部署文档
```

### 5.3 里程碑

| 里程碑 | 日期 | 验收标准 |
|--------|------|----------|
| M1: 环境就绪 | Week 1 结束 | Twenty 可访问，数据库迁移完成 |
| M2: 同步功能 | Week 2 结束 | 客户/任务可双向同步 |
| M3: 界面整合 | Week 3 结束 | 统一界面可正常使用 |
| M4: 系统上线 | Week 4 结束 | 测试通过，文档完整 |

---

## 6. 风险与应对

### 6.1 技术风险

| 风险 | 概率 | 影响 | 应对措施 |
|------|------|------|----------|
| Twenty API 变更 | 中 | 高 | 封装同步层，隔离变化 |
| 同步数据冲突 | 中 | 高 | 实现冲突检测和人工介入机制 |
| 性能瓶颈 | 低 | 中 | 批量同步 + 异步队列 |
| iframe 跨域问题 | 低 | 中 | 配置 CORS，使用相同域名 |

### 6.2 业务风险

| 风险 | 概率 | 影响 | 应对措施 |
|------|------|------|----------|
| 用户不适应新界面 | 中 | 中 | 保留原有界面，渐进式切换 |
| 数据不一致 | 低 | 高 | 定期全量同步 + 校验机制 |
| Twenty 服务不稳定 | 低 | 中 | 本地缓存 + 降级方案 |

### 6.3 应对措施详解

#### 数据冲突处理

```typescript
// 冲突检测逻辑
async function detectConflict(localEntity: any, twentyEntity: any): Promise<boolean> {
  const localUpdated = new Date(localEntity.updated_at).getTime();
  const twentyUpdated = new Date(twentyEntity.updatedAt).getTime();
  
  // 如果两边都更新了，且更新时间不同，则存在冲突
  if (localUpdated !== twentyUpdated) {
    // 记录冲突，等待人工处理
    await logConflict(localEntity, twentyEntity);
    return true;
  }
  return false;
}
```

#### 降级方案

```typescript
// 当 Twenty 不可用时，使用本地功能
async function syncWithFallback(entity: any) {
  try {
    return await twentySync.syncCustomer(entity.id);
  } catch (error) {
    console.warn('Twenty sync failed, using local only:', error);
    // 标记为待同步，稍后重试
    await markAsPending(entity.id);
    return { success: true, localOnly: true };
  }
}
```

---

## 7. 附录

### 7.1 相关资源

#### Twenty CRM
- **GitHub**: https://github.com/twentyhq/twenty
- **文档**: https://docs.twenty.com
- **下载**: https://github.com/twentyhq/twenty/archive/refs/heads/main.zip

#### GraphQL API 参考
```graphql
# 查询公司
query GetCompanies {
  companies {
    edges {
      node {
        id
        name
        domainName
        createdAt
      }
    }
  }
}

# 创建任务
mutation CreateTask($input: TaskCreateInput!) {
  createTask(data: $input) {
    id
    title
    status
  }
}
```

### 7.2 数据库迁移脚本

```bash
# 执行迁移
npm run migrate

# 回滚迁移
npm run migrate:rollback
```

### 7.3 部署检查清单

- [ ] Twenty Docker 容器运行正常
- [ ] 数据库迁移执行成功
- [ ] 环境变量配置正确
- [ ] API 接口测试通过
- [ ] 前端组件加载正常
- [ ] 同步功能验证通过
- [ ] 性能测试达标
- [ ] 文档编写完成

### 7.4 联系方式

| 角色 | 姓名 | 职责 |
|------|------|------|
| 项目负责人 | - | 整体协调 |
| 后端开发 | - | 同步服务开发 |
| 前端开发 | - | 界面整合 |
| 测试 | - | 质量保证 |

---

**文档版本历史**

| 版本 | 日期 | 修改内容 | 作者 |
|------|------|----------|------|
| v1.0 | 2026-05-10 | 初始版本 | AI Assistant |

---

*本文档为 Q1.18 CRM 系统集成方案的完整实施指南，请各相关人员仔细阅读并按计划执行。*
