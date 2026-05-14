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

export function setConnectionConfig(config: Partial<NiumaConnectionConfig>) {
  connectionConfig = { ...connectionConfig, ...config };
}

export function getConnectionConfig(): NiumaConnectionConfig {
  return { ...connectionConfig };
}

/**
 * 调用牛马AI引擎高级筛选API
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

  const url = `${connectionConfig.baseUrl}/api/analysis/advanced?${queryParams.toString()}`;

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

  const url = `${connectionConfig.baseUrl}/api/enterprise/search?${queryParams.toString()}`;

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

  const url = `${connectionConfig.baseUrl}/api/analysis/fields`;

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
 */
export async function checkNiumaEngineHealth(): Promise<{ ok: boolean; latency: number; error?: string }> {
  const start = Date.now();
  try {
    const response = await fetch(`${connectionConfig.baseUrl}/api/analysis/fields`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    const latency = Date.now() - start;
    return { ok: response.ok, latency };
  } catch (error: any) {
    return { ok: false, latency: Date.now() - start, error: error.message };
  }
}
