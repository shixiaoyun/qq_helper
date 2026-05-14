/**
 * 牛马AI引擎数据映射转换层
 * 将牛马引擎的企业字段映射到OQ助手CRM客户模型
 */

import type { NiumaEnterpriseData } from './niumaEngineClient.js';

export interface MappedCustomer {
  name: string;
  company: string;
  phone: string;
  email: string;
  address: string;
  industry: string;
  status: string;
  source: string;
  vendor: string;
  product_interest: string[];
  budget_range: string;
  urgency_level: number;
  notes: string;
  niuma_id: number;
  niuma_metadata: string;
}

export interface MappingRule {
  sourceField: string;
  targetField: string;
  transform?: 'string' | 'number' | 'json' | 'concat' | 'custom';
  customFn?: (value: any, raw: NiumaEnterpriseData) => any;
  defaultValue?: any;
}

// 默认映射规则
export const DEFAULT_MAPPING_RULES: MappingRule[] = [
  { sourceField: 'company_name', targetField: 'name', transform: 'string' },
  { sourceField: 'company_name', targetField: 'company', transform: 'string' },
  { sourceField: 'phone', targetField: 'phone', transform: 'string', defaultValue: '' },
  { sourceField: 'email', targetField: 'email', transform: 'string', defaultValue: '' },
  {
    sourceField: 'province',
    targetField: 'address',
    transform: 'custom',
    customFn: (_v: any, raw: NiumaEnterpriseData) => {
      const parts = [raw.province, raw.city].filter(Boolean);
      return parts.join(' ');
    },
  },
  { sourceField: 'gb_industry_major', targetField: 'industry', transform: 'string', defaultValue: '其他' },
  {
    sourceField: 'v9_piracy',
    targetField: 'status',
    transform: 'custom',
    customFn: (v: any) => {
      const piracy = Number(v) || 0;
      if (piracy >= 80) return 'hot';
      if (piracy >= 50) return 'warm';
      if (piracy >= 20) return 'cold';
      return 'lead';
    },
  },
  {
    sourceField: 'v9_piracy',
    targetField: 'source',
    transform: 'custom',
    customFn: (_v: any, raw: NiumaEnterpriseData) => {
      return `牛马引擎-盗版分析-${raw.v9_industry_segment || '未知'}`;
    },
  },
  {
    sourceField: 'v9_industry_segment',
    targetField: 'vendor',
    transform: 'custom',
    customFn: (v: any) => {
      const segment = String(v || '').toLowerCase();
      if (segment.includes('autodesk')) return 'autodesk';
      if (segment.includes('adobe')) return 'adobe';
      if (segment.includes('microsoft')) return 'microsoft';
      if (segment.includes('达索')) return 'dassault';
      if (segment.includes('西门子')) return 'siemens';
      if (segment.includes('ptc')) return 'ptc';
      return 'autodesk';
    },
  },
  {
    sourceField: 'v9_products',
    targetField: 'product_interest',
    transform: 'custom',
    customFn: (v: any) => {
      if (!v) return [];
      return String(v).split(/[,，;；]/).map((s: string) => s.trim()).filter(Boolean);
    },
  },
  {
    sourceField: 'reg_capital',
    targetField: 'budget_range',
    transform: 'custom',
    customFn: (v: any) => {
      const capital = String(v || '');
      const num = parseFloat(capital.replace(/[^0-9.]/g, ''));
      if (isNaN(num)) return 'unknown';
      if (num >= 10000) return 'enterprise';
      if (num >= 1000) return 'large';
      if (num >= 500) return 'medium';
      if (num >= 100) return 'small';
      return 'startup';
    },
  },
  {
    sourceField: 'v9_piracy',
    targetField: 'urgency_level',
    transform: 'custom',
    customFn: (v: any) => {
      const piracy = Number(v) || 0;
      if (piracy >= 80) return 5;
      if (piracy >= 60) return 4;
      if (piracy >= 40) return 3;
      if (piracy >= 20) return 2;
      return 1;
    },
  },
  {
    sourceField: 'v9_piracy',
    targetField: 'notes',
    transform: 'custom',
    customFn: (_v: any, raw: NiumaEnterpriseData) => {
      const lines: string[] = [];
      lines.push(`【牛马AI引擎数据】`);
      lines.push(`盗版指数: ${raw.v9_piracy}`);
      lines.push(`质量评分: ${raw.v9_quality_score}`);
      lines.push(`客户评分: ${raw.v9_customer_score}`);
      lines.push(`行业细分: ${raw.v9_industry_segment || '无'}`);
      lines.push(`行业趋势: ${raw.v9_industry_trend || '无'}`);
      lines.push(`采购级别: ${raw.v9_purchasing_level || '无'}`);
      lines.push(`依赖程度: ${raw.dependency_level || '无'}`);
      lines.push(`核心产品: ${raw.core_product || '无'}`);
      lines.push(`参保人数: ${raw.insurance_count || 0}`);
      lines.push(`注册资本: ${raw.reg_capital || '无'}`);
      lines.push(`法人: ${raw.legal_person || '无'}`);
      lines.push(`统一代码: ${raw.credit_code || '无'}`);
      lines.push(`成立日期: ${raw.est_date || '无'}`);
      return lines.join('\n');
    },
  },
  { sourceField: 'id', targetField: 'niuma_id', transform: 'number' },
  {
    sourceField: 'id',
    targetField: 'niuma_metadata',
    transform: 'custom',
    customFn: (_v: any, raw: NiumaEnterpriseData) => JSON.stringify(raw),
  },
];

let activeMappingRules: MappingRule[] = [...DEFAULT_MAPPING_RULES];

export function setMappingRules(rules: MappingRule[]) {
  activeMappingRules = [...rules];
}

export function getMappingRules(): MappingRule[] {
  return [...activeMappingRules];
}

export function resetMappingRules() {
  activeMappingRules = [...DEFAULT_MAPPING_RULES];
}

/**
 * 将单个牛马引擎企业数据映射为CRM客户
 */
export function mapEnterpriseToCustomer(raw: NiumaEnterpriseData): MappedCustomer {
  const result: any = {};

  for (const rule of activeMappingRules) {
    const sourceValue = (raw as any)[rule.sourceField];
    let targetValue: any;

    if (sourceValue === undefined || sourceValue === null || sourceValue === '') {
      targetValue = rule.defaultValue;
    } else {
      switch (rule.transform) {
        case 'string':
          targetValue = String(sourceValue);
          break;
        case 'number':
          targetValue = Number(sourceValue);
          break;
        case 'json':
          targetValue = typeof sourceValue === 'string' ? sourceValue : JSON.stringify(sourceValue);
          break;
        case 'concat':
          targetValue = String(sourceValue);
          break;
        case 'custom':
          targetValue = rule.customFn ? rule.customFn(sourceValue, raw) : sourceValue;
          break;
        default:
          targetValue = sourceValue;
      }
    }

    result[rule.targetField] = targetValue;
  }

  return result as MappedCustomer;
}

/**
 * 批量映射
 */
export function mapEnterprisesToCustomers(rawList: NiumaEnterpriseData[]): MappedCustomer[] {
  return rawList.map(mapEnterpriseToCustomer);
}

/**
 * 获取可用的源字段列表（来自牛马引擎）
 */
export function getAvailableSourceFields(): { field: string; label: string; type: string }[] {
  return [
    { field: 'company_name', label: '企业名称', type: 'string' },
    { field: 'province', label: '省份', type: 'string' },
    { field: 'city', label: '城市', type: 'string' },
    { field: 'gb_industry_major', label: '行业大类', type: 'string' },
    { field: 'insurance_count', label: '参保人数', type: 'number' },
    { field: 'reg_capital', label: '注册资本', type: 'string' },
    { field: 'credit_code', label: '统一信用代码', type: 'string' },
    { field: 'reg_status', label: '注册状态', type: 'string' },
    { field: 'legal_person', label: '法人', type: 'string' },
    { field: 'est_date', label: '成立日期', type: 'string' },
    { field: 'email', label: '邮箱', type: 'string' },
    { field: 'phone', label: '电话', type: 'string' },
    { field: 'v9_piracy', label: '盗版指数', type: 'number' },
    { field: 'v9_quality_score', label: '质量评分', type: 'number' },
    { field: 'v9_customer_score', label: '客户评分', type: 'number' },
    { field: 'v9_products', label: '产品列表', type: 'string' },
    { field: 'v9_industry_segment', label: '行业细分', type: 'string' },
    { field: 'v9_industry_trend', label: '行业趋势', type: 'string' },
    { field: 'v9_purchasing_level', label: '采购级别', type: 'string' },
    { field: 'dependency_level', label: '依赖程度', type: 'string' },
    { field: 'dependency_score', label: '依赖评分', type: 'number' },
    { field: 'core_product', label: '核心产品', type: 'string' },
  ];
}

/**
 * 获取可用的目标字段列表（CRM客户模型）
 */
export function getAvailableTargetFields(): { field: string; label: string; type: string }[] {
  return [
    { field: 'name', label: '客户名称', type: 'string' },
    { field: 'company', label: '公司名称', type: 'string' },
    { field: 'phone', label: '电话', type: 'string' },
    { field: 'email', label: '邮箱', type: 'string' },
    { field: 'address', label: '地址', type: 'string' },
    { field: 'industry', label: '行业', type: 'string' },
    { field: 'status', label: '状态', type: 'string' },
    { field: 'source', label: '来源', type: 'string' },
    { field: 'vendor', label: '厂商', type: 'string' },
    { field: 'product_interest', label: '感兴趣产品', type: 'json' },
    { field: 'budget_range', label: '预算范围', type: 'string' },
    { field: 'urgency_level', label: '紧急程度', type: 'number' },
    { field: 'notes', label: '备注', type: 'string' },
    { field: 'niuma_id', label: '牛马引擎ID', type: 'number' },
    { field: 'niuma_metadata', label: '牛马元数据', type: 'json' },
  ];
}
