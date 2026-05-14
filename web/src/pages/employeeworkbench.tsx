import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSalesCrewStore } from '../stores/salesCrewStore'
import { useUISettingsStore } from '../stores/uiSettingsStore'
import {
  Users, X, RefreshCw, Phone, Mail, Clock,
  MessageSquare, Briefcase, Calendar, Send,
  AlertCircle, Eye, ClipboardList, Zap,
  MapPin, Tag, Building2, UserCheck, History,
  FileText, User, Search, ChevronDown,
} from 'lucide-react'
import axios from 'axios'
import { useAuthStore } from '../stores/auth.ts'

function formatDate(dateValue: any): string {
  if (!dateValue) return '-'
  const d = new Date(dateValue)
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

interface Customer {
  id: number
  name: string
  company: string | null
  phone: string | null
  email: string | null
  status: string
  source: string | null
  vendor: string | null
  product_interest: string | null
  followUpCount?: number
  lastFollowUpAt?: string | null
  assigned_name?: string
  niuma_metadata?: string | null
}

interface Task {
  id: number
  title: string
  status: string
  priority: string
  due_date: string | null
  customer_name: string | null
  assigned_name?: string
}

const STATUS_OPTIONS = [
  { value: 'lead', label: '线索', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' },
  { value: 'prospect', label: '意向', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
  { value: 'customer', label: '成交', color: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20' },
  { value: 'churned', label: '流失', color: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20' },
]

const FOLLOW_UP_TYPES = [
  { value: 'phone', label: '电话' },
  { value: 'email', label: '邮件' },
  { value: 'visit', label: '拜访' },
  { value: 'wechat', label: '微信' },
  { value: 'other', label: '其他' },
]

export default function EmployeeWorkbenchPage() {
  const token = useAuthStore((state) => state.token)

  const [customers, setCustomers] = useState<Customer[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [todos, setTodos] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error'>('success')

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [followUpContent, setFollowUpContent] = useState('')
  const [followUpType, setFollowUpType] = useState('phone')
  const [showFollowUp, setShowFollowUp] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [detailFollowUps, setDetailFollowUps] = useState<any[]>([])
  const [detailCustomerFull, setDetailCustomerFull] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailActiveTab, setDetailActiveTab] = useState<'info'|'followups'|'history'|'tasks'>('info')
  const [enterpriseProfile, setEnterpriseProfile] = useState<any>(null)
  const { openForCustomer } = useSalesCrewStore()
  const { pageSize, updatePageSize, loadSettings } = useUISettingsStore()
  const isAdmin = useAuthStore((s) => s.isAdmin)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [panelOpen, setPanelOpen] = useState<Record<string, boolean>>({ meta: true, dist: true, work: true })
  const [statModalType, setStatModalType] = useState<string | null>(null)

  useEffect(() => { loadSettings() }, [loadSettings])
  useEffect(() => { setCurrentPage(1) }, [searchQuery])
  useEffect(() => { setCurrentPage(1) }, [pageSize])

  const showMsg = (msg: string, type: 'success' | 'error') => {
    setMessage(msg)
    setMessageType(type)
    setTimeout(() => setMessage(''), 3000)
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const headers = { Authorization: `Bearer ${token || ''}` }
      const [customersRes, tasksRes, todosRes, statsRes] = await Promise.all([
        axios.get('/api/crm/customers?limit=100', { headers }),
        axios.get('/api/crm/tasks?limit=50', { headers }),
        axios.get('/api/crm/todos?limit=50', { headers }),
        axios.get('/api/crm/stats', { headers }),
      ])
      setCustomers(customersRes.data.data?.list || [])
      setTasks(Array.isArray(tasksRes.data.data) ? tasksRes.data.data : [])
      setTodos(Array.isArray(todosRes.data.data) ? todosRes.data.data : [])
      setStats(statsRes.data.data)
    } catch (err: any) { console.error('加载工作台数据失败:', err) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleAddFollowUp = async () => {
    if (!selectedCustomer || !followUpContent.trim()) { showMsg('请输入跟进内容', 'error'); return }
    setLoading(true)
    try {
      const headers = { Authorization: `Bearer ${token || ''}` }
      await axios.post('/api/crm/follow-ups', { customerId: selectedCustomer.id, content: followUpContent, type: followUpType }, { headers })
      showMsg('跟进记录添加成功', 'success')
      setFollowUpContent('')
      setFollowUpType('phone')
      setShowFollowUp(false)
      setSelectedCustomer(null)
      loadData()
    } catch (err: any) { showMsg(err.response?.data?.error || '添加失败', 'error') }
    finally { setLoading(false) }
  }

  const openDetail = async (customer: Customer) => {
    setSelectedCustomer(customer)
    setShowDetail(true)
    setDetailLoading(true)
    setDetailActiveTab('info')
    setEnterpriseProfile(null)
    try {
      const headers = { Authorization: `Bearer ${token || ''}` }
      const [followResp, fullResp, profileResp] = await Promise.allSettled([
        axios.get(`/api/crm/follow-ups?customerId=${customer.id}`, { headers }),
        axios.get(`/api/crm/customers/${customer.id}`, { headers }),
        axios.get(`/api/crm/customers/${customer.id}/enterprise-profile`, { headers }),
      ])
      if (followResp.status === 'fulfilled') {
        setDetailFollowUps(followResp.value.data.data || [])
      } else {
        setDetailFollowUps([])
      }
      if (fullResp.status === 'fulfilled') {
        setDetailCustomerFull(fullResp.value.data.data || null)
      } else {
        setDetailCustomerFull(null)
      }
      if (profileResp.status === 'fulfilled' && profileResp.value.data?.success) {
        setEnterpriseProfile(profileResp.value.data.data)
      }
    } catch (err) { console.error('加载客户详情失败:', err) }
    finally { setDetailLoading(false) }
  }

  const getStatusInfo = (status: string) => STATUS_OPTIONS.find(s => s.value === status) || { label: status, color: '' }

  const filteredCustomers = useMemo(() => {
    if (!searchQuery.trim()) return customers
    const q = searchQuery.toLowerCase()
    return customers.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.company && c.company.toLowerCase().includes(q))
    )
  }, [customers, searchQuery])

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / pageSize))
  const paginatedCustomers = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredCustomers.slice(start, start + pageSize)
  }, [filteredCustomers, currentPage, pageSize])

  const statusDistribution = useMemo(() => {
    const dist = { lead: 0, prospect: 0, customer: 0, churned: 0 }
    customers.forEach(c => { if (dist.hasOwnProperty(c.status)) dist[c.status as keyof typeof dist]++ })
    return dist
  }, [customers])
  const totalFollowUps = useMemo(() => customers.reduce((sum, c) => sum + (c.followUpCount || 0), 0), [customers])
  const completedTasks = useMemo(() => tasks.filter(t => t.status === 'completed').length, [tasks])
  const taskRate = tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0
  const pendingTodos = todos.filter((t: any) => t.status !== 'completed').length

  const togglePanel = (key: string) => setPanelOpen(prev => ({ ...prev, [key]: !prev[key] }))

  const getInitials = (name: string) => {
    if (!name) return '?'
    return name.charAt(0).toUpperCase()
  }

  const getAvatarGradient = (name: string) => {
    const gradients = [
      'from-blue-500 to-indigo-600',
      'from-purple-500 to-pink-600',
      'from-amber-500 to-orange-600',
      'from-green-500 to-emerald-600',
      'from-rose-500 to-red-600',
      'from-cyan-500 to-blue-600',
      'from-violet-500 to-purple-600',
      'from-teal-500 to-green-600',
    ]
    let hash = 0
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    return gradients[Math.abs(hash) % gradients.length]
  }

  const getStatIconBg = (index: number) => {
    const bgs = [
      'from-blue-500/20 to-indigo-500/10 shadow-blue-500/20',
      'from-purple-500/20 to-pink-500/10 shadow-purple-500/20',
      'from-amber-500/20 to-orange-500/10 shadow-amber-500/20',
      'from-green-500/20 to-emerald-500/10 shadow-green-500/20',
    ]
    return bgs[index % bgs.length]
  }

  const getStatIconColor = (index: number) => {
    const colors = ['text-blue-600 dark:text-blue-400', 'text-purple-600 dark:text-purple-400', 'text-amber-600 dark:text-amber-400', 'text-green-600 dark:text-green-400']
    return colors[index % colors.length]
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-green-500/20 to-emerald-600/10 shadow-[0_2px_8px_rgba(34,197,94,0.15)]">
            <Briefcase className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">CRM工作台</h1>
            <p className="text-sm text-muted-foreground">我的客户 · 我的待办 · 跟进记录</p>
          </div>
        </div>
        <button onClick={loadData} disabled={loading} className="flex items-center gap-2 px-4 h-9 bg-secondary rounded-lg text-sm hover:bg-secondary/80 transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />刷新
        </button>
      </div>

      {message && (
        <div className={`text-sm p-3 mx-6 mt-4 rounded-xl flex items-center justify-between shadow-[0_1px_3px_rgba(0,0,0,0.04)] ${messageType === 'success' ? 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'}`}>
          {message}
          <button onClick={() => setMessage('')} className="hover:opacity-70"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="flex-1 overflow-auto p-6 animate-fade-in">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { type: 'customers', icon: Users, label: '我的客户', value: stats?.totalCustomers || 0, index: 0 },
            { type: 'tasks', icon: ClipboardList, label: '我的任务', value: stats?.totalTasks || 0, index: 1 },
            { type: 'todos', icon: AlertCircle, label: '待办事项', value: todos.filter((t: any) => t.status !== 'completed').length, index: 2 },
            { type: 'schedules', icon: Calendar, label: '今日日程', value: todos.filter((t: any) => t.status !== 'completed' && t.due_date && new Date(t.due_date).toDateString() === new Date().toDateString()).length, index: 3 },
          ].map((stat) => (
            <div key={stat.label} onClick={() => setStatModalType(stat.type)} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4 cursor-pointer shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] hover:border-primary/20 transition-all duration-300">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br ${getStatIconBg(stat.index)} shadow-[0_2px_8px_rgba(0,0,0,0.08)]`}>
                <stat.icon className={`w-6 h-6 ${getStatIconColor(stat.index)}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground count-up">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="bg-card border border-border rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-secondary/30">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />我的客户 <span className="text-xs text-muted-foreground font-normal">({filteredCustomers.length}{searchQuery ? ` / ${customers.length}总计` : ''})</span>
                </h3>
              </div>
              <div className="px-4 py-2 border-b border-border/50">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="搜索客户名称或公司..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-background border border-border rounded-md text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                  />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium">客户</th>
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium">公司</th>
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium">状态</th>
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium">跟进</th>
                      <th className="text-right px-4 py-3 text-muted-foreground font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedCustomers.length === 0 ? (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                        {searchQuery ? <><Search className="w-8 h-8 mx-auto mb-2 opacity-30" /><p>未找到匹配 "{searchQuery}" 的客户</p></> : <><Users className="w-8 h-8 mx-auto mb-2 opacity-50" />暂无分配客户</>}
                      </td></tr>
                    ) : (
                      paginatedCustomers.map((customer) => {
                        const statusInfo = getStatusInfo(customer.status)
                        const metrics = (() => {
                          if (!customer.niuma_metadata) return null
                          try {
                            const raw = JSON.parse(customer.niuma_metadata)
                            return {
                              score: raw.v9_customer_score || 0,
                              piracy: raw.v9_piracy || 0,
                              qualified: raw.v9_is_qualified === 1,
                            }
                          } catch { return null }
                        })()
                        return (
                          <tr key={customer.id} className="border-b border-border/50 hover:bg-secondary/50 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                  <User className="w-4 h-4 text-primary" />
                                </div>
                                <div>
                                  <p className="font-medium text-foreground">{customer.name}</p>
                                  {metrics && (
                                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                                      <span>评分 <span className="text-foreground font-mono font-medium">{metrics.score}</span></span>
                                      <span className="text-border/50">|</span>
                                      <span>盗版 <span className={`font-mono font-medium ${metrics.piracy >= 80 ? 'text-red-500' : metrics.piracy >= 50 ? 'text-amber-500' : 'text-green-500'}`}>{metrics.piracy}</span></span>
                                      <span className="text-border/50">|</span>
                                      <span className={metrics.qualified ? 'text-green-500' : 'text-muted-foreground'}>{metrics.qualified ? '优质' : '普通'}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{customer.company || '-'}</td>
                            <td className="px-4 py-3">
                              <span className={`text-xs px-2 py-1 rounded-full ${statusInfo.color}`}>{statusInfo.label}</span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="space-y-1">
                                <div className="flex items-center gap-1 text-xs text-muted-foreground"><MessageSquare className="w-3 h-3" />{customer.followUpCount || 0} 次</div>
                                {customer.lastFollowUpAt && <div className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="w-3 h-3" />{new Date(customer.lastFollowUpAt).toLocaleDateString()}</div>}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1">
                                {isAdmin && (
                                <button onClick={() => openForCustomer(customer)} className="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 transition-colors" title="销售教练">
                                  <Zap className="w-4 h-4 text-amber-500" />
                                </button>
                                )}
                                <button onClick={() => openDetail(customer)} className="p-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 transition-colors" title="查看详情">
                                  <Eye className="w-4 h-4 text-blue-500" />
                                </button>
                                <button onClick={() => { setSelectedCustomer(customer); setShowFollowUp(true) }} className="p-1.5 rounded-lg bg-green-500/10 hover:bg-green-500/20 transition-colors" title="添加跟进">
                                  <Send className="w-4 h-4 text-green-500" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 border-t border-border/50 flex items-center justify-between bg-secondary/20">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">共 {filteredCustomers.length} 条</span>
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-muted-foreground">每页</span>
                      <input
                        type="number"
                        value={pageSize}
                        min={1}
                        max={500}
                        disabled={!isAdmin}
                        onChange={e => {
                          const val = Number(e.target.value)
                          if (val >= 1 || e.target.value === '') {
                            updatePageSize(val || 1)
                          }
                        }}
                        className="w-16 bg-background border border-border rounded px-1.5 py-0.5 text-xs text-foreground focus:outline-none focus:border-primary/50 text-center disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <span className="text-muted-foreground">条</span>
                    </div>
                  </div>
                  {filteredCustomers.length > pageSize && (
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1} className="px-2.5 py-1 text-xs rounded-md bg-background border border-border hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors">上一页</button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                      <button key={p} onClick={() => setCurrentPage(p)} className={`px-2.5 py-1 text-xs rounded-md transition-colors ${currentPage === p ? 'bg-primary text-primary-foreground shadow-[0_1px_3px_rgba(0,0,0,0.15)]' : 'bg-background border border-border hover:bg-secondary'}`}>{p}</button>
                    ))}
                    <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className="px-2.5 py-1 text-xs rounded-md bg-background border border-border hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors">下一页</button>
                  </div>
                  )}
                </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="bg-card border border-border rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
              <button onClick={() => togglePanel('meta')} className="w-full px-4 py-3 flex items-center justify-between gap-2 hover:bg-secondary/30 transition-colors">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500/20 to-teal-500/10 flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
                    <Briefcase className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <span className="text-sm font-semibold text-foreground">业绩分析</span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">{customers.length}</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${panelOpen.meta ? 'rotate-0' : '-rotate-90'}`} />
              </button>
              <div className={`overflow-hidden transition-all duration-300 ${panelOpen.meta ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="px-4 pb-3 space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-secondary/20 rounded-lg p-2.5 text-center border border-border/50">
                      <p className="text-lg font-bold text-emerald-500">{customers.length}</p>
                      <p className="text-[10px] text-muted-foreground">客户总数</p>
                    </div>
                    <div className="bg-secondary/20 rounded-lg p-2.5 text-center border border-border/50">
                      <p className="text-lg font-bold text-blue-500">{tasks.length}</p>
                      <p className="text-[10px] text-muted-foreground">任务总数</p>
                    </div>
                    <div className="bg-secondary/20 rounded-lg p-2.5 text-center border border-border/50">
                      <p className="text-lg font-bold text-amber-500">{pendingTodos}</p>
                      <p className="text-[10px] text-muted-foreground">待办事项</p>
                    </div>
                    <div className="bg-secondary/20 rounded-lg p-2.5 text-center border border-border/50">
                      <p className="text-lg font-bold text-purple-500">{totalFollowUps}</p>
                      <p className="text-[10px] text-muted-foreground">跟进总数</p>
                    </div>
                  </div>
                  <div className="bg-secondary/20 rounded-lg p-3 border border-border/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-foreground">任务完成率</span>
                      <span className="text-xs font-bold text-foreground">{taskRate}%</span>
                    </div>
                    <div className="w-full h-2 bg-background rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all duration-500" style={{ width: `${taskRate}%` }} />
                    </div>
                    <div className="flex items-center justify-between mt-1.5 text-[10px] text-muted-foreground">
                      <span>已完成 {completedTasks}</span>
                      <span>总计 {tasks.length}</span>
                    </div>
                  </div>
                  <div className="bg-secondary/20 rounded-lg p-3 border border-border/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-foreground">转化率</span>
                      <span className="text-xs font-bold text-foreground">{customers.length ? Math.round((statusDistribution.customer / customers.length) * 100) : 0}%</span>
                    </div>
                    <div className="w-full h-2 bg-background rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-blue-400 to-blue-500 rounded-full transition-all duration-500" style={{ width: `${customers.length ? (statusDistribution.customer / customers.length) * 100 : 0}%` }} />
                    </div>
                    <div className="flex items-center justify-between mt-1.5 text-[10px] text-muted-foreground">
                      <span>成交 {statusDistribution.customer}</span>
                      <span>总客户 {customers.length}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
              <button onClick={() => togglePanel('dist')} className="w-full px-4 py-3 flex items-center justify-between gap-2 hover:bg-secondary/30 transition-colors">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500/20 to-indigo-500/10 flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
                    <Users className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span className="text-sm font-semibold text-foreground">客户分布</span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">{customers.length}</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${panelOpen.dist ? 'rotate-0' : '-rotate-90'}`} />
              </button>
              <div className={`overflow-hidden transition-all duration-300 ${panelOpen.dist ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="px-4 pb-3 space-y-2.5">
                  {[
                    { key: 'lead', label: '线索', value: statusDistribution.lead, color: 'bg-blue-500', textColor: 'text-blue-500', bgColor: 'bg-blue-500/10', max: customers.length || 1 },
                    { key: 'prospect', label: '意向', value: statusDistribution.prospect, color: 'bg-amber-500', textColor: 'text-amber-500', bgColor: 'bg-amber-500/10', max: customers.length || 1 },
                    { key: 'customer', label: '成交', value: statusDistribution.customer, color: 'bg-green-500', textColor: 'text-green-500', bgColor: 'bg-green-500/10', max: customers.length || 1 },
                    { key: 'churned', label: '流失', value: statusDistribution.churned, color: 'bg-red-500', textColor: 'text-red-500', bgColor: 'bg-red-500/10', max: customers.length || 1 },
                  ].map(s => (
                    <div key={s.key} className="bg-secondary/20 rounded-lg p-2.5 border border-border/50">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${s.color}`} />
                          <span className="text-xs text-foreground">{s.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-foreground">{s.value}</span>
                          <span className="text-[10px] text-muted-foreground">{s.max > 0 ? Math.round((s.value / s.max) * 100) : 0}%</span>
                        </div>
                      </div>
                      <div className="w-full h-1.5 bg-background rounded-full overflow-hidden">
                        <div className={`h-full ${s.color} rounded-full transition-all duration-500`} style={{ width: `${(s.value / s.max) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { label: '线索', value: statusDistribution.lead, color: 'bg-blue-500' },
                      { label: '意向', value: statusDistribution.prospect, color: 'bg-amber-500' },
                      { label: '成交', value: statusDistribution.customer, color: 'bg-green-500' },
                      { label: '流失', value: statusDistribution.churned, color: 'bg-red-500' },
                    ].map(s => (
                      <div key={s.label} className="bg-secondary/20 rounded-md p-1.5 text-center border border-border/50">
                        <div className={`w-2 h-2 rounded-full ${s.color} mx-auto mb-1`} />
                        <p className="text-xs font-bold text-foreground">{s.value}</p>
                        <p className="text-[9px] text-muted-foreground">{s.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
              <button onClick={() => togglePanel('work')} className="w-full px-4 py-3 flex items-center justify-between gap-2 hover:bg-secondary/30 transition-colors">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500/20 to-purple-500/10 flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
                    <ClipboardList className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                  </div>
                  <span className="text-sm font-semibold text-foreground">工作统计</span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 font-medium">{tasks.length}</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${panelOpen.work ? 'rotate-0' : '-rotate-90'}`} />
              </button>
              <div className={`overflow-hidden transition-all duration-300 ${panelOpen.work ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="px-4 pb-3 space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-secondary/20 rounded-lg p-2.5 text-center border border-border/50">
                      <p className="text-lg font-bold text-violet-500">{completedTasks}</p>
                      <p className="text-[10px] text-muted-foreground">已完成任务</p>
                    </div>
                    <div className="bg-secondary/20 rounded-lg p-2.5 text-center border border-border/50">
                      <p className="text-lg font-bold text-rose-500">{tasks.length - completedTasks}</p>
                      <p className="text-[10px] text-muted-foreground">进行中任务</p>
                    </div>
                    <div className="bg-secondary/20 rounded-lg p-2.5 text-center border border-border/50">
                      <p className="text-lg font-bold text-green-500">{todos.filter((t: any) => t.status === 'completed').length}</p>
                      <p className="text-[10px] text-muted-foreground">已完成待办</p>
                    </div>
                    <div className="bg-secondary/20 rounded-lg p-2.5 text-center border border-border/50">
                      <p className="text-lg font-bold text-amber-500">{pendingTodos}</p>
                      <p className="text-[10px] text-muted-foreground">未完成待办</p>
                    </div>
                  </div>
                  <div className="bg-secondary/20 rounded-lg p-3 border border-border/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-foreground">待办完成率</span>
                      <span className="text-xs font-bold text-foreground">{todos.length ? Math.round((todos.filter((t: any) => t.status === 'completed').length / todos.length) * 100) : 0}%</span>
                    </div>
                    <div className="w-full h-2 bg-background rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-violet-400 to-violet-500 rounded-full transition-all duration-500" style={{ width: `${todos.length ? (todos.filter((t: any) => t.status === 'completed').length / todos.length) * 100 : 0}%` }} />
                    </div>
                    <div className="flex items-center justify-between mt-1.5 text-[10px] text-muted-foreground">
                      <span>已完成 {todos.filter((t: any) => t.status === 'completed').length}</span>
                      <span>总计 {todos.length}</span>
                    </div>
                  </div>
                  <div className="bg-secondary/20 rounded-lg p-3 border border-border/50">
                    <h4 className="text-xs font-medium text-foreground mb-2">跟进频率</h4>
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div>
                        <p className="text-base font-bold text-emerald-500">{totalFollowUps}</p>
                        <p className="text-[9px] text-muted-foreground">总跟进次数</p>
                      </div>
                      <div>
                        <p className="text-base font-bold text-blue-500">{customers.filter(c => (c.followUpCount || 0) > 0).length}</p>
                        <p className="text-[9px] text-muted-foreground">已跟进客户</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showFollowUp && selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { setShowFollowUp(false); setSelectedCustomer(null) }}>
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-[0_8px_30px_rgba(0,0,0,0.12)]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-foreground">添加跟进记录</h3>
              <button onClick={() => { setShowFollowUp(false); setSelectedCustomer(null) }} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">客户: <span className="text-foreground font-medium">{selectedCustomer.name}</span></p>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">跟进方式</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {FOLLOW_UP_TYPES.map(t => (
                    <button key={t.value} onClick={() => setFollowUpType(t.value)} className={`px-3 h-7 rounded-lg text-xs transition-colors ${followUpType === t.value ? 'bg-primary text-primary-foreground' : 'bg-background border border-input hover:bg-secondary'}`}>{t.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">跟进内容</label>
                <textarea value={followUpContent} onChange={e => setFollowUpContent(e.target.value)} placeholder="输入跟进内容..." rows={4} className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none" />
              </div>
              <div className="flex gap-2">
                <button onClick={handleAddFollowUp} disabled={loading} className="flex items-center gap-1 px-4 h-9 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 transition-colors disabled:opacity-50">
                  <Send className="w-4 h-4" />{loading ? '提交中...' : '提交'}
                </button>
                <button onClick={() => { setShowFollowUp(false); setSelectedCustomer(null) }} className="px-4 h-9 bg-secondary rounded-lg text-sm hover:bg-secondary/80 transition-colors">取消</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDetail && selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { setShowDetail(false); setSelectedCustomer(null); setDetailCustomerFull(null); setEnterpriseProfile(null) }}>
          <div className="bg-card border border-border rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-[0_8px_30px_rgba(0,0,0,0.12)]" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${getAvatarGradient(selectedCustomer.name)} flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.1)]`}>
                  <span className="text-sm font-bold text-white">{getInitials(selectedCustomer.name)}</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">{selectedCustomer.name}</h3>
                  {selectedCustomer.company && <p className="text-xs text-muted-foreground">{selectedCustomer.company}</p>}
                </div>
              </div>
              <button onClick={() => { setShowDetail(false); setSelectedCustomer(null); setDetailCustomerFull(null) }} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><X className="w-5 h-5" /></button>
            </div>

            {/* Tabs */}
            <div className="px-6 pt-4 border-b border-border shrink-0">
              <div className="flex items-center gap-1">
                {[
                  { key: 'info' as const, label: '基本信息', icon: FileText },
                  { key: 'followups' as const, label: `跟进 (${detailFollowUps.length})`, icon: MessageSquare },
                  { key: 'history' as const, label: '分派', icon: History },
                  { key: 'tasks' as const, label: '任务', icon: ClipboardList },
                ].map(tab => (
                  <button key={tab.key} onClick={() => setDetailActiveTab(tab.key)} className={`flex items-center gap-1.5 px-3 h-8 rounded-t-lg text-xs font-semibold transition-all duration-200 ${detailActiveTab === tab.key ? 'bg-primary/10 text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/30'}`}>
                    <tab.icon className="w-3 h-3" />{tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {detailLoading ? (
                <div className="flex items-center justify-center py-12"><RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : detailActiveTab === 'info' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="bg-secondary/20 rounded-lg p-3 space-y-1.5 border border-border/50">
                      <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5 text-primary" />联系信息</h4>
                      <div className="space-y-1 text-xs">
                        {detailCustomerFull?.phone ? <div className="flex items-center gap-1.5"><Phone className="w-3 h-3 text-muted-foreground" /><span className="text-foreground">{detailCustomerFull.phone}</span></div> : <div className="flex items-center gap-1.5 text-muted-foreground"><Phone className="w-3 h-3" /><span>-</span></div>}
                        {detailCustomerFull?.email ? <div className="flex items-center gap-1.5"><Mail className="w-3 h-3 text-muted-foreground" /><span className="text-foreground">{detailCustomerFull.email}</span></div> : <div className="flex items-center gap-1.5 text-muted-foreground"><Mail className="w-3 h-3" /><span>-</span></div>}
                        {detailCustomerFull?.address ? <div className="flex items-center gap-1.5"><MapPin className="w-3 h-3 text-muted-foreground" /><span className="text-foreground">{detailCustomerFull.address}</span></div> : <div className="flex items-center gap-1.5 text-muted-foreground"><MapPin className="w-3 h-3" /><span>-</span></div>}
                      </div>
                    </div>
                    <div className="bg-secondary/20 rounded-lg p-3 space-y-1.5 border border-border/50">
                      <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Tag className="w-3.5 h-3.5 text-primary" />业务信息</h4>
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-1.5"><span className="text-muted-foreground">状态:</span> <span className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full font-semibold border ${getStatusInfo(selectedCustomer.status).color}`}>{getStatusInfo(selectedCustomer.status).label}</span></div>
                        {detailCustomerFull?.industry && <div className="flex items-center gap-1.5"><span className="text-muted-foreground">行业:</span> <span className="text-foreground">{detailCustomerFull.industry}</span></div>}
                        {detailCustomerFull?.source && <div className="flex items-center gap-1.5"><span className="text-muted-foreground">来源:</span> <span className="text-foreground">{detailCustomerFull.source}</span></div>}
                        {detailCustomerFull?.vendor && <div className="flex items-center gap-1.5"><span className="text-muted-foreground">厂商:</span> <span className="text-foreground">{detailCustomerFull.vendor}</span></div>}
                        {detailCustomerFull?.budget_range && <div className="flex items-center gap-1.5"><span className="text-muted-foreground">预算:</span> <span className="text-foreground">{detailCustomerFull.budget_range}</span></div>}
                      </div>
                    </div>
                  </div>
                  {detailCustomerFull?.product_interest && (
                    <div className="bg-secondary/20 rounded-lg p-3 border border-border/50">
                      <h4 className="text-xs font-semibold text-foreground mb-1">产品意向</h4>
                      <p className="text-xs text-foreground">{detailCustomerFull.product_interest}</p>
                    </div>
                  )}
                  {detailCustomerFull?.notes && (
                    <div className="bg-secondary/20 rounded-lg p-3 border border-border/50">
                      <h4 className="text-xs font-semibold text-foreground mb-1">备注</h4>
                      <p className="text-xs text-foreground">{detailCustomerFull.notes}</p>
                    </div>
                  )}
                  {enterpriseProfile?.engine && (
                    <div className="bg-secondary/20 border border-border rounded-lg p-3">
                      <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-2">引擎分析</h4>
                      <div className="grid grid-cols-4 gap-2">
                        <div className="text-center bg-card/50 rounded-md p-2">
                          <div className={`text-lg font-bold ${(enterpriseProfile.engine.piracyIndex||0) >= 80 ? 'text-red-500' : (enterpriseProfile.engine.piracyIndex||0) >= 60 ? 'text-amber-500' : 'text-green-500'}`}>{enterpriseProfile.engine.piracyIndex ?? '-'}</div>
                          <div className="text-[10px] text-muted-foreground">盗版指数</div>
                        </div>
                        <div className="text-center bg-card/50 rounded-md p-2">
                          <div className="text-lg font-bold text-foreground">{enterpriseProfile.engine.qualityScore ?? '-'}</div>
                          <div className="text-[10px] text-muted-foreground">质量评分</div>
                        </div>
                        <div className="text-center bg-card/50 rounded-md p-2">
                          <div className="text-lg font-bold text-purple-500">{enterpriseProfile.engine.customerScore ?? '-'}</div>
                          <div className="text-[10px] text-muted-foreground">客户价值</div>
                        </div>
                        <div className="text-center bg-card/50 rounded-md p-2">
                          <div className={`text-lg font-bold ${enterpriseProfile.engine.isQualified ? 'text-green-500' : 'text-muted-foreground'}`}>{enterpriseProfile.engine.isQualified ? '优质' : '普通'}</div>
                          <div className="text-[10px] text-muted-foreground">线索质量</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-2 text-[11px] flex-wrap">
                        <span className="text-muted-foreground">依赖:</span>
                        <span className={`px-1.5 py-0.5 rounded-full font-medium ${enterpriseProfile.engine.dependencyLevel === 'high' ? 'bg-red-500/10 text-red-600' : enterpriseProfile.engine.dependencyLevel === 'medium' ? 'bg-amber-500/10 text-amber-600' : 'bg-blue-500/10 text-blue-600'}`}>{enterpriseProfile.engine.dependencyLevel ?? '-'}</span>
                        <span className="text-muted-foreground">采购:</span>
                        <span className={`px-1.5 py-0.5 rounded-full font-medium ${enterpriseProfile.engine.purchasingLevel === 'high' ? 'bg-green-500/10 text-green-600' : enterpriseProfile.engine.purchasingLevel === 'medium' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>{enterpriseProfile.engine.purchasingLevel ?? '-'}</span>
                        <span className="text-muted-foreground">产品:</span>
                        <span className="text-foreground">{enterpriseProfile.engine.products || enterpriseProfile.engine.coreProduct || '-'}</span>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-secondary/20 rounded-lg p-2 border border-border/50">
                      <p className="text-base font-bold text-foreground">{detailFollowUps.length}</p>
                      <p className="text-[10px] text-muted-foreground">跟进次数</p>
                    </div>
                    <div className="bg-secondary/20 rounded-lg p-2 border border-border/50">
                      <p className="text-base font-bold text-foreground">{detailCustomerFull?.assignment_history?.length || 0}</p>
                      <p className="text-[10px] text-muted-foreground">分派次数</p>
                    </div>
                    <div className="bg-secondary/20 rounded-lg p-2 border border-border/50">
                      <p className="text-[10px] font-medium text-foreground">{formatDate(detailCustomerFull?.created_at || detailCustomerFull?.createdAt)}</p>
                      <p className="text-[10px] text-muted-foreground">创建时间</p>
                    </div>
                  </div>
                </div>
              )}

              {detailActiveTab === 'followups' && (
                <div>
                  {detailFollowUps.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground"><MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>暂无跟进记录</p></div>
                  ) : (
                    <div className="space-y-1.5">
                      {detailFollowUps.map((fu: any) => (
                        <div key={fu.id} className="bg-secondary/20 rounded-lg p-3 border border-border/50">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded-full font-semibold border border-primary/20">{FOLLOW_UP_TYPES.find(t => t.value === fu.type)?.label || fu.type}</span>
                              <span className="text-xs text-muted-foreground">{fu.createdBy || fu.user_name}</span>
                            </div>
                            <span className="text-xs text-muted-foreground">{formatDate(fu.created_at || fu.createdAt)}</span>
                          </div>
                          <p className="text-sm text-foreground">{fu.content}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {detailActiveTab === 'history' && (
                <div>
                  {(!detailCustomerFull?.assignment_history || detailCustomerFull.assignment_history.length === 0) ? (
                    <div className="text-center py-12 text-muted-foreground"><History className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>暂无分派历史</p></div>
                  ) : (
                    <div className="space-y-3">
                      {detailCustomerFull.assignment_history.map((h: any) => (
                        <div key={h.id} className="bg-secondary/20 rounded-xl p-4 border border-border/50">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <UserCheck className="w-4 h-4 text-primary" />
                              <span className="text-sm text-foreground">{h.from_name || '未分配'} <span className="text-muted-foreground">→</span> {h.to_name}</span>
                            </div>
                            <span className="text-xs text-muted-foreground">{formatDate(h.created_at)}</span>
                          </div>
                          {h.reason && <p className="text-xs text-muted-foreground">原因: {h.reason}</p>}
                          <p className="text-xs text-muted-foreground mt-1">操作人: {h.assigned_by_name}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {detailActiveTab === 'tasks' && (
                <div>
                  {(!detailCustomerFull?.related_tasks || detailCustomerFull.related_tasks?.length === 0) ? (
                    <div className="text-center py-12 text-muted-foreground"><ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>暂无关联任务</p></div>
                  ) : (
                    <div className="space-y-3">
                      {detailCustomerFull.related_tasks?.map((t: any) => (
                        <div key={t.id} className="bg-secondary/20 rounded-xl p-4 border border-border/50">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-foreground">{t.title}</p>
                            <span className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded-full font-semibold border ${t.status === 'completed' ? 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'}`}>{t.status === 'completed' ? '已完成' : '进行中'}</span>
                          </div>
                          {t.due_date && <p className="text-xs text-muted-foreground mt-1">截止: {new Date(t.due_date).toLocaleDateString()}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              </div>
        </div>
        </div>
      )}

      {statModalType && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setStatModalType(null)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col shadow-[0_8px_30px_rgba(0,0,0,0.12)]" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-border flex items-center justify-between shrink-0">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                {statModalType === 'customers' && <><Users className="w-4 h-4 text-primary" />我的客户详情</>}
                {statModalType === 'tasks' && <><ClipboardList className="w-4 h-4 text-primary" />我的任务详情</>}
                {statModalType === 'todos' && <><AlertCircle className="w-4 h-4 text-primary" />待办事项详情</>}
                {statModalType === 'schedules' && <><Calendar className="w-4 h-4 text-primary" />今日日程详情</>}
              </h3>
              <button onClick={() => setStatModalType(null)} className="p-1 rounded-lg hover:bg-secondary transition-colors"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {statModalType === 'customers' && (
                <div className="space-y-1.5">
                  {customers.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground"><Users className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm">暂无客户数据</p></div>
                  ) : (
                    customers.map(c => {
                      const statusInfo = getStatusInfo(c.status)
                      return (
                        <div key={c.id} className="flex items-center justify-between bg-secondary/20 rounded-lg px-3 py-2.5 border border-border/50 hover:bg-secondary/40 transition-colors">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <User className="w-3.5 h-3.5 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                              <p className="text-xs text-muted-foreground truncate">{c.company || '-'}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 ml-3">
                            <span className={`text-[11px] px-2 py-0.5 rounded-full ${statusInfo.color}`}>{statusInfo.label}</span>
                            <span className="text-xs text-muted-foreground">{c.followUpCount || 0} 次跟进</span>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              )}
              {statModalType === 'tasks' && (
                <div className="space-y-1.5">
                  {tasks.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground"><ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm">暂无任务数据</p></div>
                  ) : (
                    tasks.map(t => (
                      <div key={t.id} className="flex items-center justify-between bg-secondary/20 rounded-lg px-3 py-2.5 border border-border/50 hover:bg-secondary/40 transition-colors">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">{t.title}</p>
                          {t.due_date && <p className="text-xs text-muted-foreground">截止: {new Date(t.due_date).toLocaleDateString()}</p>}
                        </div>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold border shrink-0 ml-3 ${t.status === 'completed' ? 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'}`}>{t.status === 'completed' ? '已完成' : '进行中'}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
              {statModalType === 'todos' && (
                <div className="space-y-1.5">
                  {todos.filter((t: any) => t.status !== 'completed').length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground"><AlertCircle className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm">暂无待办事项</p></div>
                  ) : (
                    todos.filter((t: any) => t.status !== 'completed').map((t: any) => (
                      <div key={t.id} className="flex items-center justify-between bg-secondary/20 rounded-lg px-3 py-2.5 border border-border/50 hover:bg-secondary/40 transition-colors">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">{t.title || t.content}</p>
                          {t.due_date && <p className="text-xs text-muted-foreground">截止: {new Date(t.due_date).toLocaleDateString()}</p>}
                        </div>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20 shrink-0 ml-3">待处理</span>
                      </div>
                    ))
                  )}
                </div>
              )}
              {statModalType === 'schedules' && (
                <div className="space-y-1.5">
                  {todos.filter((t: any) => t.status !== 'completed' && t.due_date && new Date(t.due_date).toDateString() === new Date().toDateString()).length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground"><Calendar className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm">今日暂无日程安排</p></div>
                  ) : (
                    todos.filter((t: any) => t.status !== 'completed' && t.due_date && new Date(t.due_date).toDateString() === new Date().toDateString()).map((t: any) => (
                      <div key={t.id} className="flex items-center justify-between bg-secondary/20 rounded-lg px-3 py-2.5 border border-border/50 hover:bg-secondary/40 transition-colors">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">{t.title || t.content}</p>
                          {t.due_date && <p className="text-xs text-muted-foreground">{new Date(t.due_date).toLocaleString()}</p>}
                        </div>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 border border-blue-500/20 shrink-0 ml-3">今日日程</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
