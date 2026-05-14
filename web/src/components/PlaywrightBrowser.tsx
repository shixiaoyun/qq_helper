import { useState, useRef, useCallback, useEffect } from 'react'
import axios from 'axios'
import {
  Globe, Play, Square, Camera, Code, FileText, RefreshCw,
  ChevronLeft, ChevronRight, ArrowRight, MousePointer,
  Type, Loader2, AlertCircle, Trash2, Bot, User, Pause, Monitor,
} from 'lucide-react'

interface BrowserSession {
  id: string
  url: string
  title: string
  createdAt: string
}

interface ElementBox {
  x: number
  y: number
  width: number
  height: number
  label: string
}

type AgentState = 'idle' | 'running' | 'paused' | 'user_control'

export default function PlaywrightBrowserPanel() {
  const [session, setSession] = useState<BrowserSession | null>(null)
  const [url, setUrl] = useState('https://www.baidu.com')
  const [inputUrl, setInputUrl] = useState('https://www.baidu.com')
  const [loading, setLoading] = useState(false)
  const [screenshot, setScreenshot] = useState('')
  const [pageText, setPageText] = useState('')
  const [script, setScript] = useState('document.title')
  const [scriptResult, setScriptResult] = useState('')
  const [selector, setSelector] = useState('')
  const [fillValue, setFillValue] = useState('')
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'screenshot' | 'live' | 'text' | 'script' | 'html'>('live')
  const screenshotTimer = useRef<ReturnType<typeof window.setInterval> | null>(null)

  // Agent 自动化状态
  const [agentState, setAgentState] = useState<AgentState>('idle')
  const [showTakeoverConfirm, setShowTakeoverConfirm] = useState(false)
  const [elementBoxes, setElementBoxes] = useState<ElementBox[]>([])
  const [, setCurrentAction] = useState('')
  const [isExecuting, setIsExecuting] = useState(false)

  // 自动刷新截图
  const startAutoScreenshot = useCallback(() => {
    if (screenshotTimer.current) clearInterval(screenshotTimer.current)
    screenshotTimer.current = setInterval(() => {
      if (session && agentState === 'running') {
        takeScreenshot(false)
      }
    }, 3000)
  }, [session, agentState])

  useEffect(() => {
    return () => {
      if (screenshotTimer.current) clearInterval(screenshotTimer.current)
    }
  }, [])

  // 创建会话
  const createSession = async () => {
    setLoading(true)
    setError('')
    try {
      const resp = await axios.post('/api/browser/sessions')
      const newSession = resp.data.data
      setSession(newSession)
      await axios.post(`/api/browser/sessions/${newSession.id}/navigate`, { url })
      const infoResp = await axios.get(`/api/browser/sessions/${newSession.id}/info`)
      setSession({ ...newSession, ...infoResp.data.data })
      setInputUrl(infoResp.data.data.url)
      setAgentState('running')
      startAutoScreenshot()
    } catch (err: any) {
      setError(err.response?.data?.error || '创建会话失败')
    } finally {
      setLoading(false)
    }
  }

  // 关闭会话
  const closeSession = async () => {
    if (!session) return
    if (screenshotTimer.current) clearInterval(screenshotTimer.current)
    try {
      await axios.delete(`/api/browser/sessions/${session.id}`)
    } catch {
      // ignore
    }
    setSession(null)
    setScreenshot('')
    setPageText('')
    setScriptResult('')
    setAgentState('idle')
    setElementBoxes([])
  }

  // 导航
  const navigate = async () => {
    if (!session) return
    setLoading(true)
    setError('')
    try {
      const resp = await axios.post(`/api/browser/sessions/${session.id}/navigate`, { url: inputUrl })
      setSession(prev => prev ? { ...prev, ...resp.data.data } : null)
      setUrl(resp.data.data.url)
      setInputUrl(resp.data.data.url)
      await takeScreenshot(false)
    } catch (err: any) {
      setError(err.response?.data?.error || '导航失败')
    } finally {
      setLoading(false)
    }
  }

  // 截图
  const takeScreenshot = async (fullPage = false) => {
    if (!session) return
    try {
      const resp = await axios.post(`/api/browser/sessions/${session.id}/screenshot`, { fullPage })
      setScreenshot(resp.data.data.image)
    } catch (err: any) {
      console.error('截图失败:', err)
    }
  }

  // 获取文本
  const getText = async () => {
    if (!session) return
    setLoading(true)
    try {
      const resp = await axios.get(`/api/browser/sessions/${session.id}/text`)
      setPageText(resp.data.data.text)
      setActiveTab('text')
    } catch (err: any) {
      setError(err.response?.data?.error || '获取文本失败')
    } finally {
      setLoading(false)
    }
  }

  // 获取HTML
  const getHtml = async () => {
    if (!session) return
    setLoading(true)
    try {
      const resp = await axios.get(`/api/browser/sessions/${session.id}/html`)
      setPageText(resp.data.data.html)
      setActiveTab('html')
    } catch (err: any) {
      setError(err.response?.data?.error || '获取HTML失败')
    } finally {
      setLoading(false)
    }
  }

  // 执行脚本
  const executeScript = async () => {
    if (!session || !script) return
    setLoading(true)
    try {
      const resp = await axios.post(`/api/browser/sessions/${session.id}/execute`, { script })
      setScriptResult(JSON.stringify(resp.data.data.result, null, 2))
      setActiveTab('script')
    } catch (err: any) {
      setError(err.response?.data?.error || '执行脚本失败')
    } finally {
      setLoading(false)
    }
  }

  // 模拟Agent操作 - 带元素高亮
  const simulateAgentAction = async (actionType: string, targetSelector?: string) => {
    if (!session || agentState !== 'running') return

    setIsExecuting(true)
    setCurrentAction(actionType)

    // 如果有目标选择器，先获取元素位置并显示高亮框
    if (targetSelector) {
      try {
        const box = await axios.post(`/api/browser/sessions/${session.id}/execute`, {
          script: `
            const el = document.querySelector('${targetSelector}');
            if (el) {
              const rect = el.getBoundingClientRect();
              return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, found: true };
            }
            return { found: false };
          `
        })
        if (box.data.data.result?.found) {
          const r = box.data.data.result
          setElementBoxes([{ x: r.x, y: r.y, width: r.width, height: r.height, label: actionType }])
          await takeScreenshot(false)
          // 保持高亮1.5秒后清除
          setTimeout(() => {
            setElementBoxes([])
            setIsExecuting(false)
            setCurrentAction('')
          }, 1500)
          return
        }
      } catch {
        // ignore
      }
    }

    setCurrentAction('')
    setIsExecuting(false)
  }

  // 点击元素
  const clickElement = async () => {
    if (!session || !selector) return
    await simulateAgentAction('正在点击元素', selector)
    setLoading(true)
    try {
      await axios.post(`/api/browser/sessions/${session.id}/click`, { selector })
      await takeScreenshot(false)
    } catch (err: any) {
      setError(err.response?.data?.error || '点击失败')
    } finally {
      setLoading(false)
    }
  }

  // 填写输入框
  const fillInput = async () => {
    if (!session || !selector) return
    await simulateAgentAction('正在填写输入框', selector)
    setLoading(true)
    try {
      await axios.post(`/api/browser/sessions/${session.id}/fill`, { selector, value: fillValue })
      await takeScreenshot(false)
    } catch (err: any) {
      setError(err.response?.data?.error || '填写失败')
    } finally {
      setLoading(false)
    }
  }

  // 返回
  const goBack = async () => {
    if (!session) return
    setLoading(true)
    try {
      const resp = await axios.post(`/api/browser/sessions/${session.id}/back`)
      setSession(prev => prev ? { ...prev, ...resp.data.data } : null)
      setUrl(resp.data.data.url)
      setInputUrl(resp.data.data.url)
      await takeScreenshot(false)
    } catch (err: any) {
      setError(err.response?.data?.error || '返回失败')
    } finally {
      setLoading(false)
    }
  }

  // 前进
  const goForward = async () => {
    if (!session) return
    setLoading(true)
    try {
      const resp = await axios.post(`/api/browser/sessions/${session.id}/forward`)
      setSession(prev => prev ? { ...prev, ...resp.data.data } : null)
      setUrl(resp.data.data.url)
      setInputUrl(resp.data.data.url)
      await takeScreenshot(false)
    } catch (err: any) {
      setError(err.response?.data?.error || '前进失败')
    } finally {
      setLoading(false)
    }
  }

  // 刷新
  const reload = async () => {
    if (!session) return
    setLoading(true)
    try {
      const resp = await axios.post(`/api/browser/sessions/${session.id}/reload`)
      setSession(prev => prev ? { ...prev, ...resp.data.data } : null)
      await takeScreenshot(false)
    } catch (err: any) {
      setError(err.response?.data?.error || '刷新失败')
    } finally {
      setLoading(false)
    }
  }

  // 我来接管
  const takeover = () => {
    setShowTakeoverConfirm(true)
  }

  // 确认接管
  const confirmTakeover = () => {
    setAgentState('user_control')
    setShowTakeoverConfirm(false)
    if (screenshotTimer.current) clearInterval(screenshotTimer.current)
  }

  // 恢复Agent
  const resumeAgent = () => {
    setAgentState('running')
    startAutoScreenshot()
  }

  // 停止接管，交还Agent
  const stopTakeover = () => {
    setAgentState('running')
    startAutoScreenshot()
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    navigate()
  }

  if (!session) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-6">
        <Globe className="w-12 h-12 mb-4 opacity-30" />
        <p className="text-sm mb-1">Playwright 自动化浏览器</p>
        <p className="text-xs opacity-50 mb-4">支持Agent自动化操作、截图、执行JS等</p>
        <button
          onClick={createSession}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          启动浏览器
        </button>
        {error && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-red-500">
            <AlertCircle className="w-3.5 h-3.5" />
            {error}
          </div>
        )}
      </div>
    )
  }

  const isAgentRunning = agentState === 'running'
  const isPaused = agentState === 'paused'
  const isUserControl = agentState === 'user_control'
  const showAgentOverlay = isExecuting && isAgentRunning

  return (
    <div className="flex flex-col h-full relative">
      {/* 地址栏 */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border bg-secondary/30 flex-shrink-0">
        <button onClick={goBack} className="p-1 rounded-md hover:bg-secondary transition-colors" title="后退">
          <ChevronLeft className="w-3 h-3" />
        </button>
        <button onClick={goForward} className="p-1 rounded-md hover:bg-secondary transition-colors" title="前进">
          <ChevronRight className="w-3 h-3" />
        </button>
        <button onClick={reload} className="p-1 rounded-md hover:bg-secondary transition-colors" title="刷新">
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <form onSubmit={handleSubmit} className="flex-1 flex gap-1">
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder="输入网址..."
            className="flex-1 h-6 px-2 bg-background border border-input rounded-md text-[11px] focus:outline-none focus:ring-1 focus:ring-primary/20 focus:border-primary"
          />
          <button
            type="submit"
            disabled={loading}
            className="p-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <ArrowRight className="w-3 h-3" />
          </button>
        </form>
        <button
          onClick={() => takeScreenshot(false)}
          className="p-1 rounded-md hover:bg-secondary transition-colors"
          title="截图"
        >
          <Camera className="w-3 h-3" />
        </button>
        <button
          onClick={closeSession}
          className="p-1 rounded-md hover:bg-red-500/10 text-red-500 transition-colors"
          title="关闭浏览器"
        >
          <Square className="w-3 h-3" />
        </button>
      </div>

      {/* 页面标题 */}
      <div className="px-2 py-0.5 border-b border-border bg-secondary/10 flex-shrink-0">
        <p className="text-[10px] text-muted-foreground truncate" title={session.url}>
          {session.title || '加载中...'}
        </p>
      </div>

      {/* 操作栏 */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-border bg-secondary/10 flex-shrink-0">
        <button
          onClick={() => setActiveTab('live')}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors ${activeTab === 'live' ? 'bg-primary/10 text-primary' : 'hover:bg-secondary'}`}
        >
          <Monitor className="w-3 h-3" />实时视图
        </button>
        <button
          onClick={() => { setActiveTab('screenshot'); takeScreenshot(false); }}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors ${activeTab === 'screenshot' ? 'bg-primary/10 text-primary' : 'hover:bg-secondary'}`}
        >
          <Camera className="w-3 h-3" />截图
        </button>
        <button
          onClick={getText}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors ${activeTab === 'text' ? 'bg-primary/10 text-primary' : 'hover:bg-secondary'}`}
        >
          <FileText className="w-3 h-3" />文本
        </button>
        <button
          onClick={getHtml}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors ${activeTab === 'html' ? 'bg-primary/10 text-primary' : 'hover:bg-secondary'}`}
        >
          <Code className="w-3 h-3" />HTML
        </button>
        <button
          onClick={() => setActiveTab('script')}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors ${activeTab === 'script' ? 'bg-primary/10 text-primary' : 'hover:bg-secondary'}`}
        >
          <Code className="w-3 h-3" />JS
        </button>
      </div>

      {/* 交互操作区 */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-border bg-secondary/10 flex-shrink-0">
        <div className="flex items-center gap-1 flex-1">
          <MousePointer className="w-3 h-3 text-muted-foreground" />
          <input
            type="text"
            value={selector}
            onChange={(e) => setSelector(e.target.value)}
            placeholder="CSS选择器"
            className="flex-1 h-6 px-1.5 bg-background border border-input rounded text-[10px] focus:outline-none focus:ring-1 focus:ring-primary/20"
          />
        </div>
        <button
          onClick={clickElement}
          disabled={!selector || loading}
          className="px-2 py-1 rounded text-[10px] bg-secondary hover:bg-secondary/80 transition-colors disabled:opacity-50"
        >
          点击
        </button>
        <div className="flex items-center gap-1 flex-1">
          <Type className="w-3 h-3 text-muted-foreground" />
          <input
            type="text"
            value={fillValue}
            onChange={(e) => setFillValue(e.target.value)}
            placeholder="填写内容"
            className="flex-1 h-6 px-1.5 bg-background border border-input rounded text-[10px] focus:outline-none focus:ring-1 focus:ring-primary/20"
          />
        </div>
        <button
          onClick={fillInput}
          disabled={!selector || loading}
          className="px-2 py-1 rounded text-[10px] bg-secondary hover:bg-secondary/80 transition-colors disabled:opacity-50"
        >
          填写
        </button>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="px-2 py-1 bg-red-500/10 text-red-500 text-[10px] flex items-center gap-1 flex-shrink-0">
          <AlertCircle className="w-3 h-3" />
          {error}
          <button onClick={() => setError('')} className="ml-auto hover:opacity-70">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* 内容区 - 带Agent状态覆盖层 */}
      <div className={`flex-1 overflow-auto relative ${showAgentOverlay ? 'ring-2 ring-green-500/50 ring-inset' : ''}`}>
        {/* 顶部渐变遮罩 - Agent执行中 */}
        {showAgentOverlay && (
          <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-green-500/10 to-transparent pointer-events-none z-10" />
        )}

        {/* 实时视图 - 可交互iframe */}
        {activeTab === 'live' && (
          <div className="h-full flex flex-col">
            <div className="flex-1 relative">
              {session.url ? (
                <iframe
                  src={session.url}
                  className="w-full h-full border-0"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                  title="实时浏览器视图"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              )}
            </div>
            <div className="px-2 py-1 bg-secondary/10 border-t border-border text-[10px] text-muted-foreground flex-shrink-0">
              实时视图模式：您可以直接在上方网页中点击、输入、滚动操作
            </div>
          </div>
        )}

        {/* 截图区域 - 带元素高亮框 */}
        {activeTab === 'screenshot' && (
          <div className="p-2 relative">
            {screenshot ? (
              <div className="relative">
                <img
                  src={screenshot}
                  alt="页面截图"
                  className="w-full rounded-lg border border-border"
                />
                {/* 元素高亮框 */}
                {elementBoxes.map((box, idx) => (
                  <div
                    key={idx}
                    className="absolute border-2 border-green-400 rounded pointer-events-none animate-pulse"
                    style={{
                      left: `${(box.x / 1280) * 100}%`,
                      top: `${(box.y / 720) * 100}%`,
                      width: `${(box.width / 1280) * 100}%`,
                      height: `${(box.height / 720) * 100}%`,
                    }}
                  >
                    <span className="absolute -top-5 left-0 bg-green-500 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap">
                      {box.label}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-40 text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            )}
          </div>
        )}

        {activeTab === 'text' && (
          <div className="p-2">
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono bg-secondary/20 p-3 rounded-lg">
              {pageText || '点击"文本"按钮获取页面内容'}
            </pre>
          </div>
        )}

        {activeTab === 'html' && (
          <div className="p-2">
            <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap font-mono bg-secondary/20 p-3 rounded-lg overflow-auto max-h-full">
              {pageText || '点击"HTML"按钮获取页面源码'}
            </pre>
          </div>
        )}

        {activeTab === 'script' && (
          <div className="p-2 space-y-2">
            <div className="flex gap-1">
              <input
                type="text"
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder="JavaScript 代码，如: document.title"
                className="flex-1 h-7 px-2 bg-background border border-input rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary/20"
              />
              <button
                onClick={executeScript}
                disabled={!script || loading}
                className="px-3 py-1 bg-primary text-primary-foreground rounded text-xs hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                执行
              </button>
            </div>
            {scriptResult && (
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono bg-secondary/20 p-3 rounded-lg">
                {scriptResult}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* 底部Agent状态栏 - 只在执行中显示 */}
      {showAgentOverlay && (
        <div className="flex-shrink-0 flex items-center justify-center py-2 bg-green-500/10 border-t border-green-500/20">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500 rounded-full text-white text-xs">
            <Bot className="w-3.5 h-3.5 animate-bounce" />
            <span>正在由 Agent 操作中</span>
            <button
              onClick={takeover}
              className="ml-1 px-2 py-0.5 bg-white/20 hover:bg-white/30 rounded text-[10px] transition-colors"
            >
              我来接管
            </button>
          </div>
        </div>
      )}

      {/* 底部暂停状态栏 */}
      {isPaused && (
        <div className="flex-shrink-0 flex items-center justify-center py-2 bg-yellow-500/10 border-t border-yellow-500/20">
          <button
            onClick={resumeAgent}
            className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500 rounded-full text-white text-xs hover:bg-yellow-600 transition-colors"
          >
            <Pause className="w-3.5 h-3.5" />
            <span>暂停中 - 点击恢复</span>
          </button>
        </div>
      )}

      {/* 底部用户接管状态栏 */}
      {isUserControl && (
        <div className="flex-shrink-0 flex items-center justify-center py-2 bg-blue-500/10 border-t border-blue-500/20">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 rounded-full text-white text-xs">
            <User className="w-3.5 h-3.5" />
            <span>浏览器正在由您接管中</span>
            <button
              onClick={stopTakeover}
              className="ml-1 px-2 py-0.5 bg-white/20 hover:bg-white/30 rounded text-[10px] transition-colors"
            >
              停止接管
            </button>
          </div>
        </div>
      )}

      {/* 接管确认弹窗 */}
      {showTakeoverConfirm && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl p-5 max-w-sm mx-4 shadow-xl">
            <h3 className="text-sm font-semibold text-foreground mb-3">你即将接管 OQ助手 的浏览器</h3>
            <div className="space-y-3 text-xs text-muted-foreground">
              <div className="flex items-start gap-2">
                <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-primary text-[10px]">1</span>
                </div>
                <p>OQ助手 不会记录或截取您的屏幕内容。接管期间，仅您可见输入的信息（如密码等）。</p>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-primary text-[10px]">2</span>
                </div>
                <p>浏览器数据将被保存。接管结束后，浏览器内将保持登录状态。</p>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-primary text-[10px]">3</span>
                </div>
                <p>请注意潜在的安全风险。登录网站可能会将您的数据暴露给不安全的网站。</p>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowTakeoverConfirm(false)}
                className="flex-1 px-3 py-2 bg-secondary rounded-lg text-xs hover:bg-secondary/80 transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmTakeover}
                className="flex-1 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs hover:bg-primary/90 transition-colors"
              >
                我理解
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
