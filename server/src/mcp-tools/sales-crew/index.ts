// ==========================================
// 销售作战团队 MCP模块入口
// ==========================================

import { registerSalesAgents, salesAgents } from './agents.js';
import { registerSalesTasks } from './tasks.js';
import { registerSalesCrews } from './crews.js';
import { registerSalesTools } from './tools.js';
import { prisma } from '../../config/prisma.js';
import { getDatabase } from '../../config/database.js';
import { mcpRegistry } from '../_core/index.js';

// Q1.28: 从数据库同步Agent启用状态到内存
async function syncAgentStatusFromDB(): Promise<void> {
  try {
    const disabledConfig = await prisma.systemConfig.findUnique({
      where: { key: 'mcp_disabled_agents' },
    });
    const disabledAgents: string[] = disabledConfig ? JSON.parse(disabledConfig.value) : [];

    for (const agent of salesAgents) {
      if (disabledAgents.includes(agent.id)) {
        agent.enabled = false;
        console.log(`[SalesCrew] Agent ${agent.id} 已从数据库同步为禁用状态`);
      }
    }

    console.log(`[SalesCrew] 已从数据库同步 ${disabledAgents.length} 个禁用Agent`);
  } catch (err: any) {
    console.warn('[SalesCrew] 从数据库同步Agent状态失败:', err.message);
  }
}

// Q1.31: 从数据库加载自定义Agent
function loadCustomAgentsFromDB(): void {
  try {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM custom_agents WHERE enabled = 1').all() as any[];

    let loadedCount = 0;
    for (const row of rows) {
      const agent = {
        id: row.agent_id,
        name: row.name,
        role: row.role,
        goal: row.goal,
        backstory: row.backstory || '',
        tools: JSON.parse(row.tools || '[]'),
        knowledgeBases: JSON.parse(row.knowledge_bases || '[]'),
        model: row.model || 'deepseek-v4-pro',
        temperature: row.temperature ?? 0.7,
        maxTokens: row.max_tokens ?? 4096,
        enabled: true,
      };
      mcpRegistry.registerAgent(agent);
      loadedCount++;
    }

    if (loadedCount > 0) {
      console.log(`[SalesCrew] 已从数据库加载 ${loadedCount} 个自定义Agent`);
    }
  } catch (err: any) {
    console.warn('[SalesCrew] 加载自定义Agent失败:', err.message);
  }
}

export async function registerSalesCrewModule(): Promise<void> {
  // Q1.28: 先同步数据库状态，再注册
  await syncAgentStatusFromDB();
  registerSalesAgents();
  // Q1.31: 加载自定义Agent
  loadCustomAgentsFromDB();
  registerSalesTasks();
  registerSalesCrews();
  registerSalesTools();
  console.log('[SalesCrew] 销售作战团队模块加载完成');
}

export * from './agents.js';
export * from './tasks.js';
export * from './crews.js';
export * from './tools.js';
