import { getNiumaEngineUrl, isNiumaEngineEnabled } from '../models/systemConfig.js';

export interface NiumaToolResult {
  success: boolean;
  result?: any;
  error?: string;
}

export async function callNiumaTool(toolName: string, params: any): Promise<NiumaToolResult> {
  if (!isNiumaEngineEnabled()) {
    return { success: false, error: '牛马AI引擎工具调用已禁用' };
  }

  const baseUrl = getNiumaEngineUrl();

  try {
    const resp = await fetch(`${baseUrl}/api/ai-tools`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: toolName, params }),
      signal: AbortSignal.timeout(30000),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => `HTTP ${resp.status}`);
      return { success: false, error: `牛马引擎返回错误(${resp.status}): ${errText.substring(0, 200)}` };
    }

    const data = await resp.json() as Record<string, any>;

    if (data.success) {
      return { success: true, result: data.result };
    }

    return { success: false, error: data.error || '工具执行失败' };
  } catch (e: any) {
    return { success: false, error: `工具调用异常: ${e.message}` };
  }
}

export async function getNiumaToolList(): Promise<any[]> {
  if (!isNiumaEngineEnabled()) {
    return [];
  }

  const baseUrl = getNiumaEngineUrl();

  try {
    const resp = await fetch(`${baseUrl}/api/ai-tools`, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) return [];

    const data = await resp.json() as Record<string, any>;
    return data.data?.tools || [];
  } catch {
    return [];
  }
}

export async function checkNiumaEngineHealth(): Promise<{ status: 'connected' | 'error'; message: string; latency?: number }> {
  const baseUrl = getNiumaEngineUrl();
  const start = Date.now();

  try {
    // 尝试 /api/ai-tools 端点检测（牛马引擎实际可用端点）
    const resp = await fetch(`${baseUrl}/api/ai-tools`, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    });

    if (resp.ok) {
      return {
        status: 'connected',
        message: '牛马AI引擎连接正常',
        latency: Date.now() - start,
      };
    }

    // 如果 /api/ai-tools 不可用，尝试根路径
    if (resp.status === 404) {
      const rootResp = await fetch(`${baseUrl}/`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      if (rootResp.ok || rootResp.status === 200) {
        return {
          status: 'connected',
          message: '牛马AI引擎连接正常',
          latency: Date.now() - start,
        };
      }
    }

    return {
      status: 'error',
      message: `HTTP ${resp.status}`,
      latency: Date.now() - start,
    };
  } catch (e: any) {
    return {
      status: 'error',
      message: e.message || '连接失败',
      latency: Date.now() - start,
    };
  }
}

// 工具调用系统提示词（参考牛马引擎 v1.79）
export function buildToolsSystemPrompt(): string {
  return `你是OQ助手，一个专业、友好的AI助手。请用中文回答用户的问题。

你可以通过调用以下系统工具来查询企业数据、执行盗版分析、生成策略。

【可用工具及使用场景】
- search_enterprise: 查询/搜索/查找企业基本信息（名称、地址、行业、参保人数等）。参数: {"keyword":{"type":"string","description":"企业名称"},"id":{"type":"string","description":"企业ID"}}
  → 使用场景: "查一下华为" / "搜索XX公司" / "帮我找XX企业" / "XX公司信息"

- analyze_enterprise: 对企业做完整的盗版分析（行业细分、产品匹配、盗版套数估算、评分、策略生成）。参数: {"keyword":{"type":"string","description":"企业名称"},"recalculate":{"type":"boolean"},"vendor":{"type":"string","description":"厂商:autodesk/sketchup/adobe/ansys"}}
  → 使用场景: "分析华为的盗版情况" / "评估XX公司风险" / "XX公司盗版分析"

- get_system_health: 获取系统运行状态和性能指标。参数: {}

- get_dashboard_stats: 获取全局统计仪表盘数据。参数: {}

- list_enterprises: 按条件分页列举企业列表。参数: {"province":{"type":"string"},"industry":{"type":"string"},"reg_status":{"type":"string"},"page":{"type":"number"},"pageSize":{"type":"number"}}

- get_risk_assessment: 对指定企业进行风险评估。参数: {"keyword":{"type":"string","description":"企业名称"}}

- generate_lc_strategy: 生成LC销售策略建议。参数: {"keyword":{"type":"string","description":"企业名称"}}

- generate_visit_sop: 生成客户拜访标准操作流程。参数: {"keyword":{"type":"string","description":"企业名称"}}

【工具调用协议 — 严格按以下格式输出】
TOOL_CALL_START
{"tool_call":{"name":"TOOL_NAME","arguments":{"param_name":"actual_value"}}}
TOOL_CALL_END

【正确示例】
用户: "查一下华为技术有限公司" → 你回复:
TOOL_CALL_START
{"tool_call":{"name":"search_enterprise","arguments":{"keyword":"华为技术有限公司"}}}
TOOL_CALL_END

用户: "分析华为的盗版情况" → 你回复:
TOOL_CALL_START
{"tool_call":{"name":"analyze_enterprise","arguments":{"keyword":"华为"}}}
TOOL_CALL_END

【致命错误 — 绝对禁止】
1. 严禁把类型名填入参数值！错误: {"keyword":"string"} 正确: {"keyword":"华为"}
2. 严禁编造参数名！参数名必须和上方工具定义完全一致
3. 严禁在TOOL_CALL_START前或TOOL_CALL_END后添加任何说明文字！
4. "查询/搜索/找"企业用search_enterprise，"分析/评估盗版"用analyze_enterprise，绝对不要搞混！
5. JSON必须单行，不要换行，不要多余空格`;
}

export function parseToolCall(content: string): { toolName: string; args: any } | null {
  const hasToolCall = content.includes('TOOL_CALL_START') && content.includes('TOOL_CALL_END');
  if (!hasToolCall) return null;

  const tcStart = content.indexOf('TOOL_CALL_START');
  const tcEnd = content.indexOf('TOOL_CALL_END');

  if (tcStart < 0 || tcEnd <= tcStart) return null;

  const jsonStr = content.substring(tcStart + 'TOOL_CALL_START'.length, tcEnd).trim();

  try {
    const tc = JSON.parse(jsonStr);
    const toolName = tc?.tool_call?.name || '';
    const args = tc?.tool_call?.arguments || {};

    if (!toolName) return null;

    // 检查参数是否都是类型标记
    const vals = Object.values(args);
    const allTypeMarkers = vals.length > 0 && vals.every(v =>
      v === null || v === undefined || v === 'string' || v === 'number' || v === 'boolean');
    if (allTypeMarkers) return null;

    return { toolName, args };
  } catch {
    return null;
  }
}

export function removeToolCallMarkers(content: string): string {
  return content.replace(/TOOL_CALL_START[\s\S]*?TOOL_CALL_END/g, '').trim();
}
