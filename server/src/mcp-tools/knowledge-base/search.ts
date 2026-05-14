import { mcpRegistry } from '../_core/index.js';
import { ragService } from '../../services/ragService.js';
import { getDatabase } from '../../config/database.js';

// ==========================================
// 知识库搜索工具
// 提供向量检索和文档查询能力
// ==========================================

export function registerKnowledgeSearchTools(): void {
  // 向量检索工具
  mcpRegistry.registerTool({
    name: 'kb-search',
    description: '在知识库中进行语义搜索，返回最相关的文档片段',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索查询' },
        vendor: { type: 'string', enum: ['autodesk', 'sketchup', 'adobe', 'dassault'], description: '厂商筛选' },
        topK: { type: 'number', description: '返回结果数量', default: 5 },
      },
      required: ['query'],
    },
    execute: async ({ query, vendor, topK = 5 }) => {
      try {
        let knowledgeBaseIds: number[] = [];

        if (vendor) {
          // 查询特定厂商的知识库
          const db = getDatabase();
          const kb = db.prepare('SELECT id FROM knowledge_bases WHERE name LIKE ?').get(`%${vendor}%`) as any;
          if (kb) knowledgeBaseIds.push(kb.id);
        } else {
          // 查询所有知识库
          const db = getDatabase();
          const kbs = db.prepare('SELECT id FROM knowledge_bases WHERE status = ?').all('active') as any[];
          knowledgeBaseIds = kbs.map(k => k.id);
        }

        if (knowledgeBaseIds.length === 0) {
          return { success: false, error: '未找到知识库' };
        }

        const results = await ragService.searchMultiple(knowledgeBaseIds, query, topK);

        return {
          success: true,
          data: results.map(r => ({
            content: r.chunk.content,
            score: r.score,
            metadata: r.chunk.metadata,
          })),
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  // 文档查询工具
  mcpRegistry.registerTool({
    name: 'kb-documents',
    description: '查询知识库中的文档列表',
    parameters: {
      type: 'object',
      properties: {
        vendor: { type: 'string', enum: ['autodesk', 'sketchup', 'adobe', 'dassault'], description: '厂商筛选' },
        category: { type: 'string', description: '文档分类' },
        limit: { type: 'number', description: '返回数量限制', default: 20 },
      },
      required: [],
    },
    execute: async ({ vendor, category, limit = 20 }) => {
      try {
        const db = getDatabase();
        let sql = 'SELECT d.*, kb.name as knowledge_base_name FROM documents d JOIN knowledge_bases kb ON d.knowledge_base_id = kb.id WHERE 1=1';
        const params: any[] = [];

        if (vendor) {
          sql += ' AND kb.name LIKE ?';
          params.push(`%${vendor}%`);
        }
        if (category) {
          sql += ' AND d.file_type = ?';
          params.push(category);
        }

        sql += ' ORDER BY d.created_at DESC LIMIT ?';
        params.push(limit);

        const documents = db.prepare(sql).all(...params);
        return { success: true, data: documents };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  // 话术模板查询工具
  mcpRegistry.registerTool({
    name: 'kb-scripts',
    description: '查询销售话术模板',
    parameters: {
      type: 'object',
      properties: {
        scenario: { type: 'string', enum: ['first_contact', 'follow_up', 'demo', 'negotiation', 'objection', 'closing'], description: '销售场景' },
        vendor: { type: 'string', enum: ['autodesk', 'sketchup', 'adobe', 'dassault'], description: '厂商' },
      },
      required: ['scenario'],
    },
    execute: async ({ scenario, vendor }) => {
      try {
        const db = getDatabase();
        const query = `${scenario} ${vendor || ''} 话术`;

        // 先尝试从知识库搜索
        let knowledgeBaseIds: number[] = [];
        if (vendor) {
          const kb = db.prepare('SELECT id FROM knowledge_bases WHERE name LIKE ?').get(`%${vendor}%`) as any;
          if (kb) knowledgeBaseIds.push(kb.id);
        } else {
          const kbs = db.prepare('SELECT id FROM knowledge_bases WHERE status = ?').all('active') as any[];
          knowledgeBaseIds = kbs.map(k => k.id);
        }

        if (knowledgeBaseIds.length > 0) {
          const results = await ragService.searchMultiple(knowledgeBaseIds, query, 3);
          if (results.length > 0) {
            return {
              success: true,
              data: results.map(r => ({
                content: r.chunk.content,
                score: r.score,
              })),
              source: 'knowledge_base',
            };
          }
        }

        // 如果没有找到，返回默认话术
        const defaultScripts: Record<string, string> = {
          first_contact: '您好，我是[公司名]的销售顾问，专注于[厂商]软件解决方案。了解到贵公司在[行业]领域的卓越成就，想请教一下目前使用的设计软件情况...',
          follow_up: '张经理您好，上次沟通后我整理了一份针对贵公司需求的方案，想约个时间给您详细汇报一下...',
          demo: '今天我将为您演示[产品]的核心功能，特别是针对贵公司[需求]的解决方案...',
          negotiation: '关于价格问题，我理解您的考虑。我们可以探讨一下灵活的付款方式和增值服务...',
          objection: '您提到的[异议]确实是个重要考虑因素。让我为您详细说明一下我们的解决方案...',
          closing: '基于我们的沟通，我建议我们可以从[产品]开始试点，这样既能验证效果，又能控制成本...',
        };

        return {
          success: true,
          data: [{ content: defaultScripts[scenario] || '请根据具体情况调整话术' }],
          source: 'default',
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  console.log('[KnowledgeBase] 已注册 3 个知识库搜索工具');
}
