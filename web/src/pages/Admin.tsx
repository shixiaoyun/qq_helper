import { useState, useEffect, useCallback } from 'react'
import {
  Users, Search, Plus, Trash2, Edit3, Check, X, RefreshCw,
  Shield, UserCheck, UserX, Key, ChevronLeft, ChevronRight,
  HardDrive, Database, Trash, BarChart3, MessageCircle, Settings2, Coins,
} from 'lucide-react'
import axios from 'axios'
import { useAuthStore } from '../stores/auth'

interface AdminUser {
  id: number
  username: string
  email: string | null
  phone: string | null
  nickname: string | null
  avatar: string | null
  role: string
  status: number
  lastLoginAt: string | null
  createdAt: string
  storageLimitMB?: number
  dailyChatLimit?: number
}

interface StorageStat {
  userId: number
  username: string
  nickname: string
  role: string
  conversationCount: number
  messageCount: number
  tokenUsageCount: number
  estimatedBytes: number
  estimatedKB: number
  estimatedMB: number
}

interface ChatStat {
  userId: number
  username: string
  nickname: string
  role: string
  daily_chat_limit: number
  today_chat_count: number
}

interface TokenLimitEntry {
  user_id: number
  username: string
  nickname: string
  daily_limit: number
  weekly_limit: number
  monthly_limit: number
  daily_usage: number
  weekly_usage: number
  monthly_usage: number
}

interface TokenTotals {
  total_tokens_all: number
  total_tokens_today: number
  total_tokens_this_week: number
  total_tokens_this_month: number
}

const ROLE_OPTIONS = [
  { value: 'admin', label: '管理员', color: 'bg-red-500/10 text-red-500' },
  { value: 'supervisor', label: '主管', color: 'bg-orange-500/10 text-orange-500' },
  { value: 'user', label: '成员', color: 'bg-blue-500/10 text-blue-500' },
]

export default function AdminPage() {
  const { isAdmin } = useAuthStore()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    email: '',
    nickname: '',
    role: 'user',
  })
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error'>('success')

  const [storageStats, setStorageStats] = useState<StorageStat[]>([])
  const [chatStats, setChatStats] = useState<ChatStat[]>([])
  const [activeTab, setActiveTab] = useState<'users' | 'storage' | 'chat' | 'token'>('users')
  const [clearTargetUser, setClearTargetUser] = useState<AdminUser | null>(null)
  const [clearConfirmText, setClearConfirmText] = useState('')
  const [quotaTargetUser, setQuotaTargetUser] = useState<AdminUser | null>(null)
  const [quotaForm, setQuotaForm] = useState({ storageLimitMB: 1024, dailyChatLimit: 99 })
  const [saving, setSaving] = useState(false)
  const [tokenLimits, setTokenLimits] = useState<TokenLimitEntry[]>([])
  const [tokenTotals, setTokenTotals] = useState<TokenTotals>({
    total_tokens_all: 0,
    total_tokens_today: 0,
    total_tokens_this_week: 0,
    total_tokens_this_month: 0,
  })
  const [tokenEditUser, setTokenEditUser] = useState<TokenLimitEntry | null>(null)
  const [tokenEditForm, setTokenEditForm] = useState({ daily_limit: 1000000, weekly_limit: 5000000, monthly_limit: 10000000 })

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('pageSize', String(pageSize))
      if (searchQuery) params.set('search', searchQuery)
      if (roleFilter) params.set('role', roleFilter)
      if (statusFilter) params.set('status', statusFilter)

      const resp = await axios.get(`/api/admin/users?${params}`)
      setUsers(Array.isArray(resp.data.data) ? resp.data.data : [])
      setTotal(resp.data.pagination?.total || 0)
    } catch (err: any) {
      showMessage(err.response?.data?.error || '加载失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, searchQuery, roleFilter, statusFilter])

  const loadStorageStats = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await axios.get('/api/admin/users/storage')
      setStorageStats(Array.isArray(resp.data.data) ? resp.data.data : [])
    } catch (err: any) {
      showMessage(err.response?.data?.error || '加载存储统计失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadChatStats = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await axios.get('/api/admin/users/chat-stats')
      setChatStats(Array.isArray(resp.data.data) ? resp.data.data : [])
    } catch (err: any) {
      showMessage(err.response?.data?.error || '加载对话统计失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadTokenStats = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await axios.get('/api/admin/token-limits')
      if (resp.data.success) {
        setTokenLimits(Array.isArray(resp.data.data.users) ? resp.data.data.users : [])
        setTokenTotals(resp.data.data.totals || {
          total_tokens_all: 0,
          total_tokens_today: 0,
          total_tokens_this_week: 0,
          total_tokens_this_month: 0,
        })
      }
    } catch (err: any) {
      showMessage(err.response?.data?.error || '加载Token限额失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAdmin) {
      loadUsers()
      loadStorageStats()
      loadChatStats()
      loadTokenStats()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, page, searchQuery, roleFilter, statusFilter])

  const showMessage = (msg: string, type: 'success' | 'error') => {
    setMessage(msg)
    setMessageType(type)
    setTimeout(() => setMessage(''), 3000)
  }

  const handleCreate = async () => {
    if (!formData.username || !formData.password) {
      showMessage('用户名和密码不能为空', 'error')
      return
    }

    setLoading(true)
    try {
      await axios.post('/api/admin/users', formData)
      showMessage('创建成功', 'success')
      setShowForm(false)
      resetForm()
      loadUsers()
    } catch (err: any) {
      showMessage(err.response?.data?.error || '创建失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdate = async () => {
    if (!editingUser) return

    setLoading(true)
    try {
      await axios.put(`/api/admin/users/${editingUser.id}`, {
        nickname: formData.nickname,
        email: formData.email,
        role: formData.role,
      })
      showMessage('更新成功', 'success')
      setShowForm(false)
      setEditingUser(null)
      resetForm()
      loadUsers()
    } catch (err: any) {
      showMessage(err.response?.data?.error || '更新失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (user: AdminUser) => {
    if (!confirm(`确定要删除用户 "${user.username}" 吗？`)) return

    setLoading(true)
    try {
      await axios.delete(`/api/admin/users/${user.id}`)
      showMessage('删除成功', 'success')
      loadUsers()
    } catch (err: any) {
      showMessage(err.response?.data?.error || '删除失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async (user: AdminUser) => {
    const newPassword = prompt(`请输入用户 "${user.username}" 的新密码（至少6位）：`)
    if (!newPassword || newPassword.length < 6) {
      showMessage('密码长度不能少于6位', 'error')
      return
    }

    setLoading(true)
    try {
      await axios.post(`/api/admin/users/${user.id}/reset-password`, { newPassword })
      showMessage('密码重置成功', 'success')
    } catch (err: any) {
      showMessage(err.response?.data?.error || '重置失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleToggleStatus = async (user: AdminUser) => {
    const newStatus = user.status === 1 ? 0 : 1
    const action = newStatus === 1 ? '启用' : '禁用'

    if (!confirm(`确定要${action}用户 "${user.username}" 吗？`)) return

    setLoading(true)
    try {
      await axios.put(`/api/admin/users/${user.id}`, { status: newStatus })
      showMessage(`${action}成功`, 'success')
      loadUsers()
    } catch (err: any) {
      showMessage(err.response?.data?.error || `${action}失败`, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleAdminClearData = async () => {
    if (clearConfirmText !== 'ADMIN_CLEAR_USER_DATA') {
      showMessage('确认码不正确', 'error')
      return
    }
    if (!clearTargetUser) return

    setLoading(true)
    try {
      await axios.post(`/api/admin/users/${clearTargetUser.id}/clear-data`, {
        confirm: 'ADMIN_CLEAR_USER_DATA',
      })
      showMessage(`已清空用户 ${clearTargetUser.username} 的所有数据`, 'success')
      setClearTargetUser(null)
      setClearConfirmText('')
      loadStorageStats()
    } catch (err: any) {
      showMessage(err.response?.data?.error || '清空失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateQuota = async () => {
    if (!quotaTargetUser) return

    setLoading(true)
    try {
      await axios.put(`/api/admin/users/${quotaTargetUser.id}/quota`, {
        storage_limit_mb: quotaForm.storageLimitMB,
        daily_chat_limit: quotaForm.dailyChatLimit,
      })
      showMessage('配额更新成功', 'success')
      setQuotaTargetUser(null)
      loadUsers()
      loadStorageStats()
      loadChatStats()
    } catch (err: any) {
      showMessage(err.response?.data?.error || '更新配额失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  const startEdit = (user: AdminUser) => {
    setEditingUser(user)
    setFormData({
      username: user.username,
      password: '',
      email: user.email || '',
      nickname: user.nickname || '',
      role: user.role,
    })
    setShowForm(true)
  }

  const startCreate = () => {
    setEditingUser(null)
    resetForm()
    setShowForm(true)
  }

  const resetForm = () => {
    setFormData({
      username: '',
      password: '',
      email: '',
      nickname: '',
      role: 'user',
    })
  }

  const getRoleLabel = (role: string) => {
    return ROLE_OPTIONS.find(r => r.value === role) || { label: role, color: '' }
  }

  const totalPages = Math.ceil(total / pageSize)

  if (!isAdmin) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-4">
          <Shield className="w-16 h-16 text-destructive mx-auto" />
          <h2 className="text-xl font-bold text-foreground">权限不足</h2>
          <p className="text-muted-foreground">您没有访问用户管理页面的权限</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">用户管理</h1>
            <p className="text-sm text-muted-foreground">管理系统用户，分配角色和权限</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadUsers}
            disabled={loading}
            className="flex items-center gap-2 px-4 h-9 bg-secondary rounded-lg text-sm hover:bg-secondary/80 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
          <button
            onClick={startCreate}
            className="flex items-center gap-2 px-4 h-9 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            添加用户
          </button>
        </div>
      </div>

      {message && (
        <div className={`text-sm p-3 rounded-lg flex items-center justify-between ${
          messageType === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
        }`}>
          {message}
          <button onClick={() => setMessage('')} className="hover:opacity-70">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tab 切换 */}
      <div className="flex items-center gap-1 bg-secondary/50 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-4 h-8 rounded-md text-sm transition-colors ${
            activeTab === 'users' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Users className="w-4 h-4" />
          用户列表
        </button>
        <button
          onClick={() => setActiveTab('storage')}
          className={`flex items-center gap-2 px-4 h-8 rounded-md text-sm transition-colors ${
            activeTab === 'storage' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <HardDrive className="w-4 h-4" />
          存储空间
        </button>
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex items-center gap-2 px-4 h-8 rounded-md text-sm transition-colors ${
            activeTab === 'chat' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          对话配额
        </button>
        <button
          onClick={() => setActiveTab('token')}
          className={`flex items-center gap-2 px-4 h-8 rounded-md text-sm transition-colors ${
            activeTab === 'token' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Coins className="w-4 h-4" />
          Token限额
        </button>
      </div>

      {/* 用户列表 Tab */}
      {activeTab === 'users' && (
        <>
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadUsers()}
                placeholder="搜索用户名/昵称/邮箱..."
                className="w-full h-9 pl-9 pr-3 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="h-9 px-3 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">所有角色</option>
              {ROLE_OPTIONS.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 px-3 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">所有状态</option>
              <option value="1">正常</option>
              <option value="0">禁用</option>
            </select>
            <button
              onClick={loadUsers}
              className="h-9 px-3 bg-secondary rounded-lg text-sm hover:bg-secondary/80 transition-colors"
            >
              筛选
            </button>
          </div>

          {showForm && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setShowForm(false); setEditingUser(null); resetForm(); }}>
              <div className="bg-card border border-border rounded-xl p-5 space-y-4 w-full max-w-lg mx-4 modal-content-enter" onClick={e => e.stopPropagation()}>
              <h2 className="font-medium text-foreground">
                {editingUser ? '编辑用户' : '添加新用户'}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">用户名 *</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={e => setFormData(prev => ({ ...prev, username: e.target.value }))}
                    disabled={!!editingUser}
                    placeholder="输入用户名"
                    className="w-full h-10 px-4 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">
                    {editingUser ? '密码 (留空不修改)' : '密码 *'}
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={e => setFormData(prev => ({ ...prev, password: e.target.value }))}
                    placeholder={editingUser ? '留空不修改' : '输入密码'}
                    className="w-full h-10 px-4 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">昵称</label>
                  <input
                    type="text"
                    value={formData.nickname}
                    onChange={e => setFormData(prev => ({ ...prev, nickname: e.target.value }))}
                    placeholder="输入昵称"
                    className="w-full h-10 px-4 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">邮箱</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="输入邮箱"
                    className="w-full h-10 px-4 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">角色</label>
                  <select
                    value={formData.role}
                    onChange={e => setFormData(prev => ({ ...prev, role: e.target.value }))}
                    className="w-full h-10 px-4 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    {ROLE_OPTIONS.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={editingUser ? handleUpdate : handleCreate}
                  disabled={loading}
                  className="flex items-center gap-2 px-4 h-9 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 btn-ripple"
                >
                  <Check className="w-4 h-4" />
                  {editingUser ? '保存修改' : '创建'}
                </button>
                <button
                  onClick={() => { setShowForm(false); setEditingUser(null); resetForm(); }}
                  className="flex items-center gap-2 px-4 h-9 bg-secondary rounded-lg text-sm hover:bg-secondary/80 transition-colors"
                >
                  <X className="w-4 h-4" />
                  取消
                </button>
              </div>
              </div>
            </div>
          )}

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-3 text-muted-foreground font-medium">用户</th>
                    <th className="text-left px-4 py-3 text-muted-foreground font-medium">角色</th>
                    <th className="text-left px-4 py-3 text-muted-foreground font-medium">状态</th>
                    <th className="text-left px-4 py-3 text-muted-foreground font-medium">最后登录</th>
                    <th className="text-left px-4 py-3 text-muted-foreground font-medium">注册时间</th>
                    <th className="text-right px-4 py-3 text-muted-foreground font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && users.length === 0 ? (
                    <>
                      {[...Array(5)].map((_, i) => (
                        <tr key={i}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="skeleton skeleton-avatar" />
                              <div className="flex-1">
                                <div className="skeleton skeleton-text" style={{ width: '40%' }} />
                                <div className="skeleton skeleton-text-sm mt-1" style={{ width: '50%' }} />
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3"><div className="skeleton skeleton-text-sm" style={{ width: '30%' }} /></td>
                          <td className="px-4 py-3"><div className="skeleton skeleton-text-sm" style={{ width: '30%' }} /></td>
                          <td className="px-4 py-3"><div className="skeleton skeleton-text" style={{ width: '60%' }} /></td>
                          <td className="px-4 py-3"><div className="skeleton skeleton-text" style={{ width: '50%' }} /></td>
                          <td className="px-4 py-3"><div className="skeleton skeleton-text-sm" style={{ width: '25%' }} /></td>
                        </tr>
                      ))}
                    </>
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                        <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        暂无用户数据
                      </td>
                    </tr>
                  ) : (
                    users.map((user) => {
                      const roleInfo = getRoleLabel(user.role)
                      return (
                        <tr key={user.id} className="border-b border-border/50 hover:bg-secondary/50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                <span className="text-sm font-medium text-primary">
                                  {user.nickname?.[0] || user.username[0]}
                                </span>
                              </div>
                              <div>
                                <p className="font-medium text-foreground">{user.nickname || user.username}</p>
                                <p className="text-xs text-muted-foreground">{user.username}{user.email ? ` · ${user.email}` : ''}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-1 rounded-full ${roleInfo.color}`}>
                              {roleInfo.label}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-1 rounded-full ${
                              user.status === 1 ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                            }`}>
                              {user.status === 1 ? '正常' : '禁用'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : '从未登录'}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {new Date(user.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleToggleStatus(user)}
                                className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
                                title={user.status === 1 ? '禁用' : '启用'}
                              >
                                {user.status === 1 ? (
                                  <UserX className="w-4 h-4 text-red-500" />
                                ) : (
                                  <UserCheck className="w-4 h-4 text-green-500" />
                                )}
                              </button>
                              <button
                                onClick={() => handleResetPassword(user)}
                                className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
                                title="重置密码"
                              >
                                <Key className="w-4 h-4 text-muted-foreground" />
                              </button>
                              <button
                                onClick={() => startEdit(user)}
                                className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
                                title="编辑"
                              >
                                <Edit3 className="w-4 h-4 text-muted-foreground" />
                              </button>
                              <button
                                onClick={() => handleDelete(user)}
                                className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                                title="删除"
                              >
                                <Trash2 className="w-4 h-4 text-red-500" />
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

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  共 {total} 条记录，第 {page}/{totalPages} 页
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="p-1.5 rounded-lg hover:bg-secondary transition-colors disabled:opacity-50"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-muted-foreground">{page}</span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="p-1.5 rounded-lg hover:bg-secondary transition-colors disabled:opacity-50"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* 存储空间 Tab */}
      {activeTab === 'storage' && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="font-medium text-foreground">用户存储空间监控</h2>
              <p className="text-xs text-muted-foreground mt-1">默认上限 1GB，超过自动清理最早的 100MB</p>
            </div>
            <button
              onClick={loadStorageStats}
              disabled={loading}
              className="flex items-center gap-2 px-3 h-8 bg-secondary rounded-lg text-sm hover:bg-secondary/80 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">用户</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">角色</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium">对话数</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium">消息数</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium">Token记录</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium">占用空间</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {storageStats.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      暂无存储数据
                    </td>
                  </tr>
                ) : (
                  storageStats.map((stat) => {
                    const roleInfo = getRoleLabel(stat.role)
                    const isNearLimit = stat.estimatedMB > 900
                    return (
                      <tr key={stat.userId} className="border-b border-border/50 hover:bg-secondary/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground">{stat.nickname || stat.username}</span>
                            <span className="text-xs text-muted-foreground">({stat.username})</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-1 rounded-full ${roleInfo.color}`}>
                            {roleInfo.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-foreground">{stat.conversationCount}</td>
                        <td className="px-4 py-3 text-right text-foreground">{stat.messageCount}</td>
                        <td className="px-4 py-3 text-right text-foreground">{stat.tokenUsageCount}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-medium ${isNearLimit ? 'text-orange-500' : 'text-foreground'}`}>
                            {stat.estimatedMB > 1 ? `${stat.estimatedMB} MB` : `${stat.estimatedKB} KB`}
                          </span>
                          {isNearLimit && <span className="text-xs text-orange-500 ml-1">即将超限</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => {
                                setQuotaTargetUser({
                                  id: stat.userId,
                                  username: stat.username,
                                  nickname: stat.nickname,
                                  role: stat.role,
                                } as AdminUser)
                                setQuotaForm({ storageLimitMB: 1024, dailyChatLimit: 99 })
                              }}
                              className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
                              title="设置配额"
                            >
                              <Settings2 className="w-4 h-4 text-muted-foreground" />
                            </button>
                            <button
                              onClick={() => setClearTargetUser({
                                id: stat.userId,
                                username: stat.username,
                                nickname: stat.nickname,
                                role: stat.role,
                              } as AdminUser)}
                              className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                              title="清空数据"
                            >
                              <Trash className="w-4 h-4 text-red-500" />
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
        </div>
      )}

      {/* 对话配额 Tab */}
      {activeTab === 'chat' && (
        <div className="bg-card border border-border rounded-xl overflow-hidden card-hover-glow">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="font-medium text-foreground">用户对话配额监控</h2>
              <p className="text-xs text-muted-foreground mt-1">默认每日上限 99 次对话</p>
            </div>
            <button
              onClick={loadChatStats}
              disabled={loading}
              className="flex items-center gap-2 px-3 h-8 bg-secondary rounded-lg text-sm hover:bg-secondary/80 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">用户</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">角色</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium">今日对话</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium">每日上限</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium">使用率</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {chatStats.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                      <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      暂无对话数据
                    </td>
                  </tr>
                ) : (
                  chatStats.map((stat) => {
                    const roleInfo = getRoleLabel(stat.role)
                    const usagePercent = Math.round((stat.today_chat_count / stat.daily_chat_limit) * 100)
                    const isNearLimit = usagePercent >= 80
                    return (
                      <tr key={stat.userId} className="border-b border-border/50 hover:bg-secondary/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground">{stat.nickname || stat.username}</span>
                            <span className="text-xs text-muted-foreground">({stat.username})</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-1 rounded-full ${roleInfo.color}`}>
                            {roleInfo.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-foreground">{stat.today_chat_count}</td>
                        <td className="px-4 py-3 text-right text-foreground">{stat.daily_chat_limit}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-20 h-2 bg-secondary rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${isNearLimit ? 'bg-orange-500' : 'bg-primary'}`}
                                style={{ width: `${Math.min(usagePercent, 100)}%` }}
                              />
                            </div>
                            <span className={`text-xs ${isNearLimit ? 'text-orange-500' : 'text-muted-foreground'}`}>
                              {usagePercent}%
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end">
                            <button
                              onClick={() => {
                                setQuotaTargetUser({
                                  id: stat.userId,
                                  username: stat.username,
                                  nickname: stat.nickname,
                                  role: stat.role,
                                } as AdminUser)
                                setQuotaForm({ storageLimitMB: 1024, dailyChatLimit: stat.daily_chat_limit })
                              }}
                              className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
                              title="设置配额"
                            >
                              <Settings2 className="w-4 h-4 text-muted-foreground" />
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
        </div>
      )}

      {/* Token限额 Tab */}
      {activeTab === 'token' && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">累计总消耗</p>
              <p className="text-lg font-bold text-foreground">{(tokenTotals.total_tokens_all / 10000).toFixed(1)}万</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{tokenTotals.total_tokens_all.toLocaleString()} tokens</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">今日消耗</p>
              <p className="text-lg font-bold text-amber-500">{(tokenTotals.total_tokens_today / 10000).toFixed(1)}万</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{tokenTotals.total_tokens_today.toLocaleString()} tokens</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">本周消耗</p>
              <p className="text-lg font-bold text-blue-500">{(tokenTotals.total_tokens_this_week / 10000).toFixed(1)}万</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{tokenTotals.total_tokens_this_week.toLocaleString()} tokens</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">本月消耗</p>
              <p className="text-lg font-bold text-purple-500">{(tokenTotals.total_tokens_this_month / 10000).toFixed(1)}万</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{tokenTotals.total_tokens_this_month.toLocaleString()} tokens</p>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="font-medium text-foreground">用户Token限额管理</h2>
                <p className="text-xs text-muted-foreground mt-1">默认: 每天100万 / 每周500万 / 每月1000万 tokens</p>
              </div>
              <button
                onClick={loadTokenStats}
                disabled={loading}
                className="flex items-center gap-2 px-3 h-8 bg-secondary rounded-lg text-sm hover:bg-secondary/80 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                刷新
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-3 text-muted-foreground font-medium">用户</th>
                    <th className="text-right px-4 py-3 text-muted-foreground font-medium">每日限额</th>
                    <th className="text-right px-4 py-3 text-muted-foreground font-medium">今日已用</th>
                    <th className="text-right px-4 py-3 text-muted-foreground font-medium">每周限额</th>
                    <th className="text-right px-4 py-3 text-muted-foreground font-medium">本周已用</th>
                    <th className="text-right px-4 py-3 text-muted-foreground font-medium">每月限额</th>
                    <th className="text-right px-4 py-3 text-muted-foreground font-medium">本月已用</th>
                    <th className="text-right px-4 py-3 text-muted-foreground font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {tokenLimits.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                        <Coins className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        暂无Token数据
                      </td>
                    </tr>
                  ) : (
                    tokenLimits.map((entry) => {
                      const dailyPercent = entry.daily_limit > 0 ? Math.round((entry.daily_usage / entry.daily_limit) * 100) : 0
                      const weeklyPercent = entry.weekly_limit > 0 ? Math.round((entry.weekly_usage / entry.weekly_limit) * 100) : 0
                      const monthlyPercent = entry.monthly_limit > 0 ? Math.round((entry.monthly_usage / entry.monthly_limit) * 100) : 0
                      const isOverDaily = dailyPercent >= 100
                      return (
                        <tr key={entry.user_id} className="border-b border-border/50 hover:bg-secondary/50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-foreground">{entry.nickname || entry.username}</span>
                              <span className="text-xs text-muted-foreground">({entry.username})</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right text-foreground">{entry.daily_limit.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 h-2 bg-secondary rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${isOverDaily ? 'bg-red-500' : dailyPercent >= 80 ? 'bg-orange-500' : 'bg-primary'}`}
                                  style={{ width: `${Math.min(dailyPercent, 100)}%` }}
                                />
                              </div>
                              <span className={`text-xs ${isOverDaily ? 'text-red-500 font-bold' : dailyPercent >= 80 ? 'text-orange-500' : 'text-muted-foreground'}`}>
                                {dailyPercent}%
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right text-foreground">{entry.weekly_limit.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right">
                            <span className={`text-xs ${weeklyPercent >= 80 ? 'text-orange-500 font-bold' : 'text-muted-foreground'}`}>
                              {entry.weekly_usage.toLocaleString()} ({weeklyPercent}%)
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-foreground">{entry.monthly_limit.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right">
                            <span className={`text-xs ${monthlyPercent >= 80 ? 'text-orange-500 font-bold' : 'text-muted-foreground'}`}>
                              {entry.monthly_usage.toLocaleString()} ({monthlyPercent}%)
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end">
                              <button
                                onClick={() => {
                                  setTokenEditUser(entry)
                                  setTokenEditForm({
                                    daily_limit: entry.daily_limit,
                                    weekly_limit: entry.weekly_limit,
                                    monthly_limit: entry.monthly_limit,
                                  })
                                }}
                                className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
                                title="设置Token限额"
                              >
                                <Settings2 className="w-4 h-4 text-muted-foreground" />
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
          </div>
        </div>
      )}

      {/* 清空数据确认弹窗 */}
      {clearTargetUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md mx-4 space-y-4 modal-content-enter">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-500/10 rounded-full flex items-center justify-center">
                <Trash className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-medium text-foreground">清空用户数据</h3>
                <p className="text-sm text-muted-foreground">{clearTargetUser.nickname || clearTargetUser.username}</p>
              </div>
            </div>
            <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4 space-y-3">
              <p className="text-sm text-destructive font-medium">⚠️ 此操作不可恢复！</p>
              <p className="text-xs text-muted-foreground">
                请输入 <code className="bg-background px-1 py-0.5 rounded text-destructive">ADMIN_CLEAR_USER_DATA</code> 确认清空该用户的所有聊天记录和数据
              </p>
              <input
                type="text"
                value={clearConfirmText}
                onChange={(e) => setClearConfirmText(e.target.value)}
                placeholder="输入确认码"
                className="w-full h-9 px-3 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-destructive/20 focus:border-destructive"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setClearTargetUser(null); setClearConfirmText('') }}
                className="px-4 h-9 bg-secondary rounded-lg text-sm hover:bg-secondary/80 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleAdminClearData}
                disabled={loading}
                className="px-4 h-9 bg-destructive text-destructive-foreground rounded-lg text-sm hover:bg-destructive/90 transition-colors disabled:opacity-50"
              >
                {loading ? '清空中...' : '确认清空'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 配额设置弹窗 */}
      {quotaTargetUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md mx-4 space-y-4 modal-content-enter">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                <Settings2 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-medium text-foreground">设置用户配额</h3>
                <p className="text-sm text-muted-foreground">{quotaTargetUser.nickname || quotaTargetUser.username}</p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">
                  存储空间上限 (MB) <span className="text-xs">范围: 100 ~ 10240</span>
                </label>
                <input
                  type="number"
                  value={quotaForm.storageLimitMB}
                  onChange={(e) => setQuotaForm(prev => ({ ...prev, storageLimitMB: Number(e.target.value) }))}
                  min={100}
                  max={10240}
                  className="w-full h-10 px-4 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
                <p className="text-xs text-muted-foreground mt-1">超过此上限将自动清理最早的约100MB内容</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">
                  每日对话次数上限 <span className="text-xs">范围: 1 ~ 9999</span>
                </label>
                <input
                  type="number"
                  value={quotaForm.dailyChatLimit}
                  onChange={(e) => setQuotaForm(prev => ({ ...prev, dailyChatLimit: Number(e.target.value) }))}
                  min={1}
                  max={9999}
                  className="w-full h-10 px-4 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setQuotaTargetUser(null)}
                className="px-4 h-9 bg-secondary rounded-lg text-sm hover:bg-secondary/80 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleUpdateQuota}
                disabled={loading}
                className="px-4 h-9 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {loading ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Token限额设置弹窗 */}
      {tokenEditUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md mx-4 space-y-4 modal-content-enter">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-500/10 rounded-full flex items-center justify-center">
                <Coins className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h3 className="font-medium text-foreground">设置Token限额</h3>
                <p className="text-sm text-muted-foreground">{tokenEditUser.nickname || tokenEditUser.username}</p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">
                  每日Token上限 <span className="text-xs">(默认 100万)</span>
                </label>
                <input
                  type="number"
                  value={tokenEditForm.daily_limit}
                  onChange={(e) => setTokenEditForm(p => ({ ...p, daily_limit: Number(e.target.value) }))}
                  min={0}
                  step={100000}
                  className="w-full h-10 px-4 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">
                  每周Token上限 <span className="text-xs">(默认 500万)</span>
                </label>
                <input
                  type="number"
                  value={tokenEditForm.weekly_limit}
                  onChange={(e) => setTokenEditForm(p => ({ ...p, weekly_limit: Number(e.target.value) }))}
                  min={0}
                  step={100000}
                  className="w-full h-10 px-4 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">
                  每月Token上限 <span className="text-xs">(默认 1000万)</span>
                </label>
                <input
                  type="number"
                  value={tokenEditForm.monthly_limit}
                  onChange={(e) => setTokenEditForm(p => ({ ...p, monthly_limit: Number(e.target.value) }))}
                  min={0}
                  step={100000}
                  className="w-full h-10 px-4 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                当前用量: 今日 {tokenEditUser.daily_usage.toLocaleString()} / 本周 {tokenEditUser.weekly_usage.toLocaleString()} / 本月 {tokenEditUser.monthly_usage.toLocaleString()}
              </p>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setTokenEditUser(null)}
                className="px-4 h-9 bg-secondary rounded-lg text-sm hover:bg-secondary/80 transition-colors"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  try {
                    setSaving(true)
                    await axios.put(`/api/admin/token-limits/${tokenEditUser.user_id}`, tokenEditForm)
                    showMessage('Token限额已更新', 'success')
                    setTokenEditUser(null)
                    loadTokenStats()
                  } catch (err: any) {
                    showMessage(err.response?.data?.error || '保存失败', 'error')
                  } finally {
                    setSaving(false)
                  }
                }}
                disabled={saving}
                className="px-4 h-9 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
