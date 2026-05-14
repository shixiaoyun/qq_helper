import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../stores/auth'
import type { AuthState } from '../stores/auth'
import { apiFetch } from '../lib/api'
import { MODEL_OPTIONS } from '../constants/models'
import {
  Send,
  Users,
  MessageSquare,
  Loader2,
  User,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Trash2,
  Plus,
  History,
  Zap,
  Shield,
  BarChart3,
  Bot,
  RotateCcw,
  AlertTriangle,
  Archive,
} from 'lucide-react'

interface Agent {
  id: string
  name: string
  role: string
  avatar: string
  color: string
}

interface CrewMessage {
  id?: number
  role: 'user' | 'assistant'
  agentId?: string
  agentName?: string
  content: string
  isStreaming?: boolean
}

interface Session {
  id: number
  crewId: string | null
  vendor: string | null
  title: string | null
  messageCount: number
  lastMessageAt: string | null
  createdAt: string
}

// Agent 头像和颜色映射（根据 ID 匹配）
const AGENT_META: Record<string, { avatar: string; color: string }> = {
  'sales-manager': { avatar: '👔', color: 'bg-blue-500' },
  'customer-researcher': { avatar: '🔍', color: 'bg-green-500' },
  'product-expert': { avatar: '⚙️', color: 'bg-purple-500' },
  'sales-coach': { avatar: '🎯', color: 'bg-orange-500' },
  'solution-architect': { avatar: '🏗️', color: 'bg-cyan-500' },
  'legal-compliance': { avatar: '⚖️', color: 'bg-red-500' },
  'discovery-coach': { avatar: '🎓', color: 'bg-[#5C7CFA]' },
}

const VENDORS = [
  { id: 'autodesk', name: 'Autodesk', icon: '🔷' },
  { id: 'sketchup', name: 'SketchUp', icon: '🔶' },
  { id: 'adobe', name: 'Adobe', icon: '🟥' },
  { id: 'dassault', name: '达索系统', icon: '⬜' },
]

const WORKFLOWS = [
  { id: 'first-contact', name: '新客户初次接触', description: '分析客户背景，制定初次沟通策略' },
  { id: 'needs-analysis', name: '深度需求挖掘', description: '识别痛点，评估商机等级' },
  { id: 'solution-design', name: '方案设计与报价', description: '产品匹配，ROI计算，报价策略' },
  { id: 'objection-handling', name: '异议处理与谈判', description: '应对价格/功能/竞争异议' },
  { id: 'closing', name: '签约与交付', description: '合同谈判，实施计划，售后服务' },
  { id: 'legal-compliance', name: '法务合规支持', description: '盗版风险化解，授权谈判' },
]

export default function SalesCrew() {
  const token = useAuthStore((state: AuthState) => state.token)
  const [searchParams] = useSearchParams()
  const customerIdFromUrl = searchParams.get('customerId')
  const [messages, setMessages] = useState<CrewMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedCrew, setSelectedCrew] = useState('first-contact')
  const [selectedVendor, setSelectedVendor] = useState('autodesk')
  const [selectedModel, setSelectedModel] = useState('deepseek-v4-pro')
  const [activeAgents, setActiveAgents] = useState<string[]>([])
  const [showAgents, setShowAgents] = useState(false)
  const [sessions, setSessions] = useState<Session[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null)
  const [showSidebar, setShowSidebar] = useState(true)
  const [streamingAgent, setStreamingAgent] = useState<string | null>(null)
  const [showTrash, setShowTrash] = useState(false)
  const [deletedSessions, setDeletedSessions] = useState<Session[]>([])
  // 从后端加载已启用的 Agent 列表
  const [enabledAgents, setEnabledAgents] = useState<Agent[]>([])
  const [agentsLoading, setAgentsLoading] = useState(false)
  const [crewAgentMap, setCrewAgentMap] = useState<Record<string, string[]>>({})
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const loadCrewConfigs = useCallback(async () => {
    try {
      const resp = await apiFetch('/api/sales-crew/crews', {
        headers: { Authorization: `Bearer ${token || ''}` },
      })
      const data = await resp.json()
      if (data.success && Array.isArray(data.data)) {
        const map: Record<string, string[]> = {}
        for (const crew of data.data) {
          map[crew.id] = crew.agents || []
        }
        setCrewAgentMap(map)
      }
    } catch (err) {
      console.error('加载Crew配置失败:', err)
    }
  }, [token])

  const loadEnabledAgents = useCallback(async () => {
    setAgentsLoading(true)
    try {
      const resp = await apiFetch('/api/admin/mcp/agents', {
        headers: { Authorization: `Bearer ${token || ''}` },
      })
      const data = await resp.json()
      if (data.success) {
        const agents: Agent[] = data.data.agents
          .filter((a: any) => a.enabled)
          .map((a: any) => ({
            id: a.id,
            name: a.name,
            role: a.role.slice(0, 20) + (a.role.length > 20 ? '...' : ''),
            avatar: AGENT_META[a.id]?.avatar || '🤖',
            color: AGENT_META[a.id]?.color || 'bg-gray-500',
          }))
        setEnabledAgents(agents)
      }
    } catch (err) {
      console.error('加载Agent列表失败:', err)
    } finally {
      setAgentsLoading(false)
    }
  }, [token])

  useEffect(() => {
    loadCrewConfigs()
    loadEnabledAgents()
  }, [loadCrewConfigs, loadEnabledAgents])

  useEffect(() => {
    if (!customerIdFromUrl || !token) return
    const autoInitCustomer = async () => {
      try {
        const ctxResp = await apiFetch(`/api/crm/customers/${customerIdFromUrl}/discovery-context`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const ctxData = await ctxResp.json()
        if (!ctxData.success) return

        const customer = ctxData.data.customer
        const ctxMessage = ctxData.data.discoveryContext
        const title = `${customer.name}${customer.company ? `-${customer.company}` : ''} 销售教练`
        const crewId = 'discovery-session'
        const vendor = customer.vendor || 'autodesk'

        setSelectedCrew(crewId)
        setSelectedVendor(vendor)

        const sessResp = await apiFetch('/api/sales-crew/sessions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ crewId, vendor, title }),
        })
        const sessData = await sessResp.json()
        if (sessData.success && sessData.data) {
          setCurrentSessionId(sessData.data.id)
          setSessions(prev => [{ id: sessData.data.id, title, crewId, vendor, messageCount: 1, lastMessageAt: new Date().toISOString(), createdAt: new Date().toISOString() } as Session, ...prev])

          const userMsg: CrewMessage = {
            role: 'user',
            content: ctxMessage,
          }
          setMessages([userMsg])
          setLoading(true)

          const chatResp = await apiFetch('/api/sales-crew/chat', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: sessData.data.id,
              message: ctxMessage,
              crewId,
              vendor,
              model: selectedModel,
            }),
          })

          if (chatResp.ok) {
            const reader = chatResp.body?.getReader()
            if (!reader) { setLoading(false); return }
            const decoder = new TextDecoder()
            const assistantMsg: CrewMessage = {
              id: Date.now() + 1,
              role: 'assistant',
              content: '',
              isStreaming: true,
            }
            setMessages(prev => [...prev, assistantMsg])

            let buffer = ''
            let fullContent = ''
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              buffer += decoder.decode(value, { stream: true })
              const lines = buffer.split('\n')
              buffer = lines.pop() || ''
              for (const line of lines) {
                if (!line.startsWith('data: ')) continue
                const dataStr = line.slice(6)
                if (dataStr === '[DONE]') continue
                try {
                  const parsed = JSON.parse(dataStr)
                  switch (parsed.type) {
                    case 'agent_start':
                      setStreamingAgent(parsed.agentId)
                      setActiveAgents(prev => [...prev, parsed.agentId])
                      break
                    case 'agent_chunk':
                      fullContent += parsed.chunk
                      setMessages(prev => prev.map(m =>
                        m.id === assistantMsg.id ? { ...m, content: fullContent } : m
                      ))
                      break
                    case 'agent_complete':
                      setStreamingAgent(null)
                      break
                    case 'summary_start':
                      setStreamingAgent('sales-manager')
                      setActiveAgents(prev => [...prev, 'sales-manager'])
                      break
                    case 'summary_chunk':
                      fullContent += parsed.chunk
                      setMessages(prev => prev.map(m =>
                        m.id === assistantMsg.id ? { ...m, content: fullContent } : m
                      ))
                      break
                    case 'summary_complete':
                    case 'done':
                      setMessages(prev => prev.map(m =>
                        m.id === assistantMsg.id ? { ...m, isStreaming: false } : m
                      ))
                      setStreamingAgent(null)
                      setLoading(false)
                      loadSessions()
                      break
                    case 'error':
                      setMessages(prev => [...prev, {
                        role: 'assistant',
                        agentName: '系统',
                        content: `错误: ${parsed.error}`,
                      }])
                      setLoading(false)
                      break
                  }
                } catch { /* ignore parse errors */ }
              }
            }
          } else {
            setLoading(false)
          }
        }
      } catch (e) {
        setLoading(false)
      }
    }
    autoInitCustomer()
  }, [customerIdFromUrl, token])

  const getCrewAgentIds = useCallback((crewKey: string): Set<string> => {
    const fullId = `crew-${crewKey}`
    const agentIds = crewAgentMap[crewKey] || crewAgentMap[fullId] || []
    return new Set(agentIds)
  }, [crewAgentMap])

  const getVisibleCrewAgents = useCallback((): Agent[] => {
    if (Object.keys(crewAgentMap).length === 0) return enabledAgents
    const crewIds = getCrewAgentIds(selectedCrew)
    if (crewIds.size === 0) return enabledAgents
    return enabledAgents.filter(a => crewIds.has(a.id))
  }, [enabledAgents, selectedCrew, crewAgentMap, getCrewAgentIds])

  const loadSessions = useCallback(async () => {
    try {
      const resp = await apiFetch('/api/sales-crew/sessions', {
        headers: { Authorization: `Bearer ${token || ''}` },
      })
      const data = await resp.json()
      if (data.success) {
        setSessions(data.data)
      }
    } catch (err) {
      console.error('加载会话失败:', err)
    }
  }, [token])

  const loadSessionMessages = useCallback(async (sessionId: number) => {
    try {
      const resp = await apiFetch(`/api/sales-crew/sessions/${sessionId}`, {
        headers: { Authorization: `Bearer ${token || ''}` },
      })
      const data = await resp.json()
      if (data.success) {
        const loadedMessages: CrewMessage[] = data.data.messages.map((m: any) => ({
          id: m.id,
          role: m.role,
          agentId: m.agent_id || undefined,
          agentName: m.agent_name || undefined,
          content: m.content,
        }))
        setMessages(loadedMessages)
        setCurrentSessionId(sessionId)
        if (data.data.session.vendor) {
          setSelectedVendor(data.data.session.vendor)
        }
      }
    } catch (err) {
      console.error('加载消息失败:', err)
    }
  }, [token])

  const createNewSession = async () => {
    try {
      const resp = await apiFetch('/api/sales-crew/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token || ''}`,
        },
        body: JSON.stringify({
          crewId: selectedCrew,
          vendor: selectedVendor,
          title: '新会话',
        }),
      })
      const data = await resp.json()
      if (data.success) {
        setCurrentSessionId(data.data.id)
        setMessages([])
        loadSessions()
      }
    } catch (err) {
      console.error('创建会话失败:', err)
    }
  }

  const deleteSession = async (sessionId: number, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await apiFetch(`/api/sales-crew/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token || ''}` },
      })
      if (currentSessionId === sessionId) {
        setCurrentSessionId(null)
        setMessages([])
      }
      loadSessions()
    } catch (err) {
      console.error('删除会话失败:', err)
    }
  }

  const loadDeletedSessions = useCallback(async () => {
    try {
      const resp = await apiFetch('/api/sales-crew/sessions/deleted', {
        headers: { Authorization: `Bearer ${token || ''}` },
      })
      const data = await resp.json()
      if (data.success) {
        setDeletedSessions(data.data)
      }
    } catch (err) {
      console.error('加载回收站失败:', err)
    }
  }, [token])

  const restoreSession = async (sessionId: number, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const resp = await apiFetch(`/api/sales-crew/sessions/${sessionId}/restore`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token || ''}` },
      })
      const data = await resp.json()
      if (data.success) {
        loadDeletedSessions()
        loadSessions()
      }
    } catch (err) {
      console.error('恢复会话失败:', err)
    }
  }

  const permanentDeleteSession = async (sessionId: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('确定要永久删除此会话吗？此操作不可撤销！')) return
    try {
      await apiFetch(`/api/sales-crew/sessions/${sessionId}/permanent`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token || ''}` },
      })
      loadDeletedSessions()
    } catch (err) {
      console.error('永久删除失败:', err)
    }
  }

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSubmit = async () => {
    if (!input.trim() || loading) return

    const userMessage = input.trim()
    setInput('')

    setMessages((prev) => [...prev, { role: 'user', content: userMessage }])
    setActiveAgents([])
    setLoading(true)

    let sessionId = currentSessionId
    if (!sessionId) {
      try {
        const resp = await apiFetch('/api/sales-crew/sessions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token || ''}`,
          },
          body: JSON.stringify({
            crewId: selectedCrew,
            vendor: selectedVendor,
            title: userMessage.slice(0, 30),
          }),
        })
        const data = await resp.json()
        if (data.success) {
          sessionId = data.data.id
          setCurrentSessionId(sessionId)
          loadSessions()
        }
      } catch (err) {
        console.error('创建会话失败:', err)
        setLoading(false)
        return
      }
    }

    try {
      abortControllerRef.current = new AbortController()

      const response = await apiFetch('/api/sales-crew/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token || ''}`,
        },
        body: JSON.stringify({
          sessionId,
          message: userMessage,
          crewId: selectedCrew,
          vendor: selectedVendor,
          model: selectedModel,
        }),
        signal: abortControllerRef.current.signal,
      })

      if (!response.body) {
        throw new Error('响应流不可用')
      }

      const reader = response.body.getReader()
      if (!reader) {
        throw new Error('无法读取响应流')
      }

      const decoder = new TextDecoder()
      let buffer = ''
      let currentAgentId: string | null = null
      let currentAgentContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const dataStr = line.slice(6)
          if (dataStr === '[DONE]') continue

          try {
            const parsed = JSON.parse(dataStr)

            switch (parsed.type) {
              case 'session':
                setCurrentSessionId(parsed.sessionId)
                break

              case 'agent_start':
                currentAgentId = parsed.agentId
                currentAgentContent = ''
                setStreamingAgent(parsed.agentId)
                setActiveAgents((prev) => [...prev, parsed.agentId])
                setMessages((prev) => {
                  if (prev.find((m) => m.agentId === parsed.agentId && m.isStreaming)) {
                    return prev
                  }
                  return [...prev, {
                    role: 'assistant',
                    agentId: parsed.agentId,
                    agentName: parsed.agentName,
                    content: '',
                    isStreaming: true,
                  }]
                })
                break

              case 'agent_chunk':
                if (currentAgentId === parsed.agentId) {
                  currentAgentContent += parsed.chunk
                  setMessages((prev) => {
                    const newMessages = [...prev]
                    const idx = newMessages.findIndex(
                      (m) => m.agentId === parsed.agentId && m.isStreaming
                    )
                    if (idx >= 0) {
                      newMessages[idx] = {
                        ...newMessages[idx],
                        content: currentAgentContent,
                      }
                    }
                    return newMessages
                  })
                }
                break

              case 'agent_complete':
                setMessages((prev) => {
                  const newMessages = [...prev]
                  const idx = newMessages.findIndex(
                    (m) => m.agentId === parsed.agentId && m.isStreaming
                  )
                  if (idx >= 0) {
                    newMessages[idx] = {
                      ...newMessages[idx],
                      content: parsed.fullContent,
                      isStreaming: false,
                    }
                  }
                  return newMessages
                })
                setStreamingAgent(null)
                break

              case 'summary_start':
                currentAgentId = 'sales-manager'
                currentAgentContent = ''
                setStreamingAgent('sales-manager')
                setActiveAgents((prev) => [...prev, 'sales-manager'])
                setMessages((prev) => [...prev, {
                  role: 'assistant',
                  agentId: 'sales-manager',
                  agentName: '销售总监',
                  content: '',
                  isStreaming: true,
                }])
                break

              case 'summary_chunk':
                currentAgentContent += parsed.chunk
                setMessages((prev) => {
                  const newMessages = [...prev]
                  const idx = newMessages.findIndex(
                    (m) => m.agentId === 'sales-manager' && m.isStreaming
                  )
                  if (idx >= 0) {
                    newMessages[idx] = {
                      ...newMessages[idx],
                      content: currentAgentContent,
                    }
                  }
                  return newMessages
                })
                break

              case 'summary_complete':
                setMessages((prev) => {
                  const newMessages = [...prev]
                  const idx = newMessages.findIndex(
                    (m) => m.agentId === 'sales-manager' && m.isStreaming
                  )
                  if (idx >= 0) {
                    newMessages[idx] = {
                      ...newMessages[idx],
                      content: parsed.fullContent,
                      isStreaming: false,
                    }
                  }
                  return newMessages
                })
                setStreamingAgent(null)
                break

              case 'done':
                setLoading(false)
                loadSessions()
                break

              case 'error':
                setMessages((prev) => [...prev, {
                  role: 'assistant',
                  agentName: '系统',
                  content: `错误: ${parsed.error}`,
                }])
                setLoading(false)
                break
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setMessages((prev) => [...prev, {
          role: 'assistant',
          agentName: '系统',
          content: `请求失败: ${err.message}`,
        }])
      }
      setLoading(false)
    }
  }

  const getAgentInfo = (agentId?: string) => {
    return enabledAgents.find((a) => a.id === agentId) || { name: 'AI助手', avatar: '🤖', color: 'bg-gray-500', role: '', id: '' }
  }

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return date.toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="flex h-[calc(100vh-48px)]">
      {showSidebar && (
        <div className="w-64 bg-card/80 backdrop-blur-xl border-r border-border/50 flex flex-col">
          <div className="p-4 border-b border-border/50 space-y-2">
            <button
              onClick={createNewSession}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 btn-primary text-sm"
            >
              <Plus size={18} />
              新会话
            </button>
            <button
              onClick={() => {
                setShowTrash(!showTrash)
                if (!showTrash) loadDeletedSessions()
              }}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
                showTrash
                  ? 'bg-amber-500/10 text-amber-600 border border-amber-500/30'
                  : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
              }`}
            >
              <Archive size={16} />
              回收站
              {deletedSessions.length > 0 && (
                <span className="text-[10px] bg-amber-500/20 text-amber-600 px-1.5 py-0.5 rounded-full">
                  {deletedSessions.length}
                </span>
              )}
            </button>
          </div>

          {showTrash ? (
            <div className="flex-1 overflow-y-auto p-2">
              <div className="text-xs text-muted-foreground px-2 py-2 border-b border-border/30 mb-1">
                已删除的会话将保留30天
              </div>
              {deletedSessions.length === 0 && (
                <div className="text-center text-muted-foreground py-8 text-sm">
                  <Archive size={32} className="mx-auto mb-2 opacity-50" />
                  回收站为空
                </div>
              )}
              {deletedSessions.map((session) => (
                <div
                  key={session.id}
                  className="sidebar-item group relative opacity-70 hover:opacity-100"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Archive size={14} className="flex-shrink-0 text-amber-500" />
                    <span className="text-sm font-medium truncate text-muted-foreground">
                      {session.title || '新会话'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground w-full mt-0.5">
                    <span>{session.messageCount} 条消息</span>
                    <span>{formatTime(session.lastMessageAt)}</span>
                  </div>
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-all">
                    <button
                      onClick={(e) => restoreSession(session.id, e)}
                      className="p-1.5 hover:bg-green-500/10 rounded-lg transition-all"
                      title="恢复会话"
                    >
                      <RotateCcw size={12} className="text-green-400" />
                    </button>
                    <button
                      onClick={(e) => permanentDeleteSession(session.id, e)}
                      className="p-1.5 hover:bg-red-500/10 rounded-lg transition-all"
                      title="永久删除"
                    >
                      <AlertTriangle size={12} className="text-red-400" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-2">
              {sessions.length === 0 && (
                <div className="text-center text-muted-foreground py-8 text-sm">
                  <History size={32} className="mx-auto mb-2 opacity-50" />
                  暂无会话记录
                </div>
              )}
              {sessions.map((session) => (
                <div
                  key={session.id}
                  onClick={() => loadSessionMessages(session.id)}
                  className={`sidebar-item cursor-pointer group relative ${
                    currentSessionId === session.id
                      ? 'active'
                      : 'text-muted-foreground'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <MessageSquare size={14} className="flex-shrink-0" />
                    <span className="text-sm font-medium truncate">
                      {session.title || '新会话'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground w-full mt-0.5">
                    <span>{session.messageCount} 条消息</span>
                    <span>{formatTime(session.lastMessageAt)}</span>
                  </div>
                  <button
                    onClick={(e) => deleteSession(session.id, e)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/10 rounded-lg transition-all"
                  >
                    <Trash2 size={12} className="text-red-400" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 flex flex-col bg-background">
        <div className="border-b border-border/50 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowSidebar(!showSidebar)}
                className="p-2 btn-ghost rounded-xl"
              >
                <History size={18} />
              </button>
              <div className="flex items-center gap-2">
                <Users size={20} className="gradient-text" />
                <h1 className="text-lg font-semibold">销售教练</h1>
              </div>
              {currentSessionId && (
                <span className="text-xs bg-secondary/50 text-muted-foreground px-2.5 py-1 rounded-lg">
                  会话 #{currentSessionId}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAgents(!showAgents)}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-xl btn-ghost"
              >
                <Sparkles size={16} />
                参与专家
                {showAgents ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={selectedCrew}
              onChange={(e) => setSelectedCrew(e.target.value)}
              className="text-sm input-glass px-3 py-1.5 focus:outline-none"
            >
              {WORKFLOWS.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>

            <select
              value={selectedVendor}
              onChange={(e) => setSelectedVendor(e.target.value)}
              className="text-sm input-glass input-glow px-3 py-1.5 focus:outline-none"
            >
              {VENDORS.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.icon} {v.name}
                </option>
              ))}
            </select>

            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="text-sm input-glass px-3 py-1.5 focus:outline-none"
              title="选择AI模型"
            >
              {MODEL_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  🤖 {m.label}
                </option>
              ))}
            </select>

            {activeAgents.length > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">本次参与:</span>
                {activeAgents.map((agentId) => {
                  const agent = getAgentInfo(agentId)
                  return (
                    <span
                      key={agentId}
                      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full text-white ${agent.color}`}
                    >
                      {agent.avatar} {agent.name}
                      {streamingAgent === agentId && (
                        <Loader2 size={10} className="animate-spin" />
                      )}
                    </span>
                  )
                })}
              </div>
            )}
          </div>

          {showAgents && (
            <div className="mt-3">
              {agentsLoading ? (
                <div className="flex items-center justify-center py-4 text-muted-foreground">
                  <Loader2 size={16} className="animate-spin mr-2" />
                  <span className="text-xs">加载专家列表...</span>
                </div>
              ) : enabledAgents.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground text-xs">
                  暂无启用的AI角色专家
                </div>
              ) : (
                <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                  {(() => {
                    const visibleAgents = getVisibleCrewAgents()
                    if (visibleAgents.length === 0) {
                      return <div className="col-span-full text-center py-2 text-muted-foreground text-xs">当前工作流无可用专家</div>
                    }
                    return visibleAgents.map((agent) => (
                      <div
                        key={agent.id}
                        className={`p-2 rounded-xl border text-center transition-all duration-200 ${
                          activeAgents.includes(agent.id)
                            ? 'border-primary/30 bg-primary/5 shadow-glow'
                            : 'border-border/50 hover:border-primary/20'
                        }`}
                      >
                        <div className="text-2xl mb-1">{agent.avatar}</div>
                        <div className="text-xs font-medium">{agent.name}</div>
                        <div className="text-[10px] text-muted-foreground">{agent.role}</div>
                      </div>
                    ))
                  })()}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
          {messages.length === 0 && (
            <div className="h-full flex items-center justify-center">
              <div className="text-center max-w-md animate-fade-in">
                <div className="w-20 h-20 gradient-primary rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-glow-lg animate-float">
                  <Bot className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-xl font-semibold gradient-text mb-2">销售教练</h2>
                <p className="text-muted-foreground mb-6">
                  选择工作流和厂商，输入销售场景，多个AI专家将协作为您提供专业的销售策略和话术建议。
                </p>
                <div className="grid grid-cols-2 gap-2 text-left">
                  {WORKFLOWS.slice(0, 4).map((w) => (
                    <button
                      key={w.id}
                      onClick={() => {
                        setSelectedCrew(w.id)
                        setInput(w.description)
                      }}
                      className="p-3 text-sm glass-card rounded-xl hover:shadow-glow transition-all duration-200 text-left"
                    >
                      <div className="font-medium">{w.name}</div>
                      <div className="text-xs text-muted-foreground">{w.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {messages.map((msg, idx) => {
            if (msg.role === 'user') {
              return (
                <div key={idx} className="flex justify-end animate-fade-in">
                  <div className="max-w-[80%] message-bubble-user px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <User size={14} />
                      <span className="text-xs opacity-80">您</span>
                    </div>
                    <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                  </div>
                </div>
              )
            }

            const agent = getAgentInfo(msg.agentId)
            const isSummary = msg.agentId === 'sales-manager'

            return (
              <div key={idx} className={`flex justify-start ${isSummary ? 'mt-4' : ''} animate-fade-in`}>
                <div className={`max-w-[90%] rounded-2xl rounded-tl-sm px-4 py-3 ${
                  isSummary
                    ? 'glass-card border-primary/20 shadow-glow'
                    : 'message-bubble-assistant'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{agent.avatar}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full text-white ${agent.color}`}>
                      {msg.agentName || agent.name}
                    </span>
                    {msg.isStreaming && (
                      <Loader2 size={14} className="animate-spin gradient-text" />
                    )}
                    {isSummary && (
                      <span className="text-xs gradient-text font-medium">📋 整合方案</span>
                    )}
                  </div>
                  <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                    {msg.content || (msg.isStreaming ? (
                      <span className="text-muted-foreground">思考中...</span>
                    ) : '')}
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t border-border/50 p-4 bg-card/80 backdrop-blur-xl">
          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSubmit()
                  }
                }}
                placeholder="描述销售场景，例如：客户收到Autodesk律师函，说用了盗版软件..."
                className="w-full input-glass px-4 py-3 pr-12 resize-none focus:outline-none min-h-[80px] max-h-[200px] text-sm"
                rows={3}
                disabled={loading}
              />
            </div>
            <button
              onClick={handleSubmit}
              disabled={loading || !input.trim()}
              className="btn-primary p-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed btn-ripple"
            >
              {loading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
            </button>
          </div>
          <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <Zap size={12} /> 多Agent协作
              </span>
              <span className="flex items-center gap-1">
                <Shield size={12} /> 代理商身份
              </span>
              <span className="flex items-center gap-1">
                <BarChart3 size={12} /> 知识库增强
              </span>
            </div>
            <span>Enter 发送 / Shift+Enter 换行</span>
          </div>
        </div>
      </div>
    </div>
  )
}
