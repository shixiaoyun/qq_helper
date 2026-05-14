import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import {
  CheckCircle2,
  Circle,
  Plus,
  Trash2,
  AlertCircle,
  Loader2,
  Calendar,
  User,
  Flag,
  X,
  ChevronDown,
} from 'lucide-react'
import { useAuthStore } from '../stores/auth.ts'
import { getApiBaseUrl } from '../lib/api.ts'

interface Todo {
  id: string
  title: string
  description?: string
  completed: boolean
  priority: 'low' | 'medium' | 'high'
  dueDate?: string
  customerId?: string
  customerName?: string
  createdAt: string
}

interface TodoPanelProps {
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

export default function TodoPanel({ className = '' }: TodoPanelProps) {
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [sortBy, setSortBy] = useState<'priority' | 'dueDate'>('priority')

  const [newTodo, setNewTodo] = useState({
    title: '',
    description: '',
    priority: 'medium' as Todo['priority'],
    dueDate: '',
    customerId: '',
  })

  const fetchTodos = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const resp = await api.get('/api/crm/todos')
      setTodos(resp.data.data || [])
    } catch (err: any) {
      setError(err.response?.data?.error || '获取待办列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTodos()
  }, [fetchTodos])

  const createTodo = async () => {
    if (!newTodo.title.trim()) return
    setLoading(true)
    try {
      await api.post('/api/crm/todos', newTodo)
      setNewTodo({
        title: '',
        description: '',
        priority: 'medium',
        dueDate: '',
        customerId: '',
      })
      setShowAddForm(false)
      await fetchTodos()
    } catch (err: any) {
      setError(err.response?.data?.error || '创建待办失败')
    } finally {
      setLoading(false)
    }
  }

  const toggleTodo = async (id: string, completed: boolean) => {
    try {
      await api.patch(`/api/crm/todos/${id}`, { completed: !completed })
      setTodos(prev =>
        prev.map(t => (t.id === id ? { ...t, completed: !completed } : t))
      )
    } catch (err: any) {
      setError(err.response?.data?.error || '更新待办状态失败')
    }
  }

  const deleteTodo = async (id: string) => {
    try {
      await api.delete(`/api/crm/todos/${id}`)
      setTodos(prev => prev.filter(t => t.id !== id))
    } catch (err: any) {
      setError(err.response?.data?.error || '删除待办失败')
    }
  }

  const priorityConfig = {
    high: { label: '高', color: 'text-red-500 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800' },
    medium: { label: '中', color: 'text-amber-500 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800' },
    low: { label: '低', color: 'text-green-500 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800' },
  }

  const sortedTodos = [...todos].sort((a, b) => {
    if (sortBy === 'priority') {
      const pMap = { high: 3, medium: 2, low: 1 }
      if (pMap[a.priority] !== pMap[b.priority]) {
        return pMap[b.priority] - pMap[a.priority]
      }
    }
    if (sortBy === 'dueDate') {
      if (a.dueDate && b.dueDate) {
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
      }
      if (a.dueDate) return -1
      if (b.dueDate) return 1
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  const completedCount = todos.filter(t => t.completed).length

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* 头部 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-secondary/20 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">待办事项</span>
          <span className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded-full">
            {completedCount}/{todos.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <div className="relative">
            <button
              onClick={() => setSortBy(prev => prev === 'priority' ? 'dueDate' : 'priority')}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] hover:bg-secondary transition-colors"
            >
              {sortBy === 'priority' ? <Flag className="w-3 h-3" /> : <Calendar className="w-3 h-3" />}
              {sortBy === 'priority' ? '按优先级' : '按截止日期'}
              <ChevronDown className="w-2.5 h-2.5" />
            </button>
          </div>
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

      {/* 添加表单 */}
      {showAddForm && (
        <div className="p-3 border-b border-border bg-secondary/10 space-y-2 flex-shrink-0">
          <input
            type="text"
            value={newTodo.title}
            onChange={e => setNewTodo(prev => ({ ...prev, title: e.target.value }))}
            placeholder="待办标题..."
            className="w-full h-8 px-2.5 bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          <input
            type="text"
            value={newTodo.description}
            onChange={e => setNewTodo(prev => ({ ...prev, description: e.target.value }))}
            placeholder="描述（可选）..."
            className="w-full h-8 px-2.5 bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          <div className="flex gap-2">
            <select
              value={newTodo.priority}
              onChange={e => setNewTodo(prev => ({ ...prev, priority: e.target.value as Todo['priority'] }))}
              className="h-8 px-2 bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="high">高优先级</option>
              <option value="medium">中优先级</option>
              <option value="low">低优先级</option>
            </select>
            <input
              type="date"
              value={newTodo.dueDate}
              onChange={e => setNewTodo(prev => ({ ...prev, dueDate: e.target.value }))}
              className="h-8 px-2 bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            <input
              type="text"
              value={newTodo.customerId}
              onChange={e => setNewTodo(prev => ({ ...prev, customerId: e.target.value }))}
              placeholder="客户ID"
              className="flex-1 h-8 px-2 bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
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
              onClick={createTodo}
              disabled={!newTodo.title.trim() || loading}
              className="px-3 h-7 bg-primary text-primary-foreground rounded-md text-xs hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : '创建'}
            </button>
          </div>
        </div>
      )}

      {/* 待办列表 */}
      <div className="flex-1 overflow-y-auto">
        {loading && todos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mb-2" />
            <span className="text-xs">加载中...</span>
          </div>
        ) : sortedTodos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <CheckCircle2 className="w-8 h-8 mb-2 opacity-30" />
            <span className="text-xs">暂无待办事项</span>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {sortedTodos.map(todo => {
              const pConfig = priorityConfig[todo.priority]
              return (
                <div
                  key={todo.id}
                  className={`group flex items-start gap-2 px-3 py-2.5 hover:bg-secondary/30 transition-colors ${
                    todo.completed ? 'opacity-50' : ''
                  }`}
                >
                  <button
                    onClick={() => toggleTodo(todo.id, todo.completed)}
                    className="mt-0.5 flex-shrink-0"
                  >
                    {todo.completed ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    ) : (
                      <Circle className="w-4 h-4 text-muted-foreground hover:text-primary transition-colors" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${todo.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                      {todo.title}
                    </p>
                    {todo.description && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{todo.description}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className={`text-[10px] px-1 py-0.5 rounded border ${pConfig.color}`}>
                        {pConfig.label}
                      </span>
                      {todo.dueDate && (
                        <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                          <Calendar className="w-2.5 h-2.5" />
                          {new Date(todo.dueDate).toLocaleDateString('zh-CN')}
                        </span>
                      )}
                      {todo.customerName && (
                        <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                          <User className="w-2.5 h-2.5" />
                          {todo.customerName}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteTodo(todo.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/10 text-red-500 transition-all flex-shrink-0"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
