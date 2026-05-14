import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import {
  Bug, Search, Trash2, RefreshCw, Loader2, AlertCircle,
  CheckCircle, Clock, ExternalLink, Download, FileText,
  Globe, Briefcase, LayoutGrid,
} from 'lucide-react'

interface CrawlTask {
  id: string
  url: string
  status: 'pending' | 'running' | 'completed' | 'error'
  keyword?: string
  platform?: string
  pages?: number
  results: any[]
  error?: string
  createdAt: string
  updatedAt: string
}

export default function SmartCrawlerPage() {
  const [tasks, setTasks] = useState<CrawlTask[]>([])
  const [keyword, setKeyword] = useState('')
  const [startPage, setStartPage] = useState(1)
  const [endPage, setEndPage] = useState(2)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedTask, setSelectedTask] = useState<CrawlTask | null>(null)
  const pollTimer = useRef<ReturnType<typeof window.setInterval> | null>(null)

  const fetchTasks = async () => {
    try {
      const resp = await axios.get('/api/crawler/tasks')
      setTasks(resp.data.data)
    } catch (err: any) {
      console.error('获取任务失败:', err)
    }
  }

  useEffect(() => {
    fetchTasks()
    pollTimer.current = setInterval(fetchTasks, 3000)
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current)
    }
  }, [])

  const startLiepinCrawl = async () => {
    if (!keyword.trim()) {
      setError('请输入搜索关键词')
      return
    }
    if (startPage < 1) {
      setError('起始页不能小于1')
      return
    }
    if (endPage < startPage) {
      setError('结束页不能小于起始页')
      return
    }
    setLoading(true)
    setError('')
    try {
      await axios.post('/api/crawler/liepin', { keyword, startPage, endPage })
      await fetchTasks()
    } catch (err: any) {
      setError(err.response?.data?.error || '创建任务失败')
    } finally {
      setLoading(false)
    }
  }

  const deleteTask = async (taskId: string) => {
    try {
      await axios.delete(`/api/crawler/tasks/${taskId}`)
      if (selectedTask?.id === taskId) setSelectedTask(null)
      await fetchTasks()
    } catch (err: any) {
      setError(err.response?.data?.error || '删除失败')
    }
  }

  const exportToJson = (task: CrawlTask) => {
    const dataStr = JSON.stringify(task.results, null, 2)
    const blob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `crawl-${task.id}-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'running':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />
      default:
        return <Clock className="w-4 h-4 text-yellow-500" />
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed': return '已完成'
      case 'running': return '执行中'
      case 'error': return '失败'
      default: return '等待中'
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center">
          <Bug className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">智能抓取</h1>
          <p className="text-sm text-muted-foreground">基于Playwright的智能网页数据抓取</p>
        </div>
      </div>

      {/* 猎聘网搜索 */}
      <div className="bg-card border border-border rounded-xl p-5 stat-card">
        <div className="flex items-center gap-2 mb-4">
          <Briefcase className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">猎聘网职位搜索</h2>
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="输入职位关键词，如：Python工程师、产品经理..."
              className="w-full h-10 px-4 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              onKeyDown={(e) => e.key === 'Enter' && startLiepinCrawl()}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">从</span>
            <input
              type="number"
              min={1}
              max={100}
              value={startPage}
              onChange={(e) => setStartPage(Number(e.target.value))}
              className="w-16 h-10 px-2 bg-background border border-input rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            <span className="text-xs text-muted-foreground whitespace-nowrap">到</span>
            <input
              type="number"
              min={1}
              max={100}
              value={endPage}
              onChange={(e) => setEndPage(Number(e.target.value))}
              className="w-16 h-10 px-2 bg-background border border-input rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            <span className="text-xs text-muted-foreground whitespace-nowrap">页</span>
          </div>
          <button
            onClick={startLiepinCrawl}
            disabled={loading}
            className="flex items-center gap-2 px-5 h-10 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            开始抓取
          </button>
        </div>
        {error && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-red-500">
            <AlertCircle className="w-3.5 h-3.5" />
            {error}
          </div>
        )}
      </div>

      {/* 任务列表 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左侧任务列表 */}
        <div className="lg:col-span-1 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">抓取任务</h3>
            <button
              onClick={fetchTasks}
              className="p-1.5 rounded-md hover:bg-secondary transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {tasks.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Bug className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs">暂无抓取任务</p>
              </div>
            )}
            {tasks.map((task) => (
              <button
                key={task.id}
                onClick={() => setSelectedTask(task)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  selectedTask?.id === task.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-card hover:bg-secondary/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  {getStatusIcon(task.status)}
                  <span className="text-xs font-medium">{getStatusText(task.status)}</span>
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {new Date(task.createdAt).toLocaleTimeString('zh-CN')}
                  </span>
                </div>
                <p className="text-xs text-foreground mt-1 truncate">
                  {task.keyword || task.url}
                </p>
                {task.results.length > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    共 {task.results.length} 条数据
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* 右侧结果详情 */}
        <div className="lg:col-span-2">
          {selectedTask ? (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  {getStatusIcon(selectedTask.status)}
                  <span className="text-sm font-medium">{selectedTask.keyword || '网页抓取'}</span>
                  <span className="text-[10px] px-1.5 py-0.5 bg-secondary rounded text-muted-foreground">
                    {getStatusText(selectedTask.status)}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {selectedTask.status === 'completed' && selectedTask.results.length > 0 && (
                    <button
                      onClick={() => exportToJson(selectedTask)}
                      className="p-1.5 rounded-md hover:bg-secondary transition-colors"
                      title="导出JSON"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => deleteTask(selectedTask.id)}
                    className="p-1.5 rounded-md hover:bg-red-500/10 text-red-500 transition-colors"
                    title="删除"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="p-4">
                {selectedTask.status === 'running' && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    <span className="ml-2 text-sm text-muted-foreground">正在抓取中...</span>
                  </div>
                )}

                {selectedTask.status === 'error' && (
                  <div className="flex items-center gap-2 py-4 text-red-500 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    {selectedTask.error || '抓取失败'}
                  </div>
                )}

                {selectedTask.status === 'completed' && selectedTask.results.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-xs">未获取到数据</p>
                  </div>
                )}

                {selectedTask.results.length > 0 && selectedTask.platform === 'liepin' && (
                  <div className="space-y-2 max-h-[500px] overflow-y-auto">
                    {selectedTask.results.map((job: any, idx: number) => (
                      <div
                        key={idx}
                        className="p-3 bg-secondary/20 rounded-lg border border-border hover:border-primary/30 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            {/* 职位标题 */}
                            <h4 className="text-sm font-medium text-foreground truncate">
                              {job.title}
                            </h4>
                            {/* 企业名称 - 单独一行突出显示 */}
                            {job.company && (
                              <div className="flex items-center gap-1 mt-1">
                                <span className="text-[10px] px-1 py-0.5 bg-blue-500/10 text-blue-600 rounded font-medium">企业</span>
                                <span className="text-xs text-foreground font-medium truncate">{job.company}</span>
                              </div>
                            )}
                            {/* 薪资、地点等信息 */}
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {job.salary && (
                                <span className="text-xs text-green-600 font-medium bg-green-500/10 px-1.5 py-0.5 rounded">{job.salary}</span>
                              )}
                              {job.location && (
                                <span className="text-xs text-muted-foreground">{job.location}</span>
                              )}
                            </div>
                          </div>
                          {job.url && (
                            <a
                              href={job.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-md hover:bg-secondary transition-colors flex-shrink-0 mt-0.5"
                              title="查看职位详情"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {selectedTask.results.length > 0 && selectedTask.platform !== 'liepin' && (
                  <div className="space-y-2">
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono bg-secondary/20 p-3 rounded-lg overflow-auto max-h-[500px]">
                      {JSON.stringify(selectedTask.results, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground py-16">
              <LayoutGrid className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">选择一个任务查看抓取结果</p>
              <p className="text-xs mt-1 opacity-50">或使用右侧浏览器模块访问网页后抓取</p>
            </div>
          )}
        </div>
      </div>

      {/* 使用提示 */}
      <div className="bg-secondary/20 border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold text-foreground mb-2">使用说明</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-muted-foreground">
          <div className="flex items-start gap-2">
            <Globe className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
            <p>右侧浏览器模块可访问任意网站，支持登录、点击、填写等操作</p>
          </div>
          <div className="flex items-start gap-2">
            <Bug className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
            <p>猎聘网搜索会自动翻页抓取职位信息，包括标题、公司、薪资、地点</p>
          </div>
          <div className="flex items-start gap-2">
            <FileText className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
            <p>抓取结果支持导出JSON格式，方便后续数据处理</p>
          </div>
          <div className="flex items-start gap-2">
            <Briefcase className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
            <p>支持多页抓取，建议每次不超过5页以避免被封</p>
          </div>
        </div>
      </div>
    </div>
  )
}
