import { useState, useEffect, useCallback } from 'react'
import {
  Users, Search, Plus, Trash2, Edit3, Check, X, RefreshCw,
  ChevronLeft, ChevronRight, User, Phone, Mail, Calendar,
  Clock, MessageSquare, Briefcase, MapPin, Tag, Filter,
  BarChart3, UserPlus, ClipboardList, CalendarDays, Eye,
  History, Send, GitBranch, UsersRound, TrendingUp, AlertCircle,
  Building2, PieChart, Activity, ChevronRight as ChevronRightIcon, UserCheck, ArrowRight, Settings,
  Zap, Award, Target, CheckCircle2, PhoneCall, MailOpen, Car, MessageCircle,
  Ban, Globe, FileText, XCircle, ExternalLink, PlusCircle, UserMinus, AlertTriangle, AlertOctagon,
} from 'lucide-react'
import axios from 'axios'
import { useAuthStore } from '../stores/auth'
import CRMSettingsPage from './CRMSettings'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { useCountUp } from '../hooks/useAnimations'

// 安全日期格式化函数
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
  address: string | null
  status: 'lead' | 'prospect' | 'customer' | 'churned'
  source: string | null
  industry: string | null
  remark: string | null
  createdAt: string
  updatedAt: string
  followUpCount?: number
  lastFollowUpAt?: string | null
}

interface FollowUp {
  id: number
  customerId: number
  content: string
  type: 'phone' | 'email' | 'visit' | 'wechat' | 'other'
  createdAt: string
  createdBy: string
}

interface CRMStats {
  totalCustomers: number
  totalTodos: number
  totalTasks: number
  todaySchedules: number
  customerTrend: { date: string; count: number }[]
}

interface PipelineStage {
  id: number
  name: string
  order_index: number
  color: string
  probability: number
}

interface Deal {
  id: number
  title: string
  customer_id: number
  customer_name: string
  customer_company: string
  customer_phone: string
  stage_id: number
  stage_name: string
  stage_color: string
  value: number
  expected_close_date: string | null
  assigned_to: number | null
  assigned_name: string | null
  priority: 'low' | 'medium' | 'high'
  probability: number
  status: 'open' | 'won' | 'lost'
  notes: string | null
  created_at: string
}

interface TeamMember {
  id: number
  nickname: string
  username: string
  customer_count: number
  deal_count: number
  deal_value: number
  task_count: number
  pending_tasks: number
  completed_tasks: number
  follow_up_count: number
}

interface TeamStats {
  overview: {
    members: number
    customers: number
    deals: number
    dealValue: number
    tasks: number
    pendingTasks: number
    overdueTasks: number
  }
  vendorDistribution: { vendor: string; count: number }[]
  stageDistribution: { name: string; color: string; count: number; value: number }[]
}

const STATUS_OPTIONS = [
  { value: 'lead', label: '线索', color: 'bg-blue-500/10 text-blue-500' },
  { value: 'prospect', label: '意向', color: 'bg-yellow-500/10 text-yellow-500' },
  { value: 'customer', label: '成交', color: 'bg-green-500/10 text-green-500' },
  { value: 'churned', label: '流失', color: 'bg-red-500/10 text-red-500' },
]

const FOLLOW_UP_TYPES = [
  { value: 'phone', label: '电话' },
  { value: 'email', label: '邮件' },
  { value: 'visit', label: '拜访' },
  { value: 'wechat', label: '微信' },
  { value: 'other', label: '其他' },
]

const PRIORITY_CONFIG = {
  low: { label: '低', color: 'bg-secondary text-muted-foreground' },
  medium: { label: '中', color: 'bg-amber-500/10 text-amber-500' },
  high: { label: '高', color: 'bg-red-500/10 text-red-500' },
}

const VENDOR_MAP: Record<string, string> = {
  autodesk: 'Autodesk',
  sketchup: 'SketchUp',
  adobe: 'Adobe',
  dassault: '达索',
}

const VENDOR_COLORS: Record<string, string> = {
  autodesk: 'bg-red-500',
  sketchup: 'bg-green-500',
  adobe: 'bg-blue-500',
  dassault: 'bg-purple-500',
}

type TabType = 'customers' | 'pipeline' | 'team' | 'rules' | 'settings' | 'members'

export default function CRMManagePage() {
  const { isAdmin, isSupervisor, user } = useAuthStore()
  const isMemberCRM = user?.role === 'user'
  const canAccessCRM = isAdmin || isSupervisor || isMemberCRM
  const [activeTab, setActiveTab] = useState<TabType>('customers')

  // Customers state
  const [customers, setCustomers] = useState<Customer[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [formData, setFormData] = useState({
    name: '', company: '', phone: '', email: '', address: '',
    status: 'lead' as Customer['status'], source: '', industry: '', remark: '',
  })
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error'>('success')
  const [stats, setStats] = useState<CRMStats | null>(null)
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null)
  const [followUps, setFollowUps] = useState<FollowUp[]>([])
  const [showDetail, setShowDetail] = useState(false)
  const [showFollowUpForm, setShowFollowUpForm] = useState(false)
  const [followUpContent, setFollowUpContent] = useState('')
  const [followUpType, setFollowUpType] = useState<FollowUp['type']>('phone')

  // Detail modal tab state
  const [detailTab, setDetailTab] = useState<'basic' | 'search' | 'evidence' | 'followUp'>('basic')

  // Abandon state
  const [showAbandonModal, setShowAbandonModal] = useState(false)
  const [abandonReason, setAbandonReason] = useState('')
  const [abandoningCustomer, setAbandoningCustomer] = useState<Customer | null>(null)

  // Supplement request state
  const [showSupplementModal, setShowSupplementModal] = useState(false)
  const [supplementReason, setSupplementReason] = useState('')
  const [supplementQuantity, setSupplementQuantity] = useState(5)
  const [supplementRequests, setSupplementRequests] = useState<any[]>([])
  const [showRequestsModal, setShowRequestsModal] = useState(false)

  // Evidence state
  const [evidenceList, setEvidenceList] = useState<any[]>([])
  const [evidenceTitle, setEvidenceTitle] = useState('')
  const [evidenceContent, setEvidenceContent] = useState('')
  const [evidenceType, setEvidenceType] = useState('text')

  // Customer count info
  const [customerCountInfo, setCustomerCountInfo] = useState<{ totalCustomers: number; maxLimit: number }>({ totalCustomers: 0, maxLimit: 100 })

  // Enterprise profile
  const [enterpriseProfile, setEnterpriseProfile] = useState<any>(null)
  const [profileLoading, setProfileLoading] = useState(false)

  // Pipeline state
  const [stages, setStages] = useState<PipelineStage[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [pipelineCustomers, setPipelineCustomers] = useState<{id:number,name:string,company:string|null}[]>([])
  const [pipelineUsers, setPipelineUsers] = useState<{id:number,nickname:string}[]>([])
  const [pipelineStats, setPipelineStats] = useState<any>(null)
  const [showDealForm, setShowDealForm] = useState(false)
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null)
  const [dealFormData, setDealFormData] = useState({
    title: '', customer_id: '', stage_id: '', value: '', expected_close_date: '',
    assigned_to: '', priority: 'medium' as Deal['priority'], notes: '',
  })
  const [draggedDeal, setDraggedDeal] = useState<Deal | null>(null)
  const [dragOverStage, setDragOverStage] = useState<number | null>(null)
  const [dealSearch, setDealSearch] = useState('')

  // Team state
  const [members, setMembers] = useState<TeamMember[]>([])
  const [teamStats, setTeamStats] = useState<TeamStats | null>(null)
  const [selectedMember, setSelectedMember] = useState<number | null>(null)
  const [memberDetail, setMemberDetail] = useState<any>(null)

  // Members management state (Q1.31)
  const [detailedMembers, setDetailedMembers] = useState<any[]>([])
  const [memberDetailedStats, setMemberDetailedStats] = useState<any>(null)
  const [memberPeriod, setMemberPeriod] = useState('7d')
  const [showMemberDetail, setShowMemberDetail] = useState(false)

  // Rules state
  const [rules, setRules] = useState<any[]>([])
  const [showRuleForm, setShowRuleForm] = useState(false)
  const [editingRule, setEditingRule] = useState<any>(null)
  const [ruleFormData, setRuleFormData] = useState({
    name: '',
    rule_type: 'round_robin' as string,
    is_active: true,
    config: JSON.stringify({ user_ids: [1] }),
  })

  // Assignment state
  const [assigningCustomer, setAssigningCustomer] = useState<number | null>(null)
  const [assignToUser, setAssignToUser] = useState<number>(0)

  const loadRules = useCallback(async () => {
    try {
      const resp = await axios.get('/api/crm/assignment-rules')
      setRules(resp.data.data || [])
    } catch (err: any) { console.error('加载分派规则失败:', err) }
  }, [])

  const { value: membersValue, ref: membersRef } = useCountUp(teamStats?.overview?.members || 0)
  const { value: customersValue, ref: customersRef } = useCountUp(teamStats?.overview?.customers || 0)
  const { value: dealValueRaw, ref: dealValueRef } = useCountUp(teamStats?.overview?.dealValue || 0)
  const { value: pendingTasksValue, ref: pendingTasksRef } = useCountUp(teamStats?.overview?.pendingTasks || 0)

  const showMsg = (msg: string, type: 'success' | 'error') => {
    setMessage(msg)
    setMessageType(type)
    setTimeout(() => setMessage(''), 3000)
  }

  // Load customers
  const loadCustomers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('pageSize', String(pageSize))
      if (searchQuery) params.set('search', searchQuery)
      if (statusFilter) params.set('status', statusFilter)
      if (sourceFilter) params.set('source', sourceFilter)
      const resp = await axios.get(`/api/crm/customers?${params}`)
      setCustomers(resp.data.data?.list || [])
      setTotal(resp.data.data?.pagination?.total || 0)
    } catch (err: any) { showMsg(err.response?.data?.error || '客户列表加载失败，请刷新重试', 'error') } finally {
      setLoading(false)
    }
  }, [page, pageSize, searchQuery, statusFilter, sourceFilter])

  const loadStats = useCallback(async () => {
    try {
      const resp = await axios.get('/api/crm/stats')
      setStats(resp.data.data)
    } catch (err: any) { console.error('加载统计失败:', err) }
  }, [])

  const loadFollowUps = useCallback(async (customerId: number) => {
    try {
      const resp = await axios.get(`/api/crm/follow-ups?customerId=${customerId}`)
      setFollowUps(resp.data.data)
    } catch (err: any) { console.error('加载跟进记录失败:', err) }
  }, [])

  // Load pipeline
  const loadPipelineData = useCallback(async () => {
    setLoading(true)
    try {
      const [stagesRes, dealsRes, customersRes, usersRes, statsRes] = await Promise.all([
        axios.get('/api/crm/pipeline/stages'),
        axios.get('/api/crm/pipeline/deals'),
        axios.get('/api/crm/customers?limit=1000'),
        axios.get('/api/crm/users'),
        axios.get('/api/crm/pipeline/stats'),
      ])
      setStages(stagesRes.data.data || [])
      setDeals(dealsRes.data.data || [])
      setPipelineCustomers((customersRes.data.data?.list || []).map((c: any) => ({ id: c.id, name: c.name, company: c.company })))
      setPipelineUsers(usersRes.data.data || [])
      setPipelineStats(statsRes.data.data)
    } catch (err: any) { console.error('加载管道数据失败:', err) }
    finally { setLoading(false) }
  }, [])

  // Load team
  const loadTeamData = useCallback(async () => {
    setLoading(true)
    try {
      const [workloadRes, statsRes] = await Promise.all([
        axios.get('/api/crm/team/workload'),
        axios.get('/api/crm/team/stats'),
      ])
      setMembers(workloadRes.data.data || [])
      setTeamStats(statsRes.data.data)
    } catch (err: any) { console.error('加载团队数据失败:', err) }
    finally { setLoading(false) }
  }, [])

  // Load detailed members data (Q1.31)
  const loadDetailedMembers = useCallback(async () => {
    try {
      const resp = await axios.get(`/api/crm/team/members-detailed?period=${memberPeriod}`)
      setDetailedMembers(resp.data.data || [])
    } catch (err: any) { console.error('加载详细成员数据失败:', err) }
  }, [memberPeriod])

  const loadMemberDetailedStats = useCallback(async (id: number) => {
    try {
      const statsRes = await axios.get(`/api/crm/member/${id}/detailed-stats`)
      setMemberDetailedStats(statsRes.data.data)
      setShowMemberDetail(true)
    } catch (err: any) { showMsg('加载成员详情失败', 'error') }
  }, [])

  useEffect(() => {
    if (!isAdmin) return
    loadCustomers()
    loadStats()
    loadCustomerCount()
    loadPipelineData()
    loadTeamData()
    loadRules()
    loadDetailedMembers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  useEffect(() => {
    if (!isMemberCRM) return
    loadCustomerCount()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMemberCRM])

  useEffect(() => {
    if (isAdmin) loadDetailedMembers()
  }, [isAdmin, memberPeriod, loadDetailedMembers])

  // Customer handlers
  const handleCreate = async () => {
    if (!formData.name) { showMsg('客户名称不能为空', 'error'); return }
    setLoading(true)
    try {
      await axios.post('/api/crm/customers', formData)
      showMsg('创建成功', 'success')
      setShowForm(false)
      resetForm()
      loadCustomers()
      loadStats()
    } catch (err: any) { showMsg(err.response?.data?.error || '客户创建失败，请检查填写内容', 'error') }
    finally { setLoading(false) }
  }

  const handleUpdate = async () => {
    if (!editingCustomer) return
    setLoading(true)
    try {
      await axios.put(`/api/crm/customers/${editingCustomer.id}`, formData)
      showMsg('更新成功', 'success')
      setShowForm(false)
      setEditingCustomer(null)
      resetForm()
      loadCustomers()
    } catch (err: any) { showMsg(err.response?.data?.error || '客户信息更新失败，请稍后重试', 'error') }
    finally { setLoading(false) }
  }

  // Rules handlers
  const saveRule = async () => {
    if (!ruleFormData.name) { showMsg('规则名称不能为空', 'error'); return }
    setLoading(true)
    try {
      if (editingRule) {
        await axios.put(`/api/crm/assignment-rules/${editingRule.id}`, ruleFormData)
        showMsg('规则更新成功', 'success')
      } else {
        await axios.post('/api/crm/assignment-rules', ruleFormData)
        showMsg('规则创建成功', 'success')
      }
      setShowRuleForm(false); setEditingRule(null)
      loadRules()
    } catch (err: any) { showMsg(err.response?.data?.error || '规则保存失败', 'error') }
    finally { setLoading(false) }
  }

  const deleteRule = async (ruleId: number) => {
    if (!confirm('确认删除该分派规则？')) return
    setLoading(true)
    try {
      await axios.delete(`/api/crm/assignment-rules/${ruleId}`)
      showMsg('规则已移入回收站', 'success')
      loadRules()
    } catch (err: any) { showMsg(err.response?.data?.error || '删除失败', 'error') }
    finally { setLoading(false) }
  }

  const executeRule = async (ruleId: number) => {
    if (!confirm('确认立即执行该分派规则？\n\n系统将对所有未分派的客户进行自动分派，并同步到员工账户。')) return
    setLoading(true)
    try {
      const resp = await axios.post(`/api/crm/assignment-rules/${ruleId}/execute`)
      const data = resp.data.data
      showMsg(data.message || `分派完成: ${data.assigned} 成功, ${data.failed} 失败`, data.assigned > 0 ? 'success' : 'error')
      loadRules()
      loadCustomers()
      loadTeamData()
    } catch (err: any) { showMsg(err.response?.data?.error || '执行失败', 'error') }
    finally { setLoading(false) }
  }

  const autoAssignCustomer = async (customerId: number) => {
    setLoading(true)
    try {
      await axios.post(`/api/crm/customers/${customerId}/auto-assign`)
      showMsg('自动分派成功', 'success')
      loadCustomers(); loadTeamData()
      setAssigningCustomer(null)
    } catch (err: any) { showMsg(err.response?.data?.error || '自动分派失败，请检查分派规则', 'error') }
    finally { setLoading(false) }
  }

  const manualAssignCustomer = async (customerId: number) => {
    if (!assignToUser) { showMsg('请选择员工', 'error'); return }
    setLoading(true)
    try {
      await axios.post(`/api/crm/customers/${customerId}/assign`, { assigned_to: assignToUser })
      showMsg('手动分派成功', 'success')
      loadCustomers(); loadTeamData()
      setAssigningCustomer(null)
    } catch (err: any) { showMsg(err.response?.data?.error || '分派失败', 'error') }
    finally { setLoading(false) }
  }

  const handleDelete = async (customer: Customer) => {
    if (!confirm(`确定要删除客户 "${customer.name}" 吗？`)) return
    setLoading(true)
    try {
      await axios.delete(`/api/crm/customers/${customer.id}`)
      showMsg('删除成功', 'success')
      loadCustomers()
      loadStats()
    } catch (err: any) { showMsg(err.response?.data?.error || '客户删除失败，请稍后重试', 'error') }
    finally { setLoading(false) }
  }

  const handleAddFollowUp = async () => {
    if (!detailCustomer || !followUpContent.trim()) { showMsg('请输入跟进内容', 'error'); return }
    setLoading(true)
    try {
      await axios.post('/api/crm/follow-ups', { customer_id: detailCustomer.id, content: followUpContent, follow_up_type: followUpType })
      showMsg('跟进记录添加成功', 'success')
      setFollowUpContent('')
      setFollowUpType('phone')
      setShowFollowUpForm(false)
      loadFollowUps(detailCustomer.id)
      loadCustomers()
      loadStats()
    } catch (err: any) { showMsg(err.response?.data?.error || '跟进记录添加失败，请稍后重试', 'error') }
    finally { setLoading(false) }
  }

  const loadCustomerCount = useCallback(async () => {
    try {
      const resp = await axios.get('/api/crm/my-customer-count')
      setCustomerCountInfo(resp.data.data)
    } catch (err) { console.error('加载客户计数失败:', err) }
  }, [])

  const confirmAbandon = async () => {
    if (!abandoningCustomer || !abandonReason.trim()) { showMsg('请填写放弃原因', 'error'); return }
    setLoading(true)
    try {
      await axios.post(`/api/crm/customers/${abandoningCustomer.id}/abandon`, { reason: abandonReason })
      showMsg('客户已放弃', 'success')
      setShowAbandonModal(false)
      setAbandonReason('')
      setAbandoningCustomer(null)
      loadCustomers()
      loadStats()
      loadCustomerCount()
    } catch (err: any) { showMsg(err.response?.data?.error || '操作失败', 'error') }
    finally { setLoading(false) }
  }

  const loadEvidence = async (customerId: number) => {
    try {
      const resp = await axios.get(`/api/crm/customers/${customerId}/evidence`)
      setEvidenceList(resp.data.data || [])
    } catch (err) { console.error('加载证据失败:', err); setEvidenceList([]) }
  }

  const addEvidence = async () => {
    if (!detailCustomer || !evidenceTitle.trim()) { showMsg('请输入证据标题', 'error'); return }
    setLoading(true)
    try {
      await axios.post(`/api/crm/customers/${detailCustomer.id}/evidence`, { title: evidenceTitle, content: evidenceContent, evidence_type: evidenceType })
      showMsg('证据已添加', 'success')
      setEvidenceTitle('')
      setEvidenceContent('')
      setEvidenceType('text')
      loadEvidence(detailCustomer.id)
    } catch (err: any) { showMsg(err.response?.data?.error || '添加失败', 'error') }
    finally { setLoading(false) }
  }

  const loadEnterpriseProfile = async (customerId: number) => {
    setProfileLoading(true)
    try {
      const resp = await axios.get(`/api/crm/customers/${customerId}/enterprise-profile`)
      setEnterpriseProfile(resp.data.data)
    } catch (err) { console.error('加载企业画像失败:', err); setEnterpriseProfile(null) }
    finally { setProfileLoading(false) }
  }

  const loadSupplementRequests = async () => {
    try {
      const resp = await axios.get('/api/crm/supplement-requests')
      setSupplementRequests(resp.data.data || [])
    } catch (err) { console.error('加载补充请求失败:', err) }
  }

  const createSupplementRequest = async () => {
    if (!supplementReason.trim()) { showMsg('请填写申请原因', 'error'); return }
    setLoading(true)
    try {
      await axios.post('/api/crm/supplement-requests', { reason: supplementReason, quantity: supplementQuantity })
      showMsg('补充请求已提交，请等待主管处理', 'success')
      setShowSupplementModal(false)
      setSupplementReason('')
    } catch (err: any) { showMsg(err.response?.data?.error || '提交失败', 'error') }
    finally { setLoading(false) }
  }

  const handleSupplementRequest = async (id: number, status: 'approved' | 'rejected') => {
    try {
      await axios.put(`/api/crm/supplement-requests/${id}/handle`, { status })
      showMsg(`请求已${status === 'approved' ? '批准' : '驳回'}`, 'success')
      loadSupplementRequests()
    } catch (err: any) { showMsg(err.response?.data?.error || '操作失败', 'error') }
  }

  const resetForm = () => setFormData({ name: '', company: '', phone: '', email: '', address: '', status: 'lead', source: '', industry: '', remark: '' })
  const openDetail = async (customer: Customer) => {
    setDetailCustomer(customer)
    setShowDetail(true)
    setDetailTab('basic')
    setEnterpriseProfile(null)
    await Promise.all([
      loadFollowUps(customer.id),
      loadEvidence(customer.id),
      loadEnterpriseProfile(customer.id),
    ])
  }
  const startEdit = (customer: Customer) => {
    setEditingCustomer(customer)
    setFormData({ name: customer.name, company: customer.company || '', phone: customer.phone || '', email: customer.email || '', address: customer.address || '', status: customer.status, source: customer.source || '', industry: customer.industry || '', remark: customer.remark || '' })
    setShowForm(true)
    setShowDetail(false)
  }
  const startCreate = () => { setEditingCustomer(null); resetForm(); setShowForm(true); setShowDetail(false) }
  const getStatusLabel = (status: string) => STATUS_OPTIONS.find(s => s.value === status) || { label: status, color: '' }
  const totalPages = Math.ceil(total / pageSize)
  const sources = Array.from(new Set(customers.map(c => c.source).filter(Boolean)))

  // Pipeline handlers
  const filteredDeals = deals.filter(d => !dealSearch || d.title?.toLowerCase().includes(dealSearch.toLowerCase()) || d.customer_name?.toLowerCase().includes(dealSearch.toLowerCase()))
  const getDealsByStage = (stageId: number) => filteredDeals.filter(d => d.stage_id === stageId && d.status === 'open')

  const handleDragStart = (deal: Deal) => setDraggedDeal(deal)
  const handleDragOver = (e: React.DragEvent, stageId: number) => { e.preventDefault(); setDragOverStage(stageId) }
  const handleDragLeave = () => setDragOverStage(null)
  const handleDrop = async (e: React.DragEvent, stageId: number) => {
    e.preventDefault()
    setDragOverStage(null)
    if (!draggedDeal || draggedDeal.stage_id === stageId) return
    try {
      await axios.post(`/api/crm/pipeline/deals/${draggedDeal.id}/move`, { stage_id: stageId })
      setDeals(prev => prev.map(d => d.id === draggedDeal.id ? { ...d, stage_id: stageId } : d))
      setDraggedDeal(null)
    } catch (err: any) { showMsg('商机移动失败: ' + (err.response?.data?.error || '网络异常，请稍后重试'), 'error') }
  }

  const openDealForm = (deal?: Deal) => {
    if (deal) {
      setEditingDeal(deal)
      setDealFormData({ title: deal.title, customer_id: String(deal.customer_id), stage_id: String(deal.stage_id), value: String(deal.value || ''), expected_close_date: deal.expected_close_date ? deal.expected_close_date.split('T')[0] : '', assigned_to: deal.assigned_to ? String(deal.assigned_to) : '', priority: deal.priority, notes: deal.notes || '' })
    } else {
      setEditingDeal(null)
      setDealFormData({ title: '', customer_id: '', stage_id: stages.length > 0 ? String(stages[0].id) : '', value: '', expected_close_date: '', assigned_to: '', priority: 'medium', notes: '' })
    }
    setShowDealForm(true)
  }

  const saveDeal = async () => {
    if (!dealFormData.title || !dealFormData.customer_id || !dealFormData.stage_id) { showMsg('请填写必填项', 'error'); return }
    try {
      const payload = { ...dealFormData, customer_id: parseInt(dealFormData.customer_id), stage_id: parseInt(dealFormData.stage_id), value: parseFloat(dealFormData.value) || 0, assigned_to: dealFormData.assigned_to ? parseInt(dealFormData.assigned_to) : null }
      if (editingDeal) { await axios.put(`/api/crm/pipeline/deals/${editingDeal.id}`, payload) }
      else { await axios.post('/api/crm/pipeline/deals', payload) }
      setShowDealForm(false)
      loadPipelineData()
    } catch (err: any) { showMsg('商机保存失败: ' + (err.response?.data?.error || '网络异常，请稍后重试'), 'error') }
  }

  const deleteDeal = async (id: number) => {
    if (!confirm('确定删除此商机?')) return
    try { await axios.delete(`/api/crm/pipeline/deals/${id}`); loadPipelineData() }
    catch (err: any) { showMsg('商机删除失败: ' + (err.response?.data?.error || '网络异常，请稍后重试'), 'error') }
  }

  // Team handlers
  const loadMemberDetail = async (id: number) => {
    try { const res = await axios.get(`/api/crm/team/member/${id}`); setMemberDetail(res.data.data); setSelectedMember(id) }
    catch (err: any) { showMsg('成员详情加载失败，请稍后重试', 'error') }
  }

  const formatCurrency = (v: number) => { if (!v) return '¥0'; if (v >= 10000) return `¥${(v / 10000).toFixed(1)}万`; return `¥${v.toLocaleString()}` }
  const getCompletionRate = (m: TeamMember) => { const total = m.completed_tasks + m.pending_tasks; return total > 0 ? Math.round((m.completed_tasks / total) * 100) : 0 }

  if (!canAccessCRM) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-4">
          <Briefcase className="w-16 h-16 text-destructive mx-auto" />
          <h2 className="text-xl font-bold text-foreground">权限不足</h2>
          <p className="text-muted-foreground">您没有访问CRM管理页面的权限</p>
        </div>
      </div>
    )
  }

  const tabs = isMemberCRM
    ? [
        { key: 'customers' as TabType, label: '客户管理', icon: Users },
        { key: 'pipeline' as TabType, label: '销售管道', icon: GitBranch },
      ]
    : [
        { key: 'customers' as TabType, label: '客户管理', icon: Users },
        { key: 'pipeline' as TabType, label: '销售管道', icon: GitBranch },
        { key: 'team' as TabType, label: '团队协作', icon: UsersRound },
        { key: 'members' as TabType, label: '成员管理', icon: UserCheck },
        { key: 'rules' as TabType, label: '分派规则', icon: ClipboardList },
        { key: 'settings' as TabType, label: 'CRM设置', icon: Settings },
      ]

  return (
    <div className="min-h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center">
            <Briefcase className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">CRM管理</h1>
            <p className="text-sm text-muted-foreground">客户管理 · 销售管道 · 团队协作 · 分派规则 · CRM设置</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {tabs.map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 h-9 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`text-sm p-3 mx-6 mt-4 rounded-lg flex items-center justify-between ${messageType === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
          {message}
          <button onClick={() => setMessage('')} className="hover:opacity-70"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Content */}
      <div className="overflow-y-auto p-6">
        {/* ========== CUSTOMERS TAB ========== */}
        {activeTab === 'customers' && (
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-card border border-border rounded-xl p-5 stat-card">
                <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
                  <Users className="w-5 h-5 text-blue-500" />
                </div>
                <p className="text-sm text-muted-foreground mt-3">客户总数</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-2xl font-bold text-foreground">{customerCountInfo.totalCustomers}</span>
                  <span className="text-sm text-muted-foreground">/ {customerCountInfo.maxLimit}</span>
                  {customerCountInfo.totalCustomers >= customerCountInfo.maxLimit ? (
                    <span className="text-xs px-2 py-0.5 bg-red-500/10 text-red-500 rounded-full">已满</span>
                  ) : (
                    <button
                      onClick={() => setShowSupplementModal(true)}
                      className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full hover:bg-primary/20 transition-colors"
                      title="申请补充名单"
                    >
                      申请补充
                    </button>
                  )}
                </div>
              </div>
              {[
                { title: '待办数', value: stats?.totalTodos || 0, icon: ClipboardList, color: 'text-orange-500', bg: 'bg-orange-500/10' },
                { title: '任务数', value: stats?.totalTasks || 0, icon: Briefcase, color: 'text-purple-500', bg: 'bg-purple-500/10' },
                { title: '今日日程', value: stats?.todaySchedules || 0, icon: CalendarDays, color: 'text-green-500', bg: 'bg-green-500/10' },
              ].map(card => {
                const Icon = card.icon
                return (
                  <div key={card.title} className="bg-card border border-border rounded-xl p-5 stat-card">
                    <div className={`w-10 h-10 ${card.bg} rounded-lg flex items-center justify-center`}>
                      <Icon className={`w-5 h-5 ${card.color}`} />
                    </div>
                    <p className="text-sm text-muted-foreground mt-3">{card.title}</p>
                    <p className="text-2xl font-bold text-foreground">{card.value}</p>
                  </div>
                )
              })}
            </div>

            {/* Trend Chart */}
            {stats?.customerTrend && stats.customerTrend.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">客户增长趋势（30天）</h3>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={[...stats.customerTrend].reverse()}>
                      <defs>
                        <linearGradient id="colorCustomers" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => v.slice(5)} />
                      <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                      <Area type="monotone" dataKey="count" stroke="#3b82f6" fillOpacity={1} fill="url(#colorCustomers)" name="新增客户" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Filters */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 max-w-xs">
                <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && loadCustomers()} placeholder="搜索客户名称/公司/电话..." className="w-full h-9 pl-9 pr-3 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
              </div>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="h-9 px-3 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                <option value="">所有状态</option>
                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} className="h-9 px-3 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                <option value="">所有来源</option>
                {sources.map(s => <option key={s} value={s || ''}>{s || ''}</option>)}
              </select>
              <button onClick={loadCustomers} className="h-9 px-3 bg-secondary rounded-lg text-sm hover:bg-secondary/80 transition-colors">筛选</button>
              <button onClick={() => { loadCustomers(); loadStats(); loadCustomerCount(); }} disabled={loading} className="flex items-center gap-2 px-3 h-9 bg-secondary rounded-lg text-sm hover:bg-secondary/80 transition-colors disabled:opacity-50">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />刷新
              </button>
              {(isAdmin || isSupervisor) && (
                <button onClick={() => { loadSupplementRequests(); setShowRequestsModal(true) }} className="flex items-center gap-2 px-3 h-9 bg-orange-500/10 text-orange-600 rounded-lg text-sm hover:bg-orange-500/20 transition-colors">
                  <ClipboardList className="w-4 h-4" />补充请求
                </button>
              )}
              <button onClick={startCreate} className="flex items-center gap-2 px-4 h-9 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors ml-auto btn-ripple">
                <Plus className="w-4 h-4" />新增客户
              </button>
            </div>

            {/* Form */}
            {showForm && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setShowForm(false); setEditingCustomer(null); resetForm() }}>
                <div className="bg-card border border-border rounded-xl p-5 space-y-4 w-full max-w-2xl mx-4 modal-content-enter max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-2">
                    <UserPlus className="w-5 h-5 text-primary" />
                    <h2 className="font-medium text-foreground">{editingCustomer ? '编辑客户' : '新增客户'}</h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="text-sm text-muted-foreground mb-1.5 block">客户名称 *</label>
                      <input type="text" value={formData.name} onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))} placeholder="输入客户名称" className="w-full h-10 px-4 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground mb-1.5 block">公司</label>
                      <input type="text" value={formData.company} onChange={e => setFormData(prev => ({ ...prev, company: e.target.value }))} placeholder="输入公司名称" className="w-full h-10 px-4 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground mb-1.5 block">电话</label>
                      <input type="text" value={formData.phone} onChange={e => setFormData(prev => ({ ...prev, phone: e.target.value }))} placeholder="输入联系电话" className="w-full h-10 px-4 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground mb-1.5 block">邮箱</label>
                      <input type="email" value={formData.email} onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))} placeholder="输入邮箱地址" className="w-full h-10 px-4 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground mb-1.5 block">地址</label>
                      <input type="text" value={formData.address} onChange={e => setFormData(prev => ({ ...prev, address: e.target.value }))} placeholder="输入地址" className="w-full h-10 px-4 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground mb-1.5 block">状态</label>
                      <select value={formData.status} onChange={e => setFormData(prev => ({ ...prev, status: e.target.value as Customer['status'] }))} className="w-full h-10 px-4 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary">
                        {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground mb-1.5 block">来源</label>
                      <input type="text" value={formData.source} onChange={e => setFormData(prev => ({ ...prev, source: e.target.value }))} placeholder="如：官网、展会、推荐" className="w-full h-10 px-4 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground mb-1.5 block">行业</label>
                      <input type="text" value={formData.industry} onChange={e => setFormData(prev => ({ ...prev, industry: e.target.value }))} placeholder="输入所属行业" className="w-full h-10 px-4 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                    </div>
                    <div className="md:col-span-2 lg:col-span-3">
                      <label className="text-sm text-muted-foreground mb-1.5 block">备注</label>
                      <textarea value={formData.remark} onChange={e => setFormData(prev => ({ ...prev, remark: e.target.value }))} placeholder="输入备注信息" rows={3} className="w-full px-4 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none" />
                    </div>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button onClick={editingCustomer ? handleUpdate : handleCreate} disabled={loading} className="flex items-center gap-2 px-4 h-9 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
                      <Check className="w-4 h-4" />{editingCustomer ? '保存修改' : '创建'}
                    </button>
                    <button onClick={() => { setShowForm(false); setEditingCustomer(null); resetForm() }} className="flex items-center gap-2 px-4 h-9 bg-secondary rounded-lg text-sm hover:bg-secondary/80 transition-colors">
                      <X className="w-4 h-4" />取消
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Table */}
            <div className="bg-card border border-border rounded-xl overflow-hidden card-hover-glow">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium">客户</th>
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium">公司</th>
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium">联系方式</th>
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium">状态</th>
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium">来源</th>
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium">跟进</th>
                      <th className="text-right px-4 py-3 text-muted-foreground font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && customers.length === 0 ? (
                      <>
                        {[...Array(5)].map((_, i) => (
                          <tr key={i}>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="skeleton skeleton-avatar" />
                                <div className="flex-1">
                                  <div className="skeleton skeleton-text" style={{ width: '40%' }} />
                                  <div className="skeleton skeleton-text-sm mt-1" style={{ width: '30%' }} />
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3"><div className="skeleton skeleton-text" style={{ width: '60%' }} /></td>
                            <td className="px-4 py-3"><div className="skeleton skeleton-text" style={{ width: '70%' }} /></td>
                            <td className="px-4 py-3"><div className="skeleton skeleton-text-sm" style={{ width: '30%' }} /></td>
                            <td className="px-4 py-3"><div className="skeleton skeleton-text-sm" style={{ width: '40%' }} /></td>
                            <td className="px-4 py-3"><div className="skeleton skeleton-text-sm" style={{ width: '50%' }} /></td>
                            <td className="px-4 py-3"><div className="skeleton skeleton-text-sm" style={{ width: '20%' }} /></td>
                          </tr>
                        ))}
                      </>
                    ) : customers.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground"><Users className="w-8 h-8 mx-auto mb-2 opacity-50" />暂无客户数据</td></tr>
                    ) : (
                      customers.map(customer => {
                        const statusInfo = getStatusLabel(customer.status)
                        return (
                          <tr key={customer.id} className="border-b border-border/50 hover:bg-secondary/50 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center"><User className="w-4 h-4 text-primary" /></div>
                                <div>
                                  <p className="font-medium text-foreground">{customer.name}</p>
                                  {customer.industry && <p className="text-xs text-muted-foreground">{customer.industry}</p>}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{customer.company || '-'}</td>
                            <td className="px-4 py-3">
                              <div className="space-y-1">
                                {customer.phone && <div className="flex items-center gap-1 text-xs text-muted-foreground"><Phone className="w-3 h-3" />{customer.phone}</div>}
                                {customer.email && <div className="flex items-center gap-1 text-xs text-muted-foreground"><Mail className="w-3 h-3" />{customer.email}</div>}
                                {!customer.phone && !customer.email && <span className="text-xs text-muted-foreground">-</span>}
                              </div>
                            </td>
                            <td className="px-4 py-3"><span className={`text-xs px-2 py-1 rounded-full ${statusInfo.color}`}>{statusInfo.label}</span></td>
                            <td className="px-4 py-3 text-muted-foreground">{customer.source || '-'}</td>
                            <td className="px-4 py-3">
                              <div className="space-y-1">
                                <div className="flex items-center gap-1 text-xs text-muted-foreground"><MessageSquare className="w-3 h-3" />{customer.followUpCount || 0} 次</div>
                                {customer.lastFollowUpAt && <div className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="w-3 h-3" />{new Date(customer.lastFollowUpAt).toLocaleDateString()}</div>}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={() => openDetail(customer)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors" title="查看详情"><Eye className="w-4 h-4 text-muted-foreground" /></button>
                                <button onClick={() => startEdit(customer)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors" title="编辑"><Edit3 className="w-4 h-4 text-muted-foreground" /></button>
                                {assigningCustomer === customer.id ? (
                                  <span className="flex items-center gap-1 bg-secondary/50 rounded-lg px-1.5 py-1">
                                    <select value={assignToUser} onChange={e => setAssignToUser(Number(e.target.value))} className="text-xs border border-border rounded px-1 py-0.5 bg-background w-20">
                                      <option value={0}>选择...</option>
                                      {members.map(m => <option key={m.id} value={m.id}>{m.nickname || m.username}</option>)}
                                    </select>
                                    <button onClick={() => manualAssignCustomer(customer.id)} disabled={loading} className="p-0.5 text-xs text-primary hover:bg-primary/10 rounded" title="确认分派"><Check className="w-3 h-3" /></button>
                                    <button onClick={() => autoAssignCustomer(customer.id)} disabled={loading} className="p-0.5 text-xs text-blue-400 hover:bg-blue-500/10 rounded" title="自动分派"><ArrowRight className="w-3 h-3" /></button>
                                    <button onClick={() => setAssigningCustomer(null)} className="p-0.5 text-xs text-muted-foreground hover:bg-secondary rounded"><X className="w-3 h-3" /></button>
                                  </span>
                                ) : (
                                  <button onClick={() => { setAssigningCustomer(customer.id); setAssignToUser(0) }} className="p-1.5 rounded-lg hover:bg-blue-500/10 transition-colors" title="分派客户"><UserCheck className="w-4 h-4 text-blue-400" /></button>
                                )}
                                <button onClick={() => { setAbandoningCustomer(customer); setShowAbandonModal(true) }} className="p-1.5 rounded-lg hover:bg-orange-500/10 transition-colors" title="放弃客户"><Ban className="w-4 h-4 text-orange-500" /></button>
                                <button onClick={() => handleDelete(customer)} className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors" title="删除"><Trash2 className="w-4 h-4 text-red-500" /></button>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                  <p className="text-xs text-muted-foreground">共 {total} 条记录，第 {page}/{totalPages} 页</p>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="p-1.5 rounded-lg hover:bg-secondary transition-colors disabled:opacity-50"><ChevronLeft className="w-4 h-4" /></button>
                    <span className="text-sm text-muted-foreground">{page}</span>
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-1.5 rounded-lg hover:bg-secondary transition-colors disabled:opacity-50"><ChevronRight className="w-4 h-4" /></button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========== PIPELINE TAB ========== */}
        {activeTab === 'pipeline' && (
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-foreground">销售管道</h2>
                <p className="text-sm text-muted-foreground">
                  {pipelineStats && (
                    <><span className="font-medium text-foreground">{pipelineStats.total?.count || 0}</span> 个商机 · <span className="font-medium text-foreground">{formatCurrency(pipelineStats.total?.value || 0)}</span> 总额</>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70" />
                  <input type="text" placeholder="搜索商机..." value={dealSearch} onChange={e => setDealSearch(e.target.value)} className="pl-9 pr-4 py-2 text-sm border border-border rounded-lg w-56 focus:outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
                <button onClick={() => openDealForm()} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors">
                  <Plus className="w-4 h-4" />新建商机
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-x-auto overflow-y-hidden bg-secondary/50 rounded-xl">
              <div className="flex h-full p-4 gap-4 min-w-max">
                {stages.map(stage => {
                  const stageDeals = getDealsByStage(stage.id)
                  const stageValue = stageDeals.reduce((sum, d) => sum + (d.value || 0), 0)
                  const isDragOver = dragOverStage === stage.id
                  return (
                    <div key={stage.id} className={`flex flex-col w-72 rounded-xl transition-all duration-200 ${isDragOver ? 'bg-primary/5 ring-2 ring-blue-400 scale-[1.02]' : 'bg-secondary'}`}
                      onDragOver={e => handleDragOver(e, stage.id)} onDragLeave={handleDragLeave} onDrop={e => handleDrop(e, stage.id)}>
                      <div className="px-3 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stage.color }} />
                          <span className="font-semibold text-sm text-foreground">{stage.name}</span>
                          <span className="text-xs text-muted-foreground/70 bg-muted px-1.5 py-0.5 rounded-full">{stageDeals.length}</span>
                        </div>
                        <span className="text-xs font-medium text-muted-foreground">{formatCurrency(stageValue)}</span>
                      </div>
                      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2">
                        {stageDeals.map(deal => (
                          <div key={deal.id} draggable onDragStart={() => handleDragStart(deal)} className="bg-card rounded-lg p-3 shadow-sm border border-border cursor-move hover:shadow-md transition-shadow group">
                            <div className="flex items-start justify-between mb-2">
                              <h3 className="text-sm font-medium text-foreground line-clamp-2 flex-1">{deal.title}</h3>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => openDealForm(deal)} className="p-1 hover:bg-accent rounded"><Edit3 className="w-3 h-3 text-muted-foreground/70" /></button>
                                <button onClick={() => deleteDeal(deal.id)} className="p-1 hover:bg-accent rounded"><Trash2 className="w-3 h-3 text-muted-foreground/70" /></button>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 mb-2">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${PRIORITY_CONFIG[deal.priority]?.color}`}>{PRIORITY_CONFIG[deal.priority]?.label}</span>
                              {deal.value > 0 && <span className="text-xs font-semibold text-foreground">{formatCurrency(deal.value)}</span>}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                              <User className="w-3 h-3" />
                              <span className="truncate">{deal.customer_name}{deal.customer_company ? ` · ${deal.customer_company}` : ''}</span>
                            </div>
                            {deal.assigned_name && <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70"><Users className="w-3 h-3" /><span>{deal.assigned_name}</span></div>}
                            {deal.expected_close_date && <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70 mt-1.5"><Calendar className="w-3 h-3" /><span>预计成交: {new Date(deal.expected_close_date).toLocaleDateString('zh-CN')}</span></div>}
                          </div>
                        ))}
                        {stageDeals.length === 0 && <div className="text-center py-8 text-muted-foreground/70 text-xs">拖拽商机到此处</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ========== TEAM TAB ========== */}
        {activeTab === 'team' && (
          <div className="space-y-6">
            {teamStats && (
              <>
                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-card rounded-xl p-4 border border-border shadow-sm">
                    <div className="flex items-center justify-between mb-2"><span className="text-sm text-muted-foreground">团队成员</span><Users className="w-4 h-4 text-blue-500" /></div>
                    <p className="text-2xl font-bold text-foreground"><span ref={membersRef} className="count-up">{membersValue}</span></p>
                  </div>
                  <div className="bg-card rounded-xl p-4 border border-border shadow-sm stat-card">
                    <div className="flex items-center justify-between mb-2"><span className="text-sm text-muted-foreground">客户总数</span><Building2 className="w-4 h-4 text-green-500" /></div>
                    <p className="text-2xl font-bold text-foreground"><span ref={customersRef} className="count-up">{customersValue}</span></p>
                  </div>
                  <div className="bg-card rounded-xl p-4 border border-border shadow-sm">
                    <div className="flex items-center justify-between mb-2"><span className="text-sm text-muted-foreground">商机总额</span><TrendingUp className="w-4 h-4 text-amber-500" /></div>
                    <p className="text-2xl font-bold text-foreground"><span ref={dealValueRef} className="count-up">{formatCurrency(dealValueRaw)}</span></p>
                  </div>
                  <div className="bg-card rounded-xl p-4 border border-border shadow-sm">
                    <div className="flex items-center justify-between mb-2"><span className="text-sm text-muted-foreground">待办任务</span><AlertCircle className="w-4 h-4 text-red-500" /></div>
                    <p className="text-2xl font-bold text-foreground"><span ref={pendingTasksRef} className="count-up">{pendingTasksValue}</span></p>
                    {teamStats.overview.overdueTasks > 0 && <span className="text-xs text-red-500">{teamStats.overview.overdueTasks} 个已逾期</span>}
                  </div>
                </div>
              </>
            )}

            <div className="grid grid-cols-3 gap-6">
              <div className="col-span-2">
                <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden card-hover-glow">
                  <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                    <h2 className="font-semibold text-foreground">成员工作量</h2>
                    <span className="text-xs text-muted-foreground/70">{members.length} 人</span>
                  </div>
                  <div className="divide-y divide-border">
                    {members.map(member => (
                      <div key={member.id} onClick={() => loadMemberDetail(member.id)} className={`px-4 py-3 flex items-center gap-4 cursor-pointer hover:bg-accent/50 transition-colors ${selectedMember === member.id ? 'bg-primary/5' : ''}`}>
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-bold text-primary">{member.nickname?.[0] || member.username?.[0] || 'U'}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2"><span className="font-medium text-foreground text-sm">{member.nickname || member.username}</span></div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span>{member.customer_count} 客户</span><span>{member.deal_count} 商机</span><span>{member.task_count} 任务</span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-semibold text-foreground">{formatCurrency(member.deal_value)}</p>
                          <div className="flex items-center gap-1 mt-1">
                            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden progress-glow"><div className="h-full bg-green-500 rounded-full" style={{ width: `${getCompletionRate(member)}%` }} /></div>
                            <span className="text-[10px] text-muted-foreground/70">{getCompletionRate(member)}%</span>
                          </div>
                        </div>
                        <ChevronRightIcon className="w-4 h-4 text-muted-foreground/50 flex-shrink-0" />
                      </div>
                    ))}
                    {members.length === 0 && !loading && <div className="px-4 py-8 text-center text-muted-foreground/70 text-sm">暂无成员数据</div>}
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                {teamStats && teamStats.vendorDistribution.length > 0 && (
                  <div className="bg-card rounded-xl border border-border shadow-sm p-4">
                    <h3 className="font-semibold text-foreground text-sm mb-3 flex items-center gap-2"><PieChart className="w-4 h-4 text-blue-500" />厂商分布</h3>
                    <div className="space-y-2">
                      {teamStats.vendorDistribution.map(v => (
                        <div key={v.vendor} className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${VENDOR_COLORS[v.vendor] || 'bg-muted-foreground/70'}`} />
                          <span className="text-xs text-muted-foreground flex-1">{VENDOR_MAP[v.vendor] || v.vendor}</span>
                          <span className="text-xs font-medium text-foreground">{v.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {teamStats && teamStats.stageDistribution.length > 0 && (
                  <div className="bg-card rounded-xl border border-border shadow-sm p-4">
                    <h3 className="font-semibold text-foreground text-sm mb-3 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-blue-500" />管道分布</h3>
                    <div className="space-y-2">
                      {teamStats.stageDistribution.map(s => (
                        <div key={s.name} className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                          <span className="text-xs text-muted-foreground flex-1">{s.name}</span>
                          <span className="text-xs font-medium text-foreground">{s.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {memberDetail && (
                  <div className="bg-card rounded-xl border border-border shadow-sm p-4">
                    <h3 className="font-semibold text-foreground text-sm mb-3 flex items-center gap-2"><Activity className="w-4 h-4 text-blue-500" />{memberDetail.member.nickname} 的详情</h3>
                    {memberDetail.skills.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs text-muted-foreground mb-1">技能专长</p>
                        <div className="flex flex-wrap gap-1">
                          {memberDetail.skills.map((s: any) => (
                            <span key={s.vendor} className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary rounded-full">{VENDOR_MAP[s.vendor] || s.vendor} Lv.{s.proficiency_level}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {memberDetail.territories.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs text-muted-foreground mb-1">负责地域</p>
                        <div className="flex flex-wrap gap-1">
                          {memberDetail.territories.map((t: any) => (
                            <span key={`${t.province}-${t.city}`} className="text-[10px] px-2 py-0.5 bg-green-50 text-green-600 rounded-full flex items-center gap-1"><MapPin className="w-2.5 h-2.5" />{t.province}{t.city ? `·${t.city}` : ''}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {memberDetail.deals.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs text-muted-foreground mb-1">最近商机</p>
                        <div className="space-y-1">
                          {memberDetail.deals.map((d: any) => (
                            <div key={d.id} className="flex items-center gap-2 text-xs">
                              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: d.stage_color }} />
                              <span className="text-foreground flex-1 truncate">{d.title}</span>
                              <span className="text-muted-foreground">{formatCurrency(d.value)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {memberDetail.tasks.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">待办任务</p>
                        <div className="space-y-1">
                          {memberDetail.tasks.map((t: any) => (
                            <div key={t.id} className="flex items-center gap-2 text-xs">
                              <div className={`w-1.5 h-1.5 rounded-full ${t.status === 'completed' ? 'bg-green-500' : 'bg-amber-500'}`} />
                              <span className="text-foreground flex-1 truncate">{t.title}</span>
                              {t.due_date && <span className="text-muted-foreground/70">{new Date(t.due_date).toLocaleDateString('zh-CN')}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========== RULES TAB ========== */}
        {activeTab === 'rules' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-foreground">分派规则</h2>
                <p className="text-sm text-muted-foreground">配置客户自动分派规则，系统按优先级顺序匹配执行</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { setEditingRule(null); setRuleFormData({ name: '', rule_type: 'round_robin', is_active: true, config: JSON.stringify({ user_ids: [1] }) }); setShowRuleForm(true) }} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors">
                  <Plus className="w-4 h-4" />新建规则
                </button>
              </div>
            </div>

            {/* 标准规则模板 */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"><Zap className="w-4 h-4 text-amber-500" />快速应用标准模板</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  {
                    key: 'monthly_round_robin',
                    name: '月度轮询分派',
                    desc: '每月按顺序轮流分配新客户',
                    type: 'round_robin',
                    config: { user_ids: [], reset_cycle: 'monthly' },
                    icon: Calendar,
                    color: 'bg-blue-500/10 text-blue-500',
                  },
                  {
                    key: 'weekly_load_balance',
                    name: '周度负载均衡',
                    desc: '每周分配给当前客户最少的员工',
                    type: 'load_balance',
                    config: { max_load: 20, reset_cycle: 'weekly' },
                    icon: BarChart3,
                    color: 'bg-green-500/10 text-green-500',
                  },
                  {
                    key: 'skill_match',
                    name: '技能匹配分派',
                    desc: '按厂商技能熟练度自动匹配',
                    type: 'skill_match',
                    config: { vendor_keywords: { autodesk: [], sketchup: [], adobe: [], dassault: [] } },
                    icon: Award,
                    color: 'bg-purple-500/10 text-purple-500',
                  },
                  {
                    key: 'territory',
                    name: '地域分派规则',
                    desc: '按客户所在地区匹配负责人',
                    type: 'territory',
                    config: { territory_map: { '北京': [], '上海': [], '广东': [], '浙江': [], '江苏': [] } },
                    icon: MapPin,
                    color: 'bg-amber-500/10 text-amber-500',
                  },
                ].map(template => (
                  <button
                    key={template.key}
                    onClick={() => {
                      setEditingRule(null)
                      setRuleFormData({
                        name: template.name,
                        rule_type: template.type,
                        is_active: true,
                        config: JSON.stringify(template.config, null, 2),
                      })
                      setShowRuleForm(true)
                    }}
                    className="text-left p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-all group"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${template.color}`}>
                        <template.icon className="w-4 h-4" />
                      </div>
                      <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{template.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{template.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Rule Form */}
            {showRuleForm && (
              <div className="bg-card border border-border rounded-xl p-6">
                <h3 className="text-base font-semibold text-foreground mb-4">{editingRule ? '编辑规则' : '新建规则'}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="text-sm text-muted-foreground mb-1.5 block">规则名称</label>
                    <input type="text" value={ruleFormData.name} onChange={e => setRuleFormData(p => ({ ...p, name: e.target.value }))} placeholder="例：默认轮询分派" className="w-full px-4 py-2 bg-background border border-input rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground mb-1.5 block">规则类型</label>
                    <select value={ruleFormData.rule_type} onChange={e => setRuleFormData(p => ({ ...p, rule_type: e.target.value }))} className="w-full px-4 py-2 bg-background border border-input rounded-lg text-sm">
                      <option value="round_robin">轮询分派 — 在员工列表中轮流分配</option>
                      <option value="load_balance">负载均衡 — 分配给当前客户数最少的员工</option>
                      <option value="skill_match">能力匹配 — 按厂商技能熟练度匹配</option>
                      <option value="territory">地域分派 — 按客户地址匹配负责区域</option>
                      <option value="priority">优先级分派 — 高价值客户优先高级员工</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                      <input type="checkbox" checked={ruleFormData.is_active} onChange={e => setRuleFormData(p => ({ ...p, is_active: e.target.checked }))} className="rounded" />
                      启用规则
                    </label>
                  </div>
                </div>
                <div className="mb-4">
                  <label className="text-sm text-muted-foreground mb-1.5 block">规则配置 (JSON)</label>
                  <textarea
                    value={ruleFormData.config}
                    onChange={e => setRuleFormData(p => ({ ...p, config: e.target.value }))}
                    placeholder='例：{"user_ids": [1,2,3], "max_load": 10}'
                    rows={4}
                    className="w-full px-4 py-2 bg-background border border-input rounded-lg text-sm font-mono resize-none"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    <strong>轮询分派:</strong> {'{"user_ids": [1,2,3]}'} ｜ <strong>负载均衡:</strong> {'{"max_load": 10}'} ｜ <strong>能力匹配:</strong> {'{"vendor_keywords": {"autodesk": [1,2], "adobe": [3]}}'} ｜ <strong>地域分派:</strong> {'{"territory_map": {"北京": "张三", "上海": "李四"}}'} ｜ <strong>优先级分派:</strong> {'{"high_value_threshold": 100000, "senior_user_ids": [1,2]}'}
                  </p>
                </div>
                <div className="flex gap-3">
                  <button onClick={saveRule} disabled={loading} className="flex items-center gap-2 px-4 h-9 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
                    <Check className="w-4 h-4" />{editingRule ? '保存修改' : '创建'}
                  </button>
                  <button onClick={() => { setShowRuleForm(false); setEditingRule(null) }} className="flex items-center gap-2 px-4 h-9 bg-secondary rounded-lg text-sm hover:bg-secondary/80 transition-colors">
                    <X className="w-4 h-4" />取消
                  </button>
                </div>
              </div>
            )}

            {/* Rules List */}
            <div className="bg-card border border-border rounded-xl overflow-hidden card-hover-glow">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-3 text-muted-foreground font-medium">规则名称</th>
                    <th className="text-left px-4 py-3 text-muted-foreground font-medium">类型</th>
                    <th className="text-left px-4 py-3 text-muted-foreground font-medium">状态</th>
                    <th className="text-left px-4 py-3 text-muted-foreground font-medium">配置</th>
                    <th className="text-right px-4 py-3 text-muted-foreground font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground"><ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-50" />暂无分派规则，点击上方按钮创建</td></tr>
                  ) : (
                    rules.map((rule: any) => {
                      const typeLabels: Record<string, string> = { round_robin: '轮询分派', load_balance: '负载均衡', skill_match: '能力匹配', territory: '地域分派', priority: '优先级分派' }
                      return (
                        <tr key={rule.id} className="border-b border-border/50 hover:bg-secondary/50 transition-colors">
                          <td className="px-4 py-3 font-medium text-foreground">{rule.name}</td>
                          <td className="px-4 py-3 text-muted-foreground">{typeLabels[rule.rule_type] || rule.rule_type}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-1 rounded-full ${rule.is_active ? 'bg-green-500/10 text-green-500' : 'bg-gray-500/10 text-gray-500'}`}>
                              {rule.is_active ? '启用' : '禁用'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground text-xs font-mono max-w-48 truncate">{typeof rule.config === 'string' ? rule.config : JSON.stringify(rule.config)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              {rule.is_active && (
                                <button onClick={() => executeRule(rule.id)} className="p-1.5 rounded-lg hover:bg-green-500/10 transition-colors" title="立即执行分派">
                                  <Zap className="w-4 h-4 text-green-500" />
                                </button>
                              )}
                              <button onClick={() => { setEditingRule(rule); setRuleFormData({ name: rule.name, rule_type: rule.rule_type, is_active: !!rule.is_active, config: typeof rule.config === 'string' ? rule.config : JSON.stringify(rule.config || {}) }); setShowRuleForm(true) }} className="p-1.5 rounded-lg hover:bg-secondary transition-colors" title="编辑"><Edit3 className="w-4 h-4 text-muted-foreground" /></button>
                              <button onClick={() => deleteRule(rule.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors" title="删除"><Trash2 className="w-4 h-4 text-red-500" /></button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ========== MEMBERS TAB (Q1.31) ========== */}
        {activeTab === 'members' && (
          <div className="space-y-6">
            {/* Period selector */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-foreground">团队成员管理</h2>
                <p className="text-sm text-muted-foreground">详细统计每个成员的工作内容、工作情况和业绩表现</p>
              </div>
              <div className="flex items-center gap-2 bg-secondary/50 rounded-xl p-1">
                {[
                  { key: '7d', label: '近7天' },
                  { key: '30d', label: '近30天' },
                  { key: '90d', label: '近90天' },
                ].map(p => (
                  <button
                    key={p.key}
                    onClick={() => setMemberPeriod(p.key)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      memberPeriod === p.key
                        ? 'gradient-primary text-white shadow-glow'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Members grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {detailedMembers.map(member => (
                <div
                  key={member.id}
                  onClick={() => loadMemberDetailedStats(member.id)}
                  className="bg-card border border-border rounded-xl p-5 cursor-pointer card-hover-glow transition-all"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center shadow-glow">
                      <span className="text-lg font-bold text-primary">{member.nickname?.[0] || member.username?.[0] || 'U'}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground truncate">{member.nickname || member.username}</h3>
                      <p className="text-xs text-muted-foreground">{member.role === 'admin' ? '管理员' : member.role === 'supervisor' ? '主管' : '员工'}</p>
                    </div>
                    <ChevronRightIcon className="w-5 h-5 text-muted-foreground/50" />
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-secondary/30 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">负责客户</p>
                      <p className="text-lg font-bold text-foreground">{member.customer_count || 0}</p>
                      {member.new_customers_7d > 0 && <span className="text-[10px] text-green-500">+{member.new_customers_7d} 新增</span>}
                    </div>
                    <div className="bg-secondary/30 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">商机金额</p>
                      <p className="text-lg font-bold text-foreground">{formatCurrency(member.deal_value || 0)}</p>
                    </div>
                    <div className="bg-secondary/30 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">任务完成</p>
                      <p className="text-lg font-bold text-foreground">{member.tasks_completed || 0}/{member.task_count || 0}</p>
                      {member.tasks_overdue > 0 && <span className="text-[10px] text-red-500">{member.tasks_overdue} 逾期</span>}
                    </div>
                    <div className="bg-secondary/30 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">跟进记录</p>
                      <p className="text-lg font-bold text-foreground">{member.follow_up_count || 0}</p>
                      {member.follow_ups_7d > 0 && <span className="text-[10px] text-green-500">+{member.follow_ups_7d} 新增</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    <span>最后登录: {member.last_login_at ? formatDate(member.last_login_at) : '从未登录'}</span>
                  </div>
                </div>
              ))}
              {detailedMembers.length === 0 && !loading && (
                <div className="col-span-full text-center py-12 text-muted-foreground">
                  <UsersRound className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>暂无成员数据</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========== SETTINGS TAB ========== */}
        {activeTab === 'settings' && (
          <div className="max-w-3xl mx-auto">
            <CRMSettingsPage />
          </div>
        )}
      </div>

      {/* Deal Form Modal */}
      {showDealForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-xl shadow-xl w-[500px] max-h-[90vh] overflow-y-auto modal-content-enter">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-lg font-bold text-foreground">{editingDeal ? '编辑商机' : '新建商机'}</h2>
              <button onClick={() => setShowDealForm(false)} className="p-1 hover:bg-accent rounded-lg"><X className="w-5 h-5 text-muted-foreground/70" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">商机标题 <span className="text-red-500">*</span></label>
                <input type="text" value={dealFormData.title} onChange={e => setDealFormData({ ...dealFormData, title: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="输入商机标题" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">关联客户 <span className="text-red-500">*</span></label>
                <select value={dealFormData.customer_id} onChange={e => setDealFormData({ ...dealFormData, customer_id: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                  <option value="">选择客户</option>
                  {pipelineCustomers.map(c => <option key={c.id} value={c.id}>{c.name}{c.company ? ` (${c.company})` : ''}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">阶段 <span className="text-red-500">*</span></label>
                  <select value={dealFormData.stage_id} onChange={e => setDealFormData({ ...dealFormData, stage_id: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                    {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">预计金额</label>
                  <input type="number" value={dealFormData.value} onChange={e => setDealFormData({ ...dealFormData, value: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="0" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">预计成交日</label>
                  <input type="date" value={dealFormData.expected_close_date} onChange={e => setDealFormData({ ...dealFormData, expected_close_date: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">优先级</label>
                  <select value={dealFormData.priority} onChange={e => setDealFormData({ ...dealFormData, priority: e.target.value as Deal['priority'] })} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                    <option value="low">低</option><option value="medium">中</option><option value="high">高</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">负责人</label>
                <select value={dealFormData.assigned_to} onChange={e => setDealFormData({ ...dealFormData, assigned_to: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                  <option value="">未分配</option>
                  {pipelineUsers.map(u => <option key={u.id} value={u.id}>{u.nickname}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">备注</label>
                <textarea value={dealFormData.notes} onChange={e => setDealFormData({ ...dealFormData, notes: e.target.value })} rows={3} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none" placeholder="输入备注信息..." />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
              <button onClick={() => setShowDealForm(false)} className="px-4 py-2 text-sm text-muted-foreground hover:bg-accent rounded-lg transition-colors">取消</button>
              <button onClick={saveDeal} className="px-4 py-2 text-sm bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary-dark transition-colors">保存</button>
            </div>
          </div>
        </div>
      )}

      {/* Member Detail Modal (Q1.31) */}
      {showMemberDetail && memberDetailedStats && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto modal-content-enter">
            {/* Header */}
            <div className="px-6 py-4 border-b border-border flex items-center justify-between sticky top-0 bg-card/95 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center shadow-glow">
                  <span className="text-lg font-bold text-primary">{memberDetailedStats.member.nickname?.[0] || 'U'}</span>
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">{memberDetailedStats.member.nickname || memberDetailedStats.member.username}</h3>
                  <p className="text-xs text-muted-foreground">
                    {memberDetailedStats.member.role === 'admin' ? '管理员' : memberDetailedStats.member.role === 'supervisor' ? '主管' : '员工'}
                    · 最后登录: {memberDetailedStats.member.last_login_at ? formatDate(memberDetailedStats.member.last_login_at) : '从未登录'}
                  </p>
                </div>
              </div>
              <button onClick={() => setShowMemberDetail(false)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Stats Overview */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-secondary/30 rounded-xl p-4 text-center">
                  <Users className="w-5 h-5 text-blue-500 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-foreground">{memberDetailedStats.customerStats?.total || 0}</p>
                  <p className="text-xs text-muted-foreground">负责客户</p>
                </div>
                <div className="bg-secondary/30 rounded-xl p-4 text-center">
                  <Target className="w-5 h-5 text-purple-500 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-foreground">{memberDetailedStats.dealStats?.open || 0}</p>
                  <p className="text-xs text-muted-foreground">进行中商机</p>
                </div>
                <div className="bg-secondary/30 rounded-xl p-4 text-center">
                  <CheckCircle2 className="w-5 h-5 text-green-500 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-foreground">{memberDetailedStats.taskStats?.completed || 0}</p>
                  <p className="text-xs text-muted-foreground">已完成任务</p>
                </div>
                <div className="bg-secondary/30 rounded-xl p-4 text-center">
                  <MessageSquare className="w-5 h-5 text-amber-500 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-foreground">{memberDetailedStats.followUpStats?.total || 0}</p>
                  <p className="text-xs text-muted-foreground">跟进记录</p>
                </div>
              </div>

              {/* Customer Stats */}
              {memberDetailedStats.customerStats && (
                <div className="bg-card border border-border rounded-xl p-5">
                  <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-500" />客户统计
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-3 bg-blue-500/5 rounded-lg border border-blue-500/10">
                      <p className="text-xl font-bold text-blue-500">{memberDetailedStats.customerStats.leads || 0}</p>
                      <p className="text-xs text-muted-foreground">线索</p>
                    </div>
                    <div className="text-center p-3 bg-yellow-500/5 rounded-lg border border-yellow-500/10">
                      <p className="text-xl font-bold text-yellow-500">{memberDetailedStats.customerStats.prospects || 0}</p>
                      <p className="text-xs text-muted-foreground">意向</p>
                    </div>
                    <div className="text-center p-3 bg-green-500/5 rounded-lg border border-green-500/10">
                      <p className="text-xl font-bold text-green-500">{memberDetailedStats.customerStats.customers || 0}</p>
                      <p className="text-xs text-muted-foreground">成交</p>
                    </div>
                    <div className="text-center p-3 bg-red-500/5 rounded-lg border border-red-500/10">
                      <p className="text-xl font-bold text-red-500">{memberDetailedStats.customerStats.churned || 0}</p>
                      <p className="text-xs text-muted-foreground">流失</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                    <span>近7天新增: <strong className="text-green-500">{memberDetailedStats.customerStats.new_7d || 0}</strong></span>
                    <span>近30天新增: <strong className="text-green-500">{memberDetailedStats.customerStats.new_30d || 0}</strong></span>
                  </div>
                </div>
              )}

              {/* Deal Stats */}
              {memberDetailedStats.dealStats && (
                <div className="bg-card border border-border rounded-xl p-5">
                  <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Target className="w-4 h-4 text-purple-500" />商机统计
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-3 bg-purple-500/5 rounded-lg border border-purple-500/10">
                      <p className="text-xl font-bold text-purple-500">{memberDetailedStats.dealStats.open || 0}</p>
                      <p className="text-xs text-muted-foreground">进行中</p>
                    </div>
                    <div className="text-center p-3 bg-green-500/5 rounded-lg border border-green-500/10">
                      <p className="text-xl font-bold text-green-500">{memberDetailedStats.dealStats.won || 0}</p>
                      <p className="text-xs text-muted-foreground">已成交</p>
                    </div>
                    <div className="text-center p-3 bg-red-500/5 rounded-lg border border-red-500/10">
                      <p className="text-xl font-bold text-red-500">{memberDetailedStats.dealStats.lost || 0}</p>
                      <p className="text-xs text-muted-foreground">已流失</p>
                    </div>
                    <div className="text-center p-3 bg-blue-500/5 rounded-lg border border-blue-500/10">
                      <p className="text-xl font-bold text-blue-500">{formatCurrency(memberDetailedStats.dealStats.open_value || 0)}</p>
                      <p className="text-xs text-muted-foreground">进行中金额</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Task & Todo Stats */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {memberDetailedStats.taskStats && (
                  <div className="bg-card border border-border rounded-xl p-5">
                    <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-amber-500" />任务统计
                    </h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">总任务</span>
                        <span className="text-sm font-semibold">{memberDetailedStats.taskStats.total || 0}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">已完成</span>
                        <span className="text-sm font-semibold text-green-500">{memberDetailedStats.taskStats.completed || 0}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">待处理</span>
                        <span className="text-sm font-semibold text-amber-500">{memberDetailedStats.taskStats.pending || 0}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">已逾期</span>
                        <span className="text-sm font-semibold text-red-500">{memberDetailedStats.taskStats.overdue || 0}</span>
                      </div>
                      <div className="w-full h-2 bg-secondary rounded-full overflow-hidden mt-2">
                        <div
                          className="h-full bg-green-500 rounded-full transition-all"
                          style={{
                            width: `${memberDetailedStats.taskStats.total > 0 ? (memberDetailedStats.taskStats.completed / memberDetailedStats.taskStats.total) * 100 : 0}%`
                          }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground text-right">
                        完成率: {memberDetailedStats.taskStats.total > 0 ? Math.round((memberDetailedStats.taskStats.completed / memberDetailedStats.taskStats.total) * 100) : 0}%
                      </p>
                    </div>
                  </div>
                )}

                {memberDetailedStats.todoStats && (
                  <div className="bg-card border border-border rounded-xl p-5">
                    <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                      <ClipboardList className="w-4 h-4 text-cyan-500" />待办统计
                    </h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">总待办</span>
                        <span className="text-sm font-semibold">{memberDetailedStats.todoStats.total || 0}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">已完成</span>
                        <span className="text-sm font-semibold text-green-500">{memberDetailedStats.todoStats.completed || 0}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">待处理</span>
                        <span className="text-sm font-semibold text-amber-500">{memberDetailedStats.todoStats.pending || 0}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">已逾期</span>
                        <span className="text-sm font-semibold text-red-500">{memberDetailedStats.todoStats.overdue || 0}</span>
                      </div>
                      <div className="w-full h-2 bg-secondary rounded-full overflow-hidden mt-2">
                        <div
                          className="h-full bg-cyan-500 rounded-full transition-all"
                          style={{
                            width: `${memberDetailedStats.todoStats.total > 0 ? (memberDetailedStats.todoStats.completed / memberDetailedStats.todoStats.total) * 100 : 0}%`
                          }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground text-right">
                        完成率: {memberDetailedStats.todoStats.total > 0 ? Math.round((memberDetailedStats.todoStats.completed / memberDetailedStats.todoStats.total) * 100) : 0}%
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Follow Up Stats */}
              {memberDetailedStats.followUpStats && (
                <div className="bg-card border border-border rounded-xl p-5">
                  <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-green-500" />跟进统计
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div className="text-center p-3 bg-secondary/30 rounded-lg">
                      <p className="text-xl font-bold text-foreground">{memberDetailedStats.followUpStats.total || 0}</p>
                      <p className="text-xs text-muted-foreground">总跟进</p>
                    </div>
                    <div className="text-center p-3 bg-blue-500/5 rounded-lg">
                      <PhoneCall className="w-4 h-4 text-blue-500 mx-auto mb-1" />
                      <p className="text-sm font-bold">{memberDetailedStats.followUpStats.phone_count || 0}</p>
                      <p className="text-[10px] text-muted-foreground">电话</p>
                    </div>
                    <div className="text-center p-3 bg-green-500/5 rounded-lg">
                      <MailOpen className="w-4 h-4 text-green-500 mx-auto mb-1" />
                      <p className="text-sm font-bold">{memberDetailedStats.followUpStats.email_count || 0}</p>
                      <p className="text-[10px] text-muted-foreground">邮件</p>
                    </div>
                    <div className="text-center p-3 bg-amber-500/5 rounded-lg">
                      <Car className="w-4 h-4 text-amber-500 mx-auto mb-1" />
                      <p className="text-sm font-bold">{memberDetailedStats.followUpStats.visit_count || 0}</p>
                      <p className="text-[10px] text-muted-foreground">拜访</p>
                    </div>
                    <div className="text-center p-3 bg-purple-500/5 rounded-lg">
                      <MessageCircle className="w-4 h-4 text-purple-500 mx-auto mb-1" />
                      <p className="text-sm font-bold">{memberDetailedStats.followUpStats.wechat_count || 0}</p>
                      <p className="text-[10px] text-muted-foreground">微信</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Calendar Stats */}
              {memberDetailedStats.calendarStats && (
                <div className="bg-card border border-border rounded-xl p-5">
                  <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-orange-500" />日程统计
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-3 bg-orange-500/5 rounded-lg border border-orange-500/10">
                      <p className="text-xl font-bold text-orange-500">{memberDetailedStats.calendarStats.today || 0}</p>
                      <p className="text-xs text-muted-foreground">今日日程</p>
                    </div>
                    <div className="text-center p-3 bg-purple-500/5 rounded-lg border border-purple-500/10">
                      <p className="text-xl font-bold text-purple-500">{memberDetailedStats.calendarStats.this_week || 0}</p>
                      <p className="text-xs text-muted-foreground">本周日程</p>
                    </div>
                    <div className="text-center p-3 bg-blue-500/5 rounded-lg border border-blue-500/10">
                      <p className="text-xl font-bold text-blue-500">{memberDetailedStats.calendarStats.meetings || 0}</p>
                      <p className="text-xs text-muted-foreground">会议</p>
                    </div>
                    <div className="text-center p-3 bg-green-500/5 rounded-lg border border-green-500/10">
                      <p className="text-xl font-bold text-green-500">{memberDetailedStats.calendarStats.follow_ups || 0}</p>
                      <p className="text-xs text-muted-foreground">跟进</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Recent Activities */}
              {memberDetailedStats.recentActivities && memberDetailedStats.recentActivities.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-5">
                  <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-cyan-500" />最近活动
                  </h4>
                  <div className="space-y-3">
                    {memberDetailedStats.recentActivities.slice(0, 10).map((activity: any, index: number) => (
                      <div key={index} className="flex items-start gap-3 p-3 bg-secondary/30 rounded-lg">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          activity.type === 'follow_up' ? 'bg-green-500/10' :
                          activity.type === 'task' ? 'bg-amber-500/10' :
                          'bg-purple-500/10'
                        }`}>
                          {activity.type === 'follow_up' ? <PhoneCall className="w-4 h-4 text-green-500" /> :
                           activity.type === 'task' ? <Briefcase className="w-4 h-4 text-amber-500" /> :
                           <Target className="w-4 h-4 text-purple-500" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground truncate">{activity.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {activity.type === 'follow_up' ? `跟进方式: ${activity.detail}` :
                             activity.type === 'task' ? `状态: ${activity.detail}` :
                             `状态: ${activity.detail}`}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground flex-shrink-0">{formatDate(activity.created_at)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Customer Detail Modal */}
      {showDetail && detailCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col modal-content-enter">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between sticky top-0 bg-card rounded-t-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center"><User className="w-5 h-5 text-primary" /></div>
                <div>
                  <h3 className="font-medium text-foreground">{detailCustomer.name}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusLabel(detailCustomer.status).color}`}>{getStatusLabel(detailCustomer.status).label}</span>
                </div>
              </div>
              <button onClick={() => setShowDetail(false)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>

            {/* Tab Navigation */}
            <div className="px-6 py-3 border-b border-border flex items-center gap-1 bg-secondary/10">
              {[
                { key: 'basic', label: '基本信息', icon: Briefcase },
                { key: 'search', label: '联网搜索', icon: Globe },
                { key: 'evidence', label: '使用证据', icon: FileText },
                { key: 'followUp', label: '跟进（行动记录）', icon: History },
              ].map(tab => {
                const Icon = tab.icon
                return (
                  <button
                    key={tab.key}
                    onClick={() => setDetailTab(tab.key as any)}
                    className={`flex items-center gap-1.5 px-4 h-8 rounded-lg text-xs font-medium transition-colors ${
                      detailTab === tab.key
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                )
              })}
            </div>

            {/* Tab Content */}
            <div className="p-6 flex-1 overflow-y-auto">
              {/* 基本信息 Tab */}
              {detailTab === 'basic' && (
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2"><Briefcase className="w-4 h-4 text-primary" />基本信息</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-secondary/30 rounded-lg p-4">
                    <div className="flex items-center gap-2"><BuildingIcon className="w-4 h-4 text-muted-foreground" /><span className="text-sm text-muted-foreground">公司：</span><span className="text-sm text-foreground">{detailCustomer.company || '-'}</span></div>
                    <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-muted-foreground" /><span className="text-sm text-muted-foreground">电话：</span><span className="text-sm text-foreground">{detailCustomer.phone || '-'}</span></div>
                    <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-muted-foreground" /><span className="text-sm text-muted-foreground">邮箱：</span><span className="text-sm text-foreground">{detailCustomer.email || '-'}</span></div>
                    <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-muted-foreground" /><span className="text-sm text-muted-foreground">地址：</span><span className="text-sm text-foreground">{detailCustomer.address || '-'}</span></div>
                    <div className="flex items-center gap-2"><Tag className="w-4 h-4 text-muted-foreground" /><span className="text-sm text-muted-foreground">来源：</span><span className="text-sm text-foreground">{detailCustomer.source || '-'}</span></div>
                    <div className="flex items-center gap-2"><Filter className="w-4 h-4 text-muted-foreground" /><span className="text-sm text-muted-foreground">行业：</span><span className="text-sm text-foreground">{detailCustomer.industry || '-'}</span></div>
                    <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-muted-foreground" /><span className="text-sm text-muted-foreground">负责人：</span><span className="text-sm text-foreground">{(detailCustomer as any).assigned_name || '-'}</span></div>
                    <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-muted-foreground" /><span className="text-sm text-muted-foreground">创建时间：</span><span className="text-sm text-foreground">{formatDate((detailCustomer as any).created_at || detailCustomer.createdAt)}</span></div>
                    {detailCustomer.remark && <div className="md:col-span-2"><span className="text-sm text-muted-foreground">备注：</span><span className="text-sm text-foreground">{detailCustomer.remark}</span></div>}
                  </div>
                </div>
              )}

              {/* 联网搜索 Tab */}
              {detailTab === 'search' && (
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2"><Globe className="w-4 h-4 text-primary" />联网搜索 · 企业信息</h4>
                  {profileLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="flex items-center gap-3">
                        <RefreshCw className="w-5 h-5 text-primary animate-spin" />
                        <span className="text-sm text-muted-foreground">正在搜索企业信息...</span>
                      </div>
                    </div>
                  ) : enterpriseProfile ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-secondary/30 rounded-lg p-4">
                        <div><span className="text-xs text-muted-foreground">企业名称</span><p className="text-sm text-foreground font-medium">{enterpriseProfile.company || detailCustomer.company || '-'}</p></div>
                        <div><span className="text-xs text-muted-foreground">法定代表人</span><p className="text-sm text-foreground">{enterpriseProfile.legalPerson || '-'}</p></div>
                        <div><span className="text-xs text-muted-foreground">注册资本</span><p className="text-sm text-foreground">{enterpriseProfile.registeredCapital || '-'}</p></div>
                        <div><span className="text-xs text-muted-foreground">成立日期</span><p className="text-sm text-foreground">{enterpriseProfile.establishedDate || '-'}</p></div>
                        <div><span className="text-xs text-muted-foreground">统一社会信用代码</span><p className="text-sm text-foreground">{enterpriseProfile.creditCode || '-'}</p></div>
                        <div><span className="text-xs text-muted-foreground">企业状态</span><p className="text-sm text-foreground">{enterpriseProfile.status || '-'}</p></div>
                        <div className="md:col-span-2"><span className="text-xs text-muted-foreground">注册地址</span><p className="text-sm text-foreground">{enterpriseProfile.address || '-'}</p></div>
                        <div className="md:col-span-2"><span className="text-xs text-muted-foreground">经营范围</span><p className="text-sm text-foreground">{enterpriseProfile.businessScope || '-'}</p></div>
                      </div>
                      {enterpriseProfile.riskInfo && (
                        <div className="bg-orange-500/5 border border-orange-500/20 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <AlertTriangle className="w-4 h-4 text-orange-500" />
                            <span className="text-sm font-medium text-foreground">风险信息</span>
                          </div>
                          <p className="text-sm text-muted-foreground">{enterpriseProfile.riskInfo}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <Globe className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">未找到该企业的联网信息</p>
                      <p className="text-xs mt-1">可尝试在企业画像页面补充完整信息</p>
                    </div>
                  )}
                </div>
              )}

              {/* 使用证据 Tab */}
              {detailTab === 'evidence' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium text-foreground flex items-center gap-2"><FileText className="w-4 h-4 text-primary" />使用证据 ({evidenceList.length})</h4>
                  </div>

                  {/* Add Evidence Form */}
                  <div className="bg-secondary/30 rounded-lg p-4 space-y-3">
                    <h5 className="text-xs font-medium text-muted-foreground">添加使用证据</h5>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1.5 block">证据类型</label>
                      <div className="flex items-center gap-2 flex-wrap">
                        {[
                          { value: 'text', label: '文本' },
                          { value: 'image', label: '图片' },
                          { value: 'document', label: '文档' },
                          { value: 'link', label: '链接' },
                        ].map(t => (
                          <button
                            key={t.value}
                            onClick={() => setEvidenceType(t.value)}
                            className={`px-3 h-7 rounded-lg text-xs transition-colors ${evidenceType === t.value ? 'bg-primary text-primary-foreground' : 'bg-background border border-input hover:bg-secondary'}`}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1.5 block">标题 *</label>
                      <input
                        type="text"
                        value={evidenceTitle}
                        onChange={e => setEvidenceTitle(e.target.value)}
                        placeholder="输入证据标题"
                        className="w-full h-9 px-3 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1.5 block">内容/描述</label>
                      <textarea
                        value={evidenceContent}
                        onChange={e => setEvidenceContent(e.target.value)}
                        placeholder="输入证据内容或描述..."
                        rows={2}
                        className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                      />
                    </div>
                    <button
                      onClick={addEvidence}
                      disabled={loading || !evidenceTitle.trim()}
                      className="flex items-center gap-1 px-3 h-8 bg-primary text-primary-foreground rounded-lg text-xs hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      <PlusCircle className="w-3 h-3" />
                      {loading ? '添加中...' : '添加证据'}
                    </button>
                  </div>

                  {/* Evidence List */}
                  {evidenceList.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground">
                      <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">暂无使用证据</p>
                      <p className="text-xs mt-1">请添加客户使用产品或服务的证据</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {evidenceList.map((ev: any) => (
                        <div key={ev.id} className="bg-secondary/30 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-primary" />
                              <span className="text-sm font-medium text-foreground">{ev.title}</span>
                              <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full">
                                {ev.evidence_type === 'text' ? '文本' : ev.evidence_type === 'image' ? '图片' : ev.evidence_type === 'document' ? '文档' : '链接'}
                              </span>
                            </div>
                            <span className="text-xs text-muted-foreground">{formatDate(ev.created_at)}</span>
                          </div>
                          {ev.content && <p className="text-sm text-muted-foreground">{ev.content}</p>}
                          {ev.evidence_url && (
                            <a href={ev.evidence_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-2 text-xs text-primary hover:underline">
                              <ExternalLink className="w-3 h-3" />查看附件
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 跟进记录 Tab */}
              {detailTab === 'followUp' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium text-foreground flex items-center gap-2"><History className="w-4 h-4 text-primary" />跟进记录 ({followUps.length})</h4>
                    <button onClick={() => setShowFollowUpForm(!showFollowUpForm)} className="flex items-center gap-1 px-3 h-7 bg-primary/10 text-primary rounded-lg text-xs hover:bg-primary/20 transition-colors"><Plus className="w-3 h-3" />添加跟进</button>
                  </div>
                  {showFollowUpForm && (
                    <div className="bg-secondary/30 rounded-lg p-4 space-y-3 mb-4">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1.5 block">跟进方式</label>
                        <div className="flex items-center gap-2 flex-wrap">
                          {FOLLOW_UP_TYPES.map(t => (
                            <button key={t.value} onClick={() => setFollowUpType(t.value as FollowUp['type'])} className={`px-3 h-7 rounded-lg text-xs transition-colors ${followUpType === t.value ? 'bg-primary text-primary-foreground' : 'bg-background border border-input hover:bg-secondary'}`}>{t.label}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1.5 block">跟进内容</label>
                        <textarea value={followUpContent} onChange={e => setFollowUpContent(e.target.value)} placeholder="输入跟进内容..." rows={3} className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none" />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={handleAddFollowUp} disabled={loading} className="flex items-center gap-1 px-3 h-8 bg-primary text-primary-foreground rounded-lg text-xs hover:bg-primary/90 transition-colors disabled:opacity-50"><Send className="w-3 h-3" />{loading ? '提交中...' : '提交'}</button>
                        <button onClick={() => { setShowFollowUpForm(false); setFollowUpContent('') }} className="px-3 h-8 bg-secondary rounded-lg text-xs hover:bg-secondary/80 transition-colors">取消</button>
                      </div>
                    </div>
                  )}
                  {followUps.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground"><MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" /><p className="text-sm">暂无跟进记录</p></div>
                  ) : (
                    <div className="space-y-3">
                      {followUps.map(fu => (
                        <div key={fu.id} className="bg-secondary/30 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full">{FOLLOW_UP_TYPES.find(t => t.value === fu.type)?.label || fu.type}</span>
                              <span className="text-xs text-muted-foreground">{fu.createdBy}</span>
                            </div>
                            <span className="text-xs text-muted-foreground">{formatDate((fu as any).created_at || fu.createdAt)}</span>
                          </div>
                          <p className="text-sm text-foreground">{fu.content}</p>
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

      {/* Abandon Customer Confirmation Modal */}
      {showAbandonModal && abandoningCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl w-full max-w-md mx-4 modal-content-enter">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertOctagon className="w-5 h-5 text-orange-500" />
                <h3 className="font-medium text-foreground">放弃客户</h3>
              </div>
              <button onClick={() => { setShowAbandonModal(false); setAbandoningCustomer(null); setAbandonReason('') }} className="p-1 rounded-lg hover:bg-secondary transition-colors"><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                确定要放弃客户 <span className="text-foreground font-medium">{abandoningCustomer.name}</span> 吗？
                放弃后该客户将移入放弃名单，且不再占用您的客户名额。
              </p>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">放弃原因 *</label>
                <textarea
                  value={abandonReason}
                  onChange={e => setAbandonReason(e.target.value)}
                  placeholder="请输入放弃原因..."
                  rows={3}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setShowAbandonModal(false); setAbandoningCustomer(null); setAbandonReason('') }} className="px-4 h-8 bg-secondary rounded-lg text-xs hover:bg-secondary/80 transition-colors">取消</button>
                <button onClick={confirmAbandon} disabled={loading || !abandonReason.trim()} className="flex items-center gap-1 px-4 h-8 bg-orange-500 text-white rounded-lg text-xs hover:bg-orange-600 transition-colors disabled:opacity-50">
                  <UserMinus className="w-3 h-3" />{loading ? '处理中...' : '确认放弃'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Supplement Request Modal */}
      {showSupplementModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl w-full max-w-md mx-4 modal-content-enter">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-primary" />
                <h3 className="font-medium text-foreground">申请补充客户名单</h3>
              </div>
              <button onClick={() => { setShowSupplementModal(false); setSupplementReason('') }} className="p-1 rounded-lg hover:bg-secondary transition-colors"><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                当前客户数 <strong className="text-foreground">{customerCountInfo.totalCustomers}</strong> / <strong className="text-foreground">{customerCountInfo.maxLimit}</strong>。
                提交申请后，主管将为您推送补充客户名单。
              </p>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">申请数量</label>
                <div className="flex items-center gap-2">
                  {[3, 5, 10, 20].map(n => (
                    <button
                      key={n}
                      onClick={() => setSupplementQuantity(n)}
                      className={`px-4 h-8 rounded-lg text-sm transition-colors ${supplementQuantity === n ? 'bg-primary text-primary-foreground' : 'bg-secondary hover:bg-secondary/80 text-muted-foreground'}`}
                    >
                      {n}个
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">申请原因 *</label>
                <textarea
                  value={supplementReason}
                  onChange={e => setSupplementReason(e.target.value)}
                  placeholder="请说明需要补充客户名单的原因..."
                  rows={3}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setShowSupplementModal(false); setSupplementReason('') }} className="px-4 h-8 bg-secondary rounded-lg text-xs hover:bg-secondary/80 transition-colors">取消</button>
                <button onClick={createSupplementRequest} disabled={loading || !supplementReason.trim()} className="flex items-center gap-1 px-4 h-8 bg-primary text-primary-foreground rounded-lg text-xs hover:bg-primary/90 transition-colors disabled:opacity-50">
                  <Send className="w-3 h-3" />{loading ? '提交中...' : '提交申请'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Supplement Requests Management Modal (Admin/Supervisor) */}
      {showRequestsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col modal-content-enter">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between sticky top-0 bg-card rounded-t-xl">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-primary" />
                <h3 className="font-medium text-foreground">补充名单请求管理</h3>
              </div>
              <button onClick={() => setShowRequestsModal(false)} className="p-1 rounded-lg hover:bg-secondary transition-colors"><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="p-6 flex-1 overflow-y-auto">
              {supplementRequests.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">暂无补充名单请求</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {supplementRequests.map((req: any) => (
                    <div key={req.id} className="bg-secondary/30 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-primary" />
                          <span className="text-sm font-medium text-foreground">{req.requester_name || req.requester_id}</span>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          req.status === 'pending' ? 'bg-yellow-500/10 text-yellow-600' :
                          req.status === 'approved' ? 'bg-green-500/10 text-green-600' :
                          'bg-red-500/10 text-red-600'
                        }`}>
                          {req.status === 'pending' ? '待处理' : req.status === 'approved' ? '已批准' : '已驳回'}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">
                        <span className="text-foreground">申请数量：</span>{req.quantity}个
                      </p>
                      <p className="text-sm text-muted-foreground">
                        <span className="text-foreground">原因：</span>{req.reason}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">{formatDate(req.created_at)}</p>
                      {req.status === 'pending' && (
                        <div className="flex gap-2 mt-3">
                          <button onClick={() => handleSupplementRequest(req.id, 'approved')} className="flex items-center gap-1 px-3 h-7 bg-green-500 text-white rounded-lg text-xs hover:bg-green-600 transition-colors">
                            <CheckCircle2 className="w-3 h-3" />批准
                          </button>
                          <button onClick={() => handleSupplementRequest(req.id, 'rejected')} className="flex items-center gap-1 px-3 h-7 bg-red-500 text-white rounded-lg text-xs hover:bg-red-600 transition-colors">
                            <XCircle className="w-3 h-3" />驳回
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function BuildingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18" /><path d="M6 12H4a2 2 0 0 0-2 2v6h20v-6a2 2 0 0 0-2-2h-2" /><path d="M6 22h12" /><path d="M10 10h4" /><path d="M10 6h4" /><path d="M10 14h4" />
    </svg>
  )
}
