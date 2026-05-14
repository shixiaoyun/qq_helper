import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Send, Bot, User, Loader2, Plus, Trash2, MessageSquare,
  Wrench, Globe, Copy, Zap, BrainCircuit,
  Lightbulb, Hammer, CheckCircle2, XCircle,
  Image as ImageIcon, Mic, MicOff, Volume2, X,
  RefreshCw,
  Users, ChevronDown, ChevronUp, Sparkles,
  History, Shield, BarChart3,
} from 'lucide-react'
import axios from 'axios'
import { apiFetch } from '../lib/api'
import { useAuthStore } from '../stores/auth.ts'
import BottomToolbar from '../components/BottomToolbar'

interface ChatMessage {
  id?: number
  role: 'user' | 'assistant' | 'thinking' | 'tool_call'
  content: string
  provider?: string
  model?: string
  latencyMs?: number
  status?: string
  toolCall?: {
    name: string
    args: Record<string, any>
    result?: any
    status: 'calling' | 'success' | 'error'
  }
  imageUrls?: string[]
}

interface Conversation {
  id: number
  title: string | null
  message_count: number
  last_message_at: string | null
}

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

const AGENTS: Agent[] = [
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
  { id: 'first-contact', name: '新客户初次接触', description: '分析客户背景，制定初次沟通策略' },
  { id: 'needs-analysis', name: '深度需求挖掘', description: '识别痛点，评估商机等级' },
  { id: 'solution-design', name: '方案设计与报价', description: '产品匹配，ROI计算，报价策略' },
  { id: 'objection-handling', name: '异议处理与谈判', description: '应对价格/功能/竞争异议' },
  { id: 'closing', name: '签约与交付', description: '合同谈判，实施计划，售后服务' },
  { id: 'legal-compliance', name: '法务合规支持', description: '盗版风险化解，授权谈判' },
  { id: 'discovery-session', name: 'Discovery专项训练', description: 'Discovery方法论训练与通话复盘' },
]

export default function ChatPage() {
  const [chatMode, setChatMode] = useState<'ai' | 'sales'>('ai')

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null)
  const [aiMessages, setAiMessages] = useState<ChatMessage[]>([])
  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [sidebarOpen] = useState(true)
  const [enableTools, setEnableTools] = useState(true)
  const [enableWebSearch, setEnableWebSearch] = useState(true)
  const [enableMCP, setEnableMCP] = useState(true)
  const [enableStream, setEnableStream] = useState(true)
  const [showThinking, setShowThinking] = useState(true)
  const [attachedImages, setAttachedImages] = useState<string[]>([])
  const [isRecording, setIsRecording] = useState(false)
  const [speechSynthSupported, setSpeechSynthSupported] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null)
  const [deleteMode, setDeleteMode] = useState<'ai' | 'sales'>('ai')

  const [sessions, setSessions] = useState<Session[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null)
  const [salesMessages, setSalesMessages] = useState<CrewMessage[]>([])
  const [salesInput, setSalesInput] = useState('')
  const [salesLoading, setSalesLoading] = useState(false)
  const [selectedCrew, setSelectedCrew] = useState('first-contact')
  const [selectedVendor, setSelectedVendor] = useState('autodesk')
  const [activeAgents, setActiveAgents] = useState<string[]>([])
  const [showAgents, setShowAgents] = useState(false)
  const [showSidebar, setShowSidebar] = useState(true)
  const [streamingAgent, setStreamingAgent] = useState<string | null>(null)
  const [enabledAgents, setEnabledAgents] = useState<string[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const sendingLockRef = useRef(false)

  useEffect(() => {
    setSpeechSynthSupported('speechSynthesis' in window)
  }, [])

  useEffect(() => {
    const fetchEnabledAgents = async () => {
      try {
        const resp = await axios.get('/api/mcp/agents')
        const agents = resp.data.data || []
        const enabled = agents.filter((a: any) => a.enabled !== false).map((a: any) => a.id)
        setEnabledAgents(enabled)
      } catch {
        setEnabledAgents(AGENTS.map(a => a.id))
      }
    }
    fetchEnabledAgents()
  }, [])

  useEffect(() => {
    loadConversations()
  }, [])

  useEffect(() => {
    if (chatMode === 'sales') {
      loadSessions()
    }
  }, [chatMode])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [aiMessages, salesMessages, aiLoading, salesLoading])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px'
    }
  }, [aiInput])

  // ========== AI 模式函数 ==========

  const loadConversations = useCallback(async () => {
    try {
      const resp = await axios.get('/api/chat/conversations?pageSize=100')
      setConversations(resp.data.data.conversations)
    } catch {
    }
  }, [])

  const loadAiMessages = useCallback(async (conversationId: number) => {
    try {
      const resp = await axios.get(`/api/chat/conversations/${conversationId}/messages`)
      const msgs = resp.data.data.messages.map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        provider: m.provider,
        model: m.model,
        latencyMs: m.latency_ms,
        status: m.status,
      }))
      setAiMessages(msgs)
    } catch {
    }
  }, [])

  const createNewConversation = async () => {
    try {
      const resp = await axios.post('/api/chat/conversations', { title: '新对话' })
      const conversation = resp.data.data
      setConversations(prev => [conversation, ...prev])
      setCurrentConversationId(conversation.id)
      setAiMessages([])
    } catch {
    }
  }

  const selectConversation = async (id: number) => {
    setCurrentConversationId(id)
    await loadAiMessages(id)
  }

  const openDeleteModal = (id: number, mode: 'ai' | 'sales', e: React.MouseEvent) => {
    e.stopPropagation()
    setDeleteTargetId(id)
    setDeleteMode(mode)
    setShowDeleteModal(true)
  }

  const closeDeleteModal = () => {
    setShowDeleteModal(false)
    setDeleteTargetId(null)
  }

  const confirmDeleteConversation = async () => {
    if (!deleteTargetId) return
    try {
      if (deleteMode === 'ai') {
        await axios.delete(`/api/chat/conversations/${deleteTargetId}`)
        setConversations(prev => prev.filter(c => c.id !== deleteTargetId))
        if (currentConversationId === deleteTargetId) {
          setCurrentConversationId(null)
          setAiMessages([])
        }
      } else {
        await apiFetch(`/api/sales-crew/sessions/${deleteTargetId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${useAuthStore.getState().token || ''}` },
        })
        if (currentSessionId === deleteTargetId) {
          setCurrentSessionId(null)
          setSalesMessages([])
        }
        loadSessions()
      }
    } catch (err: any) {
      alert(err.response?.data?.error || '删除失败，请重试')
    } finally {
      closeDeleteModal()
    }
  }

  const sendAiMessage = async () => {
    if (!aiInput.trim() || aiLoading || sendingLockRef.current) return
    const userMessage = aiInput.trim()
    if (!userMessage && attachedImages.length === 0) return

    sendingLockRef.current = true
    setAiInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    const userMsg: ChatMessage = { role: 'user', content: userMessage, imageUrls: attachedImages }
    const newMessages: ChatMessage[] = [...aiMessages, userMsg]
    setAiMessages(newMessages)
    setAttachedImages([])
    setAiLoading(true)

    try {
      if (enableStream) {
        await sendStreamMessage(userMessage, attachedImages, newMessages)
      } else {
        await sendNormalMessage(userMessage, attachedImages, newMessages)
      }
    } finally {
      sendingLockRef.current = false
    }
  }

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    Array.from(files).forEach(file => {
      const reader = new FileReader()
      reader.onload = (event) => {
        const base64 = event.target?.result as string
        setAttachedImages(prev => [...prev, base64])
      }
      reader.readAsDataURL(file)
    })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const toggleSpeechInput = useCallback(() => {
    if (isRecording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop()
      }
      setIsRecording(false)
      return
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition()
      recognition.continuous = false
      recognition.interimResults = true
      recognition.lang = 'zh-CN'

      recognition.onstart = () => setIsRecording(true)

      recognition.onresult = (event: any) => {
        let finalTranscript = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
          if (event.results[i].isFinal) finalTranscript += transcript
        }
        if (finalTranscript) setAiInput(prev => prev + finalTranscript)
      }

      recognition.onerror = (event: any) => {
        console.error('语音识别错误:', event.error)
        setIsRecording(false)
        if (event.error !== 'no-speech') alert('语音识别失败: ' + event.error)
      }

      recognition.onend = () => {
        setIsRecording(false)
        setTimeout(() => {
          const currentInput = (document.querySelector('textarea') as HTMLTextAreaElement)?.value
          if (currentInput && currentInput.trim()) sendAiMessage()
        }, 500)
      }

      recognition.start()
    } else {
      navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        const mediaRecorder = new MediaRecorder(stream)
        mediaRecorderRef.current = mediaRecorder
        chunksRef.current = []

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data)
        }

        mediaRecorder.onstop = async () => {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
          const reader = new FileReader()
          reader.onload = () => setAiInput(prev => prev + '[语音消息]')
          reader.readAsDataURL(blob)
          stream.getTracks().forEach(track => track.stop())
        }

        mediaRecorder.start()
        setIsRecording(true)
      }).catch(err => {
        console.error('无法访问麦克风:', err)
        alert('无法访问麦克风，请检查权限设置')
      })
    }
  }, [isRecording])

  const speakText = useCallback((text: string) => {
    if (!speechSynthSupported) return
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-CN'
    utterance.rate = 1.0
    window.speechSynthesis.speak(utterance)
  }, [speechSynthSupported])

  const sendStreamMessage = async (userMessage: string, images: string[], currentMessages: ChatMessage[]) => {
    abortControllerRef.current = new AbortController()
    const token = useAuthStore.getState().token

    try {
      const resp = await apiFetch('/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token || ''}`,
        },
        body: JSON.stringify({
          conversationId: currentConversationId || undefined,
          message: userMessage,
          imageUrls: images.length > 0 ? images : undefined,
          enableTools,
          enableWebSearch,
          enableMCP,
        }),
        signal: abortControllerRef.current.signal,
      })

      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({ error: '请求失败' }))
        throw new Error(errorData.error || `HTTP ${resp.status}`)
      }

      const reader = resp.body?.getReader()
      if (!reader) throw new Error('无法读取响应')

      const decoder = new TextDecoder()
      let fullContent = ''
      let metadata: any = null
      let thinkingMessages: ChatMessage[] = []

      setAiMessages([...currentMessages, { role: 'assistant', content: '', status: 'loading' }])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6)
            if (dataStr === '[DONE]') continue

            try {
              const parsed = JSON.parse(dataStr)
              if (parsed.error) {
                setAiMessages(prev => {
                  const filtered = prev.filter(m => m.role !== 'thinking' && m.role !== 'tool_call' && m.role !== 'assistant')
                  return [...filtered, { role: 'assistant', content: `❌ ${parsed.error}`, status: 'error' }]
                })
                setAiLoading(false)
                abortControllerRef.current = null
                return
              }

              if (parsed.thinking && showThinking) {
                const lastThinking = thinkingMessages[thinkingMessages.length - 1]
                if (lastThinking && lastThinking.content === parsed.thinking) {
                } else {
                  thinkingMessages = [...thinkingMessages, { role: 'thinking' as const, content: parsed.thinking }]
                  setAiMessages(prev => {
                    const filtered = prev.filter(m => m.role !== 'thinking' && m.role !== 'assistant')
                    return [...filtered, ...thinkingMessages, { role: 'assistant', content: fullContent, status: 'streaming' }]
                  })
                }
              }

              if (parsed.toolCall) {
                setAiMessages(prev => {
                  const filtered = prev.filter(m => m.role !== 'tool_call' && m.role !== 'assistant')
                  return [...filtered, {
                    role: 'tool_call' as const,
                    content: `调用工具: ${parsed.toolCall.name}`,
                    toolCall: parsed.toolCall,
                  }, { role: 'assistant', content: fullContent, status: 'streaming' }]
                })
              }

              if (parsed.content) {
                fullContent += parsed.content
                setAiMessages(prev => {
                  const newMsgs = [...prev]
                  const lastMsg = newMsgs[newMsgs.length - 1]
                  if (lastMsg && lastMsg.role === 'assistant') {
                    lastMsg.content = fullContent
                    lastMsg.status = 'streaming'
                  }
                  return newMsgs
                })
              }

              if (parsed.done && parsed.metadata) metadata = parsed.metadata
            } catch {
            }
          }
        }
      }

      setAiMessages(prev => {
        const newMsgs = prev.filter(m => m.role === 'user' || m.role === 'assistant' || m.role === 'tool_call')
        const lastMsg = newMsgs[newMsgs.length - 1]
        if (lastMsg && lastMsg.role === 'assistant') {
          lastMsg.content = fullContent
          lastMsg.status = 'ok'
          lastMsg.provider = metadata?.provider
          lastMsg.model = metadata?.model
          lastMsg.latencyMs = metadata?.latencyMs
        }
        return newMsgs
      })

      if (!currentConversationId && metadata?.conversationId) {
        setCurrentConversationId(metadata.conversationId)
        loadConversations()
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setAiMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: '对话已取消。', status: 'cancelled' }])
      } else {
        setAiMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: `抱歉，对话失败。\n\n错误：${err.message}`, status: 'error' }])
      }
    } finally {
      setAiLoading(false)
      abortControllerRef.current = null
    }
  }

  const sendNormalMessage = async (userMessage: string, images: string[], _currentMessages: ChatMessage[]) => {
    try {
      const token = useAuthStore.getState().token
      const resp = await axios.post('/api/chat', {
        conversationId: currentConversationId || undefined,
        message: userMessage,
        imageUrls: images.length > 0 ? images : undefined,
        enableTools,
        enableWebSearch,
        enableMCP,
      }, {
        headers: { 'Authorization': `Bearer ${token || ''}` },
      })

      const data = resp.data.data
      setAiMessages(prev => [...prev, {
        role: 'assistant',
        content: data.message.content,
        provider: data.provider,
        model: data.model,
        latencyMs: data.latencyMs,
      }])

      if (!currentConversationId) {
        setCurrentConversationId(data.conversationId)
        loadConversations()
      }
    } catch (err: any) {
      setAiMessages(prev => [...prev, {
        role: 'assistant',
        content: `抱歉，对话失败。\n\n错误：${err.response?.data?.error || err.message}`,
        status: 'error',
      }])
    } finally {
      setAiLoading(false)
    }
  }

  const cancelStream = () => {
    if (abortControllerRef.current) abortControllerRef.current.abort()
  }

  const copyMessage = (content: string) => navigator.clipboard.writeText(content)

  const retryMessage = async (msgIndex: number) => {
    let userMsgIndex = msgIndex - 1
    while (userMsgIndex >= 0 && aiMessages[userMsgIndex].role !== 'user') userMsgIndex--
    if (userMsgIndex < 0) return

    const userMsg = aiMessages[userMsgIndex]
    const userMessage = userMsg.content
    const images = userMsg.imageUrls || []
    const newMessages = aiMessages.slice(0, userMsgIndex + 1)
    setAiMessages(newMessages)
    setAiLoading(true)

    if (enableStream) await sendStreamMessage(userMessage, images, newMessages)
    else await sendNormalMessage(userMessage, images, newMessages)
  }

  // ========== 销售模式函数 ==========

  const token = useAuthStore.getState().token

  const loadSessions = useCallback(async () => {
    try {
      const resp = await apiFetch('/api/sales-crew/sessions', {
        headers: { Authorization: `Bearer ${token || ''}` },
      })
      const data = await resp.json()
      if (data.success) setSessions(data.data)
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
        setSalesMessages(loadedMessages)
        setCurrentSessionId(sessionId)
        if (data.data.session.vendor) setSelectedVendor(data.data.session.vendor)
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
        setSalesMessages([])
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
        setSalesMessages([])
      }
      loadSessions()
    } catch (err) {
      console.error('删除会话失败:', err)
    }
  }

  const handleSubmit = async () => {
    if (!salesInput.trim() || salesLoading) return
    const userMessage = salesInput.trim()
    setSalesInput('')
    setSalesMessages((prev) => [...prev, { role: 'user', content: userMessage }])
    setActiveAgents([])
    setSalesLoading(true)

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
        setSalesLoading(false)
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
        }),
        signal: abortControllerRef.current.signal,
      })

      if (!response.body) throw new Error('响应流不可用')

      const reader = response.body.getReader()
      if (!reader) throw new Error('无法读取响应流')

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
                setSalesMessages((prev) => {
                  if (prev.find((m) => m.agentId === parsed.agentId && m.isStreaming)) return prev
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
                  setSalesMessages((prev) => {
                    const newMessages = [...prev]
                    const idx = newMessages.findIndex(
                      (m) => m.agentId === parsed.agentId && m.isStreaming
                    )
                    if (idx >= 0) {
                      newMessages[idx] = { ...newMessages[idx], content: currentAgentContent }
                    }
                    return newMessages
                  })
                }
                break

              case 'agent_complete':
                setSalesMessages((prev) => {
                  const newMessages = [...prev]
                  const idx = newMessages.findIndex(
                    (m) => m.agentId === parsed.agentId && m.isStreaming
                  )
                  if (idx >= 0) {
                    newMessages[idx] = { ...newMessages[idx], content: parsed.fullContent, isStreaming: false }
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
                setSalesMessages((prev) => [...prev, {
                  role: 'assistant',
                  agentId: 'sales-manager',
                  agentName: '销售总监',
                  content: '',
                  isStreaming: true,
                }])
                break

              case 'summary_chunk':
                currentAgentContent += parsed.chunk
                setSalesMessages((prev) => {
                  const newMessages = [...prev]
                  const idx = newMessages.findIndex(
                    (m) => m.agentId === 'sales-manager' && m.isStreaming
                  )
                  if (idx >= 0) {
                    newMessages[idx] = { ...newMessages[idx], content: currentAgentContent }
                  }
                  return newMessages
                })
                break

              case 'summary_complete':
                setSalesMessages((prev) => {
                  const newMessages = [...prev]
                  const idx = newMessages.findIndex(
                    (m) => m.agentId === 'sales-manager' && m.isStreaming
                  )
                  if (idx >= 0) {
                    newMessages[idx] = { ...newMessages[idx], content: parsed.fullContent, isStreaming: false }
                  }
                  return newMessages
                })
                setStreamingAgent(null)
                break

              case 'done':
                setSalesLoading(false)
                loadSessions()
                break

              case 'error':
                setSalesMessages((prev) => [...prev, {
                  role: 'assistant',
                  agentName: '系统',
                  content: `错误: ${parsed.error}`,
                }])
                setSalesLoading(false)
                break
            }
          } catch {
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setSalesMessages((prev) => [...prev, {
          role: 'assistant',
          agentName: '系统',
          content: `请求失败: ${err.message}`,
        }])
      }
      setSalesLoading(false)
    }
  }

  const getAgentInfo = (agentId?: string) => {
    return AGENTS.find((a) => a.id === agentId) || { name: 'AI助手', avatar: '🤖', color: 'bg-gray-500' }
  }

  // ========== 渲染辅助函数 ==========

  const escapeHtml = (text: string) =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const formatContent = (content: string) => {
    const escaped = escapeHtml(content)
    return escaped
      .replace(/```([\s\S]*?)```/g, '<pre class="bg-secondary/50 p-3 rounded-lg overflow-x-auto text-sm my-2"><code>$1</code></pre>')
      .replace(/`([^`]+)`/g, '<code class="bg-secondary px-1.5 py-0.5 rounded text-sm">$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>')
  }

  return (
    <div className="h-full flex">
      {/* 左侧边栏 */}
      {(sidebarOpen || showSidebar) && (
        <div className="w-64 border-r dark:border-indigo-500/10 border-border/50 dark:bg-[rgba(10,14,30,0.8)] bg-card/80 backdrop-blur-xl flex flex-col">
          <div className="p-4 border-b border-border/50 space-y-2">
            <button
              onClick={chatMode === 'ai' ? createNewConversation : createNewSession}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 btn-primary text-sm"
            >
              <Plus className="w-4 h-4" />
              {chatMode === 'ai' ? '新对话' : '新会话'}
            </button>
          </div>

          {chatMode === 'ai' ? (
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => selectConversation(conv.id)}
                  className={`sidebar-item cursor-pointer group ${
                    currentConversationId === conv.id ? 'active' : 'text-muted-foreground'
                  }`}
                >
                  <MessageSquare className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1 truncate">{conv.title || '新对话'}</span>
                  <button
                    onClick={(e) => openDeleteModal(conv.id, 'ai', e)}
                    className="p-1 rounded-lg hover:bg-red-500/10 text-red-500 opacity-0 group-hover:opacity-100 transition-all duration-200"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  onClick={() => loadSessionMessages(session.id)}
                  className={`sidebar-item cursor-pointer group ${
                    currentSessionId === session.id ? 'active' : 'text-muted-foreground'
                  }`}
                >
                  <MessageSquare className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1 truncate">{session.title || '新会话'}</span>
                  <button
                    onClick={(e) => { deleteSession(session.id, e); openDeleteModal(session.id, 'sales', e) }}
                    className="p-1 rounded-lg hover:bg-red-500/10 text-red-500 opacity-0 group-hover:opacity-100 transition-all duration-200"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 主区域 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 顶部栏 - 模式切换Tab */}
        <div className="border-b dark:border-indigo-500/10 border-border/50 px-6 py-3 bg-card/60 backdrop-blur-xl">
          <div className="flex items-center gap-1 w-fit rounded-xl p-1 bg-secondary/40">
            <button
              onClick={() => setChatMode('ai')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-300 ${
                chatMode === 'ai'
                  ? 'gradient-primary text-white shadow-glow'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              AI对话
            </button>
            <button
              onClick={() => setChatMode('sales')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-300 ${
                chatMode === 'sales'
                  ? 'gradient-primary text-white shadow-glow'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              销售教练
            </button>
          </div>

          {/* 销售模式额外控件 */}
          {chatMode === 'sales' && (
            <>
              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowSidebar(!showSidebar)}
                    className="p-2 btn-ghost rounded-xl"
                  >
                    <History className="w-4 h-4" />
                  </button>
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 gradient-text" />
                    <h1 className="text-base font-semibold">销售教练</h1>
                  </div>
                  {currentSessionId && (
                    <span className="text-xs bg-secondary/50 text-muted-foreground px-2.5 py-1 rounded-lg">会话 #{currentSessionId}</span>
                  )}
                </div>
                <button
                  onClick={() => setShowAgents(!showAgents)}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-xl btn-ghost"
                >
                  <Sparkles className="w-4 h-4" />
                  参与专家
                  {showAgents ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>

              <div className="flex items-center gap-3 flex-wrap mt-2">
                <select
                  value={selectedCrew}
                  onChange={(e) => setSelectedCrew(e.target.value)}
                  className="text-sm input-glass px-3 py-1.5 focus:outline-none"
                >
                  {WORKFLOWS.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>

                <select
                  value={selectedVendor}
                  onChange={(e) => setSelectedVendor(e.target.value)}
                  className="text-sm input-glass input-glow px-3 py-1.5 focus:outline-none"
                >
                  {VENDORS.map((v) => (
                    <option key={v.id} value={v.id}>{v.icon} {v.name}</option>
                  ))}
                </select>

                {activeAgents.length > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">本次参与:</span>
                    {activeAgents.map((agentId) => {
                      const agent = getAgentInfo(agentId)
                      return (
                        <span key={agentId} className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full text-white ${agent.color}`}>
                          {agent.avatar} {agent.name}
                          {streamingAgent === agentId && (<Loader2 className="w-2.5 h-2.5 animate-spin" />)}
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>

              {showAgents && (
                <div className="mt-3 grid grid-cols-3 md:grid-cols-6 gap-2">
                  {AGENTS.filter((agent) => enabledAgents.length === 0 || enabledAgents.includes(agent.id)).map((agent) => (
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
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* 消息区域 */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
          {chatMode === 'ai' ? (
            <>
              {aiMessages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground animate-fade-in">
                  <div className="w-20 h-20 gradient-primary rounded-3xl flex items-center justify-center mb-6 shadow-glow-lg animate-float">
                    <Bot className="w-10 h-10 text-white" />
                  </div>
                  <h2 className="text-xl font-semibold gradient-text mb-2">你好，我是OQ助手</h2>
                  <p className="text-sm max-w-md text-center leading-relaxed">我可以帮你进行AI对话、联网搜索、文档分析等，试试问我任何问题吧</p>
                </div>
              )}

              {aiMessages.map((msg, idx) => {
                if (msg.role === 'thinking') {
                  return (
                    <div key={idx} className="flex items-start gap-3 px-4 py-3 glass-card rounded-2xl animate-fade-in">
                      <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                        <Lightbulb className="w-4 h-4 text-amber-500" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold mb-1">思考中</p>
                        <p className="text-sm text-amber-700 dark:text-amber-300 leading-relaxed">{msg.content}</p>
                      </div>
                    </div>
                  )
                }

                if (msg.role === 'tool_call') {
                  const tc = msg.toolCall
                  return (
                    <div key={idx} className="flex items-start gap-3 px-4 py-3 glass-card rounded-2xl animate-fade-in">
                      <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                        {tc?.status === 'success' ? (<CheckCircle2 className="w-4 h-4 text-blue-500" />) :
                         tc?.status === 'error' ? (<XCircle className="w-4 h-4 text-red-500" />) :
                         (<Hammer className="w-4 h-4 text-blue-500 animate-bounce" />)}
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-blue-600 dark:text-blue-400 font-semibold mb-1">工具调用: {tc?.name}</p>
                        <p className="text-xs text-blue-700 dark:text-blue-300 font-mono">参数: {JSON.stringify(tc?.args)}</p>
                        {tc?.result && (
                          <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                            结果: {typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result).slice(0, 200)}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                }

                const isUser = msg.role === 'user'
                return (
                  <div key={idx} className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''} animate-fade-in`}>
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      isUser ? 'gradient-primary shadow-glow' : 'bg-secondary/80'
                    }`}>
                      {isUser ? (<User className="w-4 h-4 text-white" />) : (<Bot className="w-4 h-4 text-muted-foreground" />)}
                    </div>
                    <div className={`max-w-[80%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
                      {msg.imageUrls && msg.imageUrls.length > 0 && (
                        <div className={`flex gap-2 mb-2 ${isUser ? 'flex-row-reverse' : ''}`}>
                          {msg.imageUrls.map((url, imgIdx) => (
                            <img key={imgIdx} src={url} alt="附件" className="max-w-36 max-h-36 rounded-2xl object-cover shadow-sm" />
                          ))}
                        </div>
                      )}
                      <div className={`px-4 py-3 ${isUser ? 'message-bubble-user' : 'message-bubble-assistant'} msg-bubble-in max-h-[60vh] overflow-y-auto`}>
                        {msg.status === 'loading' ? (
                          <div className="flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="text-sm">思考中...</span>
                          </div>
                        ) : (
                          <div className="text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: formatContent(msg.content) }} />
                        )}
                      </div>
                      {!isUser && msg.content && (
                        <div className="flex items-center gap-1.5 mt-1.5 px-1">
                          {msg.provider && (<span className="text-[10px] text-muted-foreground/60">{msg.provider} · {msg.model}</span>)}
                          {msg.latencyMs && (<span className="text-[10px] text-muted-foreground/60">{msg.latencyMs}ms</span>)}
                          <button onClick={() => copyMessage(msg.content)} className="p-1 rounded-lg btn-ghost" title="复制">
                            <Copy className="w-3 h-3 text-muted-foreground" />
                          </button>
                          {speechSynthSupported && (
                            <button onClick={() => speakText(msg.content)} className="p-1 rounded-lg btn-ghost" title="朗读">
                              <Volume2 className="w-3 h-3 text-muted-foreground" />
                            </button>
                          )}
                          <button onClick={() => retryMessage(idx)} className="p-1 rounded-lg btn-ghost" title="重试" disabled={aiLoading}>
                            <RefreshCw className={`w-3 h-3 text-muted-foreground ${aiLoading ? 'opacity-50' : ''}`} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </>
          ) : (
            <>
              {salesMessages.length === 0 && (
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
                          onClick={() => { setSelectedCrew(w.id); setSalesInput(w.description) }}
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

              {salesMessages.map((msg, idx) => {
                if (msg.role === 'user') {
                  return (
                    <div key={idx} className="flex justify-end animate-fade-in">
                      <div className="max-w-[80%] message-bubble-user px-4 py-3">
                        <div className="flex items-center gap-2 mb-1">
                          <User className="w-3.5 h-3.5" />
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
                      isSummary ? 'glass-card border-primary/20 shadow-glow' : 'message-bubble-assistant'
                    }`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">{agent.avatar}</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full text-white ${agent.color}`}>
                          {msg.agentName || agent.name}
                        </span>
                        {msg.isStreaming && (<Loader2 className="w-3.5 h-3.5 animate-spin gradient-text" />)}
                        {isSummary && (<span className="text-xs gradient-text font-medium">📋 整合方案</span>)}
                      </div>
                      <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed max-h-[60vh] overflow-y-auto pr-2">
                        {msg.content || (msg.isStreaming ? (<span className="text-muted-foreground">思考中...</span>) : '')}
                      </div>
                    </div>
                  </div>
                )
              })}
            </>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* 输入区域 */}
        {chatMode === 'ai' ? (
          <div className="border-t dark:border-indigo-500/10 border-border/50 p-4 dark:bg-[rgba(10,14,30,0.8)] bg-card/80 backdrop-blur-xl">
            <div className="flex items-center gap-2 mb-3">
              {[
                { key: 'tools', label: '工具', icon: Wrench, state: enableTools, setter: setEnableTools },
                { key: 'web', label: '联网', icon: Globe, state: enableWebSearch, setter: setEnableWebSearch },
                { key: 'mcp', label: 'MCP', icon: BrainCircuit, state: enableMCP, setter: setEnableMCP },
                { key: 'think', label: '思考', icon: Lightbulb, state: showThinking, setter: setShowThinking },
                { key: 'stream', label: '流式', icon: Zap, state: enableStream, setter: setEnableStream },
              ].map(({ key, label, icon: Icon, state, setter }) => (
                <button
                  key={key}
                  onClick={() => setter(!state)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                    state ? 'gradient-primary text-white shadow-glow' : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>

            <div className="flex items-end gap-2">
              <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" multiple className="hidden" />
              <button onClick={() => fileInputRef.current?.click()} className="p-2.5 rounded-xl btn-ghost" title="上传图片">
                <ImageIcon className="w-5 h-5" />
              </button>

              <button
                onClick={toggleSpeechInput}
                className={`p-2.5 rounded-xl transition-all duration-200 ${
                  isRecording ? 'bg-red-500 text-white shadow-glow animate-pulse' : 'btn-ghost'
                }`}
                title={isRecording ? '停止录音' : '语音输入'}
              >
                {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>

              {attachedImages.length > 0 && (
                <div className="flex items-center gap-1">
                  {attachedImages.map((url, idx) => (
                    <div key={idx} className="relative">
                      <img src={url} alt="预览" className="w-8 h-8 rounded-lg object-cover" />
                      <button
                        onClick={() => setAttachedImages(prev => prev.filter((_, i) => i !== idx))}
                        className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center"
                      >
                        <X className="w-2 h-2" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <textarea
                ref={textareaRef}
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAiMessage() } }}
                placeholder="输入消息..."
                className="flex-1 min-h-[44px] max-h-[120px] px-4 py-2.5 input-glass text-sm resize-none focus:outline-none"
                rows={1}
              />
              {aiLoading ? (
                <button onClick={cancelStream} className="px-4 py-2.5 bg-destructive text-destructive-foreground rounded-xl text-sm font-medium hover:bg-destructive/90 transition-all duration-200 shadow-glow">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </button>
              ) : (
                <button onClick={sendAiMessage} disabled={!aiInput.trim() && attachedImages.length === 0} className="px-4 py-2.5 btn-primary text-sm">
                  <Send className="w-4 h-4" />
                </button>
              )}
            </div>

            <BottomToolbar />
          </div>
        ) : (
          <div className="border-t border-border/50 p-4 bg-card/80 backdrop-blur-xl">
            <div className="flex items-end gap-2">
              <div className="flex-1 relative">
                <textarea
                  value={salesInput}
                  onChange={(e) => setSalesInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
                  placeholder="描述销售场景，例如：客户收到Autodesk律师函，说用了盗版软件..."
                  className="w-full input-glass px-4 py-3 pr-12 resize-none focus:outline-none min-h-[80px] max-h-[200px] text-sm"
                  rows={3}
                  disabled={salesLoading}
                />
              </div>
              <button
                onClick={handleSubmit}
                disabled={salesLoading || !salesInput.trim()}
                className="btn-primary p-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed btn-ripple"
              >
                {salesLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </div>
            <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> 多Agent协作</span>
                <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> 代理商身份</span>
                <span className="flex items-center gap-1"><BarChart3 className="w-3 h-3" /> 知识库增强</span>
              </div>
              <span>Enter 发送 / Shift+Enter 换行</span>
            </div>
          </div>
        )}
      </div>

      {/* 统一删除确认弹窗 */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="glass-card rounded-2xl shadow-glow-lg p-6 w-full max-w-sm mx-4 animate-fade-in-scale card-hover-glow">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">删除{deleteMode === 'ai' ? '对话' : '会话'}</h3>
                <p className="text-sm text-muted-foreground">确定要删除这个{deleteMode === 'ai' ? '对话' : '会话'}吗？此操作不可恢复。</p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={closeDeleteModal}
                className="px-5 py-2 rounded-xl text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-all duration-200"
              >
                取消
              </button>
              <button
                onClick={confirmDeleteConversation}
                className="px-5 py-2 rounded-xl text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-all duration-200 shadow-glow"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
