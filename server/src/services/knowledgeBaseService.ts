import fs from 'fs';

// ==========================================
// 知识库服务 - 直接接入牛马引擎和本地JSON知识库 (Q1.17)
// ==========================================
// 知识库来源：
// 1. 本地JSON知识库: D:\工作\RAG知识库\资料\{厂商}\autodesk_knowledge_base.json
// 2. 牛马引擎API: http://localhost:1080/api/knowledge (如果可用)
// 3. 本地SQLite数据库: D:\工作\RAG知识库\数据库\database\versions\V9.018\data\{厂商}_enterprise.db
// ==========================================

interface KnowledgeItem {
  id: string;
  domain: string;
  cat: string;
  title: string;
  content: string;
  summary: string;
  src: string[];
  kw: string;
  pages: number;
}

interface KnowledgeBase {
  meta: { time: string; total: number; ok: number; fail: number };
  items: KnowledgeItem[];
}

// 厂商知识库配置
const VENDOR_KB_CONFIG: Record<string, { jsonPath: string; dbPath: string; niumaApiPath: string }> = {
  autodesk: {
    jsonPath: 'D:\\工作\\RAG知识库\\资料\\Autodesk学习资料\\autodesk_knowledge_base.json',
    dbPath: 'D:\\工作\\RAG知识库\\数据库\\database\\versions\\V9.018\\data\\autodesk_enterprise.db',
    niumaApiPath: '/api/knowledge',
  },
  sketchup: {
    jsonPath: '', // SketchUp没有独立JSON，从数据库获取
    dbPath: 'D:\\工作\\RAG知识库\\数据库\\database\\versions\\V9.018\\data\\sketchup_enterprise.db',
    niumaApiPath: '/api/knowledge',
  },
  adobe: {
    jsonPath: '', // Adobe没有独立JSON，从数据库获取
    dbPath: 'D:\\工作\\RAG知识库\\数据库\\database\\versions\\V9.018\\data\\adobe_enterprise.db',
    niumaApiPath: '/api/knowledge',
  },
  dassault: {
    jsonPath: '', // 达索只有PPT，没有JSON
    dbPath: '',
    niumaApiPath: '/api/knowledge',
  },
};

// 缓存
const kbCache = new Map<string, { data: KnowledgeItem[]; mtime: number }>();

// 从JSON文件加载知识库
function loadJsonKnowledgeBase(vendor: string): KnowledgeItem[] {
  const config = VENDOR_KB_CONFIG[vendor];
  if (!config || !config.jsonPath) return [];

  try {
    if (!fs.existsSync(config.jsonPath)) {
      console.warn(`[KnowledgeBase] JSON文件不存在: ${config.jsonPath}`);
      return [];
    }

    const stat = fs.statSync(config.jsonPath);
    const cached = kbCache.get(vendor);
    if (cached && cached.mtime === stat.mtime.getTime()) {
      return cached.data;
    }

    const content = fs.readFileSync(config.jsonPath, 'utf-8');
    const kb = JSON.parse(content) as KnowledgeBase;
    const items = kb.items || [];

    kbCache.set(vendor, { data: items, mtime: stat.mtime.getTime() });
    console.log(`[KnowledgeBase] 加载 ${vendor} 知识库: ${items.length} 条`);
    return items;
  } catch (err: any) {
    console.error(`[KnowledgeBase] 加载 ${vendor} 知识库失败:`, err.message);
    return [];
  }
}

// 从牛马引擎API获取知识
async function queryNiumaKnowledge(vendor: string, query: string, limit = 5): Promise<KnowledgeItem[]> {
  try {
    // 牛马引擎地址 - 从环境变量或默认
    const niumaBaseUrl = process.env.NIUMA_ENGINE_URL || 'http://localhost:1080';
    const url = new URL(`${niumaBaseUrl}/api/knowledge`);
    url.searchParams.set('search', query);
    url.searchParams.set('limit', String(limit * 2));

    const resp = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });

    if (!resp.ok) {
      console.warn(`[KnowledgeBase] 牛马引擎API请求失败: HTTP ${resp.status}`);
      return [];
    }

    const data = await resp.json() as any;
    if (!data.success || !data.data?.items) {
      return [];
    }

    // 转换牛马引擎格式为内部格式
    return data.data.items.map((item: any) => ({
      id: item.knowledge_id || item.id || String(Math.random()),
      domain: vendor,
      cat: item.category || 'general',
      title: item.title || '',
      content: item.content || '',
      summary: item.content?.slice(0, 200) || '',
      src: [item.title || ''],
      kw: item.sub_category || '',
      pages: 1,
    }));
  } catch (err: any) {
    console.warn(`[KnowledgeBase] 牛马引擎查询失败:`, err.message);
    return [];
  }
}

// 搜索知识库
export async function searchKnowledgeBase(vendor: string, query: string, limit = 5): Promise<KnowledgeItem[]> {
  const results: KnowledgeItem[] = [];
  const seenIds = new Set<string>();

  // 1. 先从本地JSON加载
  const jsonItems = loadJsonKnowledgeBase(vendor);
  if (jsonItems.length > 0) {
    const queryLower = query.toLowerCase();
    const scored = jsonItems.map(item => {
      let score = 0;
      const titleLower = item.title.toLowerCase();
      const contentLower = item.content.toLowerCase();
      const kwLower = item.kw.toLowerCase();
      const catLower = item.cat.toLowerCase();

      // 标题匹配权重最高
      if (titleLower.includes(queryLower)) score += 10;
      // 关键词匹配
      if (kwLower.includes(queryLower)) score += 8;
      // 分类匹配
      if (catLower.includes(queryLower)) score += 6;
      // 内容匹配
      if (contentLower.includes(queryLower)) score += 4;

      // 分词匹配（简单实现）
      const queryWords = queryLower.split(/\s+/);
      for (const word of queryWords) {
        if (word.length < 2) continue;
        if (titleLower.includes(word)) score += 3;
        if (contentLower.includes(word)) score += 1;
        if (kwLower.includes(word)) score += 2;
      }

      return { item, score };
    });

    const filtered = scored
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    for (const { item } of filtered) {
      if (!seenIds.has(item.id)) {
        results.push(item);
        seenIds.add(item.id);
      }
    }
  }

  // 2. 如果本地结果不足，尝试牛马引擎API
  if (results.length < limit) {
    const niumaItems = await queryNiumaKnowledge(vendor, query, limit - results.length);
    for (const item of niumaItems) {
      if (!seenIds.has(item.id)) {
        results.push(item);
        seenIds.add(item.id);
      }
    }
  }

  return results.slice(0, limit);
}

// 格式化知识库结果为上下文
export function formatKnowledgeContext(items: KnowledgeItem[]): string {
  if (items.length === 0) return '';

  const contexts = items.map((item, i) => {
    const content = item.content || item.summary || '';
    // 截断内容，避免过长
    const truncated = content.length > 1500 ? content.slice(0, 1500) + '...' : content;
    return `[${i + 1}] ${item.title} (${item.cat})\n${truncated}`;
  });

  return `【知识库参考 - ${items[0]?.domain || ''}】\n\n${contexts.join('\n\n---\n\n')}\n\n请基于以上知识库内容回答，确保信息准确。`;
}

// 获取厂商知识库统计
export function getKnowledgeBaseStats(vendor: string): { total: number; available: boolean } {
  const items = loadJsonKnowledgeBase(vendor);
  return {
    total: items.length,
    available: items.length > 0,
  };
}

// 获取所有厂商知识库状态
export function getAllKnowledgeBaseStats(): Record<string, { total: number; available: boolean }> {
  const stats: Record<string, { total: number; available: boolean }> = {};
  for (const vendor of Object.keys(VENDOR_KB_CONFIG)) {
    stats[vendor] = getKnowledgeBaseStats(vendor);
  }
  return stats;
}
