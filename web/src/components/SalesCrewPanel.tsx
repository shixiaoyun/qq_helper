import { useState, useRef, useCallback, useEffect } from 'react'
import { Zap, Send, X, RefreshCw, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { useSalesCrewStore } from '../stores/salesCrewStore'
import { useAuthStore } from '../stores/auth'

interface Message {
  role: 'user' | 'assistant'
  agentName?: string
  agentId?: string
  content: string
}

const AGENTS = [
  { id: 'sales-manager', name: '销售总监', role: '整合协调', avatar: '👔', color: 'bg-blue-500' },
  { id: 'customer-researcher', name: '客户研究专家', role: '客户分析', avatar: '🔍', color: 'bg-green-500' },
  { id: 'product-expert', name: '产品技术专家', role: '产品咨询', avatar: '⚙️', color: 'bg-purple-500' },
  { id: 'sales-coach', name: '销售话术教练', role: '话术训练', avatar: '🎯', color: 'bg-orange-500' },
  { id: 'solution-architect', name: '方案架构师', role: '方案设计', avatar: '🏗️', color: 'bg-cyan-500' },
  { id: 'legal-compliance', name: '法务协同顾问', role: '合规支持', avatar: '⚖️', color: 'bg-red-500' },
  { id: 'discovery-coach', name: 'Discovery教练', role: 'Discovery方法论', avatar: '🎓', color: 'bg-indigo-500' },
]

const VENDORS = [
  { id: 'autodesk', name: 'Autodesk', icon: '🔷' },
  { id: 'sketchup', name: 'SketchUp', icon: '🔶' },
  { id: 'adobe', name: 'Adobe', icon: '🟥' },
  { id: 'dassault', name: '达索系统', icon: '⬜' },
]

const WORKFLOWS = [
  { id: 'first-contact', name: '新客户初次接触' },
  { id: 'needs-analysis', name: '深度需求挖掘' },
  { id: 'solution-design', name: '方案设计与报价' },
  { id: 'objection-handling', name: '异议处理与谈判' },
  { id: 'closing', name: '签约与交付' },
  { id: 'legal-compliance', name: '法务合规支持' },
  { id: 'discovery-session', name: 'Discovery专项训练' },
]

function getAgentInfo(agentId?: string) {
  return AGENTS.find((a) => a.id === agentId) || { name: 'AI助手', avatar: '🤖', color: 'bg-gray-500' }
}

export default function SalesCrewPanel({ onClose }: { onClose?: () => void }) {
  const { targetCustomer, closePanel } = useSalesCrewStore()
  const token = useAuthStore((s) => s.token)
  const isAdmin = useAuthStore((s) => s.isAdmin)
  const isSupervisor = useAuthStore((s) => s.isSupervisor)
  const canUseSalesCrew = isAdmin || isSupervisor
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [activeAgents, setActiveAgents] = useState<string[]>([])
  const [streamingAgent, setStreamingAgent] = useState<string | null>(null)
  const [selectedVendor, setSelectedVendor] = useState('autodesk')
  const [selectedCrew, setSelectedCrew] = useState('first-contact')
  const abortRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [showWorkflows, setShowWorkflows] = useState(false)

  // 加载历史会话
  useEffect(() => {
    if (!targetCustomer) return
    const loadSession = async () => {
      try {
        const resp = await fetch(`/api/sales-crew/sessions/customer/${targetCustomer.id}`, {
          headers: { Authorization: `Bearer ${token || ''}` },
        })
        const data = await resp.json()
        if (data.success && data.data.session) {
          setSessionId(data.data.session.id)
          if (data.data.messages && data.data.messages.length > 0) {
            setMessages(data.data.messages.map((m: any) => ({
              role: m.role === 'user' ? 'user' : 'assistant',
              agentName: m.agent_name || undefined,
              agentId: m.agent_id || undefined,
              content: m.content,
            })))
          }
        }
      } catch (err) {
        console.error('加载销售教练会话失败:', err)
      }
    }
    loadSession()
  }, [targetCustomer, token])

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || loading || !targetCustomer) return
    const msg = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: msg }])
    setLoading(true)
    setActiveAgents([])
    setStreamingAgent(null)

    try {
      let sid = sessionId
      if (!sid) {
        const vendor = (() => {
          try {
            if (targetCustomer.niuma_metadata) {
              const meta = JSON.parse(targetCustomer.niuma_metadata)
              return meta.vendor || selectedVendor
            }
          } catch {}
          return selectedVendor
        })()
        const resp = await fetch('/api/sales-crew/sessions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token || ''}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            crewId: selectedCrew,
            vendor,
            title: `${(targetCustomer as any).company || targetCustomer.name} 销售教练`,
            customerId: targetCustomer.id,
          }),
        })
        const data = await resp.json()
        if (data.success) {
          sid = data.data.id
          setSessionId(sid)
        }
      }

      abortRef.current = new AbortController()
      const response = await fetch('/api/sales-crew/chat', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token || ''}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sid,
          message: msg,
          crewId: selectedCrew,
          vendor: selectedVendor,
          model: 'deepseek-v4-pro',
        }),
        signal: abortRef.current.signal,
      })

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}))
        setMessages(prev => [...prev, {
          role: 'assistant',
          agentName: '系统',
          content: errBody?.error || `请求失败 (${response.status})`,
        }])
        setLoading(false)
        return
      }

      const reader = response.body?.getReader()
      if (!reader) { setLoading(false); return }
      const decoder = new TextDecoder()
      let buffer = ''
      let fullContent = ''
      let currentAgentId: string | null = null

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
            if (parsed.type === 'agent_start') {
              currentAgentId = parsed.agentId
              fullContent = ''
              setStreamingAgent(parsed.agentId)
              setActiveAgents((prev) => {
                if (prev.includes(parsed.agentId)) return prev
                return [...prev, parsed.agentId]
              })
              setMessages(prev => [...prev, {
                role: 'assistant',
                agentName: parsed.agentName,
                agentId: parsed.agentId,
                content: '',
              }])
            } else if (parsed.type === 'agent_chunk') {
              if (currentAgentId === parsed.agentId) {
                fullContent += parsed.chunk
                setMessages(prev => prev.map((m, i) =>
                  i === prev.length - 1 ? { ...m, content: fullContent } : m
                ))
              }
            } else if (parsed.type === 'agent_complete') {
              setMessages(prev => prev.map((m, i) =>
                i === prev.length - 1 ? { ...m, content: parsed.fullContent || fullContent } : m
              ))
              setStreamingAgent(null)
            } else if (parsed.type === 'summary_start') {
              currentAgentId = 'sales-manager'
              fullContent = ''
              setStreamingAgent('sales-manager')
              setActiveAgents((prev) => {
                if (prev.includes('sales-manager')) return prev
                return [...prev, 'sales-manager']
              })
              setMessages(prev => [...prev, {
                role: 'assistant',
                agentName: '销售总监',
                agentId: 'sales-manager',
                content: '',
              }])
            } else if (parsed.type === 'summary_chunk') {
              fullContent += parsed.chunk
              setMessages(prev => prev.map((m, i) =>
                i === prev.length - 1 ? { ...m, content: fullContent } : m
              ))
            } else if (parsed.type === 'summary_complete') {
              setMessages(prev => prev.map((m, i) =>
                i === prev.length - 1 ? { ...m, content: parsed.fullContent || fullContent } : m
              ))
              setStreamingAgent(null)
            } else if (parsed.type === 'done') {
              setStreamingAgent(null)
            } else if (parsed.type === 'error') {
              setMessages(prev => [...prev, { role: 'assistant', agentName: '系统', content: `错误: ${parsed.error}` }])
            }
          } catch {}
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setMessages(prev => [...prev, { role: 'assistant', agentName: '系统', content: `请求失败: ${err.message}` }])
      }
    } finally {
      setLoading(false)
      abortRef.current = null
    }
  }, [input, loading, targetCustomer, sessionId, token, selectedVendor, selectedCrew])

  const handleClose = () => {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null }
    setMessages([])
    setSessionId(null)
    setActiveAgents([])
    setStreamingAgent(null)
    closePanel()
    onClose?.()
  }

  if (!canUseSalesCrew) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-6">
        <Zap className="w-10 h-10 mb-3 opacity-30" />
        <p className="text-sm">AI对话暂未开放</p>
        <p className="text-xs mt-1 opacity-60">请联系管理员获取使用权限</p>
      </div>
    )
  }

  if (!targetCustomer) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-6">
        <Zap className="w-10 h-10 mb-3 opacity-30" />
        <p className="text-sm">暂未选择客户</p>
        <p className="text-xs mt-1 opacity-60">在客户列表中点击 ⚡ 按钮开启AI销售教练</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/10 flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <span className="text-sm font-semibold text-foreground">销售教练</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 font-medium">{(targetCustomer as any).company || targetCustomer.name}</span>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={() => { setMessages([]); setSessionId(null); setActiveAgents([]); setStreamingAgent(null); }}
              className="p-1 rounded-lg hover:bg-secondary transition-colors"
              title="清除对话"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={handleClose} className="p-1 rounded-lg hover:bg-secondary transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="px-3 py-2 border-b border-border shrink-0 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={selectedVendor}
            onChange={(e) => setSelectedVendor(e.target.value)}
            className="text-xs bg-background border border-border rounded px-2 py-1 focus:outline-none focus:border-primary/50"
          >
            {VENDORS.map((v) => (
              <option key={v.id} value={v.id}>{v.icon} {v.name}</option>
            ))}
          </select>
          <button
            onClick={() => setShowWorkflows(!showWorkflows)}
            className="flex items-center gap-1 text-xs text-muted-foreground px-2 py-1 rounded border border-border hover:bg-secondary/50"
          >
            场景切换
            {showWorkflows ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
        {showWorkflows && (
          <div className="flex flex-wrap gap-1">
            {WORKFLOWS.map((w) => (
              <button
                key={w.id}
                onClick={() => { setSelectedCrew(w.id); setShowWorkflows(false) }}
                className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                  selectedCrew === w.id
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-600'
                    : 'border-border hover:border-amber-500/20 text-muted-foreground'
                }`}
              >
                {w.name}
              </button>
            ))}
          </div>
        )}
        {activeAgents.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[10px] text-muted-foreground">本次参与:</span>
            {activeAgents.map((agentId) => {
              const agent = getAgentInfo(agentId)
              return (
                <span key={agentId} className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full text-white ${agent.color}`}>
                  {agent.avatar} {agent.name}
                  {streamingAgent === agentId && (<Loader2 className="w-2 h-2 animate-spin" />)}
                </span>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2" ref={messagesEndRef}>
        {messages.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-xs text-muted-foreground">开始与AI销售教练对话，获取客户建议</p>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-lg px-3 py-2 ${
                m.role === 'user'
                  ? 'bg-primary/10 text-foreground'
                  : 'bg-secondary/30 border border-border/50 text-foreground'
              }`}>
                {m.role === 'assistant' && m.agentName && (
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 font-medium">{m.agentName}</span>
                  </div>
                )}
                <p className="text-xs whitespace-pre-wrap leading-relaxed">{m.content || (i === messages.length - 1 && loading ? '思考中...' : '')}</p>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex items-end gap-1.5 border-t border-border p-2.5 shrink-0">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
          placeholder="输入消息，AI销售团队将协同分析..."
          rows={1}
          className="flex-1 bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs resize-none focus:outline-none focus:border-primary/50 min-h-[28px] max-h-[60px]"
          disabled={loading}
        />
        <button
          onClick={handleSubmit}
          disabled={loading || !input.trim()}
          className="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 disabled:opacity-40 transition-colors"
        >
          {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  )
}
