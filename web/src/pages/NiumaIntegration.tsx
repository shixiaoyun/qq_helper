import { useState, useEffect, useCallback } from 'react'
import {
  Settings, Database, ArrowDownToLine, Activity, RefreshCw,
  CheckCircle, AlertCircle, Loader2, Server, Link2, BarChart3,
  Users, TrendingUp, Gauge, RotateCcw, Filter, MapPin,
  Building2, Star, Shield, Eye, Download, SlidersHorizontal,
  X, Check, Search, Play, Trash2,
  FileText, Upload, Download as DownloadIcon, BookOpen, Globe, Phone, Package,
} from 'lucide-react'
import { api } from '../lib/api'
import EnterpriseAnalysisPanel from '../components/EnterpriseAnalysisPanel'

interface Tab {
  id: string
  label: string
  icon: any
}

const tabs: Tab[] = [
  { id: 'single', label: '单企业分析', icon: Search },
  { id: 'batch', label: '批量分析', icon: Database },
  { id: 'advanced', label: '高级筛选', icon: Filter },
  { id: 'import', label: '客户导入', icon: ArrowDownToLine },
  { id: 'knowledge', label: '知识库', icon: BookOpen },
  { id: 'config', label: '连接配置', icon: Settings },
  { id: 'monitor', label: '监控面板', icon: Activity },
]

export default function NiumaIntegrationPage() {
  const [activeTab, setActiveTab] = useState('single')
  const [toast, setToast] = useState<{ type: string; message: string } | null>(null)

  const showToast = (type: string, message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3000)
  }

  const fetchApi = useCallback(async (url: string, options?: RequestInit) => {
    const res = await api.request({
      url,
      method: (options?.method as any) || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers as any),
      },
      data: options?.body ? JSON.parse(options.body as string) : undefined,
    })
    const data = res.data
    if (!data.success) throw new Error(data.error || '请求失败')
    return data
  }, [])

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <Database className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold">牛马AI引擎集成</h1>
            <p className="text-xs text-muted-foreground">盗版分析 · 单企业/批量/高级筛选 · 客户导入CRM</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 pt-4">
        <div className="flex gap-1 p-1 bg-secondary/50 rounded-xl">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeTab === tab.id
                    ? 'gradient-primary text-white shadow-glow'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'single' && <SingleAnalysisPanel fetchApi={fetchApi} showToast={showToast} />}
        {activeTab === 'batch' && <BatchAnalysisPanel fetchApi={fetchApi} showToast={showToast} />}
        {activeTab === 'advanced' && <AdvancedFilterPanel fetchApi={fetchApi} showToast={showToast} />}
        {activeTab === 'import' && <ImportPanel fetchApi={fetchApi} showToast={showToast} />}
        {activeTab === 'knowledge' && <KnowledgePanel fetchApi={fetchApi} showToast={showToast} />}
        {activeTab === 'config' && <ConfigPanel fetchApi={fetchApi} showToast={showToast} />}
        {activeTab === 'monitor' && <MonitorPanel fetchApi={fetchApi} showToast={showToast} />}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-xl shadow-glow-lg z-50 flex items-center gap-2 text-sm font-medium animate-fade-in-scale ${
          toast.type === 'success' ? 'bg-green-500/90 text-white' :
          toast.type === 'error' ? 'bg-red-500/90 text-white' :
          'bg-primary/90 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> :
           toast.type === 'error' ? <AlertCircle className="w-4 h-4" /> :
           <Activity className="w-4 h-4" />}
          {toast.message}
        </div>
      )}
    </div>
  )
}

// ==========================================
// 单企业分析面板 - V1.79 对齐版
// ==========================================
function CompactRow({ label, value, source, color, highlight, colSpan }: {
  label: string; value: string; source?: any; color?: string; highlight?: boolean; colSpan?: boolean;
}) {
  return (
    <div className={`flex justify-between items-center py-1 px-3 border-b border-border/10 text-xs ${colSpan ? 'col-span-2' : ''}`}>
      <span className="text-muted-foreground truncate max-w-[45%]">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className={`font-medium truncate max-w-[140px] ${color || ''} ${highlight ? 'font-semibold' : ''}`}>
          {value || '-'}
        </span>
        {source && <span className="text-[10px] px-1 py-0.5 rounded bg-secondary/50 text-muted-foreground">{source}</span>}
      </div>
    </div>
  )
}

function SectionHeader({ icon: Icon, label, color }: { icon: any; label: string; color?: string }) {
  return (
    <div className={`col-span-2 flex items-center gap-1.5 py-1 px-3 bg-secondary/30 border-b border-border/20 ${color || ''}`}>
      <Icon className="w-3 h-3 text-muted-foreground" />
      <span className="text-[11px] text-muted-foreground font-medium">{label}</span>
    </div>
  )
}

function SingleAnalysisPanel({ fetchApi, showToast }: any) {
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [onlineInfo, setOnlineInfo] = useState<any>(null)
  const [onlineLoading, setOnlineLoading] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})

  const toggleSection = (key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const val = (data: any) => {
    if (!data) return '-'
    if (typeof data === 'object' && data !== null && 'value' in data) return data.value
    return data
  }

  const sourceTag = (data: any) => {
    if (!data || typeof data !== 'object' || !data.source) return null
    const colorMap: Record<string, string> = {
      db: 'bg-blue-100 text-blue-700',
      calc: 'bg-purple-100 text-purple-700',
      kb: 'bg-orange-100 text-orange-700',
      niuniuchong: 'bg-green-100 text-green-700',
      mock: 'bg-gray-100 text-gray-600',
    }
    return (
      <span className={`text-[10px] px-1 py-0.5 rounded ${colorMap[data.source] || 'bg-gray-100 text-gray-500'}`}>
        {data.source}
      </span>
    )
  }

  const safeVal = (data: any) => val(data)
  const safeSrc = (data: any) => sourceTag(data)

  const search = async (recalculate = false) => {
    if (!keyword.trim()) return
    setLoading(true)
    if (!recalculate) setResult(null)
    try {
      const url = `/api/niuma/analysis/single?keyword=${encodeURIComponent(keyword.trim())}${recalculate ? '&recalculate=true' : ''}`
      const data = await fetchApi(url)
      const analysisData = data.data?.data || data.data
      setResult(analysisData)
    } catch (err: any) {
      showToast('error', err.message || '分析失败')
    } finally {
      setLoading(false)
    }
  }

  const fetchOnlineInfo = async (name: string) => {
    setOnlineLoading(true)
    try {
      const cardTypes = [
        'enterpriseQualification',
        'enterpriseRelation',
        'recentGoodNews',
        'negativeSituation',
        'piracyEvidence',
        'otherConcerns',
        'productUsageScenario',
        'productDependency',
        'insuranceChange',
        'contactInfo',
      ]
      const results: Record<string, any> = {}
      await Promise.all(cardTypes.map(async (cardType) => {
        try {
          const data = await fetchApi('/api/niuma/online-info', {
            method: 'POST',
            body: JSON.stringify({ enterpriseName: name, cardType }),
            headers: { 'Content-Type': 'application/json' },
          })
          if (data.data) results[cardType] = data.data
        } catch {
          // 单个cardType失败不影响其他
        }
      }))
      setOnlineInfo(results)
      showToast('success', '联网信息获取完成')
    } catch {
      showToast('error', '联网信息获取失败')
    } finally {
      setOnlineLoading(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* 搜索栏 */}
      <div className="flex gap-3 mb-6">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder="输入企业全称、简称或关键词..."
            className="w-full pl-10 pr-4 py-3 bg-background border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <button
          onClick={() => search(false)}
          disabled={loading || !keyword.trim()}
          className="flex items-center gap-2 px-6 py-3 gradient-primary text-white rounded-xl text-sm font-medium disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          {loading ? '分析中...' : '分析'}
        </button>
      </div>

      {result && (
        <EnterpriseAnalysisPanel
          result={result}
          onReanalyze={() => search(true)}
          onWebSearch={() => fetchOnlineInfo(safeVal(result.company_name))}
          onlineLoading={onlineLoading}
          onlineInfo={onlineInfo}
        />
      )}

      {false && result && (
        <div className="space-y-6">
          {/* ========== 企业头部 ========== */}
          <div className="border rounded-xl p-5">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-lg font-bold">
                  {(safeVal(result.company_name) || '企')[0]}
                </div>
                <div>
                  <h2 className="text-lg font-bold">{safeVal(result.company_name)}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${safeVal(result.reg_status) === '存续' ? 'text-green-600 bg-green-50 border-green-200' : 'text-gray-500 bg-gray-100'}`}>
                      {safeVal(result.reg_status)}
                    </span>
                    {safeSrc(result.reg_status)}
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${
                      safeVal(result.percentile_level) === 'A' ? 'border-green-500 bg-green-50 text-green-700' :
                      safeVal(result.percentile_level) === 'B' ? 'border-blue-500 bg-blue-50 text-blue-700' :
                      safeVal(result.percentile_level) === 'C' ? 'border-yellow-500 bg-yellow-50 text-yellow-700' :
                      'border-red-400 bg-red-50 text-red-600'
                    }`}>
                      {safeVal(result.percentile_level)}级 · {safeVal(result.percentile_score)}分
                    </span>
                    {safeSrc(result.percentile_score)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchOnlineInfo(safeVal(result.company_name))}
                  disabled={onlineLoading}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs border rounded-lg hover:bg-secondary transition-colors"
                >
                  {onlineLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
                  联网信息
                </button>
              </div>
            </div>
          </div>

          {/* ========== 关键指标卡片 ========== */}
          <div className="grid grid-cols-5 gap-4">
            {[
              { label: '盗版数量', value: safeVal(result.v9_piracy), unit: '个', type: 'number' },
              { label: '质量评分', value: safeVal(result.v9_quality_score), unit: '分', type: 'number' },
              { label: '客户评分', value: safeVal(result.v9_customer_score), unit: '分', type: 'number' },
              { label: '依赖评分', value: result.dependency_score, unit: '分', type: 'number' },
              { label: '百分制评分', value: `${safeVal(result.percentile_level)} · ${safeVal(result.percentile_score)}`, unit: '分', type: 'text' },
            ].map((item, idx) => (
              <div key={idx} className="p-4 border rounded-xl">
                <div className="text-xs text-muted-foreground mb-1">{item.label}</div>
                <div className="text-lg font-bold">{item.value}</div>
                {item.unit && <div className="text-[10px] text-muted-foreground">{item.unit}</div>}
              </div>
            ))}
          </div>

          {/* ========== 双列详细信息 ========== */}
          <div className="border rounded-xl p-5">
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-500" />
              本地信息
            </h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              {[
                { label: '统一社会信用代码', key: 'credit_code' },
                { label: '法定代表人', key: 'legal_person' },
                { label: '省份/城市', key: 'province', custom: () => `${safeVal(result.province)} / ${safeVal(result.city)}` },
                { label: '行业大类', key: 'gb_industry_major' },
                { label: '行业细分', key: 'v9_industry_segment' },
                { label: '注册资本', key: 'reg_capital' },
                { label: '成立日期', key: 'est_date' },
                { label: '参保人数', key: 'insurance_count', unit: '人', type: 'number' },
                { label: '经营状态', key: 'reg_status' },
                { label: '企业类型', key: 'company_type' },
                { label: '上市/融资', key: 'financing' },
                { label: '网址', key: 'website' },
                { label: '邮寄地址', key: 'v9_mail_address', custom: () => {
                  const addr = result.v9_mail_address
                  return addr ? safeVal(addr) : '-'
                }},
                { label: '邮寄信任度', key: 'v9_mail_trust' },
                { label: '联系电话', key: 'phone' },
                { label: '联系邮箱', key: 'email' },
                { label: '使用部门', key: 'v9_dept' },
                { label: '部门人数', key: 'v9_dept_people', unit: '人', type: 'number' },
                { label: '核心产品', key: 'core_product' },
                { label: '涉及产品', key: 'v9_products', custom: () => {
                  const prods = result.v9_products?.value
                  if (!prods || !Array.isArray(prods)) return safeVal(result.v9_products)
                  return (
                    <div className="flex flex-wrap gap-1">
                      {prods.map((p: string, i: number) => (
                        <span key={i} className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">{p}</span>
                      ))}
                    </div>
                  )
                }},
                { label: '采购等级', key: 'v9_purchasing_level' },
                { label: '依赖等级', key: 'dependency_level' },
                { label: '行业趋势', key: 'v9_industry_trend' },
                { label: '排除原因', key: 'v9_exclude_reason' },
                { label: '使用率', key: 'v9_usage_rate', custom: () => `${Math.round((safeVal(result.v9_usage_rate) || 0) * 100)}%` },
              ].map((row, idx) => {
                const value = row.custom ? row.custom() : (row.type === 'number' ? `${safeVal(result[row.key]).toLocaleString()}${row.unit || ''}` : safeVal(result[row.key]))
                const src = !row.custom ? safeSrc(result[row.key]) : null
                return (
                  <div key={idx} className="flex justify-between items-center py-1.5 border-b border-border/30 last:border-0">
                    <span className="text-xs text-muted-foreground">{row.label}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium">{value || '-'}</span>
                      {src}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ========== 联系方式分析 ========== */}
          <div className="grid grid-cols-3 gap-4">
            {[
              {
                title: '电话分析',
                icon: '📞',
                data: result.v9_phone_marker?.analysis,
                render: (analysis: any) => {
                  if (!analysis) return <div className="text-xs text-muted-foreground">无</div>
                  return (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${analysis.is_effective ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                          {analysis.is_effective ? '有效' : '无效'}
                        </span>
                        <span className="text-xs text-muted-foreground">{analysis.valid_count}/{analysis.raw_count} 个有效</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {analysis.has_mobile && '📱 含手机号 '}
                        {analysis.has_landline && '☎️ 含座机号'}
                      </div>
                      {analysis.phones?.slice(0, 3).map((p: any, i: number) => (
                        <div key={i} className="text-xs font-mono">{p.number}</div>
                      ))}
                    </div>
                  )
                },
              },
              {
                title: '邮箱分析',
                icon: '📧',
                data: result.v9_email_marker?.analysis,
                render: (analysis: any) => {
                  if (!analysis) return <div className="text-xs text-muted-foreground">无</div>
                  return (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${analysis.is_effective ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                          {analysis.is_effective ? '有效' : '无效'}
                        </span>
                        <span className="text-xs text-muted-foreground">{analysis.valid_count}/{analysis.raw_count} 个有效</span>
                      </div>
                      {analysis.has_corporate ? (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700">含企业邮箱</span>
                      ) : null}
                      {analysis.emails?.slice(0, 3).map((e: any, i: number) => (
                        <div key={i} className="text-xs font-mono truncate">{e.address}</div>
                      ))}
                    </div>
                  )
                },
              },
              {
                title: '地址分析',
                icon: '📍',
                data: result.v9_mail_address?.analysis,
                render: (analysis: any) => {
                  if (!analysis) return <div className="text-xs text-muted-foreground">无</div>
                  return (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${analysis.is_effective ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                          {analysis.is_effective ? '有效' : '无效'}
                        </span>
                        <span className="text-xs text-muted-foreground">信任度: {analysis.trust_level}({analysis.trust_score}分)</span>
                      </div>
                      <div className="text-xs font-mono line-clamp-2">{analysis.address}</div>
                    </div>
                  )
                },
              },
            ].map((card, idx) => (
              <div key={idx} className="p-4 border rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <span>{card.icon}</span>
                  <span className="text-sm font-medium">{card.title}</span>
                  {safeSrc(result.v9_phone_marker)}
                </div>
                {card.render(card.data)}
              </div>
            ))}
          </div>

          {/* ========== V9 分析卡片 ========== */}
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Shield className="w-4 h-4 text-orange-500" />
              V9 分析卡片
            </h3>
            <div className="grid grid-cols-3 gap-4">
              {result.v9_cards?.map((card: any, idx: number) => {
                const colorMap: Record<string, string> = {
                  success: 'border-green-400 bg-green-50',
                  danger: 'border-red-400 bg-red-50',
                  warning: 'border-yellow-400 bg-yellow-50',
                  primary: 'border-blue-400 bg-blue-50',
                  accent: 'border-purple-400 bg-purple-50',
                  muted: 'border-gray-300 bg-gray-50',
                }
                return (
                  <div key={idx} className={`p-4 border-2 rounded-xl ${colorMap[card.color] || 'border-blue-300 bg-blue-50'}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-lg">{getCardIcon(card.icon)}</span>
                      <span className="text-sm font-bold">{card.title}</span>
                    </div>
                    <div className="space-y-1.5">
                      {card.items?.map((item: any, j: number) => (
                        <div key={j} className="flex justify-between items-center">
                          <span className="text-xs text-muted-foreground">{item.label}</span>
                          <span className="text-sm font-semibold">{item.value}{item.unit || ''}</span>
                        </div>
                      ))}
                    </div>
                    {card.conclusion && (
                      <div className="mt-3 pt-2 border-t border-current/10 text-xs text-muted-foreground">
                        {card.conclusion}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* ========== 策略详情 ========== */}
          <div className="grid grid-cols-3 gap-4">
            {/* 定价策略 */}
            <div className="border rounded-xl p-4">
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                💰 定价策略
              </h4>
              {result.pricing_data?.value ? (
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">产品</span><span className="font-medium">{result.pricing_data.value.product}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">刊例价</span><span className="font-medium">¥{result.pricing_data.value.base_price?.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">上浮价</span><span className="font-medium">¥{result.pricing_data.value.markup_price?.toLocaleString()} ({result.pricing_data.value.markup_rate})</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">折扣</span><span className="font-medium">量{result.pricing_data.value.volume_discount} / 企{result.pricing_data.value.enterprise_discount}</span></div>
                  <div className="flex justify-between pt-1 border-t"><span className="text-muted-foreground">终定价</span><span className="text-sm font-bold text-green-600">¥{result.pricing_data.value.final_price?.toLocaleString()}</span></div>
                  <div className="text-[10px] text-muted-foreground pt-1">策略: {result.pricing_data.value.pricing_strategy}</div>
                </div>
              ) : <div className="text-xs text-muted-foreground">暂无定价数据</div>}
            </div>

            {/* LC策略 */}
            <div className="border rounded-xl p-4">
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                🎯 LC策略
              </h4>
              {result.v9_lc_strategy?.analysis ? (
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">策略</span><span className="font-bold text-blue-600">{result.v9_lc_strategy.analysis.name}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">频率</span><span className="font-medium">{result.v9_lc_strategy.analysis.frequency}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">周期</span><span className="font-medium">{result.v9_lc_strategy.analysis.cycle}</span></div>
                  <div className="pt-1">
                    <div className="text-muted-foreground mb-1">行动计划:</div>
                    {result.v9_lc_strategy.analysis.actions?.map((a: string, i: number) => (
                      <div key={i} className="flex items-center gap-1 py-0.5">
                        <Check className="w-3 h-3 text-green-500" />
                        <span>{a}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : <div className="text-xs text-muted-foreground">暂无策略数据</div>}
            </div>

            {/* 拜访SOP */}
            <div className="border rounded-xl p-4">
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                📋 拜访SOP
              </h4>
              {result.v9_visit_sop?.analysis ? (
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">流程</span><span className="font-bold text-purple-600">{result.v9_visit_sop.analysis.name}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">周期</span><span className="font-medium">{result.v9_visit_sop.analysis.total_days}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">人员</span><span className="font-medium">{(result.v9_visit_sop.analysis.required_roles || []).join(', ')}</span></div>
                  <div className="pt-1">
                    <div className="text-muted-foreground mb-1">步骤:</div>
                    {(result.v9_visit_sop.analysis.steps || []).map((s: string, i: number) => (
                      <div key={i} className="py-0.5">{s}</div>
                    ))}
                  </div>
                </div>
              ) : <div className="text-xs text-muted-foreground">暂无SOP数据</div>}
            </div>
          </div>

          {/* ========== 评分分解 / 数据流 ========== */}
          <div className="border rounded-xl p-5">
            <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleSection('scoring')}>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-green-500" />
                {expandedSections['scoring'] ? '▼' : '▶'} 评分分解说明 & 数据流
              </h3>
              {safeSrc(result.percentile_score)}
            </div>
            {expandedSections['scoring'] && (
              <div className="mt-4 space-y-4">
                <div>
                  <div className="text-xs text-muted-foreground mb-2">百分制评分: {safeVal(result.percentile_score)} 分 ({safeVal(result.percentile_level)}级 - {safeVal(result.percentile_level_desc)})</div>
                  <pre className="text-xs font-mono bg-secondary/30 p-3 rounded-lg overflow-x-auto">
                    {safeVal(result.percentile_breakdown)}
                  </pre>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-2">4维度评分明细</div>
                  <div className="grid grid-cols-4 gap-2">
                    {result.percentile_dimensions && Object.entries(result.percentile_dimensions).map(([key, dim]: [string, any]) => (
                      <div key={key} className="p-2 rounded-lg border bg-secondary/10 text-center">
                        <div className="text-[10px] text-muted-foreground">{dim.name}</div>
                        <div className="text-sm font-bold">{dim.score}/{dim.max}</div>
                        {dim.factors && (
                          <div className="text-[9px] text-muted-foreground mt-0.5">
                            {dim.factors.map((f: any, fi: number) => (
                              <span key={fi}>{f.name}({Math.round(f.weight * 100)}%){fi < dim.factors.length - 1 ? ' + ' : ''}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                {result.data_flow && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-2">数据流 (Data Flow)</div>
                    <pre className="text-xs font-mono bg-secondary/30 p-3 rounded-lg overflow-x-auto">
                      {JSON.stringify(result.data_flow, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ========== 牛牛虫招聘数据 - V1.79卡片格式 ========== */}
          {result.recruit_evidence?.value && (
            <div className="border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between p-3 cursor-pointer bg-secondary/30" onClick={() => toggleSection('recruit')}>
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  🐛 牛牛虫招聘爬取
                  {safeSrc(result.recruit_evidence)}
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs">{expandedSections['recruit'] ? '▲' : '▼'}</span>
                </div>
              </div>
            </div>
          )}

          {/* ========== 联网信息 - V1.79 10小节对齐 ========== */}
          {onlineInfo && (
            <div className="border rounded-xl overflow-hidden border-blue-200">
              <div className="flex items-center gap-2 py-1.5 px-3 bg-blue-50 border-b border-blue-100">
                <Globe className="w-3.5 h-3.5 text-blue-600" />
                <span className="text-xs font-medium text-blue-700">联网信息</span>
                {onlineInfo._query_timestamp && (
                  <span className="text-[10px] text-blue-400 ml-auto">{new Date(onlineInfo._query_timestamp).toLocaleTimeString()}</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-0">
                {/* 企业资质 */}
                <SectionHeader icon={Shield} label="企业资质" />
                <CompactRow label="资质等级" value={onlineInfo.enterpriseQualification?.level || '待获取'} source="联网" />
                <CompactRow label="资质认证" value={onlineInfo.enterpriseQualification?.qualification || '待获取'} source="联网" />
                <CompactRow label="资质证书" value={onlineInfo.enterpriseQualification?.certificates?.join(', ') || '-'} source="联网" colSpan />

                {/* 企业关联 */}
                <SectionHeader icon={Link2} label="企业关联" />
                <CompactRow label="子公司" value={onlineInfo.enterpriseRelation?.subsidiaries?.length ? `${onlineInfo.enterpriseRelation.subsidiaries.length}家` : '待获取'} source="联网" />
                <CompactRow label="分公司" value={onlineInfo.enterpriseRelation?.branches?.length ? `${onlineInfo.enterpriseRelation.branches.length}家` : '待获取'} source="联网" />
                <CompactRow label="法人关联" value={onlineInfo.enterpriseRelation?.legal_person_companies?.join(', ') || '-'} source="联网" colSpan />

                {/* 近期利好 */}
                <SectionHeader icon={TrendingUp} label="近期利好" />
                <CompactRow label="展会" value={onlineInfo.recentGoodNews?.exhibitions?.length ? `${onlineInfo.recentGoodNews.exhibitions.length}条` : '待获取'} source="联网" />
                <CompactRow label="招聘" value={onlineInfo.recentGoodNews?.recruitment?.length ? `${onlineInfo.recentGoodNews.recruitment.length}条` : '待获取'} source="联网" />
                <CompactRow label="获奖" value={onlineInfo.recentGoodNews?.awards?.join(', ') || '无'} source="联网" />
                <CompactRow label="扩张" value={onlineInfo.recentGoodNews?.expansion?.join(', ') || '无'} source="联网" />

                {/* 负面情况 */}
                <SectionHeader icon={AlertCircle} label="负面情况" />
                <CompactRow label="诉讼" value={onlineInfo.negativeSituation?.lawsuits?.length ? `${onlineInfo.negativeSituation.lawsuits.length}条` : '待获取'} source="联网" />
                <CompactRow label="限高" value={onlineInfo.negativeSituation?.restricted?.join(', ') || '-'} source="联网" />
                <CompactRow label="欠薪" value={onlineInfo.negativeSituation?.wage_arrears?.join(', ') || '-'} source="联网" />
                <CompactRow label="处罚" value={onlineInfo.negativeSituation?.penalties?.join(', ') || '-'} source="联网" />

                {/* 盗版证据 */}
                <SectionHeader icon={FileText} label="盗版证据" color="text-red-500" />
                <CompactRow label="证据数量" value={onlineInfo.piracyEvidence?.evidence_count ? `${onlineInfo.piracyEvidence.evidence_count}条` : '待获取'} source="联网" highlight color="text-red-600" />
                <CompactRow label="CAD岗位" value={onlineInfo.piracyEvidence?.job_count ? `${onlineInfo.piracyEvidence.job_count}个` : '待获取'} source="联网" />
                <CompactRow label="证据详情" value={onlineInfo.piracyEvidence?.evidence?.join('; ') || '-'} source="联网" colSpan />

                {/* 其他关注 */}
                <SectionHeader icon={Eye} label="其他关注" />
                <CompactRow label="行业趋势" value={onlineInfo.otherConcerns?.industry_trend || '待获取'} source="联网" />
                <CompactRow label="市场地位" value={onlineInfo.otherConcerns?.market_position || '待获取'} source="联网" />
                <CompactRow label="财务健康度" value={onlineInfo.otherConcerns?.financial_health || '待获取'} source="联网" />
                <CompactRow label="风险因素" value={onlineInfo.otherConcerns?.risk_factors?.join(', ') || '无'} source="联网" />

                {/* 产品使用场景 */}
                <SectionHeader icon={Package} label="产品使用场景" />
                <CompactRow label="使用场景" value={onlineInfo.productUsageScenario?.scenarios?.join(', ') || '-'} source="联网" colSpan />
                <CompactRow label="使用部门" value={onlineInfo.productUsageScenario?.departments?.join(', ') || '-'} source="联网" />
                <CompactRow label="工作流程" value={onlineInfo.productUsageScenario?.workflow || '待获取'} source="联网" />

                {/* 产品依赖程度 */}
                <SectionHeader icon={Link2} label="产品依赖程度" />
                <CompactRow label="依赖等级" value={onlineInfo.productDependency?.level || '待获取'} source="联网" />
                <CompactRow label="依赖评分" value={onlineInfo.productDependency?.score || '待获取'} source="联网" />
                <CompactRow label="替代方案" value={onlineInfo.productDependency?.alternatives?.join(', ') || '-'} source="联网" colSpan />
                <CompactRow label="依赖原因" value={onlineInfo.productDependency?.reason || '待获取'} source="联网" colSpan />

                {/* 参保人数变化 */}
                <SectionHeader icon={Users} label="参保人数变化" />
                <CompactRow label="参保趋势" value={onlineInfo.insuranceChange?.trend || '待获取'} source="联网" />
                <CompactRow label="参保总结" value={onlineInfo.insuranceChange?.summary || '待获取'} source="联网" />
                <CompactRow label="参保明细" value={onlineInfo.insuranceChange?.years?.map((y: any) => `${y.year}:${y.count}人${y.change}`).join(' | ') || '-'} source="联网" colSpan />

                {/* 联系方式识别 */}
                <SectionHeader icon={Phone} label="联系方式识别" />
                <CompactRow label="联系电话" value={onlineInfo.contactInfo?.phones?.join(', ') || '-'} source="数据库反查" />
                <CompactRow label="联系邮箱" value={onlineInfo.contactInfo?.emails?.join(', ') || '-'} source="数据库" />
                <CompactRow label="联系官网" value={onlineInfo.contactInfo?.website || '待获取'} source="数据库" />
                <CompactRow label="联系地址" value={onlineInfo.contactInfo?.address || '待获取'} source="数据库" />
              </div>
            </div>
          )}


          {/* ========== 联网信息旧版（无数据时fallback） ========== */}
          {onlineInfo && !onlineInfo.enterpriseQualification && onlineInfo.summary && (
            <div className="border rounded-xl p-4 border-blue-200 bg-blue-50/30">
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Eye className="w-4 h-4 text-blue-500" />
                联网信息
              </h3>
              <div className="text-sm text-muted-foreground mb-2">{onlineInfo.summary}</div>
              <div className="grid grid-cols-2 gap-2">
                {onlineInfo.sources?.map((s: any, i: number) => (
                  <div key={i} className="p-2 border rounded bg-white text-xs">
                    <div className="font-medium">{s.title}</div>
                    <div className="text-muted-foreground line-clamp-2">{s.snippet}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 空状态 */}
      {!result && !loading && (
        <div className="text-center py-16">
          <Search className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <div className="text-muted-foreground">输入企业名称并点击"分析"开始</div>
          <div className="text-xs text-muted-foreground/50 mt-1">支持企业全称、简称或关键词搜索</div>
        </div>
      )}

      {/* 加载状态 */}
      {loading && (
        <div className="text-center py-16">
          <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto mb-4" />
          <div className="text-muted-foreground">正在分析企业数据...</div>
        </div>
      )}
    </div>
  )
}

function getCardIcon(iconName: string) {
  const icons: Record<string, string> = {
    ShieldAlert: '🛡️', Award: '🏆', Package: '📦',
    PhoneCall: '📞', TrendingUp: '📈', BarChart3: '📊',
  }
  return icons[iconName] || '📌'
}

// ==========================================
// 批量分析面板 - 直接调用牛马引擎API
// ==========================================
function BatchAnalysisPanel({ fetchApi, showToast }: any) {
  const [manualInput, setManualInput] = useState('')
  const [companyNames, setCompanyNames] = useState<string[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<any[]>([])
  const [inputMode, setInputMode] = useState<'manual' | 'file'>('manual')

  const parseCompanyNames = (input: string): string[] => {
    if (!input.trim()) return []
    const lines = input.split(/[\n\r]+/)
    const names: string[] = []
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const parts = trimmed.split(/[,，;；\s]+/).filter((p: string) => p.length >= 2)
      if (parts.length > 1) {
        names.push(...parts)
      } else {
        names.push(...trimmed.split(/[,，;；]+/).map((p: string) => p.trim()).filter((p: string) => p.length >= 2))
      }
    }
    return [...new Set(names)].filter((n: string) => n.length >= 4)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setManualInput(value)
    setCompanyNames(parseCompanyNames(value))
    setResults([])
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      const lines = text.split('\n').filter((l: string) => l.trim())
      const names = lines.map((l: string) => {
        const p = l.split(',')[0]?.trim()
        return p || l.trim()
      }).filter((n: string) => n.length >= 4)
      const unique = [...new Set(names)]
      setCompanyNames(unique)
      setManualInput(unique.join('\n'))
      setResults([])
    }
    reader.readAsText(file)
  }

  const startAnalysis = async () => {
    if (companyNames.length === 0) {
      showToast('error', '请输入企业名称')
      return
    }
    setAnalyzing(true)
    setProgress(0)
    setResults([])
    try {
      const res = await fetchApi('/niuma/analysis/batch', {
        method: 'POST',
        body: JSON.stringify({ names: companyNames, vendor: 'autodesk' }),
      })
      setResults(res.data.results || [])
      setProgress(100)
      showToast('success', `分析完成，成功 ${res.data.found}/${res.data.total}`)
    } catch (err: any) {
      showToast('error', err.message)
    }
    setAnalyzing(false)
  }

  const exportResults = () => {
    const csv = [
      '企业名称,信用代码,省份,城市,行业,盗版指数,质量评分,客户评分,参保人数,匹配产品,状态',
      ...results.map((r: any) => {
        const d = r.data || {}
        return `${d.company_name || r._name},${d.credit_code || ''},${d.province || ''},${d.city || ''},${d.gb_industry_major || ''},${d.v9_piracy || ''},${d.v9_quality_score || ''},${d.v9_customer_score || ''},${d.insurance_count || ''},"${d.v9_products || ''}",${r._found ? '成功' : '失败'}`
      })
    ].join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `批量分析结果_${new Date().toLocaleDateString()}.csv`
    link.click()
  }

  return (
    <div className="space-y-6">
      {/* 输入区域 */}
      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Database className="w-5 h-5 gradient-text" />
          <h2 className="text-base font-semibold">批量盗版分析</h2>
          <span className="text-xs text-muted-foreground ml-2">通过API调用牛马AI引擎批量分析</span>
        </div>

        {/* 输入模式切换 */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setInputMode('manual')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              inputMode === 'manual' ? 'gradient-primary text-white' : 'bg-secondary text-muted-foreground'
            }`}
          >
            <FileText className="w-4 h-4 inline mr-1" />
            手动输入
          </button>
          <button
            onClick={() => setInputMode('file')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              inputMode === 'file' ? 'gradient-primary text-white' : 'bg-secondary text-muted-foreground'
            }`}
          >
            <Upload className="w-4 h-4 inline mr-1" />
            文件上传
          </button>
        </div>

        {inputMode === 'manual' ? (
          <textarea
            value={manualInput}
            onChange={handleInputChange}
            placeholder="输入企业名称，支持换行、逗号、分号分隔&#10;例如：&#10;某科技有限公司&#10;某建筑工程公司, 某设计院"
            className="w-full h-40 px-4 py-3 bg-background border border-border/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
          />
        ) : (
          <div className="border-2 border-dashed border-border/50 rounded-xl p-8 text-center">
            <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground mb-2">点击上传CSV文件</p>
            <input
              type="file"
              accept=".csv,.txt"
              onChange={handleFileUpload}
              className="hidden"
              id="batch-file-upload"
            />
            <label
              htmlFor="batch-file-upload"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg gradient-primary text-white text-sm cursor-pointer"
            >
              选择文件
            </label>
          </div>
        )}

        {/* 解析结果 */}
        {companyNames.length > 0 && (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle className="w-3 h-3 text-green-500" />
            已解析 {companyNames.length} 个企业名称
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex gap-3 mt-4">
          <button
            onClick={startAnalysis}
            disabled={analyzing || companyNames.length === 0}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl gradient-primary text-white text-sm font-medium shadow-glow disabled:opacity-50"
          >
            {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {analyzing ? `分析中 ${progress}%` : '开始批量分析'}
          </button>
          <button
            onClick={() => { setManualInput(''); setCompanyNames([]); setResults([]); setProgress(0) }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl btn-ghost text-sm"
          >
            <Trash2 className="w-4 h-4" />
            清空
          </button>
        </div>

        {/* 进度条 */}
        {analyzing && (
          <div className="mt-4">
            <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
              <div className="h-full rounded-full gradient-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* 分析结果 */}
      {results.length > 0 && (
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 gradient-text" />
              <h2 className="text-base font-semibold">分析结果</h2>
              <span className="text-xs text-muted-foreground">
                成功 {results.filter((r: any) => r._found).length}/{results.length}
              </span>
            </div>
            <button
              onClick={exportResults}
              className="flex items-center gap-2 px-4 py-2 rounded-xl btn-ghost text-sm"
            >
              <DownloadIcon className="w-4 h-4" />
              导出CSV
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">企业名称</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">省份</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">行业</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">盗版指数</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">质量评分</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">客户评分</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">状态</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r: any, i: number) => {
                  const d = r.data || {}
                  return (
                    <tr key={i} className="border-b border-border/30 hover:bg-accent/30">
                      <td className="py-2 px-3 font-medium">{d.company_name || r._name}</td>
                      <td className="py-2 px-3">{d.province || '-'}</td>
                      <td className="py-2 px-3">{d.gb_industry_major || '-'}</td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          (d.v9_piracy || 0) >= 80 ? 'bg-red-500/10 text-red-500' :
                          (d.v9_piracy || 0) >= 50 ? 'bg-orange-500/10 text-orange-500' :
                          'bg-green-500/10 text-green-500'
                        }`}>
                          {d.v9_piracy ?? '-'}
                        </span>
                      </td>
                      <td className="py-2 px-3">{d.v9_quality_score ?? '-'}</td>
                      <td className="py-2 px-3">{d.v9_customer_score ?? '-'}</td>
                      <td className="py-2 px-3">
                        {r._found ? (
                          <span className="flex items-center gap-1 text-green-500 text-xs">
                            <CheckCircle className="w-3 h-3" /> 成功
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-red-400 text-xs">
                            <X className="w-3 h-3" /> {r._error || '失败'}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ==========================================
// 高级筛选面板 - 直接调用牛马引擎API
// ==========================================
function AdvancedFilterPanel({ fetchApi, showToast }: any) {
  const [filters, setFilters] = useState<any>({
    province: '', industry_segment: '', gb_industry: '',
    insurance_min: '', insurance_max: '', piracy_min: '', piracy_max: '',
    industry_trend: '', dependency_level: '',
  })
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [provinces, setProvinces] = useState<any[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    fetchApi('/niuma/provinces').then((res: any) => {
      if (Array.isArray(res.data)) setProvinces(res.data)
    }).catch(() => {})
  }, [fetchApi])

  const handleSearch = async (targetPage = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('page', String(targetPage))
      params.append('page_size', String(pageSize))
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== '' && value !== undefined && value !== null) {
          params.append(key, String(value))
        }
      })
      const res = await fetchApi(`/niuma/import/preview?${params.toString()}`)
      setResults(res.data.preview || [])
      setTotal(res.data.total || 0)
      setPage(targetPage)
      showToast('success', `筛选完成，共 ${res.data.total} 条数据`)
    } catch (err: any) {
      showToast('error', err.message)
    }
    setLoading(false)
  }

  const toggleSelect = (id: number) => {
    const newSet = new Set(selectedIds)
    if (newSet.has(id)) newSet.delete(id)
    else newSet.add(id)
    setSelectedIds(newSet)
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === results.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(results.map((r: any) => r.niuma_id)))
    }
  }

  return (
    <div className="space-y-6">
      {/* 筛选条件 */}
      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 gradient-text" />
          <h2 className="text-base font-semibold">高级条件筛选</h2>
          <span className="text-xs text-muted-foreground ml-2">通过API调用牛马AI引擎盗版分析高级筛选</span>
        </div>

        <div className="grid grid-cols-4 gap-4">
          {/* 省份 */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <MapPin className="w-3 h-3" /> 省份
            </label>
            <select
              value={filters.province}
              onChange={(e) => setFilters({ ...filters, province: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-background border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">全部省份</option>
              {provinces.map((p: any) => (
                <option key={p.province} value={p.province}>{p.province}</option>
              ))}
            </select>
          </div>

          {/* 行业细分 */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Building2 className="w-3 h-3" /> 行业细分
            </label>
            <select
              value={filters.industry_segment}
              onChange={(e) => setFilters({ ...filters, industry_segment: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-background border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">全部细分</option>
              <option value="AEC">建筑/工程/施工 (AEC)</option>
              <option value="DM">数字制造/机械 (DM)</option>
              <option value="ME">媒体与娱乐 (ME)</option>
            </select>
          </div>

          {/* 盗版指数 */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Shield className="w-3 h-3" /> 盗版指数最小
            </label>
            <input
              type="number"
              value={filters.piracy_min}
              onChange={(e) => setFilters({ ...filters, piracy_min: e.target.value })}
              placeholder="0-100"
              className="w-full px-3 py-2 rounded-xl bg-background border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Shield className="w-3 h-3" /> 盗版指数最大
            </label>
            <input
              type="number"
              value={filters.piracy_max}
              onChange={(e) => setFilters({ ...filters, piracy_max: e.target.value })}
              placeholder="0-100"
              className="w-full px-3 py-2 rounded-xl bg-background border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* 参保人数 */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Users className="w-3 h-3" /> 参保人数最小
            </label>
            <input
              type="number"
              value={filters.insurance_min}
              onChange={(e) => setFilters({ ...filters, insurance_min: e.target.value })}
              placeholder="输入最小人数"
              className="w-full px-3 py-2 rounded-xl bg-background border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Users className="w-3 h-3" /> 参保人数最大
            </label>
            <input
              type="number"
              value={filters.insurance_max}
              onChange={(e) => setFilters({ ...filters, insurance_max: e.target.value })}
              placeholder="输入最大人数"
              className="w-full px-3 py-2 rounded-xl bg-background border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* 行业趋势 */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> 行业趋势
            </label>
            <select
              value={filters.industry_trend}
              onChange={(e) => setFilters({ ...filters, industry_trend: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-background border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">全部趋势</option>
              <option value="上升">上升</option>
              <option value="稳定">稳定</option>
              <option value="下降">下降</option>
            </select>
          </div>

          {/* 依赖程度 */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Link2 className="w-3 h-3" /> 依赖程度
            </label>
            <select
              value={filters.dependency_level}
              onChange={(e) => setFilters({ ...filters, dependency_level: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-background border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">全部程度</option>
              <option value="高">高</option>
              <option value="中">中</option>
              <option value="低">低</option>
            </select>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={() => handleSearch(1)}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl gradient-primary text-white text-sm font-medium shadow-glow disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            执行筛选
          </button>
          <button
            onClick={() => {
              setFilters({ province: '', industry_segment: '', gb_industry: '', insurance_min: '', insurance_max: '', piracy_min: '', piracy_max: '', industry_trend: '', dependency_level: '' })
              setResults([])
              setSelectedIds(new Set())
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl btn-ghost text-sm"
          >
            <RotateCcw className="w-4 h-4" />
            重置
          </button>
        </div>
      </div>

      {/* 结果列表 */}
      {results.length > 0 && (
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 gradient-text" />
              <h2 className="text-base font-semibold">筛选结果</h2>
              <span className="text-xs text-muted-foreground">共 {total} 条，当前第 {page} 页</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleSelectAll}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {selectedIds.size === results.length ? '取消全选' : '全选'} ({selectedIds.size})
              </button>
              <button
                onClick={() => showToast('success', `已选择 ${selectedIds.size} 个客户导入`)}
                disabled={selectedIds.size === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-xl gradient-primary text-white text-sm font-medium shadow-glow disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                导入选中 ({selectedIds.size})
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left py-2 px-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === results.length && results.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded"
                    />
                  </th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">企业名称</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">省份</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">行业</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">盗版指数</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">质量评分</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">客户评分</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">参保人数</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">采购级别</th>
                </tr>
              </thead>
              <tbody>
                {results.map((item: any, i: number) => (
                  <tr key={i} className="border-b border-border/30 hover:bg-accent/30">
                    <td className="py-2 px-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.niuma_id)}
                        onChange={() => toggleSelect(item.niuma_id)}
                        className="w-4 h-4 rounded"
                      />
                    </td>
                    <td className="py-2 px-3 font-medium">{item.company || item.name || '-'}</td>
                    <td className="py-2 px-3">{item.address?.split(' ')[0] || '-'}</td>
                    <td className="py-2 px-3">{item.industry || '-'}</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        (item.urgency_level || 0) >= 4 ? 'bg-red-500/10 text-red-500' :
                        (item.urgency_level || 0) >= 3 ? 'bg-orange-500/10 text-orange-500' :
                        'bg-green-500/10 text-green-500'
                      }`}>
                        {item.urgency_level || '-'}
                      </span>
                    </td>
                    <td className="py-2 px-3">{item.budget_range || '-'}</td>
                    <td className="py-2 px-3">{item.source || '-'}</td>
                    <td className="py-2 px-3">-</td>
                    <td className="py-2 px-3">{item.vendor || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 分页 */}
          <div className="flex items-center justify-center gap-2 mt-4">
            <button
              onClick={() => handleSearch(page - 1)}
              disabled={page <= 1 || loading}
              className="px-3 py-1.5 rounded-lg bg-secondary text-sm disabled:opacity-50"
            >
              上一页
            </button>
            <span className="text-sm text-muted-foreground">第 {page} 页</span>
            <button
              onClick={() => handleSearch(page + 1)}
              disabled={results.length < pageSize || loading}
              className="px-3 py-1.5 rounded-lg bg-secondary text-sm disabled:opacity-50"
            >
              下一页
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ==========================================
// 客户导入面板
// ==========================================
function ImportPanel({ fetchApi, showToast }: any) {
  const [filters, setFilters] = useState<any>({
    province: '', city: '', industry: '', industry_segment: '',
    piracy_min: '', piracy_max: '', score_min: '', score_max: '',
    insurance_min: '', capital_min: '', purchasing_level: '',
    dependency_level: '', page: 1, page_size: 20,
  })
  const [previewData, setPreviewData] = useState<any>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult] = useState<any>(null)
  const [users, setUsers] = useState<any[]>([])
  const [importConfig, setImportConfig] = useState({
    auto_assign: false,
    assign_to_user_id: '',
    max_import: 100,
  })

  useEffect(() => {
    fetchApi('/crm/users').then((res: any) => setUsers(res.data || [])).catch(() => {})
  }, [fetchApi])

  const handlePreview = async () => {
    setPreviewLoading(true)
    try {
      const cleanFilters = Object.fromEntries(
        Object.entries(filters).filter(([_, v]) => v !== '' && v !== undefined)
      )
      const res = await fetchApi('/niuma/import/preview', {
        method: 'POST',
        body: JSON.stringify({ filters: cleanFilters }),
      })
      setPreviewData(res.data)
      showToast('success', `预览成功，共 ${res.data.total} 条数据`)
    } catch (err: any) {
      showToast('error', err.message)
    }
    setPreviewLoading(false)
  }

  const handleImport = async () => {
    setImportLoading(true)
    try {
      const cleanFilters = Object.fromEntries(
        Object.entries(filters).filter(([_, v]) => v !== '' && v !== undefined)
      )
      const res = await fetchApi('/niuma/import', {
        method: 'POST',
        body: JSON.stringify({
          filters: cleanFilters,
          auto_assign: importConfig.auto_assign,
          assign_to_user_id: importConfig.assign_to_user_id || undefined,
          max_import: importConfig.max_import,
        }),
      })
      setImportResult(res.data)
      showToast('success', `成功导入 ${res.data.imported_count} 个客户`)
    } catch (err: any) {
      showToast('error', err.message)
    }
    setImportLoading(false)
  }

  const filterFields = [
    { key: 'province', label: '省份', type: 'text', icon: MapPin },
    { key: 'city', label: '城市', type: 'text', icon: MapPin },
    { key: 'industry', label: '行业', type: 'text', icon: Building2 },
    { key: 'industry_segment', label: '行业细分', type: 'text', icon: Building2 },
    { key: 'piracy_min', label: '盗版指数最小', type: 'number', icon: Shield },
    { key: 'piracy_max', label: '盗版指数最大', type: 'number', icon: Shield },
    { key: 'score_min', label: '质量评分最小', type: 'number', icon: Star },
    { key: 'score_max', label: '质量评分最大', type: 'number', icon: Star },
    { key: 'insurance_min', label: '参保人数最小', type: 'number', icon: Users },
    { key: 'capital_min', label: '注册资本最小(万)', type: 'number', icon: TrendingUp },
    { key: 'purchasing_level', label: '采购级别', type: 'select', options: ['', '全部级别', '高', '中', '低'], icon: SlidersHorizontal },
    { key: 'dependency_level', label: '依赖程度', type: 'select', options: ['', '全部程度', '高', '中', '低'], icon: Link2 },
  ]

  return (
    <div className="space-y-6">
      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 gradient-text" />
          <h2 className="text-base font-semibold">导入条件筛选</h2>
          <span className="text-xs text-muted-foreground ml-2">从牛马AI引擎-盗版分析获取客户</span>
        </div>
        <div className="grid grid-cols-4 gap-4">
          {filterFields.map((field) => {
            const Icon = field.icon
            return (
              <div key={field.key} className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Icon className="w-3 h-3" />
                  {field.label}
                </label>
                {field.type === 'select' ? (
                  <select
                    value={filters[field.key]}
                    onChange={(e) => setFilters({ ...filters, [field.key]: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {field.options?.map((opt: string) => (
                      <option key={opt} value={opt === '全部级别' || opt === '全部程度' ? '' : opt}>{opt || '全部'}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.type}
                    value={filters[field.key]}
                    onChange={(e) => setFilters({ ...filters, [field.key]: e.target.value })}
                    placeholder={`输入${field.label}`}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50"
                  />
                )}
              </div>
            )
          })}
        </div>
        <div className="flex gap-3 mt-6">
          <button
            onClick={handlePreview}
            disabled={previewLoading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl gradient-primary text-white text-sm font-medium shadow-glow disabled:opacity-50"
          >
            {previewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
            预览数据
          </button>
          <button
            onClick={() => setFilters({
              province: '', city: '', industry: '', industry_segment: '',
              piracy_min: '', piracy_max: '', score_min: '', score_max: '',
              insurance_min: '', capital_min: '', purchasing_level: '',
              dependency_level: '', page: 1, page_size: 20,
            })}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl btn-ghost text-sm"
          >
            <RotateCcw className="w-4 h-4" />
            重置
          </button>
        </div>
      </div>

      {/* 导入配置 */}
      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Download className="w-5 h-5 gradient-text" />
          <h2 className="text-base font-semibold">导入配置</h2>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">最大导入数量</label>
            <input
              type="number"
              value={importConfig.max_import}
              onChange={(e) => setImportConfig({ ...importConfig, max_import: parseInt(e.target.value) || 100 })}
              className="w-full px-3 py-2 rounded-xl bg-background border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">自动分派</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setImportConfig({ ...importConfig, auto_assign: !importConfig.auto_assign })}
                className={`relative w-12 h-6 rounded-full transition-colors ${importConfig.auto_assign ? 'bg-green-500' : 'bg-muted'}`}
              >
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${importConfig.auto_assign ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
              <span className="text-sm">{importConfig.auto_assign ? '启用' : '禁用'}</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">指定分派员工</label>
            <select
              value={importConfig.assign_to_user_id}
              onChange={(e) => setImportConfig({ ...importConfig, assign_to_user_id: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-background border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">自动分派</option>
              {users.map((u: any) => (
                <option key={u.id} value={u.id}>{u.nickname || u.username}</option>
              ))}
            </select>
          </div>
        </div>
        <button
          onClick={handleImport}
          disabled={importLoading || !previewData}
          className="mt-4 flex items-center gap-2 px-6 py-2.5 rounded-xl gradient-primary text-white text-sm font-medium shadow-glow disabled:opacity-50"
        >
          {importLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          执行导入
        </button>
      </div>

      {/* 导入结果 */}
      {importResult && (
        <div className="glass-card rounded-2xl p-6 border-green-500/20">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <h2 className="text-base font-semibold">导入结果</h2>
          </div>
          <div className="grid grid-cols-5 gap-4">
            <div className="text-center p-4 rounded-xl bg-green-500/5 border border-green-500/10">
              <div className="text-2xl font-bold text-green-500">{importResult.imported_count}</div>
              <div className="text-xs text-muted-foreground mt-1">导入成功</div>
            </div>
            <div className="text-center p-4 rounded-xl bg-blue-500/5 border border-blue-500/10">
              <div className="text-2xl font-bold text-blue-500">{importResult.assigned_count}</div>
              <div className="text-xs text-muted-foreground mt-1">已分派</div>
            </div>
            <div className="text-center p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/10">
              <div className="text-2xl font-bold text-yellow-500">{importResult.skipped_count}</div>
              <div className="text-xs text-muted-foreground mt-1">跳过(重复)</div>
            </div>
            <div className="text-center p-4 rounded-xl bg-red-500/5 border border-red-500/10">
              <div className="text-2xl font-bold text-red-500">{importResult.error_count}</div>
              <div className="text-xs text-muted-foreground mt-1">错误</div>
            </div>
            <div className="text-center p-4 rounded-xl bg-purple-500/5 border border-purple-500/10">
              <div className="text-2xl font-bold text-purple-500">{importResult.total_available}</div>
              <div className="text-xs text-muted-foreground mt-1">引擎总数据</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ==========================================
// 连接配置面板
// ==========================================
function ConfigPanel({ fetchApi, showToast }: any) {
  const [config, setConfig] = useState({ baseUrl: 'http://localhost:1077', timeout: 30000, enabled: true })
  const [health, setHealth] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchApi('/niuma/config').then((res: any) => setConfig(res.data)).catch(() => {})
    checkHealth()
  }, [fetchApi])

  const checkHealth = async () => {
    try {
      const res = await fetchApi('/niuma/health')
      setHealth(res.data)
    } catch (err: any) {
      setHealth({ ok: false, error: err.message })
    }
  }

  const saveConfig = async () => {
    setLoading(true)
    try {
      await fetchApi('/niuma/config', {
        method: 'PUT',
        body: JSON.stringify(config),
      })
      showToast('success', '配置已保存')
      checkHealth()
    } catch (err: any) {
      showToast('error', err.message)
    }
    setLoading(false)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-6">
          <Server className="w-5 h-5 gradient-text" />
          <h2 className="text-base font-semibold">牛马AI引擎连接配置</h2>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">引擎地址</label>
            <input
              type="text"
              value={config.baseUrl}
              onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-background border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">超时时间 (毫秒)</label>
            <input
              type="number"
              value={config.timeout}
              onChange={(e) => setConfig({ ...config, timeout: parseInt(e.target.value) })}
              className="w-full px-3 py-2 rounded-xl bg-background border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setConfig({ ...config, enabled: !config.enabled })}
              className={`relative w-12 h-6 rounded-full transition-colors ${config.enabled ? 'bg-green-500' : 'bg-muted'}`}
            >
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${config.enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
            <span className="text-sm">{config.enabled ? '连接已启用' : '连接已禁用'}</span>
          </div>
        </div>

        <button
          onClick={saveConfig}
          disabled={loading}
          className="mt-6 flex items-center gap-2 px-6 py-2.5 rounded-xl gradient-primary text-white text-sm font-medium shadow-glow disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          保存配置
        </button>
      </div>

      {health && (
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 gradient-text" />
              <h2 className="text-base font-semibold">连接健康状态</h2>
            </div>
            <button onClick={checkHealth} className="p-2 rounded-xl btn-ghost">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          <div className={`p-4 rounded-xl border ${health.ok ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
            <div className="flex items-center gap-2">
              {health.ok ? <CheckCircle className="w-5 h-5 text-green-500" /> : <AlertCircle className="w-5 h-5 text-red-500" />}
              <span className={`font-medium ${health.ok ? 'text-green-500' : 'text-red-500'}`}>
                {health.ok ? '连接正常' : '连接异常'}
              </span>
            </div>
            {health.latency !== undefined && (
              <div className="mt-2 text-sm text-muted-foreground">延迟: {health.latency}ms</div>
            )}
            {health.error && <div className="mt-2 text-sm text-red-400">{health.error}</div>}
          </div>
        </div>
      )}
    </div>
  )
}

// ==========================================
// 监控面板
// ==========================================
function MonitorPanel({ fetchApi, showToast }: any) {
  const [data, setData] = useState<any>(null)

  const loadData = async () => {
    try {
      const res = await fetchApi('/niuma/monitor')
      setData(res.data)
    } catch (err: any) {
      showToast('error', err.message)
    }
  }

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 30000)
    return () => clearInterval(interval)
  }, [fetchApi])

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  const { health, stats, recentImports: _ri, statusDistribution: _sd, userProgress } = data

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-5 gap-4">
        <div className="glass-card rounded-2xl p-5 text-center">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center mx-auto mb-3">
            <Database className="w-5 h-5 text-blue-500" />
          </div>
          <div className="text-2xl font-bold">{stats.totalImported}</div>
          <div className="text-xs text-muted-foreground mt-1">累计导入</div>
        </div>
        <div className="glass-card rounded-2xl p-5 text-center">
          <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center mx-auto mb-3">
            <TrendingUp className="w-5 h-5 text-green-500" />
          </div>
          <div className="text-2xl font-bold">{stats.todayImported}</div>
          <div className="text-xs text-muted-foreground mt-1">今日导入</div>
        </div>
        <div className="glass-card rounded-2xl p-5 text-center">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center mx-auto mb-3">
            <Users className="w-5 h-5 text-purple-500" />
          </div>
          <div className="text-2xl font-bold">{stats.totalNiumaCustomers}</div>
          <div className="text-xs text-muted-foreground mt-1">牛马客户总数</div>
        </div>
        <div className="glass-card rounded-2xl p-5 text-center">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center mx-auto mb-3">
            <CheckCircle className="w-5 h-5 text-orange-500" />
          </div>
          <div className="text-2xl font-bold">{stats.assignedNiumaCustomers}</div>
          <div className="text-xs text-muted-foreground mt-1">已分派</div>
        </div>
        <div className="glass-card rounded-2xl p-5 text-center">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center mx-auto mb-3">
            <Gauge className="w-5 h-5 text-red-500" />
          </div>
          <div className="text-2xl font-bold">{stats.assignmentRate}%</div>
          <div className="text-xs text-muted-foreground mt-1">分派率</div>
        </div>
      </div>

      {health && (
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 gradient-text" />
            <h2 className="text-base font-semibold">引擎连接状态</h2>
          </div>
          <div className={`p-4 rounded-xl border ${health.ok ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
            <div className="flex items-center gap-2">
              {health.ok ? <CheckCircle className="w-5 h-5 text-green-500" /> : <AlertCircle className="w-5 h-5 text-red-500" />}
              <span className={`font-medium ${health.ok ? 'text-green-500' : 'text-red-500'}`}>
                {health.ok ? `连接正常 · ${health.latency}ms` : '连接异常'}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 gradient-text" />
          <h2 className="text-base font-semibold">员工处理进度</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">员工</th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">客户数</th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">已成交</th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">任务数</th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">已完成</th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">完成率</th>
              </tr>
            </thead>
            <tbody>
              {userProgress?.map((user: any) => (
                <tr key={user.id} className="border-b border-border/30">
                  <td className="py-2 px-3 font-medium">{user.nickname}</td>
                  <td className="py-2 px-3">{user.customer_count || 0}</td>
                  <td className="py-2 px-3 text-green-500">{user.closed_count || 0}</td>
                  <td className="py-2 px-3">{user.task_count || 0}</td>
                  <td className="py-2 px-3 text-blue-500">{user.completed_task_count || 0}</td>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 rounded-full bg-secondary overflow-hidden">
                        <div className="h-full rounded-full gradient-primary transition-all" style={{ width: `${user.task_count > 0 ? (user.completed_task_count / user.task_count * 100) : 0}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {user.task_count > 0 ? Math.round(user.completed_task_count / user.task_count * 100) : 0}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ==========================================
// 知识库面板 - 同步牛马AI引擎知识库
// ==========================================
function KnowledgePanel({ fetchApi, showToast }: any) {
  const [activeSubTab, setActiveSubTab] = useState<'remote' | 'local' | 'history'>('remote')
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [categories, setCategories] = useState<any[]>([])
  const [syncHistory, setSyncHistory] = useState<any[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [vendorStats, setVendorStats] = useState<Record<string, number>>({})
  const [selectedVendor, setSelectedVendor] = useState('')
  const pageSize = 20

  // 4大厂商配置
  const vendors = [
    { id: 'autodesk', label: 'Autodesk', color: 'bg-red-500/10 text-red-500' },
    { id: 'sketchup', label: 'SketchUp', color: 'bg-green-500/10 text-green-500' },
    { id: 'adobe', label: 'Adobe', color: 'bg-blue-500/10 text-blue-500' },
    { id: 'dassault', label: '达索', color: 'bg-purple-500/10 text-purple-500' },
  ]

  const loadRemote = async (p = 1, vendor = selectedVendor) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('page', String(p))
      params.append('limit', String(pageSize))
      if (search) params.append('search', search)
      if (category) params.append('category', category)
      if (vendor) params.append('vendor', vendor)
      const res = await fetchApi(`/niuma/knowledge?${params.toString()}`)
      setItems(res.data?.data?.items || [])
      setTotal(res.data?.data?.total || 0)
      setCategories(res.data?.data?.categories || [])
      setVendorStats(res.data?.data?.vendor_stats || {})
      setPage(p)
    } catch (err: any) {
      showToast('error', err.message)
    }
    setLoading(false)
  }

  const loadLocal = async (p = 1, vendor = selectedVendor) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('page', String(p))
      params.append('limit', String(pageSize))
      if (search) params.append('search', search)
      if (category) params.append('category', category)
      if (vendor) params.append('vendor', vendor)
      const res = await fetchApi(`/niuma/knowledge/local?${params.toString()}`)
      setItems(res.data?.items || [])
      setTotal(res.data?.total || 0)
      setPage(p)
    } catch (err: any) {
      showToast('error', err.message)
    }
    setLoading(false)
  }

  const loadHistory = async () => {
    try {
      const res = await fetchApi('/niuma/knowledge/sync-history')
      setSyncHistory(res.data || [])
    } catch (err: any) {
      showToast('error', err.message)
    }
  }

  const doSync = async () => {
    setSyncing(true)
    try {
      const res = await fetchApi('/niuma/knowledge/sync', { method: 'POST' })
      showToast('success', `同步完成: ${res.data?.inserted || 0}/${res.data?.total || 0} 条`)
      loadHistory()
    } catch (err: any) {
      showToast('error', err.message)
    }
    setSyncing(false)
  }

  const handleVendorChange = (vendorId: string) => {
    const newVendor = selectedVendor === vendorId ? '' : vendorId
    setSelectedVendor(newVendor)
    if (activeSubTab === 'remote') loadRemote(1, newVendor)
    else if (activeSubTab === 'local') loadLocal(1, newVendor)
  }

  useEffect(() => {
    if (activeSubTab === 'remote') loadRemote(1)
    else if (activeSubTab === 'local') loadLocal(1)
    else loadHistory()
  }, [activeSubTab])

  return (
    <div className="space-y-6">
      {/* 子标签 */}
      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 gradient-text" />
            <h2 className="text-base font-semibold">知识库管理</h2>
            <span className="text-xs text-muted-foreground ml-2">同步牛马AI引擎知识库</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setActiveSubTab('remote')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeSubTab === 'remote' ? 'gradient-primary text-white' : 'bg-secondary text-muted-foreground'
              }`}
            >
              远程知识库
            </button>
            <button
              onClick={() => setActiveSubTab('local')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeSubTab === 'local' ? 'gradient-primary text-white' : 'bg-secondary text-muted-foreground'
              }`}
            >
              本地知识库
            </button>
            <button
              onClick={() => setActiveSubTab('history')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeSubTab === 'history' ? 'gradient-primary text-white' : 'bg-secondary text-muted-foreground'
              }`}
            >
              同步历史
            </button>
          </div>
        </div>

        {/* 4大厂商筛选 */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xs text-muted-foreground">厂商筛选:</span>
          {vendors.map((v) => (
            <button
              key={v.id}
              onClick={() => handleVendorChange(v.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                selectedVendor === v.id ? v.color + ' ring-1 ring-current' : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              {v.label}
              {vendorStats[v.id] > 0 && (
                <span className="ml-1 opacity-70">({vendorStats[v.id]})</span>
              )}
            </button>
          ))}
          {selectedVendor && (
            <button
              onClick={() => handleVendorChange('')}
              className="px-2 py-1 rounded-lg text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* 搜索和同步 */}
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (activeSubTab === 'remote' ? loadRemote(1) : loadLocal(1))}
              placeholder="搜索知识库标题或内容"
              className="w-full h-10 pl-10 pr-4 bg-background border border-border/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          {activeSubTab === 'remote' && (
            <button
              onClick={doSync}
              disabled={syncing}
              className="h-10 px-5 gradient-primary text-white text-sm font-medium rounded-xl shadow-glow flex items-center gap-2 disabled:opacity-50"
            >
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {syncing ? '同步中...' : '同步到本地'}
            </button>
          )}
          <button
            onClick={() => activeSubTab === 'remote' ? loadRemote(1) : loadLocal(1)}
            disabled={loading}
            className="h-10 px-4 btn-ghost text-sm rounded-xl flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            搜索
          </button>
        </div>
      </div>

      {/* 内容列表 */}
      {activeSubTab !== 'history' ? (
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-muted-foreground">共 {total} 条</span>
            {categories.length > 0 && (
              <select
                value={category}
                onChange={(e) => { setCategory(e.target.value); activeSubTab === 'remote' ? loadRemote(1) : loadLocal(1) }}
                className="px-3 py-1.5 rounded-lg bg-secondary text-sm border-none"
              >
                <option value="">全部分类</option>
                {categories.map((c: any) => (
                  <option key={c.name} value={c.name}>{c.name} ({c.count})</option>
                ))}
              </select>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item: any, i: number) => {
                // 从knowledge_id提取厂商
                const vendorMatch = item.knowledge_id?.match(/^PIRACY_(\w+)_/)
                const itemVendor = vendorMatch ? vendorMatch[1].toLowerCase() : 'unknown'
                const vendorConfig = vendors.find(v => v.id === itemVendor)
                return (
                  <div key={i} className="p-4 rounded-xl bg-secondary/30 border border-border/30">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${vendorConfig?.color || 'bg-gray-500/10 text-gray-500'}`}>
                        {vendorConfig?.label || itemVendor}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                        {item.category}
                      </span>
                      {item.sub_category && (
                        <span className="px-2 py-0.5 rounded-full bg-secondary text-muted-foreground text-xs">
                          {item.sub_category}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto">
                        置信度: {item.confidence_score}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold mb-1">{item.title}</h3>
                    <p className="text-xs text-muted-foreground line-clamp-2">{item.content}</p>
                    <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                      {item.detection_methods && item.detection_methods !== '[]' && (
                        <span>检测: {item.detection_methods}</span>
                      )}
                      {item.risk_indicators && item.risk_indicators !== '{}' && (
                        <span>风险: {item.risk_indicators}</span>
                      )}
                    </div>
                  </div>
                )
              })}
              {items.length === 0 && (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  暂无数据
                </div>
              )}
            </div>
          )}

          {/* 分页 */}
          {total > pageSize && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                onClick={() => activeSubTab === 'remote' ? loadRemote(page - 1) : loadLocal(page - 1)}
                disabled={page <= 1 || loading}
                className="px-3 py-1.5 rounded-lg bg-secondary text-sm disabled:opacity-50"
              >
                上一页
              </button>
              <span className="text-sm text-muted-foreground">第 {page} 页</span>
              <button
                onClick={() => activeSubTab === 'remote' ? loadRemote(page + 1) : loadLocal(page + 1)}
                disabled={items.length < pageSize || loading}
                className="px-3 py-1.5 rounded-lg bg-secondary text-sm disabled:opacity-50"
              >
                下一页
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="glass-card rounded-2xl p-6">
          <h3 className="text-sm font-semibold mb-4">同步历史</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">时间</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">总数</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">成功</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">状态</th>
                </tr>
              </thead>
              <tbody>
                {syncHistory.map((h: any, i: number) => (
                  <tr key={i} className="border-b border-border/30">
                    <td className="py-2 px-3">{h.created_at}</td>
                    <td className="py-2 px-3">{h.total_items}</td>
                    <td className="py-2 px-3">{h.inserted_items}</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        h.sync_status === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                      }`}>
                        {h.sync_status === 'success' ? '成功' : '失败'}
                      </span>
                    </td>
                  </tr>
                ))}
                {syncHistory.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-muted-foreground">暂无同步记录</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
