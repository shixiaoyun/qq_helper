import { getWebSearchConfig, isWebSearchEnabled } from '../models/systemConfig.js';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  siteName?: string;
  date?: string;
}

export async function searchWeb(query: string, count: number = 5): Promise<SearchResult[]> {
  if (!isWebSearchEnabled()) {
    throw new Error('联网搜索功能已禁用');
  }

  const config = getWebSearchConfig();
  if (!config.apiKey) {
    throw new Error('未配置联网搜索API密钥');
  }

  try {
    const resp = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        query,
        freshness: 'noLimit',
        summary: true,
        count,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => `HTTP ${resp.status}`);
      throw new Error(`搜索API错误(${resp.status}): ${errText.substring(0, 200)}`);
    }

    const data = await resp.json() as Record<string, any>;

    if (data.code !== 200 || !data.data?.webPages?.value) {
      throw new Error(data.msg || '搜索返回空结果');
    }

    const results: SearchResult[] = data.data.webPages.value.map((item: any) => ({
      title: item.name || '',
      url: item.url || '',
      snippet: item.summary || item.snippet || '',
      siteName: item.siteName || '',
      date: item.dateLastCrawled || '',
    }));

    return results;
  } catch (e: any) {
    throw new Error(`联网搜索失败: ${e.message}`);
  }
}

export function formatSearchResultsForLLM(results: SearchResult[]): string {
  if (results.length === 0) return '未找到相关搜索结果。';

  let formatted = '【联网搜索结果】\n\n';
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    formatted += `[${i + 1}] ${r.title}\n`;
    formatted += `来源: ${r.siteName || r.url}\n`;
    formatted += `摘要: ${r.snippet}\n\n`;
  }
  return formatted.trim();
}
