import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { Trash2, RotateCcw, AlertTriangle, Archive, Filter, CheckSquare, Square } from 'lucide-react'

interface TrashItem {
  id: number
  original_table: string
  original_id: number
  data: string
  summary: string | null
  user_id: number | null
  deleted_by: number | null
  restored: number
  restored_at: string | null
  created_at: string
}

const TABLE_LABELS: Record<string, string> = {
  crm_customers: '客户',
  crm_sales_tasks: '销售任务',
  crm_todos: '待办事项',
  crm_calendar_events: '日历事件',
  crm_follow_ups: '跟进记录',
  crm_notifications: '通知',
  crm_pipeline_stages: '管道阶段',
  crm_deals: '商机',
  crm_assignment_rules: '分派规则',
  crm_user_skills: '员工技能',
  crm_user_territories: '负责地域',
  sales_crew_sessions: '销售教练会话',
  conversations: '对话',
  workflows: '工作流',
  agents: '智能体',
  crews: '作战编队',
  knowledge_bases: '知识库',
  knowledge_documents: '知识文档',
  crawler_tasks: '抓取任务',
  roles: '角色',
  ai_providers: 'AI提供商',
  users: '用户',
}

const TABLE_COLORS: Record<string, string> = {
  crm_customers: 'bg-blue-500/20 text-blue-400',
  crm_sales_tasks: 'bg-purple-500/20 text-purple-400',
  crm_todos: 'bg-cyan-500/20 text-cyan-400',
  crm_calendar_events: 'bg-teal-500/20 text-teal-400',
  crm_follow_ups: 'bg-green-500/20 text-green-400',
  crm_notifications: 'bg-yellow-500/20 text-yellow-400',
  crm_pipeline_stages: 'bg-indigo-500/20 text-indigo-400',
  crm_deals: 'bg-emerald-500/20 text-emerald-400',
  crm_assignment_rules: 'bg-orange-500/20 text-orange-400',
  crm_user_skills: 'bg-pink-500/20 text-pink-400',
  crm_user_territories: 'bg-rose-500/20 text-rose-400',
  sales_crew_sessions: 'bg-red-500/20 text-red-400',
  conversations: 'bg-sky-500/20 text-sky-400',
  workflows: 'bg-violet-500/20 text-violet-400',
  agents: 'bg-fuchsia-500/20 text-fuchsia-400',
  crews: 'bg-amber-500/20 text-amber-400',
  knowledge_bases: 'bg-lime-500/20 text-lime-400',
  knowledge_documents: 'bg-orange-500/20 text-orange-400',
  crawler_tasks: 'bg-teal-500/20 text-teal-400',
  roles: 'bg-indigo-500/20 text-indigo-400',
  ai_providers: 'bg-sky-500/20 text-sky-400',
  users: 'bg-gray-500/20 text-gray-400',
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHour = Math.floor(diffMs / 3600000)
  const diffDay = Math.floor(diffMs / 86400000)
  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin}分钟前`
  if (diffHour < 24) return `${diffHour}小时前`
  if (diffDay < 30) return `${diffDay}天前`
  return d.toLocaleDateString('zh-CN')
}

export default function TrashPage() {
  const [items, setItems] = useState<TrashItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [filterTable, setFilterTable] = useState<string>('')
  const [message, setMessage] = useState('')

  const loadItems = useCallback(async () => {
    setLoading(true)
    try {
      const params: any = { pageSize: '200' }
      if (filterTable) params.table = filterTable
      const resp = await axios.get('/api/trash', { params })
      if (resp.data.success) {
        setItems(resp.data.items)
      }
    } catch (err) {
      console.error('加载回收站失败:', err)
    } finally {
      setLoading(false)
    }
  }, [filterTable])

  useEffect(() => {
    loadItems()
  }, [loadItems])

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(items.map(i => i.id)))
    }
  }

  const handleRestore = async (id: number) => {
    try {
      const resp = await axios.post(`/api/trash/${id}/restore`)
      if (resp.data.success) {
        setMessage('已恢复')
        loadItems()
        setTimeout(() => setMessage(''), 2000)
      } else {
        alert(resp.data.error || '恢复失败')
      }
    } catch (err: any) {
      alert(err.response?.data?.error || '恢复失败')
    }
  }

  const handlePermanentDelete = async (id: number) => {
    if (!confirm('确定要永久删除吗？此操作不可撤销！')) return
    try {
      await axios.delete(`/api/trash/${id}`)
      loadItems()
      setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next })
    } catch (err: any) {
      alert(err.response?.data?.error || '删除失败')
    }
  }

  const handleEmptySelected = async () => {
    if (selectedIds.size === 0) return
    if (!confirm(`确定要永久删除选中的 ${selectedIds.size} 条记录吗？此操作不可撤销！`)) return
    try {
      await axios.post('/api/trash/empty', { ids: Array.from(selectedIds) })
      setSelectedIds(new Set())
      loadItems()
    } catch (err: any) {
      alert(err.response?.data?.error || '清空失败')
    }
  }

  const uniqueTables = [...new Set(items.map(i => i.original_table))]

  return (
    <div className="h-full flex flex-col p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Archive className="w-7 h-7 text-amber-500" />
            回收站
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            所有被删除的数据都在这里，可以恢复或永久删除
          </p>
        </div>
        <div className="flex items-center gap-3">
          {message && (
            <span className="text-sm text-green-500">{message}</span>
          )}
          {selectedIds.size > 0 && (
            <button
              onClick={handleEmptySelected}
              className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-500 border border-red-500/30 rounded-lg text-sm hover:bg-red-500/20 transition-colors btn-ripple"
            >
              <AlertTriangle className="w-4 h-4" />
              永久删除选中 ({selectedIds.size})
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <select
            value={filterTable}
            onChange={e => { setFilterTable(e.target.value); setSelectedIds(new Set()) }}
            className="bg-secondary border border-border rounded-lg px-3 py-1.5 text-sm"
          >
            <option value="">全部类型</option>
            {uniqueTables.map(t => (
              <option key={t} value={t}>{TABLE_LABELS[t] || t}</option>
            ))}
          </select>
        </div>
        <span className="text-sm text-muted-foreground">
          共 {items.length} 条记录
        </span>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
          <Archive className="w-16 h-16 mb-4 opacity-30" />
          <p className="text-lg font-medium">回收站为空</p>
          <p className="text-sm mt-1">删除的数据会显示在这里</p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 px-1">
            <button onClick={toggleSelectAll} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              {selectedIds.size === items.length && items.length > 0 ? (
                <CheckSquare className="w-4 h-4 text-primary" />
              ) : (
                <Square className="w-4 h-4" />
              )}
              全选
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2">
            {items.map(item => (
              <div
                key={item.id}
                className="flex items-center gap-4 bg-card/60 border border-border/50 rounded-xl p-4 hover:bg-card/80 transition-colors group"
              >
                <button onClick={() => toggleSelect(item.id)} className="flex-shrink-0">
                  {selectedIds.has(item.id) ? (
                    <CheckSquare className="w-5 h-5 text-primary" />
                  ) : (
                    <Square className="w-5 h-5 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${TABLE_COLORS[item.original_table] || 'bg-gray-500/20 text-gray-400'}`}>
                      {TABLE_LABELS[item.original_table] || item.original_table}
                    </span>
                    <span className="text-sm font-medium truncate">
                      {item.summary || `#${item.original_id}`}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    删除于 {formatTime(item.created_at)}
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleRestore(item.id)}
                    className="p-2 hover:bg-green-500/10 rounded-lg transition-all"
                    title="恢复"
                  >
                    <RotateCcw className="w-4 h-4 text-green-400" />
                  </button>
                  <button
                    onClick={() => handlePermanentDelete(item.id)}
                    className="p-2 hover:bg-red-500/10 rounded-lg transition-all"
                    title="永久删除"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}