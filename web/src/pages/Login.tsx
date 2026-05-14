import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Bot, Eye, EyeOff, Loader2, Sparkles,
  Users, Briefcase, Wrench,
  Globe, BarChart3, ArrowRight, CheckCircle2,
  Search, Code, FileText,
  ChevronRight, Layers, Cpu, Database,
  Workflow, Network, Webhook, Star,
  Sun, Moon,
  ChevronDown, ArrowUpRight,
  ScanSearch
} from 'lucide-react'
import { useAuthStore } from '../stores/auth'

const stats = [
  { value: '99+', label: 'MCP工具', icon: Wrench },
  { value: '6', label: 'AI专家Agent', icon: Users },
  { value: '7', label: '行业知识库', icon: Database },
  { value: '1747+', label: '代码符号', icon: Code },
  { value: '5', label: '标准工作流', icon: Workflow },
  { value: '∞', label: '可能性', icon: Sparkles }
]

function FeatureItem({ text, delay = 0, isDarkMode }: { text: string; delay?: number; isDarkMode: boolean }) {
  return (
    <div className="feature-item flex items-start gap-3 py-2" style={{ animationDelay: `${delay}s` }}>
      <CheckCircle2 className={`w-4 h-4 mt-0.5 shrink-0 transition-colors duration-500 ${isDarkMode ? 'text-emerald-400/80' : 'text-emerald-600/80'}`} />
      <span className={`text-sm leading-relaxed transition-colors duration-500 ${isDarkMode ? 'text-white/60' : 'text-slate-600'}`}>{text}</span>
    </div>
  )
}

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [currentSection, setCurrentSection] = useState(0)
  const { login } = useAuthStore()
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const isScrolling = useRef(false)

  const totalSections = 9

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await login(username, password)
    if (result.success) {
      navigate('/chat')
    } else {
      setError(result.message)
    }

    setLoading(false)
  }

  // 全屏滚动控制
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (isScrolling.current) return

      const direction = e.deltaY > 0 ? 1 : -1
      const nextSection = currentSection + direction

      if (nextSection >= 0 && nextSection < totalSections) {
        isScrolling.current = true
        setCurrentSection(nextSection)
        container.scrollTo({
          top: nextSection * container.clientHeight,
          behavior: 'smooth'
        })
        setTimeout(() => { isScrolling.current = false }, 800)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isScrolling.current) return
      let direction = 0
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') direction = 1
      if (e.key === 'ArrowUp' || e.key === 'PageUp') direction = -1
      if (e.key === 'Home') direction = -currentSection
      if (e.key === 'End') direction = totalSections - 1 - currentSection

      if (direction !== 0) {
        e.preventDefault()
        const nextSection = Math.max(0, Math.min(totalSections - 1, currentSection + direction))
        if (nextSection !== currentSection) {
          isScrolling.current = true
          setCurrentSection(nextSection)
          container.scrollTo({
            top: nextSection * container.clientHeight,
            behavior: 'smooth'
          })
          setTimeout(() => { isScrolling.current = false }, 800)
        }
      }
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      container.removeEventListener('wheel', handleWheel)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [currentSection])

  // 触摸滑动支持
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let touchStartY = 0
    const handleTouchStart = (e: TouchEvent) => { touchStartY = e.touches[0].clientY }
    const handleTouchEnd = (e: TouchEvent) => {
      const diff = touchStartY - e.changedTouches[0].clientY
      if (Math.abs(diff) > 50 && !isScrolling.current) {
        const direction = diff > 0 ? 1 : -1
        const nextSection = currentSection + direction
        if (nextSection >= 0 && nextSection < totalSections) {
          isScrolling.current = true
          setCurrentSection(nextSection)
          container.scrollTo({
            top: nextSection * container.clientHeight,
            behavior: 'smooth'
          })
          setTimeout(() => { isScrolling.current = false }, 800)
        }
      }
    }

    container.addEventListener('touchstart', handleTouchStart, { passive: true })
    container.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      container.removeEventListener('touchstart', handleTouchStart)
      container.removeEventListener('touchend', handleTouchEnd)
    }
  }, [currentSection])

  const scrollToSection = (index: number) => {
    if (isScrolling.current || !containerRef.current) return
    isScrolling.current = true
    setCurrentSection(index)
    containerRef.current.scrollTo({
      top: index * containerRef.current.clientHeight,
      behavior: 'smooth'
    })
    setTimeout(() => { isScrolling.current = false }, 800)
  }

  return (
    <div className={`min-h-screen w-full flex flex-col lg:flex-row overflow-hidden transition-colors duration-500 ${isDarkMode ? 'bg-[#070b18]' : 'bg-gradient-to-br from-slate-50 via-white to-indigo-50/30'}`} data-theme={isDarkMode ? 'dark' : 'light'}>
      {/* 主题切换按钮 */}
      <button
        onClick={() => setIsDarkMode(!isDarkMode)}
        className={`fixed top-4 right-4 z-50 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
          isDarkMode
            ? 'bg-white/10 border border-white/20 text-white/70 hover:text-white hover:bg-white/20'
            : 'bg-indigo-100 border border-indigo-200 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-200'
        } shadow-lg`}
      >
        {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      </button>

      {/* 滚动指示器 */}
      <div className="fixed right-6 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-2">
        {Array.from({ length: totalSections }).map((_, i) => (
          <button
            key={i}
            onClick={() => scrollToSection(i)}
            className={`w-2 h-2 rounded-full transition-all duration-300 ${
              currentSection === i
                ? 'bg-indigo-400 w-2 h-6'
                : isDarkMode ? 'bg-white/20 hover:bg-white/40' : 'bg-slate-300 hover:bg-slate-400'
            }`}
          />
        ))}
      </div>

      {/* 当前页码指示 */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3">
        <span className={`text-xs font-mono transition-colors duration-500 ${isDarkMode ? 'text-white/30' : 'text-slate-400'}`}>
          {String(currentSection + 1).padStart(2, '0')} / {String(totalSections).padStart(2, '0')}
        </span>
        {currentSection < totalSections - 1 && (
          <button
            onClick={() => scrollToSection(currentSection + 1)}
            className={`flex items-center gap-1 text-xs transition-colors animate-bounce ${isDarkMode ? 'text-white/30 hover:text-white/60' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <ChevronDown className={`w-4 h-4 transition-colors duration-500 ${isDarkMode ? 'text-white/30' : 'text-slate-400'}`} />
          </button>
        )}
      </div>

      {/* ====== 左侧: 全屏滚动落地页 ====== */}
      <div
        ref={containerRef}
        className="w-full lg:w-[62%] h-screen overflow-hidden snap-container"
      >
        {/* ========== Section 0: Hero ========== */}
        <section className="snap-section relative flex items-center px-8 lg:px-14 xl:px-20">
          <div className="landing-grid-bg absolute inset-0" />
          <div className="landing-orb landing-orb-1 absolute top-[8%] left-[3%]" />
          <div className="landing-orb landing-orb-2 absolute bottom-[15%] right-[8%]" />
          <div className="landing-orb landing-orb-3 absolute top-[55%] left-[35%]" />
          <div className="tech-hex-grid absolute inset-0" />
          <div className="tech-noise absolute inset-0" />
          <div className="scan-line-h" style={{ animationDuration: '10s' }} />
          <div className="corner-frame tl" />
          <div className="corner-frame tr" />
          <div className="corner-frame bl" />
          <div className="corner-frame br" />

          <div className="relative z-10 max-w-3xl mx-auto w-full">
            <div className="animate-hero-title mb-8" style={{ animationDelay: '0s' }}>
              <div className="flex items-center gap-3 mb-8">
                <div className="hero-glow-ring w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center shadow-glow-lg">
                  <Bot className="w-7 h-7 !text-white" style={{ color: 'white' }} />
                </div>
                <span className={`text-3xl font-bold tracking-tight transition-colors duration-500 ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>OQ助手</span>
                <span className={`px-3 py-1 text-xs font-semibold rounded-full border transition-colors duration-500 ${isDarkMode ? 'border-white/15 text-white/50 bg-white/[0.04]' : 'border-slate-300 text-slate-500 bg-slate-100'}`}>
                  Q1.31
                </span>
              </div>
            </div>

            <h1 className="animate-hero-title text-4xl xl:text-6xl font-bold leading-tight mb-6" style={{ animationDelay: '0.15s' }}>
              <span className={`transition-colors duration-500 ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>重新定义</span>{' '}
              <span className="gradient-text">AI协作</span>
            </h1>

            <p className={`animate-hero-title text-lg leading-relaxed max-w-xl mb-10 transition-colors duration-500 ${isDarkMode ? 'text-white/50' : 'text-slate-500'}`} style={{ animationDelay: '0.3s' }}>
              融合多Agent智能协作、MCP工具生态、企业智能分析与CRM管理的新一代AI销售平台。
              从客户发现到签约交付，全流程智能化覆盖。
            </p>

            <div className="animate-hero-title flex flex-wrap items-center gap-4 mb-16" style={{ animationDelay: '0.45s' }}>
              <button onClick={() => scrollToSection(totalSections - 1)} className="btn-primary h-12 px-8 text-base flex items-center gap-2 group">
                立即体验
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform !text-white" style={{ color: 'white' }} />
              </button>
              <button onClick={() => scrollToSection(1)} className={`btn-ghost h-12 px-7 text-base border transition-colors duration-500 ${isDarkMode ? 'text-white/70 hover:text-white border-white/10 hover:border-white/20' : 'text-slate-600 hover:text-slate-800 border-slate-300 hover:border-slate-400'}`}>
                了解更多
                <ChevronRight className={`w-4 h-4 inline ml-1 transition-colors duration-500 ${isDarkMode ? 'text-white/70' : 'text-slate-500'}`} />
              </button>
            </div>

            {/* 右侧装饰 */}
            <div className="animate-hero-title hidden lg:block absolute right-[-5%] top-1/2 -translate-y-1/2 opacity-40" style={{ animationDelay: '0.5s' }}>
              <div className="relative w-[320px] h-[320px]">
                <div className="absolute inset-0 rounded-full border border-indigo-500/20 animate-spin-slow" />
                <div className="absolute inset-6 rounded-full border border-purple-500/15 animate-spin-slow-reverse" />
                <div className="absolute inset-12 rounded-full border border-cyan-500/10 animate-spin-slower" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-20 h-20 rounded-2xl gradient-primary shadow-glow-lg animate-float flex items-center justify-center">
                    <Sparkles className="w-9 h-9 !text-white" style={{ color: 'white' }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========== Section 1: AI智能对话 ========== */}
        <section className="snap-section relative px-8 lg:px-14 xl:px-20 flex items-center">
          <div className="section-divider mb-16 absolute top-0 left-0 right-0" />
          <div className="max-w-4xl mx-auto w-full">
            <div className="flex items-start justify-between gap-4 mb-6">
              <span className={`inline-flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/25 text-sm font-bold transition-colors duration-500 ${isDarkMode ? 'text-indigo-400' : 'text-indigo-600'}`}>01</span>
            </div>
            <h2 className={`text-3xl font-bold mb-4 transition-colors duration-500 ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>AI智能对话</h2>
            <p className={`leading-relaxed max-w-2xl mb-12 transition-colors duration-500 ${isDarkMode ? 'text-white/55' : 'text-slate-500'}`}>
              基于大语言模型的智能对话系统，支持多模型切换、实时流式输出、联网搜索、MCP工具调用等高级功能。
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
              <div className="space-y-1">
                <FeatureItem text="多模型支持 — GPT-4o、Claude、通义千问等多模型自由切换" delay={0} isDarkMode={isDarkMode} />
                <FeatureItem text="流式输出 — 实时打字效果，思考过程可视化" delay={0.08} isDarkMode={isDarkMode} />
                <FeatureItem text="联网搜索 — 实时获取最新信息，打破知识截止限制" delay={0.16} isDarkMode={isDarkMode} />
                <FeatureItem text="MCP工具生态 — 99+扩展工具，自动调用完成复杂任务" delay={0.24} isDarkMode={isDarkMode} />
                <FeatureItem text="多模态交互 — 支持图片上传、语音输入朗读" delay={0.32} isDarkMode={isDarkMode} />
                <FeatureItem text="对话管理 — 历史记录持久化，多会话并行" delay={0.4} isDarkMode={isDarkMode} />
              </div>

              <div className="landing-mockup">
                <div className="ui-mockup">
                  <div className="ui-mockup-header">
                    <div className="ui-mockup-dot ui-mockup-dot-red" />
                    <div className="ui-mockup-dot ui-mockup-dot-yellow" />
                    <div className="ui-mockup-dot ui-mockup-dot-green" />
                    <span className="ml-2 text-xs text-white/40">AI对话</span>
                  </div>
                  <div className="p-4 space-y-3 min-h-[260px] flex flex-col justify-between">
                    <div className="space-y-3">
                      <div className="flex justify-end">
                        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-xs rounded-2xl rounded-br-md px-3.5 py-2.5 max-w-[75%] shadow-md">
                          你好！请帮我分析一下这份销售数据
                        </div>
                      </div>
                      <div className="flex justify-start">
                        <div className="bg-white/[0.06] border border-white/[0.08] text-white/80 text-xs rounded-2xl rounded-bl-md px-3.5 py-2.5 max-w-[85%]">
                          <p className="mb-1.5">您好！我是OQ助手，可以帮您分析。</p>
                          <p>让我先获取最新的数据趋势...</p>
                        </div>
                      </div>
                      <div className="flex justify-start">
                        <div className="bg-indigo-500/10 border border-indigo-500/20 text-white/80 text-xs rounded-xl px-3 py-2 flex items-center gap-2 max-w-[70%]">
                          <Search className="w-3.5 h-3.5 animate-pulse text-white/80" />
                          正在联网搜索最新行业数据...
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06]">
                      <div className="flex-1 h-8 bg-white/[0.04] rounded-lg border border-white/[0.08] px-3 flex items-center">
                        <span className="text-xs text-white/25">输入消息...</span>
                      </div>
                      <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
                        <ArrowRight className="w-3.5 h-3.5 !text-white" style={{ color: 'white' }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========== Section 2: 销售教练 ========== */}
        <section className="snap-section relative px-8 lg:px-14 xl:px-20 flex items-center">
          <div className="section-divider mb-16 absolute top-0 left-0 right-0" />
          <div className="max-w-4xl mx-auto w-full">
            <div className="flex items-start justify-between gap-4 mb-6">
              <span className={`inline-flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/25 text-sm font-bold transition-colors duration-500 ${isDarkMode ? 'text-indigo-400' : 'text-indigo-600'}`}>02</span>
            </div>
            <h2 className={`text-3xl font-bold mb-4 transition-colors duration-500 ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>销售教练</h2>
            <p className={`leading-relaxed max-w-2xl mb-12 transition-colors duration-500 ${isDarkMode ? 'text-white/55' : 'text-slate-500'}`}>
              独创的多Agent协作系统，集结6位AI销售专家，模拟真实销售团队协同作业。从客户初次接触到方案设计、异议处理再到签约交付，全流程智能化覆盖。
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
              <div className="space-y-1">
                <FeatureItem text="6位专家Agent — 销售总监、客户研究、产品技术、话术教练、方案架构、法务顾问" delay={0} isDarkMode={isDarkMode} />
                <FeatureItem text="5套标准工作流 — 初次接触→需求挖掘→方案设计→异议处理→签约交付" delay={0.08} isDarkMode={isDarkMode} />
                <FeatureItem text="多厂商知识库 — Autodesk/SketchUp/Adobe/达索系统等厂商专业知识" delay={0.16} isDarkMode={isDarkMode} />
                <FeatureItem text="协作式回复 — 各Agent从专业角度依次发表意见，最终整合方案" delay={0.24} isDarkMode={isDarkMode} />
                <FeatureItem text="反盗版专项 — 法务协同Agent专门处理盗版风险化解场景" delay={0.32} isDarkMode={isDarkMode} />
              </div>

              <div className="landing-mockup">
                <div className="ui-mockup">
                  <div className="ui-mockup-header">
                    <div className="ui-mockup-dot ui-mockup-dot-red" />
                    <div className="ui-mockup-dot ui-mockup-dot-yellow" />
                    <div className="ui-mockup-dot ui-mockup-dot-green" />
                    <span className={`ml-2 text-xs flex items-center gap-1.5 transition-colors duration-500 ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`}>
                      <Users className={`w-3 h-3 transition-colors duration-500 ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`} /> 销售教练
                    </span>
                  </div>
                  <div className="p-4 space-y-3 min-h-[260px] flex flex-col justify-between">
                    <div className="space-y-2.5">
                      <div className="bg-blue-500/8 border border-blue-500/15 rounded-xl p-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors duration-500 ${isDarkMode ? 'bg-blue-500/20' : 'bg-blue-100'}`}>
                            <Bot className={`w-3 h-3 transition-colors duration-500 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                          </div>
                          <span className={`text-xs font-medium transition-colors duration-500 ${isDarkMode ? 'text-blue-300' : 'text-blue-600'}`}>销售总监</span>
                        </div>
                        <p className="text-[11px] text-white/50 leading-relaxed">根据客户背景，建议采取顾问式销售策略，重点突出差异化价值...</p>
                      </div>
                      <div className="bg-emerald-500/8 border border-emerald-500/15 rounded-xl p-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors duration-500 ${isDarkMode ? 'bg-emerald-500/20' : 'bg-emerald-100'}`}>
                            <Search className={`w-3 h-3 transition-colors duration-500 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`} />
                          </div>
                          <span className={`text-xs font-medium transition-colors duration-500 ${isDarkMode ? 'text-emerald-300' : 'text-emerald-600'}`}>客户研究专家</span>
                        </div>
                        <p className="text-[11px] text-white/50 leading-relaxed">该客户行业特征分析如下：决策周期约3个月，关注ROI指标...</p>
                      </div>
                      <div className="bg-violet-500/8 border border-violet-500/20 rounded-xl p-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors duration-500 ${isDarkMode ? 'bg-violet-500/20' : 'bg-violet-100'}`}>
                            <Layers className={`w-3 h-3 transition-colors duration-500 ${isDarkMode ? 'text-violet-400' : 'text-violet-600'}`} />
                          </div>
                          <span className={`text-xs font-medium transition-colors duration-500 ${isDarkMode ? 'text-violet-300' : 'text-violet-600'}`}>方案架构师</span>
                          <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded transition-colors duration-500 ${isDarkMode ? 'text-emerald-400 bg-emerald-400/10' : 'text-emerald-600 bg-emerald-100'}`}>整合方案 ✓</span>
                        </div>
                        <p className="text-[11px] text-white/50 leading-relaxed">综合以上分析，推荐采用分阶段部署方案，预计转化率提升35%...</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========== Section 3: 企业智能分析（新增核心功能） ========== */}
        <section className="snap-section relative px-8 lg:px-14 xl:px-20 flex items-center">
          <div className="section-divider mb-16 absolute top-0 left-0 right-0" />
          <div className="max-w-4xl mx-auto w-full">
            <div className="flex items-start justify-between gap-4 mb-6">
              <span className={`inline-flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/25 text-sm font-bold transition-colors duration-500 ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`}>03</span>
              <span className={`px-3 py-1 text-xs font-semibold rounded-full border transition-colors duration-500 ${isDarkMode ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-amber-100 text-amber-600 border-amber-300'}`}>核心能力</span>
            </div>
            <h2 className={`text-3xl font-bold mb-4 transition-colors duration-500 ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>企业智能分析</h2>
            <p className={`leading-relaxed max-w-2xl mb-12 transition-colors duration-500 ${isDarkMode ? 'text-white/55' : 'text-slate-500'}`}>
              深度企业数据分析引擎，覆盖500万+企业信息库。通过多维度智能筛选，精准定位高价值潜在客户，
              为销售团队提供数据驱动的客户开发策略。
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
              <div className="space-y-1">
                <FeatureItem text="500万+企业数据库 — 覆盖全国各行业企业，信息实时更新" delay={0} isDarkMode={isDarkMode} />
                <FeatureItem text="多维度智能筛选 — 按行业、规模、地区、采购能力等20+条件精准定位" delay={0.08} isDarkMode={isDarkMode} />
                <FeatureItem text="企业画像分析 — 自动生成企业完整画像，包含参保人数、注册资本、经营状况" delay={0.16} isDarkMode={isDarkMode} />
                <FeatureItem text="需求预测模型 — 基于行业趋势和企业特征，智能预测采购意向等级" delay={0.24} isDarkMode={isDarkMode} />
                <FeatureItem text="竞品使用分析 — 识别企业现有软件使用情况，精准推荐替代方案" delay={0.32} isDarkMode={isDarkMode} />
                <FeatureItem text="一键导入CRM — 筛选结果直接导入客户管理系统，自动分配跟进任务" delay={0.4} isDarkMode={isDarkMode} />
              </div>

              <div className="landing-mockup">
                <div className="ui-mockup">
                  <div className="ui-mockup-header">
                    <div className="ui-mockup-dot ui-mockup-dot-red" />
                    <div className="ui-mockup-dot ui-mockup-dot-yellow" />
                    <div className="ui-mockup-dot ui-mockup-dot-green" />
                    <span className={`ml-2 text-xs flex items-center gap-1.5 transition-colors duration-500 ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`}>
                      <ScanSearch className={`w-3 h-3 transition-colors duration-500 ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`} /> 企业智能筛选
                    </span>
                  </div>
                  <div className="p-4 space-y-3 min-h-[260px]">
                    {/* 筛选条件 */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-white/[0.04] rounded-lg p-2 border border-white/[0.06]">
                        <p className="text-[10px] text-white/30 mb-1">行业筛选</p>
                        <p className="text-[11px] text-white/70">土木工程建筑业</p>
                      </div>
                      <div className="bg-white/[0.04] rounded-lg p-2 border border-white/[0.06]">
                        <p className="text-[10px] text-white/30 mb-1">地区</p>
                        <p className="text-[11px] text-white/70">四川省 成都市</p>
                      </div>
                      <div className="bg-white/[0.04] rounded-lg p-2 border border-white/[0.06]">
                        <p className="text-[10px] text-white/30 mb-1">参保人数</p>
                        <p className="text-[11px] text-white/70">≥ 5000人</p>
                      </div>
                      <div className="bg-white/[0.04] rounded-lg p-2 border border-white/[0.06]">
                        <p className="text-[10px] text-white/30 mb-1">采购意向</p>
                        <p className="text-[11px] text-amber-400">高意向</p>
                      </div>
                    </div>
                    {/* 企业列表 */}
                    <div className="bg-white/[0.02] rounded-lg border border-white/[0.06] overflow-hidden">
                      <div className="grid grid-cols-3 gap-2 px-3 py-2 bg-white/[0.03] border-b border-white/[0.05]">
                        <span className="text-[10px] text-white/30 font-medium">企业名称</span>
                        <span className="text-[10px] text-white/30 font-medium">参保人数</span>
                        <span className="text-[10px] text-white/30 font-medium">意向度</span>
                      </div>
                      {[
                        ['某建筑工程公司', '10,000', '98%'],
                        ['水利水电工程局', '9,779', '95%'],
                        ['地铁维护保障', '9,611', '92%'],
                      ].map((row, i) => (
                        <div key={i} className="grid grid-cols-3 gap-2 px-3 py-2 border-b border-white/[0.03] last:border-0">
                          <span className="text-[11px] text-white/65 truncate">{row[0]}</span>
                          <span className="text-[11px] text-white/50">{row[1]}</span>
                          <span className="text-[11px] text-emerald-400/80">{row[2]}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] text-white/30">共匹配 15,281 家企业</span>
                      <button className={`text-[10px] flex items-center gap-1 transition-colors duration-500 ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`}>
                        导入CRM <ArrowUpRight className={`w-3 h-3 transition-colors duration-500 ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========== Section 4: CRM工作台 ========== */}
        <section className="snap-section relative px-8 lg:px-14 xl:px-20 flex items-center">
          <div className="section-divider mb-16 absolute top-0 left-0 right-0" />
          <div className="max-w-4xl mx-auto w-full">
            <div className="flex items-start justify-between gap-4 mb-6">
              <span className={`inline-flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/25 text-sm font-bold transition-colors duration-500 ${isDarkMode ? 'text-indigo-400' : 'text-indigo-600'}`}>04</span>
            </div>
            <h2 className={`text-3xl font-bold mb-4 transition-colors duration-500 ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>CRM工作台</h2>
            <p className={`leading-relaxed max-w-2xl mb-12 transition-colors duration-500 ${isDarkMode ? 'text-white/55' : 'text-slate-500'}`}>
              一站式客户关系管理系统，集成客户管理、销售漏斗、团队任务分配等功能。数据驱动决策，让每一个销售机会都不被遗漏。
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
              <div className="space-y-1">
                <FeatureItem text="客户360视图 — 完整客户画像，沟通记录一目了然" delay={0} isDarkMode={isDarkMode} />
                <FeatureItem text="销售漏斗可视化 — 从线索到成交的全流程跟踪" delay={0.08} isDarkMode={isDarkMode} />
                <FeatureItem text="团队协作 — 任务分配、进度同步、业绩看板" delay={0.16} isDarkMode={isDarkMode} />
                <FeatureItem text="智能预警 — 客单流失提醒、跟进超时告警" delay={0.24} isDarkMode={isDarkMode} />
                <FeatureItem text="数据报表 — 自定义图表，多维数据分析" delay={0.32} isDarkMode={isDarkMode} />
              </div>

              <div className="landing-mockup">
                <div className="ui-mockup">
                  <div className="ui-mockup-header">
                    <div className="ui-mockup-dot ui-mockup-dot-red" />
                    <div className="ui-mockup-dot ui-mockup-dot-yellow" />
                    <div className="ui-mockup-dot ui-mockup-dot-green" />
                    <span className={`ml-2 text-xs flex items-center gap-1.5 transition-colors duration-500 ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`}>
                      <Briefcase className={`w-3 h-3 transition-colors duration-500 ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`} /> CRM工作台
                    </span>
                  </div>
                  <div className="p-4 space-y-3 min-h-[260px]">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-white/[0.04] rounded-lg p-2.5 border border-white/[0.06]">
                        <p className="text-[10px] text-white/35 mb-1">总客户</p>
                        <p className="text-base font-bold text-white tabular-nums">1,284</p>
                        <p className="text-[10px] text-emerald-400/80">↑ 12.5%</p>
                      </div>
                      <div className="bg-white/[0.04] rounded-lg p-2.5 border border-white/[0.06]">
                        <p className="text-[10px] text-white/35 mb-1">活跃线索</p>
                        <p className="text-base font-bold text-white tabular-nums">368</p>
                        <p className="text-[10px] text-emerald-400/80">↑ 8.3%</p>
                      </div>
                      <div className="bg-white/[0.04] rounded-lg p-2.5 border border-white/[0.06]">
                        <p className="text-[10px] text-white/35 mb-1">本月成交</p>
                        <p className="text-base font-bold text-white tabular-nums">¥89W</p>
                        <p className="text-[10px] text-emerald-400/80">↑ 23.1%</p>
                      </div>
                    </div>
                    <div className="bg-white/[0.02] rounded-lg border border-white/[0.06] overflow-hidden">
                      <div className="grid grid-cols-4 gap-2 px-3 py-2 bg-white/[0.03] border-b border-white/[0.05]">
                        <span className="text-[10px] text-white/30 font-medium">客户名称</span>
                        <span className="text-[10px] text-white/30 font-medium">阶段</span>
                        <span className="text-[10px] text-white/30 font-medium">金额</span>
                        <span className="text-[10px] text-white/30 font-medium">负责人</span>
                      </div>
                      {[
                        ['某科技公司', '谈判中', '¥120,000', '张三'],
                        ['创新工作室', '方案确认', '¥68,000', '李四'],
                        ['数字集团', '初步接触', '¥250,000', '王五'],
                      ].map((row, i) => (
                        <div key={i} className="grid grid-cols-4 gap-2 px-3 py-2 border-b border-white/[0.03] last:border-0">
                          <span className="text-[11px] text-white/65 truncate">{row[0]}</span>
                          <span className={`text-[10px] ${i === 0 ? 'text-orange-400/80' : i === 1 ? 'text-blue-400/80' : 'text-white/40'}`}>{row[1]}</span>
                          <span className="text-[11px] text-white/70 tabular-nums">{row[2]}</span>
                          <span className="text-[11px] text-white/45">{row[3]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========== Section 5: MCP工具生态 ========== */}
        <section className="snap-section relative px-8 lg:px-14 xl:px-20 flex items-center">
          <div className="section-divider mb-16 absolute top-0 left-0 right-0" />
          <div className="max-w-4xl mx-auto w-full">
            <div className="flex items-start justify-between gap-4 mb-6">
              <span className={`inline-flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/25 text-sm font-bold transition-colors duration-500 ${isDarkMode ? 'text-indigo-400' : 'text-indigo-600'}`}>05</span>
            </div>
            <h2 className={`text-3xl font-bold mb-4 transition-colors duration-500 ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>MCP工具生态</h2>
            <p className={`leading-relaxed max-w-2xl mb-12 transition-colors duration-500 ${isDarkMode ? 'text-white/55' : 'text-slate-500'}`}>
              基于Model Context Protocol的可扩展工具体系，已集成99+专业工具。涵盖知识库搜索、代码语义分析、网页抓取、文档处理等领域。
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
              <div className="space-y-1">
                <FeatureItem text="99+内置工具 — 开箱即用的丰富工具集" delay={0} isDarkMode={isDarkMode} />
                <FeatureItem text="知识库增强 — 7个厂商专业知识库，精准检索" delay={0.08} isDarkMode={isDarkMode} />
                <FeatureItem text="代码分析 — 1747+符号索引，智能代码理解" delay={0.16} isDarkMode={isDarkMode} />
                <FeatureItem text="书目目录结构 — 分类清晰，快速定位所需工具" delay={0.24} isDarkMode={isDarkMode} />
                <FeatureItem text="自定义扩展 — 开放API，轻松接入企业自有工具" delay={0.32} isDarkMode={isDarkMode} />
              </div>

              <div className="landing-mockup">
                <div className="ui-mockup">
                  <div className="ui-mockup-header">
                    <div className="ui-mockup-dot ui-mockup-dot-red" />
                    <div className="ui-mockup-dot ui-mockup-dot-yellow" />
                    <div className="ui-mockup-dot ui-mockup-dot-green" />
                    <span className={`ml-2 text-xs flex items-center gap-1.5 transition-colors duration-500 ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`}>
                      <Wrench className={`w-3 h-3 transition-colors duration-500 ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`} /> MCP工具目录
                    </span>
                  </div>
                  <div className="p-4 min-h-[260px]">
                    <div className="space-y-1.5 text-xs">
                      <div className={`font-medium pb-1.5 border-b border-white/[0.06] flex items-center gap-2 transition-colors duration-500 ${isDarkMode ? 'text-white/70' : 'text-slate-700'}`}>
                        <Network className={`w-3.5 h-3.5 transition-colors duration-500 ${isDarkMode ? 'text-amber-400/80' : 'text-amber-600'}`} />
                        工具根目录
                      </div>
                      <div className="pl-4 space-y-1">
                        <div className={`flex items-center gap-1.5 transition-colors duration-500 ${isDarkMode ? 'text-white/55' : 'text-slate-600'}`}>
                          <ChevronRight className={`w-3 h-3 rotate-90 transition-colors duration-500 ${isDarkMode ? 'text-indigo-400/60' : 'text-indigo-600'}`} />
                          <Database className={`w-3 h-3 transition-colors duration-500 ${isDarkMode ? 'text-blue-400/70' : 'text-blue-600'}`} /> 知识库检索
                          <span className={`ml-auto text-[10px] px-1.5 rounded transition-colors duration-500 ${isDarkMode ? 'text-white/25 bg-white/[0.03]' : 'text-slate-500 bg-slate-100'}`}>12</span>
                        </div>
                        <div className={`flex items-center gap-1.5 transition-colors duration-500 ${isDarkMode ? 'text-white/55' : 'text-slate-600'}`}>
                          <ChevronRight className={`w-3 h-3 transition-colors duration-500 ${isDarkMode ? 'text-indigo-400/60' : 'text-indigo-600'}`} />
                          <Code className={`w-3 h-3 transition-colors duration-500 ${isDarkMode ? 'text-emerald-400/70' : 'text-emerald-600'}`} /> 代码分析
                          <span className={`ml-auto text-[10px] px-1.5 rounded transition-colors duration-500 ${isDarkMode ? 'text-white/25 bg-white/[0.03]' : 'text-slate-500 bg-slate-100'}`}>18</span>
                        </div>
                        <div className={`flex items-center gap-1.5 transition-colors duration-500 ${isDarkMode ? 'text-white/55' : 'text-slate-600'}`}>
                          <ChevronRight className={`w-3 h-3 transition-colors duration-500 ${isDarkMode ? 'text-indigo-400/60' : 'text-indigo-600'}`} />
                          <Globe className={`w-3 h-3 transition-colors duration-500 ${isDarkMode ? 'text-cyan-400/70' : 'text-cyan-600'}`} /> 网页抓取
                          <span className={`ml-auto text-[10px] px-1.5 rounded transition-colors duration-500 ${isDarkMode ? 'text-white/25 bg-white/[0.03]' : 'text-slate-500 bg-slate-100'}`}>8</span>
                        </div>
                        <div className={`flex items-center gap-1.5 transition-colors duration-500 ${isDarkMode ? 'text-white/55' : 'text-slate-600'}`}>
                          <ChevronRight className={`w-3 h-3 transition-colors duration-500 ${isDarkMode ? 'text-indigo-400/60' : 'text-indigo-600'}`} />
                          <FileText className={`w-3 h-3 transition-colors duration-500 ${isDarkMode ? 'text-orange-400/70' : 'text-orange-600'}`} /> 文档处理
                          <span className={`ml-auto text-[10px] px-1.5 rounded transition-colors duration-500 ${isDarkMode ? 'text-white/25 bg-white/[0.03]' : 'text-slate-500 bg-slate-100'}`}>15</span>
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-[10px] text-white/30">共 99+ 个工具可用 · 全部在线运行中</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========== Section 6: 智能抓取引擎 ========== */}
        <section className="snap-section relative px-8 lg:px-14 xl:px-20 flex items-center">
          <div className="section-divider mb-16 absolute top-0 left-0 right-0" />
          <div className="max-w-4xl mx-auto w-full">
            <div className="flex items-start justify-between gap-4 mb-6">
              <span className={`inline-flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/25 text-sm font-bold transition-colors duration-500 ${isDarkMode ? 'text-indigo-400' : 'text-indigo-600'}`}>06</span>
            </div>
            <h2 className={`text-3xl font-bold mb-4 transition-colors duration-500 ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>智能抓取引擎</h2>
            <p className={`leading-relaxed max-w-2xl mb-12 transition-colors duration-500 ${isDarkMode ? 'text-white/55' : 'text-slate-500'}`}>
              AI驱动的网页数据采集系统，结合Playwright浏览器自动化与LLM智能解析，从非结构化网页中提取高质量结构化数据。
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
              <div className="space-y-1">
                <FeatureItem text="浏览器自动化 — Playwright驱动，真实渲染页面" delay={0} isDarkMode={isDarkMode} />
                <FeatureItem text="AI智能提取 — LLM理解页面语义，精准定位数据" delay={0.08} isDarkMode={isDarkMode} />
                <FeatureItem text="反爬对抗 — 智能处理验证码、动态加载等内容" delay={0.16} isDarkMode={isDarkMode} />
                <FeatureItem text="定时任务 — 支持周期性自动采集" delay={0.24} isDarkMode={isDarkMode} />
                <FeatureItem text="数据清洗 — 自动去重、格式标准化" delay={0.32} isDarkMode={isDarkMode} />
              </div>

              <div className="landing-mockup">
                <div className="ui-mockup">
                  <div className="ui-mockup-header">
                    <div className="ui-mockup-dot ui-mockup-dot-red" />
                    <div className="ui-mockup-dot ui-mockup-dot-yellow" />
                    <div className="ui-mockup-dot ui-mockup-dot-green" />
                    <span className={`ml-2 text-xs flex items-center gap-1.5 transition-colors duration-500 ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`}>
                      <Webhook className={`w-3 h-3 transition-colors duration-500 ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`} /> 抓取任务配置
                    </span>
                  </div>
                  <div className="p-4 space-y-3 min-h-[260px]">
                    <div>
                      <label className="text-[10px] text-white/35 mb-1 block">目标URL</label>
                      <div className="h-8 bg-white/[0.04] rounded-lg border border-white/[0.08] px-3 flex items-center">
                        <Globe className={`w-3 h-3 mr-2 transition-colors duration-500 ${isDarkMode ? 'text-white/25' : 'text-slate-400'}`} />
                        <span className="text-[11px] text-white/50 truncate">https://example.com/products/list</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-white/35 mb-1 block">提取模式</label>
                        <div className="h-8 bg-white/[0.04] rounded-lg border border-white/[0.08] px-3 flex items-center justify-between">
                          <span className="text-[11px] text-white/55">AI智能解析</span>
                          <Cpu className={`w-3 h-3 transition-colors duration-500 ${isDarkMode ? 'text-indigo-400/60' : 'text-indigo-600'}`} />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-white/35 mb-1 block">执行频率</label>
                        <div className="h-8 bg-white/[0.04] rounded-lg border border-white/[0.08] px-3 flex items-center">
                          <span className="text-[11px] text-white/55">每日 09:00</span>
                        </div>
                      </div>
                    </div>
                    <button className="w-full h-9 rounded-lg bg-gradient-to-r from-orange-500/90 to-amber-500/90 text-white text-xs font-medium flex items-center justify-center gap-2">
                      <Webhook className={`w-3.5 h-3.5 transition-colors duration-500 ${isDarkMode ? 'text-white' : 'text-white'}`} />
                      启动抓取任务
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========== Section 7: 数据洞察分析 ========== */}
        <section className="snap-section relative px-8 lg:px-14 xl:px-20 flex items-center">
          <div className="section-divider mb-16 absolute top-0 left-0 right-0" />
          <div className="max-w-4xl mx-auto w-full">
            <div className="flex items-start justify-between gap-4 mb-6">
              <span className={`inline-flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/25 text-sm font-bold transition-colors duration-500 ${isDarkMode ? 'text-indigo-400' : 'text-indigo-600'}`}>07</span>
            </div>
            <h2 className={`text-3xl font-bold mb-4 transition-colors duration-500 ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>数据洞察分析</h2>
            <p className={`leading-relaxed max-w-2xl mb-12 transition-colors duration-500 ${isDarkMode ? 'text-white/55' : 'text-slate-500'}`}>
              全方位的数据统计分析平台，实时监控系统运行状态、用户活跃度、资源使用情况，通过可视化图表辅助管理决策。
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
              <div className="space-y-1">
                <FeatureItem text="实时仪表盘 — 核心指标一览无余" delay={0} isDarkMode={isDarkMode} />
                <FeatureItem text="趋势分析 — 日/周/月维度趋势对比" delay={0.08} isDarkMode={isDarkMode} />
                <FeatureItem text="用户行为分析 — 活跃用户、使用频率、热门功能" delay={0.16} isDarkMode={isDarkMode} />
                <FeatureItem text="资源监控 — API调用量、Token消耗、模型负载" delay={0.24} isDarkMode={isDarkMode} />
                <FeatureItem text="可视化报表 — 图表丰富，支持导出" delay={0.32} isDarkMode={isDarkMode} />
              </div>

              <div className="landing-mockup">
                <div className="ui-mockup">
                  <div className="ui-mockup-header">
                    <div className="ui-mockup-dot ui-mockup-dot-red" />
                    <div className="ui-mockup-dot ui-mockup-dot-yellow" />
                    <div className="ui-mockup-dot ui-mockup-dot-green" />
                    <span className={`ml-2 text-xs flex items-center gap-1.5 transition-colors duration-500 ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`}>
                      <BarChart3 className={`w-3 h-3 transition-colors duration-500 ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`} /> 数据洞察
                    </span>
                  </div>
                  <div className="p-4 space-y-3 min-h-[260px]">
                    <div>
                      <p className="text-[10px] text-white/30 mb-2">API调用量趋势</p>
                      <div className="flex items-end gap-1.5 h-24 px-1">
                        {[35, 48, 42, 65, 58, 72, 85].map((h, i) => (
                          <div key={i} className="flex-1 flex flex-col items-center gap-1">
                            <div className="w-full rounded-t-sm bg-gradient-to-t from-indigo-500/60 to-cyan-400/60" style={{ height: `${h}%` }} />
                            <span className="text-[8px] text-white/20">{['周一','周二','周三','周四','周五','周六','周日'][i]}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white/[0.02] rounded-lg border border-white/[0.06] p-2.5">
                        <p className="text-[10px] text-white/30 mb-2">活跃用户</p>
                        <div className="relative h-14">
                          <div className="absolute bottom-0 right-0 text-[10px] text-emerald-400/80 font-medium">+23%</div>
                        </div>
                      </div>
                      <div className="bg-white/[0.02] rounded-lg border border-white/[0.06] p-2.5">
                        <p className="text-[10px] text-white/30 mb-2">模型使用分布</p>
                        <div className="flex items-center gap-2 h-14">
                          <div className="w-10 h-10 rounded-full border-4 border-indigo-500/60 border-t-cyan-400/60 border-r-purple-500/60 border-b-amber-400/40" />
                          <div className="space-y-1 text-[9px]">
                            <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-indigo-500/60" /><span className="text-white/40">GPT-4o 45%</span></div>
                            <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-cyan-400/60" /><span className="text-white/40">Claude 28%</span></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========== Section 8: 核心指标 + 登录区 ========== */}
        <section className="snap-section relative px-8 lg:px-14 xl:px-20 flex items-center">
          <div className="max-w-5xl mx-auto w-full">
            <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] p-10 lg:p-14 backdrop-blur-sm mb-12">
              <h2 className={`text-2xl font-bold text-center mb-3 transition-colors duration-500 ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>平台核心能力</h2>
              <p className={`text-sm text-center mb-12 transition-colors duration-500 ${isDarkMode ? 'text-white/35' : 'text-slate-500'}`}>经过验证的技术实力，为您的业务赋能</p>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
                {stats.map((stat, i) => (
                  <div key={stat.label} className="text-center stat-item" style={{ animationDelay: `${0.1 + i * 0.08}s` }}>
                    <stat.icon className={`w-5 h-5 mx-auto mb-2.5 transition-colors duration-500 ${isDarkMode ? 'text-indigo-400/50' : 'text-indigo-600/50'}`} />
                    <div className="stat-value stat-glow gradient-text text-3xl lg:text-4xl font-bold tabular-nums mb-1">
                      {stat.value}
                    </div>
                    <div className={`text-xs transition-colors duration-500 ${isDarkMode ? 'text-white/35' : 'text-slate-500'}`}>{stat.label}</div>
                  </div>
                ))}
              </div>

              <div className={`mt-12 pt-8 border-t border-white/[0.05] flex flex-wrap items-center justify-center gap-6 transition-colors duration-500 ${isDarkMode ? 'text-white/20' : 'text-slate-400'}`}>
                {['GPT-4o', 'Claude', '通义千问', 'Playwright', 'React', 'TypeScript'].map((tech) => (
                  <span key={tech} className="text-xs flex items-center gap-1.5">
                    <Star className={`w-3 h-3 transition-colors duration-500 ${isDarkMode ? 'text-white/20' : 'text-slate-400'}`} /> {tech}
                  </span>
                ))}
              </div>
            </div>

            <div className="text-center">
              <h2 className="text-3xl xl:text-4xl font-bold text-white mb-4">
                准备好开始了吗？
              </h2>
              <p className="text-lg text-white/45 mb-10 leading-relaxed">
                立即登录，体验全新的AI协作方式
              </p>
              <button
                onClick={() => scrollToSection(totalSections - 1)}
                className="btn-primary h-12 px-10 text-base flex items-center gap-2 group mx-auto"
              >
                前往登录
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform !text-white" style={{ color: 'white' }} />
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* ====== 右侧: 登录窗 ====== */}
      <div id="login-form" className="relative w-full lg:w-[38%] min-h-screen lg:sticky lg:top-0 lg:h-screen flex items-center justify-center p-6 lg:p-10">
        {!isDarkMode ? null : (
          <>
            <div className="absolute top-1/4 right-[-10%] w-[300px] h-[300px] rounded-full bg-indigo-500/5 blur-3xl pointer-events-none" />
            <div className="absolute bottom-[-5%] left-[-5%] w-[200px] h-[200px] rounded-full bg-purple-500/5 blur-3xl pointer-events-none" />
          </>
        )}

        <div className={`w-full max-w-sm relative z-10 animate-fade-in-scale rounded-2xl transition-all duration-500 ${isDarkMode ? 'shadow-2xl shadow-black/30' : 'shadow-xl shadow-black/8'}`} style={{ animationDelay: '0.2s', animationFillMode: 'both' }}>
          <div
            className={`rounded-2xl p-7 sm:p-8 transition-colors duration-500 ${
              isDarkMode ? 'bg-[rgba(15,20,40,0.75)]' : 'bg-white/95 backdrop-blur-xl'
            }`}
            style={{
              backdropFilter: isDarkMode ? 'blur(24px) saturate(180%)' : 'blur(24px)',
              WebkitBackdropFilter: isDarkMode ? 'blur(24px) saturate(180%)' : 'blur(24px)',
              border: `1px solid ${isDarkMode ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.12)'}`,
              boxShadow: isDarkMode
                ? '0 8px 48px rgba(0,0,0,0.4), 0 0 80px rgba(99,102,241,0.06), inset 0 1px 0 rgba(255,255,255,0.05)'
                : '0 8px 40px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.9)'
            }}
          >
            <div className="text-center mb-7">
              <div className="w-13 h-13 gradient-primary rounded-xl flex items-center justify-center mx-auto mb-3.5 shadow-glow animate-float">
                <Bot className="w-6.5 h-6.5 !text-white" style={{ color: 'white' }} />
              </div>
              <h2 className={`text-xl font-bold transition-colors duration-500 ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>欢迎回来</h2>
              <p className={`text-sm mt-1 transition-colors duration-500 ${isDarkMode ? 'text-white/45' : 'text-slate-400'}`}>登录您的账户，开始智能对话</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4.5">
              {error && (
                <div className={`p-3 border rounded-xl text-sm animate-fade-in flex items-start gap-2 transition-colors duration-500 ${
                  isDarkMode ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-red-50 border-red-200 text-red-600'
                }`}>
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 opacity-70" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className={`block text-sm font-medium mb-2 transition-colors duration-500 ${isDarkMode ? 'text-white/75' : 'text-slate-600'}`}>用户名</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="请输入用户名"
                  required
                  className="landing-input"
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 transition-colors duration-500 ${isDarkMode ? 'text-white/75' : 'text-slate-600'}`}>密码</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="请输入密码"
                    required
                    className="landing-input pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className={`absolute right-3 top-1/2 -translate-y-1/2 transition-colors duration-500 ${isDarkMode ? 'text-white/35 hover:text-white/65' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full h-11 text-sm flex items-center justify-center gap-2 mt-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin !text-white" style={{ color: 'white' }} /> : <Sparkles className="w-4 h-4 !text-white" style={{ color: 'white' }} />}
                登录
              </button>
            </form>

            <p className={`text-center text-sm mt-6 transition-colors duration-500 ${isDarkMode ? 'text-white/40' : 'text-slate-400'}`}>
              还没有账户？{' '}
              <Link to="/register" className={`inline-flex items-center gap-1 font-medium transition-colors group ${isDarkMode ? 'hover:text-white text-white/70' : 'hover:text-indigo-600 text-indigo-500'}`}>
                立即注册
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </p>
          </div>

          <div className="text-center mt-6">
            <p className={`text-xs transition-colors duration-500 ${isDarkMode ? 'text-white/30' : 'text-slate-400/70'}`}>OQ助手 · 让AI成为您的得力助手</p>
          </div>
        </div>
      </div>
    </div>
  )
}
