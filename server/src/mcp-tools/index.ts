// ==========================================
// MCP工具总入口
// 统一注册所有MCP模块
// ==========================================

import { mcpRegistry } from './_core/index.js';
import { registerSalesCrewModule } from './sales-crew/index.js';
import { registerKnowledgeBaseModule } from './knowledge-base/index.js';

export async function initMCPToolsModular(): Promise<void> {
  console.log('[MCP] 开始初始化模块化工具集...');

  // 注册销售作战团队模块
  await registerSalesCrewModule();

  // 注册知识库模块
  await registerKnowledgeBaseModule();

  const stats = mcpRegistry.getStats();
  console.log(`[MCP] 模块化工具集初始化完成`);
  console.log(`[MCP] 统计: ${stats.tools} 工具, ${stats.agents} Agent, ${stats.tasks} 任务, ${stats.crews} Crew, ${stats.knowledgeBases} 知识库`);
}

export { mcpRegistry };
export * from './_core/index.js';
