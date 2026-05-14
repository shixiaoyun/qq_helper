import React, { useState, useEffect } from 'react';
import {
  Building2, Loader2, RefreshCw, Search, Shield, Link2, TrendingUp, TrendingDown,
  FileText, Eye, Package, Users, Phone, Globe, Database, ChevronDown, ChevronUp
} from 'lucide-react';

// ==================== 辅助函数：提取值 ====================
function getValue(field: any): any {
  if (field === null || field === undefined) return '';
  if (typeof field === 'object' && 'value' in field) return field.value;
  return field;
}

function getNumber(field: any): number {
  const v = getValue(field);
  if (v === null || v === undefined || v === '') return 0;
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function getString(field: any): string {
  const v = getValue(field);
  if (v === null || v === undefined) return '';
  return String(v);
}

function getSourceTag(field: any): string {
  if (field && typeof field === 'object' && 'source' in field) {
    const s = field.source;
    if (s === 'db') return '数据库';
    if (s === 'calc') return '计算';
    if (s === 'calc2') return '计算2';
    if (s === 'kb') return '知识库';
    if (s === 'niuniuchong') return '牛牛虫';
    return s;
  }
  return '';
}

function sa(arr: any): any[] { return Array.isArray(arr) ? arr : []; }
function saJoin(arr: any, sep: string = ', '): string { return sa(arr).join(sep); }
function saMap(arr: any, fn: (item: any, idx: number) => any): any[] { return sa(arr).map(fn); }

// ==================== 可展开文本组件 ====================
const ExpandableText = React.memo(function ExpandableText({ text, maxLength = 30 }: { text: string; maxLength?: number }) {
  const [expanded, setExpanded] = useState(false);
  if (!text || text === '-') return <span className="text-xs text-muted-foreground">-</span>;
  if (text.length <= maxLength) return <span className="text-xs font-medium text-foreground">{text}</span>;

  return (
    <div className="flex-1 min-w-0">
      <span
        className={`text-xs font-medium text-foreground cursor-pointer hover:text-primary transition-colors ${expanded ? '' : 'truncate block'}`}
        onClick={() => setExpanded(!expanded)}
        title={expanded ? '点击收起' : '点击展开'}
      >
        {expanded ? text : text.slice(0, maxLength) + '...'}
      </span>
      {!expanded && (
        <span className="text-[10px] text-primary ml-1 cursor-pointer hover:underline" onClick={() => setExpanded(true)}>展开</span>
      )}
    </div>
  );
});

// ==================== 紧凑表格行组件 ====================
const CompactRow = React.memo(function CompactRow({
  label,
  value,
  source,
  highlight = false,
  color = '',
  colSpan = 1,
  children,
  expandable = false,
  extra,
}: {
  label: string;
  value?: any;
  source?: string;
  highlight?: boolean;
  color?: string;
  colSpan?: number;
  children?: React.ReactNode;
  expandable?: boolean;
  extra?: React.ReactNode;
}) {
  const displayValue = value === null || value === undefined || value === '' ? '-' : String(value);
  return (
    <div className={`flex items-start py-2 px-3 border-b border-border/30 hover:bg-secondary/20 ${colSpan === 2 ? 'col-span-2' : ''}`}>
      <span className="text-xs text-muted-foreground w-20 flex-shrink-0 pt-0.5">{label}</span>
      {children ? (
        <div className="flex-1 min-w-0">{children}</div>
      ) : expandable ? (
        <div className="flex-1 min-w-0 flex items-start gap-1.5">
          <ExpandableText text={displayValue} />
          {source && (
            <span className="text-[10px] px-1 py-0.5 rounded bg-secondary/60 text-muted-foreground flex-shrink-0 mt-0.5">{source}</span>
          )}
        </div>
      ) : (
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          <span className={`text-xs font-medium truncate ${color || 'text-foreground'} ${highlight ? 'text-base font-bold' : ''}`}>
            {displayValue}
          </span>
          {source && (
            <span className="text-[10px] px-1 py-0.5 rounded bg-secondary/60 text-muted-foreground flex-shrink-0">{source}</span>
          )}
          {extra}
        </div>
      )}
    </div>
  );
});

// ==================== 可展开区块 ====================
const ExpandableSection = React.memo(function ExpandableSection({
  title,
  children,
  defaultOpen = false,
  preview,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  preview?: string;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  useEffect(() => { setIsOpen(defaultOpen); }, [defaultOpen]);

  return (
    <div className="border-b border-border/30">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-2 px-3 hover:bg-secondary/20 transition-colors"
      >
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="text-xs text-muted-foreground flex-shrink-0">{title}</span>
          {!isOpen && preview && (
            <span className="text-xs text-foreground/70 truncate">{preview}</span>
          )}
        </div>
        <span className="text-xs text-primary flex items-center gap-1 flex-shrink-0 ml-2">
          {isOpen ? '收起' : '展开'}
          {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </span>
      </button>
      {isOpen && <div className="px-3 pb-2">{children}</div>}
    </div>
  );
});

// ==================== 主组件 ====================
export default function EnterpriseAnalysisPanel({
  result,
  onReanalyze,
  onWebSearch,
  onlineLoading = false,
  onlineInfo = null,
}: {
  result: any;
  onReanalyze: () => void;
  onWebSearch: () => void;
  onlineLoading?: boolean;
  onlineInfo?: Record<string, any> | null;
}) {
  const [recruitData, setRecruitData] = useState<any[]>([]);
  const [recruitLoading, setRecruitLoading] = useState(false);

  // 获取牛牛虫招聘数据
  useEffect(() => {
    const companyName = getString(result?.company_name);
    if (!companyName || companyName === '-' || companyName === '未知企业') return;

    setRecruitLoading(true);
    fetch(`/api/recruit/db?enterprise=${encodeURIComponent(companyName)}&limit=50`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setRecruitData(data.data || []);
        } else {
          setRecruitData([]);
        }
      })
      .catch(() => setRecruitData([]))
      .finally(() => setRecruitLoading(false));
  }, [result?.company_name]);

  if (!result) return null;

  const companyName = getString(result.company_name);
  const creditCode = getString(result.credit_code || result.v9_credit_code);
  const province = getString(result.province);
  const city = getString(result.city);
  const gbIndustry = getString(result.gb_industry_major);
  const regStatus = getString(result.reg_status);
  const legalPerson = getString(result.legal_person);
  const regCapital = getString(result.reg_capital);
  const insurance = getNumber(result.insurance_count);
  const website = getString(result.website);
  const estDate = getString(result.est_date);
  const companyType = getString(result.company_type);
  const financing = getString(result.financing);
  const stockCode = getString(result.stock_code);

  const getEnterpriseNature = (type: string): { label: string; color: string } => {
    if (!type) return { label: '未知', color: 'bg-gray-500/20 text-gray-400' };
    const t = type.toLowerCase();
    if (t.includes('国有独资') || t.includes('国有控股')) return { label: '国企', color: 'bg-red-500/20 text-red-400' };
    if (t.includes('央企') || (t.includes('国有') && t.includes('集团'))) return { label: '央企', color: 'bg-red-600/20 text-red-500' };
    if (t.includes('上市') || t.includes('股份有限')) return { label: '上市公司', color: 'bg-blue-500/20 text-blue-400' };
    if (t.includes('外商投资') || t.includes('外资') || t.includes('合资')) return { label: '外资/合资', color: 'bg-purple-500/20 text-purple-400' };
    if (t.includes('集体') || t.includes('集体所有制')) return { label: '集体企业', color: 'bg-yellow-500/20 text-yellow-400' };
    if (t.includes('有限合伙') || t.includes('普通合伙')) return { label: '合伙企业', color: 'bg-green-500/20 text-green-400' };
    if (t.includes('有限责任') || t.includes('有限公司')) return { label: '民营', color: 'bg-cyan-500/20 text-cyan-400' };
    if (t.includes('个体') || t.includes('个人独资')) return { label: '个体', color: 'bg-orange-500/20 text-orange-400' };
    return { label: '其他', color: 'bg-gray-500/20 text-gray-400' };
  };
  const enterpriseNature = getEnterpriseNature(companyType);

  const industrySegment = getString(result.industry_segment);

  const percentileScore = getNumber(result.percentile_score);
  const percentileLevel = getString(result.percentile_level);
  const percentileLevelDesc = getString(result.percentile_level_desc);

  const products = Array.isArray(getValue(result.products)) ? getValue(result.products) as string[] : [];
  const v9Products = getString(result.v9_products);
  const coreProduct = getString(result.core_product);
  const deptName = getString(result.dept_name || result.v9_dept);
  const deptPeople = getNumber(result.dept_people);
  const v9Piracy = getNumber(result.v9_piracy);

  const v9IndustryTrend = getString(result.v9_industry_trend);

  const phoneAnalysis = result?.v9_phone_marker?.analysis || {};
  const emailAnalysis = result?.v9_email_marker?.analysis || {};
  const mailTrustResult = result?.v9_mail_trust?.analysis || {};
  const lcStrategyResult = result?.v9_lc_strategy?.analysis || {};
  const visitSopResult = result?.v9_visit_sop?.analysis || {};
  const excludeReason = result?.v9_exclude_reason?.analysis || '';
  const pricingData = result?.pricing_data?.value || {};
  const relatedEnterprises = result?.related_enterprises || null;

  let phoneDisplay = '';
  if (phoneAnalysis.phones?.length > 0) {
    phoneDisplay = phoneAnalysis.phones.map((p: any) => {
      const typeStr = p.type === 'mobile' ? '手机' : (p.type === 'landline' ? '固话' : '未知');
      return `${p.number}(${typeStr})`;
    }).join('; ');
  } else {
    const rawPhone = getString(result.v9_phone_marker?.value || result.v9_phone_marker);
    if (rawPhone.startsWith('[')) {
      try { const parsed = JSON.parse(rawPhone); if (Array.isArray(parsed)) phoneDisplay = parsed.join('; '); else phoneDisplay = rawPhone; }
      catch { phoneDisplay = rawPhone; }
    } else { phoneDisplay = rawPhone; }
  }

  let emailDisplay = '';
  if (emailAnalysis.emails?.length > 0) {
    emailDisplay = emailAnalysis.emails.map((e: any) => {
      const typeStr = e.is_corporate ? '企业邮箱' : '个人邮箱';
      return `${e.address}(${typeStr})`;
    }).join('; ');
  } else {
    const rawEmail = getString(result.v9_email_marker?.value || result.v9_email_marker);
    if (rawEmail.startsWith('[')) {
      try { const parsed = JSON.parse(rawEmail); if (Array.isArray(parsed)) emailDisplay = parsed.join('; '); else emailDisplay = rawEmail; }
      catch { emailDisplay = rawEmail; }
    } else { emailDisplay = rawEmail; }
  }

  const addressDisplay = getString(result.v9_mail_address?.value || result.v9_mail_address);
  const scoreColor = percentileScore >= 80 ? 'text-green-500' : percentileScore >= 60 ? 'text-blue-500' : percentileScore >= 40 ? 'text-yellow-500' : 'text-red-500';

  const v9Cards = result?.v9_cards || null;
  const percentileBreakdown = result?.percentile_breakdown?.value || getString(result?.percentile_breakdown) || '';

  return (
    <div className="bg-secondary/50 border border-border rounded-xl overflow-hidden">
      {/* 顶部标题栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/30">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">{companyName}</span>
          <span className="text-xs px-2 py-0.5 bg-green-500/10 text-green-500 rounded-full">分析完成</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onReanalyze}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded hover:bg-secondary transition-colors">
            <RefreshCw className="w-3 h-3" />
            重新分析
          </button>
          <button onClick={onWebSearch} disabled={onlineLoading}
            className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 px-2 py-1 rounded hover:bg-primary/10 transition-colors disabled:opacity-50">
            {onlineLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
            {onlineLoading ? '搜索中...' : '联网搜索'}
          </button>
        </div>
      </div>

      {/* 本地信息 + 联网信息 两列布局 */}
      <div className="grid grid-cols-1 md:grid-cols-2">
        {/* 本地信息标题 */}
        <div className="col-span-2 flex items-center gap-2 py-1.5 px-3 bg-primary/5 border-b border-primary/10">
          <Database className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-medium text-primary">本地信息</span>
        </div>

        <CompactRow label="百分制评分" value={`${percentileScore.toFixed(1)} ${percentileLevel ? `(${percentileLevel}级)` : ''} ${percentileLevelDesc || ''}`} source={getSourceTag(result.percentile_score)} color={scoreColor} highlight />
        <CompactRow label="盗版数量" value={`${v9Piracy}`} source={getSourceTag(result.v9_piracy)} color={v9Piracy > 0 ? 'text-red-500' : 'text-green-500'} />
        <CompactRow label="匹配产品" value={products.length > 0 ? products.join(', ') : (v9Products || '-')} source={getSourceTag(result.products)} />
        <CompactRow label="核心产品" value={coreProduct} source={getSourceTag(result.core_product)} color="text-primary" />
        <CompactRow label="使用部门" value={deptName} source={getSourceTag(result.dept_name)} />
        <CompactRow label="部门人数" value={deptPeople > 0 ? `${deptPeople}人` : '-'} source={getSourceTag(result.dept_people)} />
        <CompactRow label="行业细分" value={industrySegment || '-'} source={getSourceTag(result.industry_segment)} />
        <CompactRow label="电话标记" value={phoneDisplay || '-'} source={getSourceTag(result.v9_phone_marker)} expandable />
        <CompactRow label="邮箱标记" value={emailDisplay || '-'} source={getSourceTag(result.v9_email_marker)} expandable />
        <CompactRow label="邮寄地址" value={addressDisplay || '-'} source={getSourceTag(result.v9_mail_address)} expandable />
        <CompactRow label="邮寄信任度" value={mailTrustResult.level || getString(result.v9_mail_trust?.value || result.v9_mail_trust) || '-'} source={getSourceTag(result.v9_mail_trust)} />
        <CompactRow label="排除原因" value={excludeReason || getString(result.v9_exclude_reason?.value || result.v9_exclude_reason) || '无排除项'} source={getSourceTag(result.v9_exclude_reason)} />
        <CompactRow label="省份/城市" value={`${province || ''} ${city || ''}`.trim() || '-'} source={getSourceTag(result.province)} />
        <CompactRow label="参保人数" value={insurance > 0 ? String(insurance) : '-'} source={getSourceTag(result.insurance_count)} />
        <CompactRow label="信用代码" value={creditCode || '-'} source="数据库" />
        <CompactRow label="法人" value={legalPerson || '-'} source="数据库" />
        <CompactRow label="注册资本" value={regCapital || '-'} source="数据库" />
        <CompactRow label="经营状态" value={regStatus || '-'} source="数据库" />
        <CompactRow label="成立日期" value={estDate || '-'} source="数据库" />
        <CompactRow label="网址" value={website || '-'} source="数据库" />
        <CompactRow label="行业" value={gbIndustry || '-'} source="数据库" colSpan={2} />
        <CompactRow label="企业类型" value={companyType || '-'} source="数据库" extra={companyType ? <span className={`text-[10px] px-1.5 py-0.5 rounded ${enterpriseNature.color}`}>{enterpriseNature.label}</span> : undefined} />
        <CompactRow label="上市/融资" value={financing || '暂无数据'} source={financing ? '数据库' : '待补充'} />
        <CompactRow label="股票代码" value={stockCode || '暂无数据'} source={stockCode ? '数据库' : '待补充'} />
        <CompactRow label="行业发展趋势" value={v9IndustryTrend || '暂无数据'} source={v9IndustryTrend ? 'V9分析' : '待分析'} colSpan={2} />

        {/* ===== 联网信息 ===== */}
        <div className="col-span-2 flex items-center gap-2 py-1.5 px-3 bg-primary/5 border-b border-primary/10">
          <Globe className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-medium text-primary">联网信息</span>
          {onlineLoading && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
          {!onlineLoading && onlineInfo && <span className="text-xs text-green-500">已获取</span>}
        </div>

        {onlineLoading && (
          <div className="col-span-2 flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" />
            正在获取联网信息...
          </div>
        )}

        {!onlineLoading && !onlineInfo && (
          <div className="col-span-2 flex items-center justify-center py-4 text-xs text-muted-foreground">
            点击上方"联网搜索"按钮获取联网信息
          </div>
        )}

        {onlineInfo && (
          <>
            {/* 企业资质 */}
            {onlineInfo.enterpriseQualification && (
              <>
                <div className="col-span-2 flex items-center gap-1.5 py-1 px-3 bg-secondary/20 border-b border-border/20">
                  <Shield className="w-3 h-3 text-muted-foreground" /><span className="text-[11px] text-muted-foreground font-medium">企业资质</span>
                </div>
                <CompactRow label="资质等级" value={onlineInfo.enterpriseQualification.qualificationLevel || '无'} source="联网" />
                <CompactRow label="资质认证" value={onlineInfo.enterpriseQualification.certifications || '无'} source="联网" />
                <CompactRow label="资质证书" value={onlineInfo.enterpriseQualification.certificates || '-'} source="联网" colSpan={2} expandable />
              </>
            )}

            {/* 企业关联 */}
            {onlineInfo.enterpriseRelation && (
              <>
                <div className="col-span-2 flex items-center gap-1.5 py-1 px-3 bg-secondary/20 border-b border-border/20">
                  <Link2 className="w-3 h-3 text-muted-foreground" /><span className="text-[11px] text-muted-foreground font-medium">企业关联</span>
                </div>
                <CompactRow label="子公司" value={onlineInfo.enterpriseRelation.subsidiaries || '无'} source="联网" />
                <CompactRow label="分公司" value={onlineInfo.enterpriseRelation.branches || '无'} source="联网" />
                <CompactRow label="法人关联" value={onlineInfo.enterpriseRelation.legalPersonRelations || '-'} source="联网" colSpan={2} expandable />
              </>
            )}

            {/* 近期利好 */}
            {onlineInfo.recentGoodNews && (
              <>
                <div className="col-span-2 flex items-center gap-1.5 py-1 px-3 bg-secondary/20 border-b border-border/20">
                  <TrendingUp className="w-3 h-3 text-muted-foreground" /><span className="text-[11px] text-muted-foreground font-medium">近期利好</span>
                </div>
                <CompactRow label="展会" value={onlineInfo.recentGoodNews.exhibitions || '无'} source="联网" />
                <CompactRow label="招聘" value={onlineInfo.recentGoodNews.recruitment || '无'} source="联网" />
                <CompactRow label="获奖" value={onlineInfo.recentGoodNews.awards || '无'} source="联网" />
                <CompactRow label="扩张" value={onlineInfo.recentGoodNews.expansion || '无'} source="联网" />
              </>
            )}

            {/* 负面情况 */}
            {onlineInfo.negativeSituation && (
              <>
                <div className="col-span-2 flex items-center gap-1.5 py-1 px-3 bg-secondary/20 border-b border-border/20">
                  <TrendingDown className="w-3 h-3 text-muted-foreground" /><span className="text-[11px] text-muted-foreground font-medium">负面情况</span>
                </div>
                <CompactRow label="诉讼" value={onlineInfo.negativeSituation.lawsuits || '无'} source="联网" />
                <CompactRow label="限高" value={onlineInfo.negativeSituation.courtOrders || '无'} source="联网" />
                <CompactRow label="欠薪" value={onlineInfo.negativeSituation.wageArrears || '无'} source="联网" />
                <CompactRow label="处罚" value={onlineInfo.negativeSituation.penalties || '无'} source="联网" />
              </>
            )}

            {/* 盗版证据 */}
            {onlineInfo.piracyEvidence && (
              <>
                <div className="col-span-2 flex items-center gap-1.5 py-1 px-3 bg-secondary/20 border-b border-border/20">
                  <FileText className="w-3 h-3 text-muted-foreground" /><span className="text-[11px] text-muted-foreground font-medium">盗版证据</span>
                </div>
                <CompactRow label="证据数量" value={onlineInfo.piracyEvidence.evidenceCount || '无'} source="联网" />
                <CompactRow label="CAD岗位" value={onlineInfo.piracyEvidence.cadPositions || '无'} source="联网" />
                <CompactRow label="证据详情" value={onlineInfo.piracyEvidence.details || '-'} source="联网" colSpan={2} expandable />
              </>
            )}

            {/* 其他关注 */}
            {onlineInfo.otherConcerns && (
              <>
                <div className="col-span-2 flex items-center gap-1.5 py-1 px-3 bg-secondary/20 border-b border-border/20">
                  <Eye className="w-3 h-3 text-muted-foreground" /><span className="text-[11px] text-muted-foreground font-medium">其他关注</span>
                </div>
                <CompactRow label="行业趋势" value={onlineInfo.otherConcerns.industryTrend || '无'} source="联网" />
                <CompactRow label="市场地位" value={onlineInfo.otherConcerns.marketPosition || '无'} source="联网" />
                <CompactRow label="财务健康度" value={onlineInfo.otherConcerns.financialHealth || '无'} source="联网" />
                <CompactRow label="风险因素" value={onlineInfo.otherConcerns.riskFactors || '无'} source="联网" />
              </>
            )}

            {/* 产品使用场景 */}
            {onlineInfo.productUsageScenario && (
              <>
                <div className="col-span-2 flex items-center gap-1.5 py-1 px-3 bg-secondary/20 border-b border-border/20">
                  <Package className="w-3 h-3 text-muted-foreground" /><span className="text-[11px] text-muted-foreground font-medium">产品使用场景</span>
                </div>
                <CompactRow label="使用场景" value={onlineInfo.productUsageScenario.scenarios || '-'} source="联网" colSpan={2} expandable />
                <CompactRow label="使用部门" value={onlineInfo.productUsageScenario.departments || '-'} source="联网" />
                <CompactRow label="工作流程" value={onlineInfo.productUsageScenario.workflow || '无'} source="联网" />
              </>
            )}

            {/* 产品依赖程度 */}
            {onlineInfo.productDependency && (
              <>
                <div className="col-span-2 flex items-center gap-1.5 py-1 px-3 bg-secondary/20 border-b border-border/20">
                  <Link2 className="w-3 h-3 text-muted-foreground" /><span className="text-[11px] text-muted-foreground font-medium">产品依赖程度</span>
                </div>
                <CompactRow label="依赖等级" value={onlineInfo.productDependency.dependencyLevel || '无'} source="联网" />
                <CompactRow label="依赖评分" value={onlineInfo.productDependency.dependencyScore || '无'} source="联网" />
                <CompactRow label="替代方案" value={onlineInfo.productDependency.alternatives || '-'} source="联网" colSpan={2} expandable />
                <CompactRow label="依赖原因" value={onlineInfo.productDependency.reason || '无'} source="联网" colSpan={2} />
              </>
            )}

            {/* 参保人数变化 */}
            {onlineInfo.insuranceChange && (
              <>
                <div className="col-span-2 flex items-center gap-1.5 py-1 px-3 bg-secondary/20 border-b border-border/20">
                  <Users className="w-3 h-3 text-muted-foreground" /><span className="text-[11px] text-muted-foreground font-medium">参保人数变化</span>
                </div>
                <CompactRow label="参保趋势" value={onlineInfo.insuranceChange.trend || '无'} source="联网" />
                <CompactRow label="参保总结" value={onlineInfo.insuranceChange.summary || '无'} source="联网" />
                <CompactRow label="参保明细" value={onlineInfo.insuranceChange.details || '-'} source="联网" colSpan={2} expandable />
              </>
            )}

            {/* 联系方式识别 */}
            {onlineInfo.contactInfo && (
              <>
                <div className="col-span-2 flex items-center gap-1.5 py-1 px-3 bg-secondary/20 border-b border-border/20">
                  <Phone className="w-3 h-3 text-muted-foreground" /><span className="text-[11px] text-muted-foreground font-medium">联系方式识别</span>
                </div>
                <CompactRow label="联系电话" value={onlineInfo.contactInfo.phone || '-'} source="联网" expandable />
                <CompactRow label="联系邮箱" value={onlineInfo.contactInfo.email || '-'} source="联网" expandable />
                <CompactRow label="联系官网" value={onlineInfo.contactInfo.website || '无'} source="联网" />
                <CompactRow label="联系地址" value={onlineInfo.contactInfo.address || '无'} source="联网" expandable />
              </>
            )}
          </>
        )}

        {/* 定价策略 */}
        <div className="col-span-2 border-b border-border/30">
          <ExpandableSection title="定价策略" defaultOpen={false} preview={pricingData?.product ? `${pricingData.product} ¥${pricingData.final_price?.toLocaleString() || '-'} ${pricingData.pricing_strategy || ''}` : '暂无数据'}>
            {pricingData && pricingData.product ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div className="bg-secondary/30 rounded p-2"><div className="text-muted-foreground">产品</div><div className="font-medium">{pricingData.product}</div></div>
                <div className="bg-secondary/30 rounded p-2"><div className="text-muted-foreground">基础价格</div><div className="font-medium">¥{pricingData.base_price?.toLocaleString() || '-'}</div></div>
                <div className="bg-secondary/30 rounded p-2"><div className="text-muted-foreground">最终价格</div><div className="font-medium text-green-500">¥{pricingData.final_price?.toLocaleString() || '-'}</div></div>
                <div className="bg-secondary/30 rounded p-2"><div className="text-muted-foreground">策略</div><div className="font-medium">{pricingData.pricing_strategy || '-'}</div></div>
              </div>
            ) : (<div className="text-xs text-muted-foreground">暂无定价策略数据</div>)}
          </ExpandableSection>
        </div>

        {/* LC策略 */}
        <div className="col-span-2 border-b border-border/30">
          <ExpandableSection title="LC策略" defaultOpen={false} preview={lcStrategyResult?.code ? `${lcStrategyResult.code} ${lcStrategyResult.name} | ${lcStrategyResult.frequency}` : '暂无数据'}>
            {lcStrategyResult && lcStrategyResult.code ? (
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2"><span className="px-1.5 py-0.5 bg-primary/10 text-primary rounded">{lcStrategyResult.code}</span><span className="font-medium">{lcStrategyResult.name}</span></div>
                <div className="text-muted-foreground">跟进频率: {lcStrategyResult.frequency} | 周期: {lcStrategyResult.cycle}</div>
                <div className="space-y-0.5">{saMap(lcStrategyResult.actions, (action: string, i: number) => (<div key={i} className="text-foreground">• {action}</div>))}</div>
              </div>
            ) : (<div className="text-xs text-muted-foreground">暂无LC策略数据</div>)}
          </ExpandableSection>
        </div>

        {/* 访问SOP */}
        <div className="col-span-2 border-b border-border/30">
          <ExpandableSection title="访问SOP" defaultOpen={false} preview={visitSopResult?.code ? `${visitSopResult.code} ${visitSopResult.name} | ${visitSopResult.total_days}` : '暂无数据'}>
            {visitSopResult && visitSopResult.code ? (
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2"><span className="px-1.5 py-0.5 bg-accent/10 text-accent rounded">{visitSopResult.code}</span><span className="font-medium">{visitSopResult.name}</span></div>
                <div className="text-muted-foreground">预计周期: {visitSopResult.total_days} | 所需角色: {saJoin(visitSopResult.required_roles)}</div>
                <div className="space-y-0.5">{saMap(visitSopResult.steps, (step: string, i: number) => (<div key={i} className="text-foreground">{step}</div>))}</div>
              </div>
            ) : (<div className="text-xs text-muted-foreground">暂无访问SOP数据</div>)}
          </ExpandableSection>
        </div>

        {/* 评分明细 */}
        <div className="col-span-2 border-b border-border/30">
          <ExpandableSection title="评分明细" defaultOpen={false} preview={result?.percentile_dimensions ? (() => { const dims = result.percentile_dimensions; const keys = Object.keys(dims); return keys.slice(0, 4).map(k => `${(dims[k] as any).name || k}:${(dims[k] as any).score || 0}/${(dims[k] as any).max || '-'}`).join(' '); })() : '暂无数据'}>
            {result.percentile_dimensions ? (
              <div className="grid grid-cols-4 gap-2 text-xs">
                {Object.entries(result.percentile_dimensions).map(([key, dim]: [string, any]) => (
                  <div key={key} className={`rounded p-2 text-center ${dim.is_penalty ? 'bg-red-500/10 border border-red-500/20' : 'bg-secondary/30'}`}>
                    <div className="text-muted-foreground">{dim.name || key}</div>
                    <div className={`font-medium ${dim.is_penalty ? 'text-red-500' : ''}`}>{dim.score || 0}/{dim.max || '-'}</div>
                  </div>
                ))}
              </div>
            ) : (<div className="text-xs text-muted-foreground">暂无评分明细数据</div>)}
          </ExpandableSection>
        </div>

        {/* V9卡片 */}
        {v9Cards && typeof v9Cards === 'object' && (
          <div className="col-span-2 border-b border-border/30">
            <ExpandableSection title="V9分析卡片" defaultOpen={false} preview={`共${Array.isArray(v9Cards) ? v9Cards.length : Object.keys(v9Cards).length}张分析卡片`}>
              <div className="space-y-2">
                {Array.isArray(v9Cards)
                  ? v9Cards.map((card: any, idx: number) => (
                      <div key={card.id || idx} className="bg-secondary/30 rounded-lg p-3 border border-border/20">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-primary">{card.title || `卡片${idx + 1}`}</span>
                          {card.icon && <span className="text-xs">{card.icon}</span>}
                        </div>
                        {card.conclusion && (
                          <div className="text-xs text-foreground mb-1">{card.conclusion}</div>
                        )}
                        {card.items && card.items.length > 0 && (
                          <div className="space-y-0.5">
                            {card.items.map((item: any, itemIdx: number) => (
                              <div key={itemIdx} className="flex items-center gap-1.5 text-xs">
                                <span className="text-muted-foreground">•</span>
                                <span className="font-medium">{item.label}:</span>
                                <span className={item.color || ''}>{item.value || '-'}</span>
                                {item.unit && <span className="text-muted-foreground ml-0.5">{item.unit}</span>}
                                {item.source && <span className="text-[10px] text-muted-foreground ml-1">({item.source})</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  : Object.entries(v9Cards).map(([key, card]: [string, any]) => {
                      if (!card) return null;
                      return (
                        <div key={key} className="bg-secondary/30 rounded-lg p-3 border border-border/20">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-primary">{card.card_label || key}</span>
                            {card.icon && <span className="text-xs">{card.icon}</span>}
                          </div>
                          {card.conclusion && (
                            <div className="text-xs text-foreground mb-1">{card.conclusion}</div>
                          )}
                          {card.items && card.items.length > 0 && (
                            <div className="space-y-0.5">
                              {card.items.map((item: any, idx: number) => (
                                <div key={idx} className="flex items-center gap-1.5 text-xs">
                                  <span className="text-muted-foreground">•</span>
                                  <span className="font-medium">{item.label}:</span>
                                  <span className={item.color ? item.color : ''}>{item.value || '-'}</span>
                                  {item.source && <span className="text-[10px] text-muted-foreground ml-1">({item.source})</span>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
              </div>
            </ExpandableSection>
          </div>
        )}

        {/* 牛牛虫招聘数据 */}
        <div className="col-span-2 border-b border-border/30">
          <ExpandableSection
            title="牛牛虫招聘爬取"
            defaultOpen={false}
            preview={
              recruitLoading ? '正在查询...' :
              recruitData.length > 0 ? `${recruitData.length}条招聘记录 | ${[...new Set(recruitData.map(r => r.source_platform).filter(Boolean))].join(', ')}` :
              '暂无数据（在牛牛虫系统中搜索后自动保存）'
            }
          >
            {recruitLoading ? (
              <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />正在查询汇总数据库...
              </div>
            ) : recruitData.length > 0 ? (
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                {recruitData.map((r: any, idx: number) => (
                  <div key={r.id || idx} className="bg-secondary/30 rounded-lg p-3 border border-border/20 hover:border-primary/30 transition-colors">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-1.5 mb-2">
                      <div className="text-xs">
                        <span className="text-muted-foreground">企业名称：</span>
                        <span className="font-medium text-foreground">{r.enterprise_name || '-'}</span>
                      </div>
                      <div className="text-xs">
                        <span className="text-muted-foreground">招聘岗位：</span>
                        <span className="font-medium text-primary">{r.job_title || '-'}</span>
                      </div>
                      <div className="text-xs">
                        <span className="text-muted-foreground">工作地点：</span>
                        <span className="font-medium text-foreground">{r.location || '-'}</span>
                      </div>
                      <div className="text-xs">
                        <span className="text-muted-foreground">联系人：</span>
                        <span className="text-foreground">{r.contact_person || '-'}</span>
                      </div>
                      <div className="text-xs">
                        <span className="text-muted-foreground">联系电话：</span>
                        <span className="font-medium text-green-500">{r.phone || '-'}</span>
                      </div>
                      <div className="text-xs">
                        <span className="text-muted-foreground">平台：</span>
                        <span className="px-1 py-0.5 bg-secondary/50 rounded text-[10px]">{r.source_platform || '-'}</span>
                        {r.salary && <span className="ml-1.5 text-muted-foreground">{r.salary}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs border-t border-border/20 pt-2 mt-1">
                      {r.detail_url && (
                        <a href={r.detail_url} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline">
                          <Globe className="w-3 h-3" />
                          详情页网址
                        </a>
                      )}
                      {r.screenshot && (
                        <a href={r.screenshot} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-accent hover:underline ml-3">
                          <Eye className="w-3 h-3" />
                          网页截图
                        </a>
                      )}
                      {r.keyword && (
                        <span className="text-muted-foreground ml-auto">搜索词: {r.keyword}</span>
                      )}
                    </div>
                    {r.description && (
                      <div className="mt-1.5 text-[11px] text-muted-foreground line-clamp-2">{r.description}</div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground space-y-1">
                <p>暂无该企业的招聘爬取记录。</p>
                <p>提示：在<strong>牛牛虫管控中心</strong>搜索该公司后，数据将自动同步至此处。</p>
              </div>
            )}
          </ExpandableSection>
        </div>

        {/* 关联企业 */}
        {relatedEnterprises && relatedEnterprises.length > 0 && (
          <div className="col-span-2 border-b border-border/30">
            <ExpandableSection title="关联企业" defaultOpen={false} preview={`共${relatedEnterprises.reduce((s: number, g: any) => s + (g.enterprises?.length || 0), 0)}家关联企业`}>
              <div className="space-y-2">
                {relatedEnterprises.map((group: any, gi: number) => (
                  <div key={gi} className="bg-secondary/30 rounded-lg p-2 border border-border/20">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-xs font-medium text-foreground">{group.type_label || group.type}</span>
                      {group.evidence && <span className="text-[10px] text-muted-foreground">({group.evidence})</span>}
                    </div>
                    <div className="space-y-0.5">
                      {(group.enterprises || []).map((ent: any, ei: number) => (
                        <div key={ei} className="flex items-center gap-2 text-xs pl-2">
                          <span className="text-foreground">{ent.name}</span>
                          {ent.province && <span className="text-muted-foreground">{ent.province}{ent.city || ''}</span>}
                          {ent.reg_status && <span className={ent.reg_status === '在营' ? 'text-green-500' : 'text-muted-foreground'}>{ent.reg_status}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ExpandableSection>
          </div>
        )}

        {/* 百分制评分分解说明 */}
        {percentileBreakdown && (
          <div className="col-span-2 border-b border-border/30">
            <ExpandableSection title="评分分解说明" defaultOpen={false} preview={percentileBreakdown.substring(0, 60) + (percentileBreakdown.length > 60 ? '...' : '')}>
              <div className="text-xs text-foreground whitespace-pre-wrap">{percentileBreakdown}</div>
            </ExpandableSection>
          </div>
        )}

      </div>
    </div>
  );
}
