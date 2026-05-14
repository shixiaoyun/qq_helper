import { useState } from 'react'
import {
  Globe,
  FileText,
  Image,
  Code,
  Terminal,
  X,
  Maximize2,
  Minimize2,
} from 'lucide-react'
import PlaywrightBrowserPanel from './PlaywrightBrowser'
import CodeEditor from './CodeEditor'

interface BottomToolbarProps {
  className?: string
}

type PanelType = 'playwright' | 'markdown' | 'image' | 'code' | 'terminal' | null

interface PanelConfig {
  type: Exclude<PanelType, null>
  title: string
  icon: React.ElementType
}

const PANELS: PanelConfig[] = [
  { type: 'playwright', title: 'Playwright浏览器', icon: Globe },
  { type: 'markdown', title: '文档', icon: FileText },
  { type: 'code', title: '代码编辑器', icon: Code },
  { type: 'image', title: '图片', icon: Image },
  { type: 'terminal', title: '终端', icon: Terminal },
]

export default function BottomToolbar({ className = '' }: BottomToolbarProps) {
  const [activePanel, setActivePanel] = useState<PanelType>(null)
  const [isExpanded, setIsExpanded] = useState(false)

  const togglePanel = (type: PanelType) => {
    if (activePanel === type) {
      setActivePanel(null)
    } else {
      setActivePanel(type)
      if (!isExpanded) {
        setIsExpanded(true)
      }
    }
  }

  const closePanel = () => {
    setActivePanel(null)
    setIsExpanded(false)
  }

  return (
    <div className={`flex flex-col ${className}`}>
      {/* 底部面板内容区 */}
      {activePanel && isExpanded && (
        <div className="border-t border-border bg-card flex flex-col transition-all duration-300"
          style={{ height: isExpanded ? '320px' : '0px' }}
        >
          {/* 面板头部 */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-secondary/20 flex-shrink-0">
            <div className="flex items-center gap-2">
              {(() => {
                const panel = PANELS.find(p => p.type === activePanel)
                const Icon = panel?.icon || Globe
                return <Icon className="w-3.5 h-3.5 text-primary" />
              })()}
              <span className="text-xs font-medium">
                {PANELS.find(p => p.type === activePanel)?.title}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1 rounded hover:bg-secondary transition-colors"
                title={isExpanded ? '最小化' : '展开'}
              >
                {isExpanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
              </button>
              <button
                onClick={closePanel}
                className="p-1 rounded hover:bg-secondary transition-colors"
                title="关闭"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* 面板内容 */}
          <div className="flex-1 overflow-hidden">
            <PanelContent type={activePanel} />
          </div>
        </div>
      )}

      {/* 工具栏 */}
      <div className="flex items-center justify-center gap-1 px-3 py-1.5 border-t border-border bg-card flex-shrink-0">
        {PANELS.map(panel => {
          const Icon = panel.icon
          const isActive = activePanel === panel.type
          return (
            <button
              key={panel.type}
              onClick={() => togglePanel(panel.type)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
              title={panel.title}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{panel.title}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// 面板内容渲染
function PanelContent({ type }: { type: PanelType }) {
  switch (type) {
    case 'playwright':
      return <PlaywrightBrowserPanel />
    case 'markdown':
      return <MarkdownPanel />
    case 'code':
      return <CodeEditor className="flex-1" />
    case 'image':
      return <ImagePanel />
    case 'terminal':
      return <TerminalPanel />
    default:
      return null
  }
}

// Markdown文档面板
function MarkdownPanel() {
  const [content, setContent] = useState('# 新建文档\n\n在这里编写内容...')
  const [preview, setPreview] = useState(true)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-secondary/30 flex-shrink-0">
        <span className="text-xs text-muted-foreground">Markdown 编辑器</span>
        <button
          onClick={() => setPreview(!preview)}
          className="text-xs px-2 py-0.5 rounded-md bg-secondary hover:bg-secondary/80 transition-colors"
        >
          {preview ? '编辑' : '预览'}
        </button>
      </div>
      <div className="flex-1 flex overflow-hidden">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className={`${preview ? 'w-1/2' : 'w-full'} h-full p-3 bg-background text-sm font-mono resize-none focus:outline-none border-r border-border`}
          placeholder="在此输入 Markdown 内容..."
        />
        {preview && (
          <div className="w-1/2 h-full p-3 overflow-auto prose prose-sm max-w-none">
            <div className="text-muted-foreground text-sm">
              {content || <span className="opacity-40">预览区域</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// 图片面板
function ImagePanel() {
  const [imageUrl, setImageUrl] = useState('')
  const [inputUrl, setInputUrl] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setImageUrl(inputUrl)
  }

  return (
    <div className="flex flex-col h-full">
      <form onSubmit={handleSubmit} className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-secondary/30 flex-shrink-0">
        <input
          type="text"
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          placeholder="输入图片 URL..."
          className="flex-1 h-7 px-2.5 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
        <button
          type="submit"
          className="px-3 py-1 bg-primary text-primary-foreground rounded-md text-xs hover:bg-primary/90 transition-colors"
        >
          加载
        </button>
      </form>
      <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt="预览"
            className="max-w-full max-h-full object-contain rounded-lg"
            onError={() => setImageUrl('')}
          />
        ) : (
          <div className="text-center text-muted-foreground">
            <Image className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">输入图片 URL 查看</p>
          </div>
        )}
      </div>
    </div>
  )
}

// 终端面板
function TerminalPanel() {
  const [lines, setLines] = useState<string[]>(['OQ助手终端 vQ1.14', '输入命令开始...', ''])
  const [input, setInput] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return

    const newLines = [...lines, `> ${input}`, `命令 "${input}" 已接收（演示模式）`, '']
    setLines(newLines)
    setInput('')
  }

  return (
    <div className="flex flex-col h-full bg-black text-green-400 font-mono text-sm">
      <div className="flex-1 overflow-auto p-3">
        {lines.map((line, i) => (
          <div key={i} className={line.startsWith('>') ? 'text-yellow-400' : ''}>
            {line || <br />}
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="flex items-center gap-2 px-3 py-2 border-t border-border/30 flex-shrink-0">
        <span className="text-yellow-400">{'>'}</span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="flex-1 bg-transparent text-green-400 focus:outline-none font-mono text-sm"
          placeholder="输入命令..."
          autoFocus
        />
      </form>
    </div>
  )
}
