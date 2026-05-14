import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import {
  ClipboardList,
  Plus,
  Trash2,
  AlertCircle,
  Loader2,
  User,
  Building2,
  Calendar,
  X,
  CheckCircle2,
  Clock,
  PlayCircle,
  PauseCircle,
} from 'lucide-react'
import { useAuthStore } from '../stores/auth.ts'
import { getApiBaseUrl } from '../lib/api.ts'

interface Task {
  id: string
  title: string
  description?: string
  status: 'pending' | 'in_progress' | 'completed' | 'paused'
  priority: 'low' | 'medium' | 'high'
  assigneeId: string
  assigneeName?: string
  customerId?: string
  customerName?: string
  dueDate?: string
  createdAt: string
}

interface CRMUser {
  id: string
  username: string
  nickname?: string
}

interface TaskPanelProps {
  className?: string
}

const api = axios.create({
  baseURL: getApiBaseUrl(),
})

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export default function TaskPanel({ className = '' }: TaskPanelProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [users, setUsers] = useState<CRMUser[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [statusFilter, setStatusFilter] = useState<Task['status'] | 'all'>('all')

  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    priority: 'medium' as Task['priority'],
    assigneeId: '',
    customerId: '',
    dueDate: '',
  })

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const resp = await api.get('/api/crm/tasks')
      setTasks(resp.data.data?.list || resp.data.data || [])
    } catch (err: any) {
      setError(err.response?.data?.error || '获取任务列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchUsers = useCallback(async () => {
    try {
      const resp = await api.get('/api/crm/users')
      setUsers(resp.data.data || [])
    } catch (err: any) {
      console.error('获取用户列表失败:', err)
    }
  }, [])

  useEffect(() => {
    fetchTasks()
    fetchUsers()
  }, [fetchTasks, fetchUsers])

  const createTask = async () => {
    if (!newTask.title.trim() || !newTask.assigneeId) return
    setLoading(true)
    try {
      await api.post('/api/crm/tasks', newTask)
      setNewTask({
        title: '',
        description: '',
        priority: 'medium',
        assigneeId: '',
        customerId: '',
        dueDate: '',
      })
      setShowAddForm(false)
      await fetchTasks()
    } catch (err: any) {
      setError(err.response?.data?.error || '创建任务失败')
    } finally {
      setLoading(false)
    }
  }

  const updateTaskStatus = async (id: string, status: Task['status']) => {
    try {
      await api.patch(`/api/crm/tasks/${id}`, { status })
      setTasks(prev =>
        prev.map(t => (t.id === id ? { ...t, status } : t))
      )
    } catch (err: any) {
      setError(err.response?.data?.error || '更新任务状态失败')
    }
  }

  const deleteTask = async (id: string) => {
    try {
      await api.delete(`/api/crm/tasks/${id}`)
      setTasks(prev => prev.filter(t => t.id !== id))
    } catch (err: any) {
      setError(err.response?.data?.error || '删除任务失败')
    }
  }

  const statusConfig = {
    pending: { label: '待处理', icon: Clock, color: 'text-amber-500 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800' },
    in_progress: { label: '进行中', icon: PlayCircle, color: 'text-blue-500 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800' },
    paused: { label: '已暂停', icon: PauseCircle, color: 'text-gray-500 bg-gray-50 dark:bg-gray-950/30 border-gray-200 dark:border-gray-800' },
    completed: { label: '已完成', icon: CheckCircle2, color: 'text-green-500 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800' },
  }

  const priorityConfig = {
    high: { label: '高', color: 'text-red-500' },
    medium: { label: '中', color: 'text-amber-500' },
    low: { label: '低', color: 'text-green-500' },
  }

  const filteredTasks = statusFilter === 'all'
    ? tasks
    : tasks.filter(t => t.status === statusFilter)

  const statusOptions: { value: Task['status'] | 'all'; label: string }[] = [
    { value: 'all', label: '全部' },
    { value: 'pending', label: '待处理' },
    { value: 'in_progress', label: '进行中' },
    { value: 'paused', label: '已暂停' },
    { value: 'completed', label: '已完成' },
  ]

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* 头部 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-secondary/20 flex-shrink-0">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">任务委派</span>
          <span className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded-full">
            {filteredTasks.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className={`p-1.5 rounded transition-colors ${showAddForm ? 'bg-primary/10 text-primary' : 'hover:bg-secondary'}`}
          >
            {showAddForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="px-3 py-1.5 bg-red-500/10 text-red-500 text-[11px] flex items-center gap-1.5 flex-shrink-0">
          <AlertCircle className="w-3 h-3" />
          {error}
          <button onClick={() => setError('')} className="ml-auto hover:opacity-70">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* 状态筛选 */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border flex-shrink-0 overflow-x-auto">
        {statusOptions.map(opt => (
          <button
            key={opt.value}
            onClick={() => setStatusFilter(opt.value)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors whitespace-nowrap ${
              statusFilter === opt.value
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-secondary'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* 添加表单 */}
      {showAddForm && (
        <div className="p-3 border-b border-border bg-secondary/10 space-y-2 flex-shrink-0">
          <input
            type="text"
            value={newTask.title}
            onChange={e => setNewTask(prev => ({ ...prev, title: e.target.value }))}
            placeholder="任务标题..."
            className="w-full h-8 px-2.5 bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          <input
            type="text"
            value={newTask.description}
            onChange={e => setNewTask(prev => ({ ...prev, description: e.target.value }))}
            placeholder="描述（可选）..."
            className="w-full h-8 px-2.5 bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          <div className="flex gap-2">
            <select
              value={newTask.priority}
              onChange={e => setNewTask(prev => ({ ...prev, priority: e.target.value as Task['priority'] }))}
              className="h-8 px-2 bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="high">高优先级</option>
              <option value="medium">中优先级</option>
              <option value="low">低优先级</option>
            </select>
            <select
              value={newTask.assigneeId}
              onChange={e => setNewTask(prev => ({ ...prev, assigneeId: e.target.value }))}
              className="flex-1 h-8 px-2 bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="">选择委派给...</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.nickname || u.username}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newTask.customerId}
              onChange={e => setNewTask(prev => ({ ...prev, customerId: e.target.value }))}
              placeholder="客户ID"
              className="flex-1 h-8 px-2 bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            <input
              type="date"
              value={newTask.dueDate}
              onChange={e => setNewTask(prev => ({ ...prev, dueDate: e.target.value }))}
              className="h-8 px-2 bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowAddForm(false)}
              className="px-3 h-7 bg-secondary rounded-md text-xs hover:bg-secondary/80 transition-colors"
            >
              取消
            </button>
            <button
              onClick={createTask}
              disabled={!newTask.title.trim() || !newTask.assigneeId || loading}
              className="px-3 h-7 bg-primary text-primary-foreground rounded-md text-xs hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : '创建'}
            </button>
          </div>
        </div>
      )}

      {/* 任务列表 */}
      <div className="flex-1 overflow-y-auto">
        {loading && tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mb-2" />
            <span className="text-xs">加载中...</span>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <ClipboardList className="w-8 h-8 mb-2 opacity-30" />
            <span className="text-xs">暂无任务</span>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredTasks.map(task => {
              const sConfig = statusConfig[task.status]
              const StatusIcon = sConfig.icon
              const pConfig = priorityConfig[task.priority]
              return (
                <div
                  key={task.id}
                  className="group px-3 py-2.5 hover:bg-secondary/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate text-foreground">{task.title}</p>
                      {task.description && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{task.description}</p>
                      )}
                    </div>
                    <button
                      onClick={() => deleteTask(task.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/10 text-red-500 transition-all flex-shrink-0"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <span className={`flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border ${sConfig.color}`}>
                      <StatusIcon className="w-2.5 h-2.5" />
                      {sConfig.label}
                    </span>
                    <span className={`text-[10px] font-medium ${pConfig.color}`}>
                      {pConfig.label}优先级
                    </span>
                    {task.assigneeName && (
                      <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                        <User className="w-2.5 h-2.5" />
                        {task.assigneeName}
                      </span>
                    )}
                    {task.customerName && (
                      <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                        <Building2 className="w-2.5 h-2.5" />
                        {task.customerName}
                      </span>
                    )}
                    {task.dueDate && (
                      <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                        <Calendar className="w-2.5 h-2.5" />
                        {new Date(task.dueDate).toLocaleDateString('zh-CN')}
                      </span>
                    )}
                  </div>
                  {/* 状态操作 */}
                  <div className="flex items-center gap-1 mt-1.5">
                    {task.status !== 'in_progress' && task.status !== 'completed' && (
                      <button
                        onClick={() => updateTaskStatus(task.id, 'in_progress')}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                      >
                        开始
                      </button>
                    )}
                    {task.status === 'in_progress' && (
                      <button
                        onClick={() => updateTaskStatus(task.id, 'paused')}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-gray-50 dark:bg-gray-950/30 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-900/30 transition-colors"
                      >
                        暂停
                      </button>
                    )}
                    {task.status === 'paused' && (
                      <button
                        onClick={() => updateTaskStatus(task.id, 'in_progress')}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                      >
                        恢复
                      </button>
                    )}
                    {task.status !== 'completed' && (
                      <button
                        onClick={() => updateTaskStatus(task.id, 'completed')}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                      >
                        完成
                      </button>
                    )}
                    {task.status === 'completed' && (
                      <button
                        onClick={() => updateTaskStatus(task.id, 'pending')}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                      >
                        重置
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
