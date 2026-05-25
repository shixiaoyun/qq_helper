/**
 * 牛马AI引擎 API 客户端
 * 用于从牛马AI引擎获取企业客户数据
 */

export interface NiumaAdvancedFilterParams {
  province?: string;
  city?: string;
  industry?: string;
  industry_segment?: string;
  product?: string;
  insurance_min?: number;
  insurance_max?: number;
  piracy_min?: number;
  piracy_max?: number;
  capital_min?: number;
  capital_max?: number;
  industry_trend?: string;
  purchasing_level?: string;
  dependency_level?: string;
  score_min?: number;
  score_max?: number;
  customer_score_min?: number;
  customer_score_max?: number;
  page?: number;
  page_size?: number;
}

export interface NiumaEnterpriseData {
  id: number;
  company_name: string;
  province: string;
  city: string;
  gb_industry_major: string;
  insurance_count: number;
  reg_capital: string;
  credit_code: string;
  reg_status: string;
  legal_person: string;
  est_date: string;
  email: string;
  phone: string;
  v9_piracy: number;
  v9_is_qualified: number;
  v9_quality_score: number;
  v9_products: string;
  v9_dept: string;
  v9_customer_score: number;
  v9_industry_segment: string;
  v9_industry_trend: string;
  v9_purchasing_level: string;
  v9_exclude_reason: string;
  dependency_level: string;
  dependency_score: number;
  core_product: string;
}

export interface NiumaApiResponse {
  total: number;
  page: number;
  page_size: number;
  data: NiumaEnterpriseData[];
  error?: string;
}

export interface NiumaConnectionConfig {
  baseUrl: string;
  timeout: number;
  enabled: boolean;
}

const DEFAULT_CONFIG: NiumaConnectionConfig = {
  baseUrl: process.env.NIUMA_ENGINE_URL || 'http://localhost:1077',
  timeout: 30000,
  enabled: true,
};

let connectionConfig: NiumaConnectionConfig = { ...DEFAULT_CONFIG };

function normalizeBaseUrl(rawUrl: string) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error('牛马AI引擎地址未配置');
  }

  let url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('牛马AI引擎地址必须以 http:// 或 https:// 开头');
  }

  url = url.replace(/\/api\/?$/i, '');
  url = url.replace(/\/+$/g, '');
  return url;
}

/**
 * 把 niuma_v10 /api/analysis/single 返回里 { value, source } 形式的字段拍扁成 value
 * 仅用于批量分析场景：前端按扁平字段渲染，对象会触发 React 渲染错误把整页卸载
 */
export function flattenNiumaResult(raw: any): Record<string, any> {
  if (!raw || typeof raw !== 'object') return raw;
  const out: Record<string, any> = {};
  for (const [key, val] of Object.entries(raw)) {
    if (val && typeof val === 'object' && !Array.isArray(val) && 'value' in (val as any)) {
      out[key] = (val as any).value;
    } else {
      out[key] = val;
    }
  }
  // 前端批量结果列期望 v9_quality_score，但 niuma_v10 实际字段是 percentile_score / v9_score
  if (out.v9_quality_score === undefined) {
    if (out.percentile_score !== undefined) out.v9_quality_score = out.percentile_score;
    else if (out.v9_score !== undefined) out.v9_quality_score = out.v9_score;
  }
  return out;
}

export function setConnectionConfig(config: Partial<NiumaConnectionConfig>) {
  const normalized: Partial<NiumaConnectionConfig> = { ...config };
  if (normalized.baseUrl !== undefined) {
    normalized.baseUrl = normalizeBaseUrl(String(normalized.baseUrl));
  }
  connectionConfig = { ...connectionConfig, ...normalized };
}

export function getConnectionConfig(): NiumaConnectionConfig {
  return { ...connectionConfig };
}

/**
 * 调用牛马AI引擎高级筛选API
 * 如果外部引擎不可用，自动回退到本地Mock服务
 */
export async function fetchAdvancedAnalysis(
  params: NiumaAdvancedFilterParams = {}
): Promise<NiumaApiResponse> {
  if (!connectionConfig.enabled) {
    throw new Error('牛马AI引擎连接已禁用');
  }

  const queryParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      queryParams.append(key, String(value));
    }
  });

  const baseUrl = normalizeBaseUrl(connectionConfig.baseUrl);
  const externalUrl = `${baseUrl}/api/analysis/advanced?${queryParams.toString()}`;
  const localMockUrl = `http://localhost:${process.env.PORT || 1031}/api/analysis/advanced?${queryParams.toString()}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), connectionConfig.timeout);

  try {
    const response = await fetch(externalUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`牛马AI引擎返回错误: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    return result as NiumaApiResponse;
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    // 外部引擎不可用，回退到本地Mock服务
    console.warn(`外部牛马AI引擎不可用: ${error.message}，回退到本地Mock服务`);
    
    try {
      const mockResponse = await fetch(localMockUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });
      
      if (!mockResponse.ok) {
        throw new Error(`本地Mock服务返回错误: ${mockResponse.status}`);
      }
      
      const result = await mockResponse.json();
      return result as NiumaApiResponse;
    } catch (mockError: any) {
      throw new Error(`外部引擎和本地Mock服务均不可用: ${mockError.message}`);
    }
  }
}

/**
 * 调用牛马AI引擎企业搜索API
 */
export async function searchEnterprises(keyword: string, page = 1, pageSize = 20): Promise<NiumaApiResponse> {
  if (!connectionConfig.enabled) {
    throw new Error('牛马AI引擎连接已禁用');
  }

  const queryParams = new URLSearchParams();
  queryParams.append('keyword', keyword);
  queryParams.append('page', String(page));
  queryParams.append('page_size', String(pageSize));

  const baseUrl = normalizeBaseUrl(connectionConfig.baseUrl);
  const url = `${baseUrl}/api/enterprise/search?${queryParams.toString()}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), connectionConfig.timeout);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`牛马AI引擎返回错误: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    return result as NiumaApiResponse;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('请求牛马AI引擎超时');
    }
    throw new Error(`连接牛马AI引擎失败: ${error.message}`);
  }
}

/**
 * 获取牛马AI引擎数据库字段信息
 */
export async function fetchAnalysisFields(): Promise<any> {
  if (!connectionConfig.enabled) {
    throw new Error('牛马AI引擎连接已禁用');
  }

  const baseUrl = normalizeBaseUrl(connectionConfig.baseUrl);
  const url = `${baseUrl}/api/analysis/fields`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), connectionConfig.timeout);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`牛马AI引擎返回错误: ${response.status}`);
    }

    return await response.json();
  } catch (error: any) {
    clearTimeout(timeoutId);
    throw new Error(`获取字段信息失败: ${error.message}`);
  }
}

/**
 * 健康检查
 * 1077 上 /api/analysis/fields 已下线；用 /api/analysis/advanced?page_size=1 作为存活探针
 * （该端点稳定返回 JSON，即使空结果或参数报错也会回 200 + error 字段，能区分"服务在"与"服务死"）
 */
export async function checkNiumaEngineHealth(): Promise<{ ok: boolean; latency: number; error?: string }> {
  const start = Date.now();
  const baseUrl = normalizeBaseUrl(connectionConfig.baseUrl);
  try {
    const response = await fetch(`${baseUrl}/api/analysis/advanced?page_size=1`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    const latency = Date.now() - start;
    return { ok: response.ok, latency };
  } catch (error: any) {
    return { ok: false, latency: Date.now() - start, error: error.message };
  }
}
