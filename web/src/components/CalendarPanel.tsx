import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import {
  CalendarDays,
  Plus,
  Trash2,
  AlertCircle,
  Loader2,
  Clock,
  Building2,
  ClipboardList,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useAuthStore } from '../stores/auth.ts'
import { getApiBaseUrl } from '../lib/api.ts'

interface CalendarEvent {
  id: string
  title: string
  description?: string
  startTime: string
  endTime?: string
  allDay?: boolean
  customerId?: string
  customerName?: string
  taskId?: string
  taskTitle?: string
  createdAt: string
}

type ViewMode = 'today' | 'week' | 'month'

interface CalendarPanelProps {
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

export default function CalendarPanel({ className = '' }: CalendarPanelProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('today')
  const [currentDate, setCurrentDate] = useState(new Date())

  const [newEvent, setNewEvent] = useState({
    title: '',
    description: '',
    startTime: '',
    endTime: '',
    allDay: false,
    customerId: '',
    taskId: '',
  })

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: Record<string, string> = { view: viewMode }
      if (viewMode === 'week' || viewMode === 'month') {
        params.date = currentDate.toISOString().split('T')[0]
      }
      const resp = await api.get('/api/crm/calendar', { params })
      setEvents(resp.data.data || [])
    } catch (err: any) {
      setError(err.response?.data?.error || '获取日历事件失败')
    } finally {
      setLoading(false)
    }
  }, [viewMode, currentDate])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  const createEvent = async () => {
    if (!newEvent.title.trim() || !newEvent.startTime) return
    setLoading(true)
    try {
      await api.post('/api/crm/calendar', newEvent)
      setNewEvent({
        title: '',
        description: '',
        startTime: '',
        endTime: '',
        allDay: false,
        customerId: '',
        taskId: '',
      })
      setShowAddForm(false)
      await fetchEvents()
    } catch (err: any) {
      setError(err.response?.data?.error || '创建事件失败')
    } finally {
      setLoading(false)
    }
  }

  const deleteEvent = async (id: string) => {
    try {
      await api.delete(`/api/crm/calendar/${id}`)
      setEvents(prev => prev.filter(e => e.id !== id))
    } catch (err: any) {
      setError(err.response?.data?.error || '删除事件失败')
    }
  }

  const navigateDate = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const next = new Date(prev)
      if (viewMode === 'week') {
        next.setDate(next.getDate() + (direction === 'next' ? 7 : -7))
      } else if (viewMode === 'month') {
        next.setMonth(next.getMonth() + (direction === 'next' ? 1 : -1))
      }
      return next
    })
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }

  const viewModeConfig: { value: ViewMode; label: string }[] = [
    { value: 'today', label: '今日' },
    { value: 'week', label: '本周' },
    { value: 'month', label: '本月' },
  ]

  const getHeaderText = () => {
    if (viewMode === 'today') {
      return '今日'
    }
    if (viewMode === 'week') {
      const start = new Date(currentDate)
      start.setDate(start.getDate() - start.getDay())
      const end = new Date(start)
      end.setDate(end.getDate() + 6)
      return `${start.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}`
    }
    return currentDate.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' })
  }

  // 按日期分组事件
  const groupedEvents = events.reduce<Record<string, CalendarEvent[]>>((acc, event) => {
    const date = new Date(event.startTime).toLocaleDateString('zh-CN')
    if (!acc[date]) acc[date] = []
    acc[date].push(event)
    return acc
  }, {})

  // 排序日期
  const sortedDates = Object.keys(groupedEvents).sort((a, b) => {
    return new Date(a).getTime() - new Date(b).getTime()
  })

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* 头部 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-secondary/20 flex-shrink-0">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">日历</span>
          <span className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded-full">
            {events.length}
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

      {/* 视图切换与导航 */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-1">
          {viewMode !== 'today' && (
            <>
              <button
                onClick={() => navigateDate('prev')}
                className="p-0.5 rounded hover:bg-secondary transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs text-muted-foreground min-w-[100px] text-center">
                {getHeaderText()}
              </span>
              <button
                onClick={() => navigateDate('next')}
                className="p-0.5 rounded hover:bg-secondary transition-colors"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          {viewMode === 'today' && (
            <span className="text-xs text-muted-foreground">{getHeaderText()}</span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {viewModeConfig.map(vm => (
            <button
              key={vm.value}
              onClick={() => setViewMode(vm.value)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                viewMode === vm.value
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-secondary'
              }`}
            >
              {vm.label}
            </button>
          ))}
        </div>
      </div>

      {/* 添加表单 */}
      {showAddForm && (
        <div className="p-3 border-b border-border bg-secondary/10 space-y-2 flex-shrink-0">
          <input
            type="text"
            value={newEvent.title}
            onChange={e => setNewEvent(prev => ({ ...prev, title: e.target.value }))}
            placeholder="事件标题..."
            className="w-full h-8 px-2.5 bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          <input
            type="text"
            value={newEvent.description}
            onChange={e => setNewEvent(prev => ({ ...prev, description: e.target.value }))}
            placeholder="描述（可选）..."
            className="w-full h-8 px-2.5 bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          <div className="flex gap-2">
            <input
              type="datetime-local"
              value={newEvent.startTime}
              onChange={e => setNewEvent(prev => ({ ...prev, startTime: e.target.value }))}
              className="flex-1 h-8 px-2 bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            <input
              type="datetime-local"
              value={newEvent.endTime}
              onChange={e => setNewEvent(prev => ({ ...prev, endTime: e.target.value }))}
              className="flex-1 h-8 px-2 bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newEvent.customerId}
              onChange={e => setNewEvent(prev => ({ ...prev, customerId: e.target.value }))}
              placeholder="客户ID"
              className="flex-1 h-8 px-2 bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            <input
              type="text"
              value={newEvent.taskId}
              onChange={e => setNewEvent(prev => ({ ...prev, taskId: e.target.value }))}
              placeholder="关联任务ID"
              className="flex-1 h-8 px-2 bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={newEvent.allDay}
              onChange={e => setNewEvent(prev => ({ ...prev, allDay: e.target.checked }))}
              className="w-3.5 h-3.5 rounded border-border"
            />
            全天事件
          </label>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowAddForm(false)}
              className="px-3 h-7 bg-secondary rounded-md text-xs hover:bg-secondary/80 transition-colors"
            >
              取消
            </button>
            <button
              onClick={createEvent}
              disabled={!newEvent.title.trim() || !newEvent.startTime || loading}
              className="px-3 h-7 bg-primary text-primary-foreground rounded-md text-xs hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : '创建'}
            </button>
          </div>
        </div>
      )}

      {/* 事件列表 */}
      <div className="flex-1 overflow-y-auto">
        {loading && events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mb-2" />
            <span className="text-xs">加载中...</span>
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <CalendarDays className="w-8 h-8 mb-2 opacity-30" />
            <span className="text-xs">暂无事件</span>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {sortedDates.map(date => (
              <div key={date}>
                <div className="px-3 py-1 bg-secondary/20 text-[10px] font-medium text-muted-foreground sticky top-0">
                  {date}
                </div>
                {groupedEvents[date].map(event => (
                  <div
                    key={event.id}
                    className="group flex items-start gap-2 px-3 py-2.5 hover:bg-secondary/30 transition-colors"
                  >
                    <div className="flex-shrink-0 w-12 text-right">
                      {event.allDay ? (
                        <span className="text-[10px] text-muted-foreground">全天</span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">{formatTime(event.startTime)}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate text-foreground">{event.title}</p>
                      {event.description && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{event.description}</p>
                      )}
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {!event.allDay && event.endTime && (
                          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                            <Clock className="w-2.5 h-2.5" />
                            {formatTime(event.startTime)} - {formatTime(event.endTime)}
                          </span>
                        )}
                        {event.customerName && (
                          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                            <Building2 className="w-2.5 h-2.5" />
                            {event.customerName}
                          </span>
                        )}
                        {event.taskTitle && (
                          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                            <ClipboardList className="w-2.5 h-2.5" />
                            {event.taskTitle}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => deleteEvent(event.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/10 text-red-500 transition-all flex-shrink-0"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
