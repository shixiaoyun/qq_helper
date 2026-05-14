import { useState, useEffect, useCallback } from 'react'
import {
  Wrench, RefreshCw, ToggleLeft, ToggleRight, Search,
  Play, Globe, FileText, GitBranch, Database, Terminal,
  Code, Activity, Zap, Bot, Users,
  ChevronDown, ChevronRight, CircleDot,
} from 'lucide-react'
import axios from 'axios'
import { useAuthStore } from '../stores/auth.ts'

// ========== 类型定义 ==========
interface MCPTool {
  name: string
  description: string
  parameters: any
  enabled: boolean
  category: string
}

interface MCPAgent {
  id: string
  name: string
  role: string
  goal: string
  model: string
  enabled: boolean
}

type TabType = 'tools' | 'agents'

// ========== 工具分类配置 ==========
const CATEGORY_ICONS: Record<string, React.ElementType> = {
  browser: Globe,
  filesystem: FileText,
  git: GitBranch,
  database: Database,
  shell: Terminal,
  api: Zap,
  code: Code,
  system: Activity,
  other: Wrench,
}

const CATEGORY_LABELS: Record<string, string> = {
  browser: '浏览器',
  filesystem: '文件系统',
  git: 'Git操作',
  database: '数据库',
  shell: 'Shell命令',
  api: 'API工具',
  code: '代码分析',
  system: '系统信息',
  other: '其他',
}

// ========== 主组件 ==========
export default function MCPManagePage() {
  const [activeTab, setActiveTab] = useState<TabType>('tools')

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col">
      {/* 标签切换栏 */}
      <div className="shrink-0 border-b border-border bg-card">
        <div className="flex px-4">
          <button
            onClick={() => setActiveTab('tools')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'tools'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Wrench className="w-4 h-4" />
            MCP工具
          </button>
          <button
            onClick={() => setActiveTab('agents')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'agents'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Bot className="w-4 h-4" />
            AI角色专家
          </button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'tools' ? <ToolsPanel /> : <AgentsPanel />}
      </div>
    </div>
  )
}

// ========== 工具管理面板 ==========
function ToolsPanel() {
  const [tools, setTools] = useState<MCPTool[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [stats, setStats] = useState({ total: 0, enabled: 0, disabled: 0 })
  const [testResult, setTestResult] = useState<{ name: string; result: any; error?: string } | null>(null)
  const [testingTool, setTestingTool] = useState<string | null>(null)
  const [selectedToolName, setSelectedToolName] = useState<string>('')
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(() => new Set())

  const loadTools = useCallback(async () => {
    setLoading(true)
    try {
      const token = useAuthStore.getState().token
      const resp = await axios.get('/api/admin/mcp/tools', {
        headers: { 'Authorization': `Bearer ${token || ''}` },
      })
      setTools(resp.data.data.tools)
      setStats({
        total: resp.data.data.total,
        enabled: resp.data.data.enabled,
        disabled: resp.data.data.disabled,
      })
    } catch (err: any) {
      console.error('加载工具失败:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTools()
  }, [loadTools])

  const toggleTool = async (name: string, enabled: boolean) => {
    try {
      const token = useAuthStore.getState().token
      await axios.put(`/api/admin/mcp/tools/${name}/toggle`, { enabled: !enabled }, {
        headers: { 'Authorization': `Bearer ${token || ''}` },
      })
      setTools(prev => prev.map(t => t.name === name ? { ...t, enabled: !enabled } : t))
      setStats(prev => ({
        ...prev,
        enabled: !enabled ? prev.enabled + 1 : prev.enabled - 1,
        disabled: !enabled ? prev.disabled - 1 : prev.disabled + 1,
      }))
    } catch (err: any) {
      alert('切换失败: ' + (err.response?.data?.error || err.message))
    }
  }

  const testTool = async (tool: MCPTool) => {
    setTestingTool(tool.name)
    setTestResult(null)
    try {
      let testArgs: Record<string, any> = {}
      switch (tool.category) {
        case 'browser':
          if (tool.name === 'browser_create_session') testArgs = {}
          else if (tool.name === 'browser_navigate') testArgs = { sessionId: 'test', url: 'https://example.com' }
          else testArgs = { sessionId: 'test' }
          break
        case 'filesystem':
          if (tool.name === 'fs_read') testArgs = { path: 'package.json' }
          else if (tool.name === 'fs_list') testArgs = { path: '.' }
          else if (tool.name === 'fs_write') testArgs = { path: 'test.txt', content: 'test' }
          else testArgs = { path: '.' }
          break
        case 'system':
          testArgs = { type: 'os' }
          break
        case 'shell':
          testArgs = { command: 'echo hello', timeout: 5000 }
          break
        case 'git':
          testArgs = { repoPath: '.' }
          break
        case 'database':
          testArgs = { sql: 'SELECT 1' }
          break
        case 'api':
          testArgs = { url: 'https://httpbin.org/get', method: 'GET' }
          break
        default:
          testArgs = {}
      }
      const token = useAuthStore.getState().token
      const resp = await axios.post(`/api/admin/mcp/tools/${tool.name}/test`, { args: testArgs }, {
        headers: { 'Authorization': `Bearer ${token || ''}` },
      })
      setTestResult({ name: tool.name, result: resp.data.data })
    } catch (err: any) {
      setTestResult({ name: tool.name, result: null, error: err.response?.data?.error || err.message })
    } finally {
      setTestingTool(null)
    }
  }

  const toggleCategoryExpand = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  const filteredTools = tools.filter(t => {
    const matchSearch = !searchQuery ||
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase())
    return matchSearch
  })

  const toolsByCategory: Record<string, MCPTool[]> = {}
  filteredTools.forEach(t => {
    if (!toolsByCategory[t.category]) toolsByCategory[t.category] = []
    toolsByCategory[t.category].push(t)
  })

  const categoryOrder = Object.keys(CATEGORY_LABELS)
  const selectedTool = tools.find(t => t.name === selectedToolName) || null

  return (
    <div className="flex h-full gap-0">
      {/* 左侧栏 */}
      <aside className="w-[260px] min-w-[260px] bg-card border-r border-border flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center">
              <Wrench className="w-4 h-4 text-primary" />
            </div>
            <span className="text-sm font-semibold text-foreground">MCP工具管理</span>
          </div>
          <button onClick={loadTools} disabled={loading} className="p-1.5 rounded-lg hover:bg-secondary transition-colors disabled:opacity-50" title="刷新">
            <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-border shrink-0">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-secondary/50 rounded-lg px-3 py-2 text-center">
              <p className="text-lg font-bold text-foreground">{stats.total}</p>
              <p className="text-[11px] text-muted-foreground">总工具</p>
            </div>
            <div className="bg-green-500/5 rounded-lg px-3 py-2 text-center">
              <p className="text-lg font-bold text-green-400">{stats.enabled}</p>
              <p className="text-[11px] text-muted-foreground">已启用</p>
            </div>
          </div>
        </div>

        <div className="px-4 py-3 shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="搜索工具..."
              className="w-full h-8 pl-8 pr-3 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary placeholder:text-muted-foreground/60" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {filteredTools.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Wrench className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-xs">暂无匹配的工具</p>
            </div>
          ) : (
            categoryOrder.map(cat => {
              const catTools = toolsByCategory[cat]
              if (!catTools || catTools.length === 0) return null
              const Icon = CATEGORY_ICONS[cat] || Wrench
              const isExpanded = expandedCategories.has(cat)
              return (
                <div key={cat} className="mb-1">
                  <button onClick={() => toggleCategoryExpand(cat)} className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-secondary/70 transition-colors group">
                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                    <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs font-medium text-foreground truncate">{CATEGORY_LABELS[cat] || cat}</span>
                    <span className="ml-auto text-[10px] tabular-nums bg-secondary/80 text-muted-foreground px-1.5 py-0.5 rounded-full shrink-0">{catTools.length}</span>
                  </button>
                  {isExpanded && (
                    <div className="ml-4 space-y-0.3">
                      {catTools.map(tool => (
                        <button key={tool.name} onClick={() => setSelectedToolName(tool.name)}
                          className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left transition-colors group/item ${
                            selectedToolName === tool.name ? 'bg-primary/10 border-l-2 border-primary text-foreground' : 'hover:bg-secondary/50 text-muted-foreground hover:text-foreground'
                          }`}>
                          <CircleDot className={`w-2 h-2 shrink-0 ${tool.enabled ? 'text-green-400' : 'text-muted-foreground/40'}`} />
                          <span className="text-xs font-mono truncate flex-1">{tool.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </aside>

      {/* 右侧详情 */}
      <main className="flex-1 overflow-y-auto p-6">
        {!selectedTool ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
            <div className="w-16 h-16 bg-secondary rounded-2xl flex items-center justify-center mb-4">
              <Wrench className="w-7 h-7 opacity-40" />
            </div>
            <p className="text-sm font-medium">从左侧选择一个工具查看详情</p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-foreground font-mono tracking-tight">{selectedTool.name}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">{selectedTool.description}</p>
              </div>
              <span className="shrink-0 text-xs px-2.5 py-1 bg-secondary rounded-full text-muted-foreground">{CATEGORY_LABELS[selectedTool.category] || selectedTool.category}</span>
            </div>
            <div className="border-t border-border" />
            <div className="flex items-center gap-4 pt-2">
              <button onClick={() => toggleTool(selectedTool.name, selectedTool.enabled)} className="flex items-center gap-2 px-4 h-9 bg-secondary rounded-lg text-sm hover:bg-secondary/80 transition-colors">
                {selectedTool.enabled ? (
                  <><ToggleRight className="w-5 h-5 text-green-400" /><span className="text-green-400 text-xs font-medium">已启用</span></>
                ) : (
                  <><ToggleLeft className="w-5 h-5 text-muted-foreground" /><span className="text-muted-foreground text-xs">已禁用</span></>
                )}
              </button>
              <button onClick={() => testTool(selectedTool)} disabled={testingTool === selectedTool.name || !selectedTool.enabled}
                className="flex items-center gap-2 px-4 h-9 bg-primary/15 text-primary rounded-lg text-sm hover:bg-primary/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                <Play className={`w-3.5 h-3.5 ${testingTool === selectedTool.name ? 'animate-pulse' : ''}`} />测试工具
              </button>
            </div>
            {testResult && testResult.name === selectedTool.name && (
              <div className="bg-card border border-border rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-foreground">测试结果</h3>
                  <button onClick={() => setTestResult(null)} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">关闭</button>
                </div>
                {testResult.error ? (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-xs text-red-400 font-mono">{testResult.error}</div>
                ) : (
                  <pre className="bg-secondary/50 rounded-lg p-3 text-xs overflow-x-auto font-mono text-foreground/90 max-h-64 overflow-y-auto">{JSON.stringify(testResult.result, null, 2)}</pre>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

// ========== Agent 管理面板 ==========
function AgentsPanel() {
  const [agents, setAgents] = useState<MCPAgent[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [stats, setStats] = useState({ total: 0, enabled: 0, disabled: 0 })
  const [selectedAgentId, setSelectedAgentId] = useState<string>('')

  const loadAgents = useCallback(async () => {
    setLoading(true)
    try {
      const token = useAuthStore.getState().token
      const resp = await axios.get('/api/admin/mcp/agents', {
        headers: { 'Authorization': `Bearer ${token || ''}` },
      })
      setAgents(resp.data.data.agents)
      setStats({
        total: resp.data.data.total,
        enabled: resp.data.data.enabled,
        disabled: resp.data.data.disabled,
      })
    } catch (err: any) {
      console.error('加载Agent失败:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAgents()
  }, [loadAgents])

  const toggleAgent = async (id: string, enabled: boolean) => {
    try {
      const token = useAuthStore.getState().token
      await axios.put(`/api/admin/mcp/agents/${id}/toggle`, { enabled: !enabled }, {
        headers: { 'Authorization': `Bearer ${token || ''}` },
      })
      setAgents(prev => prev.map(a => a.id === id ? { ...a, enabled: !enabled } : a))
      setStats(prev => ({
        ...prev,
        enabled: !enabled ? prev.enabled + 1 : prev.enabled - 1,
        disabled: !enabled ? prev.disabled - 1 : prev.disabled + 1,
      }))
    } catch (err: any) {
      alert('切换失败: ' + (err.response?.data?.error || err.message))
    }
  }

  const filteredAgents = agents.filter(a =>
    !searchQuery ||
    a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.role.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const selectedAgent = agents.find(a => a.id === selectedAgentId) || null

  return (
    <div className="flex h-full gap-0">
      {/* 左侧栏 */}
      <aside className="w-[300px] min-w-[300px] bg-card border-r border-border flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <span className="text-sm font-semibold text-foreground">AI角色专家</span>
          </div>
          <button onClick={loadAgents} disabled={loading} className="p-1.5 rounded-lg hover:bg-secondary transition-colors disabled:opacity-50" title="刷新">
            <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-border shrink-0">
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-secondary/50 rounded-lg px-2 py-2 text-center">
              <p className="text-lg font-bold text-foreground">{stats.total}</p>
              <p className="text-[10px] text-muted-foreground">总角色</p>
            </div>
            <div className="bg-green-500/5 rounded-lg px-2 py-2 text-center">
              <p className="text-lg font-bold text-green-400">{stats.enabled}</p>
              <p className="text-[10px] text-muted-foreground">已启用</p>
            </div>
            <div className="bg-red-500/5 rounded-lg px-2 py-2 text-center">
              <p className="text-lg font-bold text-red-400">{stats.disabled}</p>
              <p className="text-[10px] text-muted-foreground">已禁用</p>
            </div>
          </div>
        </div>

        <div className="px-4 py-3 shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="搜索角色..."
              className="w-full h-8 pl-8 pr-3 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary placeholder:text-muted-foreground/60" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1">
          {filteredAgents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Bot className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-xs">暂无匹配的角色</p>
            </div>
          ) : (
            filteredAgents.map(agent => (
              <button key={agent.id} onClick={() => setSelectedAgentId(agent.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                  selectedAgentId === agent.id ? 'bg-primary/10 border-l-2 border-primary text-foreground' : 'hover:bg-secondary/50 text-muted-foreground hover:text-foreground'
                }`}>
                <div className={`w-2 h-2 rounded-full shrink-0 ${agent.enabled ? 'bg-green-400' : 'bg-muted-foreground/30'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-foreground truncate">{agent.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{agent.model}</div>
                </div>
                {agent.enabled ? (
                  <span className="text-[10px] px-1.5 py-0.5 bg-green-500/10 text-green-400 rounded shrink-0">启用</span>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.5 bg-muted/50 text-muted-foreground rounded shrink-0">禁用</span>
                )}
              </button>
            ))
          )}
        </div>
      </aside>

      {/* 右侧详情 */}
      <main className="flex-1 overflow-y-auto p-6">
        {!selectedAgent ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
            <div className="w-16 h-16 bg-secondary rounded-2xl flex items-center justify-center mb-4">
              <Users className="w-7 h-7 opacity-40" />
            </div>
            <p className="text-sm font-medium">从左侧选择一个AI角色查看详情</p>
            <p className="text-xs mt-1 opacity-60">点击角色名称可查看详情并控制启停</p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-6">
            {/* 标题区 */}
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold text-foreground">{selectedAgent.name}</h2>
                  {selectedAgent.enabled ? (
                    <span className="text-xs px-2 py-0.5 bg-green-500/10 text-green-400 rounded-full font-medium">已启用</span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 bg-red-500/10 text-red-400 rounded-full font-medium">已禁用</span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{selectedAgent.role}</p>
              </div>
            </div>

            <div className="border-t border-border" />

            {/* 信息卡片 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-secondary/30 border border-border/50 rounded-lg p-3.5">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">模型</div>
                <div className="text-sm font-mono text-foreground">{selectedAgent.model}</div>
              </div>
              <div className="bg-secondary/30 border border-border/50 rounded-lg p-3.5">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">ID</div>
                <div className="text-sm font-mono text-foreground">{selectedAgent.id}</div>
              </div>
            </div>

            {/* 目标 */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">目标</h3>
              <p className="text-sm text-foreground leading-relaxed bg-secondary/20 rounded-lg p-4">{selectedAgent.goal}</p>
            </div>

            {/* 启停开关 */}
            <div className="flex items-center gap-4 pt-2">
              <button onClick={() => toggleAgent(selectedAgent.id, selectedAgent.enabled)}
                className="flex items-center gap-2 px-4 h-10 bg-secondary rounded-lg text-sm hover:bg-secondary/80 transition-colors">
                {selectedAgent.enabled ? (
                  <><ToggleRight className="w-5 h-5 text-green-400" /><span className="text-green-400 text-xs font-medium">已启用 - 点击禁用</span></>
                ) : (
                  <><ToggleLeft className="w-5 h-5 text-muted-foreground" /><span className="text-muted-foreground text-xs">已禁用 - 点击启用</span></>
                )}
              </button>
            </div>

            {/* 提示 */}
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3.5">
              <p className="text-xs text-amber-400 leading-relaxed">
                <strong>注意：</strong>禁用该角色后，系统将自动过滤包含该角色的 Crew 和 Task。重启服务后生效。
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
