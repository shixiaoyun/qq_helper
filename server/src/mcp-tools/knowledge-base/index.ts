// ==========================================
// 知识库 MCP模块入口
// ==========================================

import { registerKnowledgeBases } from './vendors.js';
import { registerKnowledgeSearchTools } from './search.js';

export async function registerKnowledgeBaseModule(): Promise<void> {
  registerKnowledgeBases();
  registerKnowledgeSearchTools();
  console.log('[KnowledgeBase] 知识库模块加载完成');
}

export * from './vendors.js';
export * from './search.js';
