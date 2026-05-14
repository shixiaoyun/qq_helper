import { useState, useEffect, useCallback } from 'react'
import {
  Settings, Save, RefreshCw, Globe, BrainCircuit, Database,
  Terminal, FileText, Zap, AlertTriangle, CheckCircle2,
  UserCheck,
} from 'lucide-react'
import axios from 'axios'
import { useAuthStore } from '../stores/auth.ts'
import SalesCrewConfigPage from './SalesCrewConfig.tsx'

interface ConfigSection {
  title: string
  icon: React.ElementType
  description: string
  configs: ConfigItem[]
}

interface ConfigItem {
  key: string
  label: string
  type: 'string' | 'number' | 'boolean' | 'select' | 'textarea'
  value: any
  defaultValue: any
  options?: { label: string; value: string }[]
  description: string
  min?: number
  max?: number
}

const DEFAULT_CONFIGS: ConfigSection[] = [
  {
    title: '浏览器配置',
    icon: Globe,
    description: 'Playwright浏览器自动化相关配置',
    configs: [
      {
        key: 'browser.headless',
        label: '无头模式',
        type: 'boolean',
        value: true,
        defaultValue: true,
        description: '是否在后台运行浏览器（不显示窗口）',
      },
      {
        key: 'browser.timeout',
        label: '操作超时（毫秒）',
        type: 'number',
        value: 30000,
        defaultValue: 30000,
        min: 5000,
        max: 120000,
        description: '浏览器操作的最大等待时间',
      },
      {
        key: 'browser.viewport',
        label: '视口大小',
        type: 'select',
        value: '1920x1080',
        defaultValue: '1920x1080',
        options: [
          { label: '1920x1080 (桌面)', value: '1920x1080' },
          { label: '1366x768 (笔记本)', value: '1366x768' },
          { label: '1280x720 (小屏)', value: '1280x720' },
          { label: '390x844 (手机)', value: '390x844' },
        ],
        description: '浏览器窗口的默认分辨率',
      },
      {
        key: 'browser.userAgent',
        label: 'User-Agent',
        type: 'string',
        value: '',
        defaultValue: '',
        description: '自定义浏览器User-Agent（留空使用默认）',
      },
    ],
  },
  {
    title: 'Agent配置',
    icon: BrainCircuit,
    description: 'AI Agent智能体相关配置',
    configs: [
      {
        key: 'agent.maxIterations',
        label: '最大迭代次数',
        type: 'number',
        value: 5,
        defaultValue: 5,
        min: 1,
        max: 20,
        description: 'Agent自动工具调用的最大循环次数',
      },
      {
        key: 'agent.maxTokens',
        label: '最大Token数',
        type: 'number',
        value: 2048,
        defaultValue: 2048,
        min: 512,
        max: 8192,
        description: 'Agent每次调用的最大Token限制',
      },
      {
        key: 'agent.temperature',
        label: '温度参数',
        type: 'number',
        value: 0.7,
        defaultValue: 0.7,
        min: 0,
        max: 2,
        description: 'Agent回复的随机性（0-2，越低越确定）',
      },
      {
        key: 'agent.systemPrompt',
        label: '系统提示词',
        type: 'textarea',
        value: '你是OQ助手，一个专业、友好的AI助手。请用中文回答用户的问题。',
        defaultValue: '你是OQ助手，一个专业、友好的AI助手。请用中文回答用户的问题。',
        description: 'Agent的系统角色设定',
      },
    ],
  },
  {
    title: 'RAG配置',
    icon: Database,
    description: '知识库检索增强生成配置',
    configs: [
      {
        key: 'rag.topK',
        label: '检索结果数量',
        type: 'number',
        value: 5,
        defaultValue: 5,
        min: 1,
        max: 20,
        description: '每次检索返回的最相似文档数量',
      },
      {
        key: 'rag.similarityThreshold',
        label: '相似度阈值',
        type: 'number',
        value: 0.7,
        defaultValue: 0.7,
        min: 0,
        max: 1,
        description: '文档匹配的最小相似度（0-1）',
      },
      {
        key: 'rag.chunkSize',
        label: '文档分块大小',
        type: 'number',
        value: 500,
        defaultValue: 500,
        min: 100,
        max: 2000,
        description: '文档切分的字符数',
      },
      {
        key: 'rag.chunkOverlap',
        label: '分块重叠大小',
        type: 'number',
        value: 50,
        defaultValue: 50,
        min: 0,
        max: 200,
        description: '相邻文档块的重叠字符数',
      },
    ],
  },
  {
    title: 'MCP配置',
    icon: Zap,
    description: 'MCP工具协议相关配置',
    configs: [
      {
        key: 'mcp.autoDetect',
        label: '自动工具检测',
        type: 'boolean',
        value: true,
        defaultValue: true,
        description: 'Agent是否自动检测并调用合适的工具',
      },
      {
        key: 'mcp.showToolCalls',
        label: '显示工具调用',
        type: 'boolean',
        value: true,
        defaultValue: true,
        description: '在聊天界面显示工具调用过程',
      },
      {
        key: 'mcp.maxConcurrent',
        label: '最大并发数',
        type: 'number',
        value: 3,
        defaultValue: 3,
        min: 1,
        max: 10,
        description: '同时执行的最大工具数量',
      },
      {
        key: 'mcp.timeout',
        label: '工具超时（毫秒）',
        type: 'number',
        value: 30000,
        defaultValue: 30000,
        min: 5000,
        max: 120000,
        description: '单个工具执行的最大等待时间',
      },
    ],
  },
  {
    title: 'Shell配置',
    icon: Terminal,
    description: 'Shell命令执行安全配置',
    configs: [
      {
        key: 'shell.enabled',
        label: '启用Shell执行',
        type: 'boolean',
        value: true,
        defaultValue: true,
        description: '是否允许执行Shell命令',
      },
      {
        key: 'shell.timeout',
        label: '命令超时（毫秒）',
        type: 'number',
        value: 30000,
        defaultValue: 30000,
        min: 1000,
        max: 300000,
        description: 'Shell命令的最大执行时间',
      },
      {
        key: 'shell.allowedCommands',
        label: '允许的命令',
        type: 'textarea',
        value: 'git,node,npm,python,pip,echo,cat,ls,dir,cd,pwd,mkdir,rm,copy,move',
        defaultValue: 'git,node,npm,python,pip,echo,cat,ls,dir,cd,pwd,mkdir,rm,copy,move',
        description: '允许执行的命令列表（逗号分隔，留空允许所有）',
      },
      {
        key: 'shell.blockedCommands',
        label: '禁止的命令',
        type: 'textarea',
        value: 'rm -rf,format,del /f,shutdown,reboot,mkfs,dd',
        defaultValue: 'rm -rf,format,del /f,shutdown,reboot,mkfs,dd',
        description: '明确禁止执行的命令（逗号分隔）',
      },
    ],
  },
  {
    title: '文件系统配置',
    icon: FileText,
    description: '文件读写操作配置',
    configs: [
      {
        key: 'fs.maxFileSize',
        label: '最大文件大小（MB）',
        type: 'number',
        value: 10,
        defaultValue: 10,
        min: 1,
        max: 100,
        description: '允许读取/写入的最大文件大小',
      },
      {
        key: 'fs.allowedPaths',
        label: '允许的路径',
        type: 'textarea',
        value: '',
        defaultValue: '',
        description: '允许访问的目录路径（逗号分隔，留空允许所有）',
      },
      {
        key: 'fs.blockedPaths',
        label: '禁止的路径',
        type: 'textarea',
        value: 'C:\\Windows,System32,etc/passwd,.env',
        defaultValue: 'C:\\Windows,System32,etc/passwd,.env',
        description: '禁止访问的目录或文件（逗号分隔）',
      },
    ],
  },
  {
    title: '销售教练配置',
    icon: UserCheck,
    description: '销售教练AI Agent与工作流管理',
    configs: [],
  },
]

export default function SystemConfigPage() {
  const [sections, setSections] = useState<ConfigSection[]>(DEFAULT_CONFIGS)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [activeSection, setActiveSection] = useState(0)

  const loadConfigs = useCallback(async () => {
    setLoading(true)
    try {
      const token = useAuthStore.getState().token
      const resp = await axios.get('/api/admin/config', {
        headers: { 'Authorization': `Bearer ${token || ''}` },
      })
      const savedConfigs = resp.data.data

      setSections(prev => prev.map(section => ({
        ...section,
        configs: section.configs.map(config => ({
          ...config,
          value: savedConfigs[config.key] !== undefined ? savedConfigs[config.key] : config.value,
        })),
      })))
    } catch (err: any) {
      console.error('加载配置失败:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadConfigs()
  }, [loadConfigs])

  const updateConfig = (sectionIndex: number, configIndex: number, value: any) => {
    setSections(prev => {
      const newSections = [...prev]
      newSections[sectionIndex].configs[configIndex].value = value
      return newSections
    })
  }

  const saveConfigs = async () => {
    setSaving(true)
    setSaveMessage(null)
    try {
      const configMap: Record<string, any> = {}
      sections.forEach(section => {
        section.configs.forEach(config => {
          configMap[config.key] = config.value
        })
      })

      const token = useAuthStore.getState().token
      await axios.put('/api/admin/config/batch', { configs: configMap }, {
        headers: { 'Authorization': `Bearer ${token || ''}` },
      })
      setSaveMessage({ type: 'success', text: '配置保存成功！' })
    } catch (err: any) {
      setSaveMessage({ type: 'error', text: err.response?.data?.error || '保存失败' })
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMessage(null), 3000)
    }
  }

  const resetToDefault = () => {
    if (!confirm('确定要重置所有配置为默认值吗？')) return
    setSections(prev => prev.map(section => ({
      ...section,
      configs: section.configs.map(config => ({
        ...config,
        value: config.defaultValue,
      })),
    })))
  }

  const renderConfigInput = (sectionIndex: number, config: ConfigItem, configIndex: number) => {
    switch (config.type) {
      case 'boolean':
        return (
          <button
            onClick={() => updateConfig(sectionIndex, configIndex, !config.value)}
            className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
            style={{ backgroundColor: config.value ? 'hsl(var(--primary))' : 'hsl(var(--muted))' }}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                config.value ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        )
      case 'number':
        return (
          <input
            type="number"
            value={config.value}
            onChange={(e) => updateConfig(sectionIndex, configIndex, Number(e.target.value))}
            min={config.min}
            max={config.max}
            className="w-full h-9 px-3 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        )
      case 'select':
        return (
          <select
            value={config.value}
            onChange={(e) => updateConfig(sectionIndex, configIndex, e.target.value)}
            className="w-full h-9 px-3 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            {config.options?.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        )
      case 'textarea':
        return (
          <textarea
            value={config.value}
            onChange={(e) => updateConfig(sectionIndex, configIndex, e.target.value)}
            rows={3}
            className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
          />
        )
      default:
        return (
          <input
            type="text"
            value={config.value}
            onChange={(e) => updateConfig(sectionIndex, configIndex, e.target.value)}
            className="w-full h-9 px-3 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        )
    }
  }

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center">
            <Settings className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">智能体配置</h1>
            <p className="text-sm text-muted-foreground">管理所有系统功能模块的配置参数</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadConfigs}
            disabled={loading}
            className="flex items-center gap-2 px-4 h-9 bg-secondary rounded-lg text-sm hover:bg-secondary/80 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
          <button
            onClick={resetToDefault}
            className="flex items-center gap-2 px-4 h-9 bg-secondary rounded-lg text-sm hover:bg-secondary/80 transition-colors"
          >
            <AlertTriangle className="w-4 h-4" />
            重置默认
          </button>
          <button
            onClick={saveConfigs}
            disabled={saving}
            className="flex items-center gap-2 px-4 h-9 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? '保存中...' : '保存配置'}
          </button>
        </div>
      </div>

      {/* 保存消息 */}
      {saveMessage && (
        <div className={`text-sm p-3 rounded-lg flex items-center gap-2 ${
          saveMessage.type === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
        }`}>
          {saveMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {saveMessage.text}
        </div>
      )}

      <div className="flex gap-6">
        {/* 左侧导航 */}
        <div className="w-64 flex-shrink-0 space-y-1">
          {sections.map((section, index) => {
            const Icon = section.icon
            return (
              <button
                key={section.title}
                onClick={() => setActiveSection(index)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors text-left ${
                  activeSection === index
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                <Icon className="w-4 h-4" />
                {section.title}
              </button>
            )
          })}
        </div>

        {/* 右侧配置内容 */}
        <div className="flex-1 space-y-6">
          {sections.map((section, sectionIndex) => (
            <div
              key={section.title}
              className={`space-y-4 ${activeSection === sectionIndex ? 'block' : 'hidden'}`}
            >
              {sectionIndex === 6 ? (
                <SalesCrewConfigPage />
              ) : (
              <div className="bg-card border border-border rounded-xl p-6 card-hover-glow">
                <div className="flex items-center gap-3 mb-2">
                  <section.icon className="w-5 h-5 text-primary" />
                  <h2 className="text-lg font-bold text-foreground">{section.title}</h2>
                </div>
                <p className="text-sm text-muted-foreground mb-6">{section.description}</p>

                <div className="space-y-5">
                  {section.configs.map((config, configIndex) => (
                    <div key={config.key} className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                      <div>
                        <label className="text-sm font-medium text-foreground block mb-1">
                          {config.label}
                        </label>
                        <p className="text-xs text-muted-foreground">{config.description}</p>
                      </div>
                      <div className="md:pt-0 pt-1">
                        {renderConfigInput(sectionIndex, config, configIndex)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
