/**
 * 牛马引擎 - 客户自动同步调度器
 *
 * 每 60s tick 一次；读 niuma_sync_strategy.auto_sync_enabled + sync_interval_hours，
 * 与 last_sync_at 比较；到点就触发一次拉取 + 导入 CRM 客户。
 *
 * 注意：底层 DB 是 sync-mysql 同步阻塞，单次导入大批量会卡事件循环，
 * 因此把 max_import 上限锁在 200，避免 cron tick 把整个 server 卡住。
 */

import { getDatabase } from '../config/database.js';
import { fetchAdvancedAnalysis, type NiumaAdvancedFilterParams } from './niumaEngineClient.js';
import { mapEnterprisesToCustomers } from './niumaDataMapper.js';
import { autoAssignCustomer } from './assignmentEngine.js';

const TICK_INTERVAL_MS = 60_000;        // 每分钟检查
const PER_RUN_MAX_IMPORT = 200;          // 单次拉取上限，保护事件循环
const PER_RUN_PAGE_SIZE = 50;

let timer: NodeJS.Timeout | null = null;
let running = false;  // 同一时刻只允许一次同步在跑

function ensureLastSyncColumn() {
  const db = getDatabase();
  try {
    db.exec(`ALTER TABLE niuma_sync_strategy ADD COLUMN last_sync_at DATETIME`);
  } catch {
    // 已存在则忽略
  }
}

interface SyncStrategyRow {
  id: number;
  auto_sync_enabled: number;
  sync_interval_hours: number;
  sync_filters: string;
  auto_assign_enabled: number;
  last_sync_at: string | null;
}

function readStrategy(): SyncStrategyRow | null {
  const db = getDatabase();
  try {
    return db.prepare('SELECT * FROM niuma_sync_strategy ORDER BY id DESC LIMIT 1').get() as SyncStrategyRow | null;
  } catch {
    return null;
  }
}

function isDueNow(strategy: SyncStrategyRow): boolean {
  if (!strategy.auto_sync_enabled) return false;
  if (!strategy.last_sync_at) return true;  // 从未跑过 → 立刻跑
  const lastMs = new Date(strategy.last_sync_at).getTime();
  if (Number.isNaN(lastMs)) return true;
  const intervalMs = Math.max(1, strategy.sync_interval_hours) * 60 * 60 * 1000;
  return Date.now() - lastMs >= intervalMs;
}

async function runOnce(strategy: SyncStrategyRow): Promise<{ imported: number; assigned: number; errors: number }> {
  const db = getDatabase();

  let filters: NiumaAdvancedFilterParams = {};
  try { filters = JSON.parse(strategy.sync_filters || '{}'); } catch { /* keep empty */ }

  // 分批拉取
  const allData: any[] = [];
  const batches = Math.ceil(PER_RUN_MAX_IMPORT / PER_RUN_PAGE_SIZE);
  for (let i = 0; i < batches; i++) {
    const remaining = PER_RUN_MAX_IMPORT - allData.length;
    if (remaining <= 0) break;
    const pageSize = Math.min(PER_RUN_PAGE_SIZE, remaining);
    const resp = await fetchAdvancedAnalysis({ ...filters, page: i + 1, page_size: pageSize });
    if (!resp.data || resp.data.length === 0) break;
    allData.push(...resp.data);
    if (resp.data.length < pageSize) break;  // 数据已拉完
  }

  const mapped = mapEnterprisesToCustomers(allData);
  let imported = 0;
  let errors = 0;
  const newIds: number[] = [];

  for (const c of mapped) {
    try {
      const existing = db.prepare('SELECT id FROM crm_customers WHERE niuma_id = ?').get(c.niuma_id);
      if (existing) continue;
      const result = db.prepare(
        `INSERT INTO crm_customers (
          name, company, industry, phone, email, address,
          vendor, product_interest, budget_range, urgency_level,
          status, source, notes, niuma_id, niuma_metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        c.name, c.company, c.industry, c.phone, c.email, c.address,
        c.vendor, JSON.stringify(c.product_interest), c.budget_range,
        c.urgency_level, c.status, c.source, c.notes,
        c.niuma_id, c.niuma_metadata
      );
      const newId = Number(result.lastInsertRowid);
      newIds.push(newId);
      imported++;
    } catch (err) {
      errors++;
    }
  }

  let assigned = 0;
  if (strategy.auto_assign_enabled) {
    for (const id of newIds) {
      try {
        await autoAssignCustomer(id, 1 /* 系统调度记为 admin 操作 */);
        assigned++;
      } catch {
        errors++;
      }
    }
  }

  return { imported, assigned, errors };
}

async function tick() {
  if (running) return;
  const strategy = readStrategy();
  if (!strategy || !isDueNow(strategy)) return;

  running = true;
  const startedAt = new Date();
  try {
    console.log(`[NiumaAutoSync] 触发同步 (interval=${strategy.sync_interval_hours}h, lastSync=${strategy.last_sync_at || 'never'})`);
    const result = await runOnce(strategy);
    console.log(`[NiumaAutoSync] 完成: 新增 ${result.imported}, 分派 ${result.assigned}, 错误 ${result.errors}`);
  } catch (err: any) {
    console.warn('[NiumaAutoSync] 同步失败:', err.message);
  } finally {
    // 不管成功失败都更新 last_sync_at，避免失败时短时间内反复重试打爆 1077
    try {
      getDatabase().prepare(
        'UPDATE niuma_sync_strategy SET last_sync_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(startedAt.toISOString().slice(0, 19).replace('T', ' '), strategy.id);
    } catch { /* ignore */ }
    running = false;
  }
}

export function startNiumaAutoSyncScheduler(): void {
  if (timer) return;  // 已启动则跳过
  ensureLastSyncColumn();
  // 启动后等 30s 再首次 tick，让其他初始化先完成
  setTimeout(() => {
    tick().catch(err => console.warn('[NiumaAutoSync] tick 异常:', err.message));
    timer = setInterval(() => {
      tick().catch(err => console.warn('[NiumaAutoSync] tick 异常:', err.message));
    }, TICK_INTERVAL_MS);
  }, 30_000);
  console.log('[NiumaAutoSync] 调度器已启动 (60s tick, 30s 后首次检查)');
}

export function stopNiumaAutoSyncScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
