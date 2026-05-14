import { mcpRegistry, type MCPKnowledgeBase } from '../_core/index.js';

// ==========================================
// 4大厂商知识库定义 (Q1.18)
// 接入牛马AI引擎知识库路径 + 反盗版专用知识库
// ==========================================

const knowledgeBases: MCPKnowledgeBase[] = [
  {
    id: 'kb-autodesk',
    name: 'Autodesk销售知识库',
    vendor: 'autodesk',
    path: 'D:\\工作\\RAG知识库\\资料\\Autodesk学习资料',
    documents: [],
    embeddingModel: 'text-embedding-v3',
  },
  {
    id: 'kb-sketchup',
    name: 'SketchUp销售知识库',
    vendor: 'sketchup',
    path: 'D:\\工作\\临时工作区\\UI\\RAG知识库\\资料\\SketchUp学习资料',
    documents: [],
    embeddingModel: 'text-embedding-v3',
  },
  {
    id: 'kb-adobe',
    name: 'Adobe销售知识库',
    vendor: 'adobe',
    path: 'D:\\工作\\RAG知识库\\资料\\Adobe学习资料',
    documents: [],
    embeddingModel: 'text-embedding-v3',
  },
  {
    id: 'kb-dassault',
    name: '达索销售知识库',
    vendor: 'dassault',
    path: 'D:\\工作\\RAG知识库\\资料\\达索学习资料',
    documents: [],
    embeddingModel: 'text-embedding-v3',
  },
  // Q1.18新增：反盗版专用知识库
  {
    id: 'kb-autodesk-piracy',
    name: 'Autodesk反盗版战术知识库',
    vendor: 'autodesk',
    path: 'D:\\工作\\RAG知识库\\数据库\\database\\versions\\V10.45',
    documents: [
      'autodesk_knowledge.json',
      'app/routers/analysis.py',
      'app/routers/enterprise.py',
    ],
    embeddingModel: 'text-embedding-v3',
  },
  {
    id: 'kb-compliance-tactics',
    name: '反盗版十大战术知识库',
    vendor: 'all',
    path: 'D:\\工作\\SOLO CN\\2026-05-10-task-1',
    documents: [
      '销售作战团队Autodesk反盗版定制版深度报告.md',
      '销售作战团队深度解析报告.md',
    ],
    embeddingModel: 'text-embedding-v3',
  },
  {
    id: 'kb-legal-scripts',
    name: '法务协同话术知识库',
    vendor: 'all',
    path: 'D:\\工作\\SOLO CN',
    documents: [
      'Autodesk盗版法务对峙 企业侧一键复制博弈话术(6).rtf',
    ],
    embeddingModel: 'text-embedding-v3',
  },
];

export function registerKnowledgeBases(): void {
  for (const kb of knowledgeBases) {
    mcpRegistry.registerKnowledgeBase(kb);
  }
  console.log(`[KnowledgeBase] 已注册 ${knowledgeBases.length} 个厂商知识库（含反盗版专用知识库）`);
}

export function getVendorKnowledgeBase(vendor: string): MCPKnowledgeBase | undefined {
  return knowledgeBases.find(kb => kb.vendor === vendor);
}

// Q1.18新增：获取反盗版专用知识库
export function getPiracyKnowledgeBases(): MCPKnowledgeBase[] {
  return knowledgeBases.filter(kb =>
    kb.id.includes('piracy') ||
    kb.id.includes('compliance') ||
    kb.id.includes('legal')
  );
}
