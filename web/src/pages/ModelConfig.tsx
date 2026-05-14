import { useState, useEffect, useCallback } from 'react'
import {
  Server, Plus, Trash2, Edit3, Check, X, RefreshCw,
  Loader2, ToggleLeft, ToggleRight, Wifi, WifiOff, Zap,
  Star, ChevronDown, ChevronUp, AlertCircle,
} from 'lucide-react'
import axios from 'axios'
import { useAuthStore } from '../stores/auth'

interface AIProvider {
  id: number
  name: string
  provider: 'ollama' | 'dashscope' | 'openai' | 'custom' | 'deepseek'
  baseUrl: string
  apiKey: string
  model: string
  models: string[]
  isActive: number
  isDefault: number
  temperature: number
  maxTokens: number
  timeout: number
  wakeWord: string
  createdAt: string
  updatedAt: string
}

interface ProviderHealth {
  provider: string
  status: 'connected' | 'error' | 'checking'
  message: string
  models?: string[]
  latency?: number
}

const PROVIDER_TYPES = [
  { value: 'ollama' as const, label: 'Ollama', desc: '本地大模型推理服务' },
  { value: 'dashscope' as const, label: '阿里云百炼', desc: '阿里云大模型服务平台' },
  { value: 'deepseek' as const, label: 'DeepSeek', desc: 'DeepSeek深度求索大模型' },
  { value: 'openai' as const, label: 'OpenAI', desc: 'OpenAI官方API' },
  { value: 'custom' as const, label: '自定义OpenAI兼容', desc: '其他OpenAI兼容API' },
]

const PRESET_MODELS: Record<string, string[]> = {
  ollama: ['deepseek-r1:7b', 'qwen2.5', 'llama3.1', 'gemma2', 'mistral'],
  dashscope: [
    'qwen-max',
    'qwen-plus',
    'qwen-turbo',
    'qwen3-max',
    'qwen3-plus',
    'qwen3-turbo',
    'qwen-max-2025-01-25',
    'qwen-plus-2025-01-25',
    'qwen-turbo-2025-01-25',
    'qwen2.5-72b-instruct',
    'qwen2.5-32b-instruct',
    'qwen2.5-14b-instruct',
    'qwen2.5-7b-instruct',
    'qwen-coder-plus',
    'qwen-coder-turbo',
    'qwen2.5-coder-32b-instruct',
    'qwen-vl-max',
    'qwen-vl-plus',
    'qwen2.5-vl-72b-instruct',
    'qwen-omni-turbo',
    'qwen-long',
    'deepseek-r1',
    'deepseek-v3',
    'deepseek-r1-0528',
    'deepseek-v3-0324',
    'llama3.1-405b-instruct',
    'llama3.1-70b-instruct',
    'llama3.3-70b-instruct',
  ],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o3-mini', 'o1', 'o1-mini'],
  deepseek: ['deepseek-v4-pro', 'deepseek-v4-flash'],
  custom: ['custom-model'],
}

const DEFAULT_CONFIGS: Record<string, { baseUrl: string; model: string }> = {
  ollama: { baseUrl: 'http://localhost:11434', model: 'deepseek-r1:7b' },
  dashscope: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-max' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o' },
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-v4-pro' },
  custom: { baseUrl: '', model: '' },
}

export default function ModelConfigPage() {
  const { isAdmin } = useAuthStore()
  const [providers, setProviders] = useState<AIProvider[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [loadingForm, setLoadingForm] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error'>('success')
  const [healthStatus, setHealthStatus] = useState<Record<number, ProviderHealth>>({})
  const [checkingHealth, setCheckingHealth] = useState<Record<number, boolean>>({})
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [editingProvider, setEditingProvider] = useState<AIProvider | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    provider: 'ollama' as 'ollama' | 'dashscope' | 'openai' | 'custom' | 'deepseek',
    baseUrl: '',
    apiKey: '',
    model: '',
    models: [] as string[],
    isActive: 1,
    isDefault: 0,
    temperature: 0.7,
    maxTokens: 2048,
    timeout: 30000,
    wakeWord: '小牛',
  })

  const loadProviders = useCallback(async () => {
    setLoadingList(true)
    try {
      const resp = await axios.get('/api/admin/ai-providers')
      setProviders(resp.data.data)
    } catch (err: any) {
      showMessage(err.response?.data?.error || '加载失败', 'error')
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => {
    if (isAdmin) {
      loadProviders()
    }
  }, [loadProviders, isAdmin])

  const showMessage = (msg: string, type: 'success' | 'error') => {
    setMessage(msg)
    setMessageType(type)
    setTimeout(() => setMessage(''), 3000)
  }

  const checkHealth = async (provider: AIProvider) => {
    setCheckingHealth(prev => ({ ...prev, [provider.id]: true }))
    try {
      const resp = await axios.post('/api/admin/ai-providers/health', { id: provider.id })
      setHealthStatus(prev => ({ ...prev, [provider.id]: resp.data.data }))
    } catch (err: any) {
      setHealthStatus(prev => ({
        ...prev,
        [provider.id]: {
          provider: provider.provider,
          status: 'error',
          message: err.response?.data?.error || '检测失败',
        },
      }))
    } finally {
      setCheckingHealth(prev => ({ ...prev, [provider.id]: false }))
    }
  }

  const checkAllHealth = async () => {
    for (const provider of providers) {
      if (provider.isActive) {
        await checkHealth(provider)
      }
    }
  }

  const handleCreate = async () => {
    if (!formData.name || !formData.baseUrl || !formData.model) {
      showMessage('名称、服务地址和模型不能为空', 'error')
      return
    }

    setLoadingForm(true)
    try {
      await axios.post('/api/admin/ai-providers', formData)
      showMessage('创建成功', 'success')
      setShowForm(false)
      resetForm()
      loadProviders()
    } catch (err: any) {
      showMessage(err.response?.data?.error || '创建失败', 'error')
    } finally {
      setLoadingForm(false)
    }
  }

  const handleUpdate = async () => {
    if (!editingProvider) return

    setLoadingForm(true)
    try {
      await axios.put('/api/admin/ai-providers', {
        id: editingProvider.id,
        ...formData,
      })
      showMessage('更新成功', 'success')
      setShowForm(false)
      setEditingProvider(null)
      resetForm()
      loadProviders()
    } catch (err: any) {
      showMessage(err.response?.data?.error || '更新失败', 'error')
    } finally {
      setLoadingForm(false)
    }
  }

  const handleDelete = async (provider: AIProvider) => {
    if (!confirm(`确定要删除提供商 "${provider.name}" 吗？`)) return

    setLoadingForm(true)
    try {
      await axios.delete(`/api/admin/ai-providers?id=${provider.id}`)
      showMessage('删除成功', 'success')
      loadProviders()
    } catch (err: any) {
      showMessage(err.response?.data?.error || '删除失败', 'error')
    } finally {
      setLoadingForm(false)
    }
  }

  const handleToggleActive = async (provider: AIProvider) => {
    setLoadingForm(true)
    try {
      await axios.put('/api/admin/ai-providers', {
        id: provider.id,
        isActive: provider.isActive ? 0 : 1,
      })
      showMessage(provider.isActive ? '已禁用' : '已启用', 'success')
      loadProviders()
    } catch (err: any) {
      showMessage(err.response?.data?.error || '操作失败', 'error')
    } finally {
      setLoadingForm(false)
    }
  }

  const handleSetDefault = async (provider: AIProvider) => {
    if (provider.isDefault) return
    setLoadingForm(true)
    try {
      await axios.put('/api/admin/ai-providers', {
        id: provider.id,
        isDefault: 1,
      })
      showMessage('已设为默认', 'success')
      loadProviders()
    } catch (err: any) {
      showMessage(err.response?.data?.error || '操作失败', 'error')
    } finally {
      setLoadingForm(false)
    }
  }

  const startEdit = (provider: AIProvider) => {
    setEditingProvider(provider)
    setFormData({
      name: provider.name,
      provider: provider.provider,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey.includes('•') ? '' : provider.apiKey,
      model: provider.model,
      models: provider.models || [],
      isActive: provider.isActive,
      isDefault: provider.isDefault,
      temperature: provider.temperature,
      maxTokens: provider.maxTokens,
      timeout: provider.timeout,
      wakeWord: provider.wakeWord,
    })
    setShowForm(true)
  }

  const startCreate = () => {
    setEditingProvider(null)
    resetForm()
    setShowForm(true)
  }

  const resetForm = () => {
    setFormData({
      name: '',
      provider: 'ollama',
      baseUrl: DEFAULT_CONFIGS.ollama.baseUrl,
      apiKey: '',
      model: DEFAULT_CONFIGS.ollama.model,
      models: PRESET_MODELS.ollama,
      isActive: 1,
      isDefault: 0,
      temperature: 0.7,
      maxTokens: 2048,
      timeout: 30000,
      wakeWord: '小牛',
    })
  }

  const onProviderTypeChange = (type: 'ollama' | 'dashscope' | 'openai' | 'custom' | 'deepseek') => {
    const defaults = DEFAULT_CONFIGS[type]
    setFormData(prev => ({
      ...prev,
      provider: type,
      baseUrl: defaults.baseUrl,
      model: defaults.model,
      models: PRESET_MODELS[type] || [],
    }))
  }

  const getProviderTypeLabel = (type: string) => {
    return PROVIDER_TYPES.find(p => p.value === type)?.label || type
  }

  const getHealthBadge = (providerId: number) => {
    const health = healthStatus[providerId]
    const checking = checkingHealth[providerId]

    if (checking) {
      return (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          检测中...
        </span>
      )
    }

    if (!health) {
      return (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <WifiOff className="w-3 h-3" />
          未检测
        </span>
      )
    }

    if (health.status === 'connected') {
      return (
        <span className="flex items-center gap-1 text-xs text-green-500">
          <Wifi className="w-3 h-3" />
          {health.message} ({health.latency}ms)
        </span>
      )
    }

    return (
      <span className="flex items-center gap-1 text-xs text-red-500">
        <WifiOff className="w-3 h-3" />
        {health.message}
      </span>
    )
  }

  if (!isAdmin) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-4">
          <Server className="w-16 h-16 text-destructive mx-auto" />
          <h2 className="text-xl font-bold text-foreground">权限不足</h2>
          <p className="text-muted-foreground">您没有访问AI提供商配置页面的权限</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center">
            <Server className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">AI提供商配置</h1>
            <p className="text-sm text-muted-foreground">管理多个AI服务提供商，支持Ollama、阿里云百炼、OpenAI等</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={checkAllHealth}
            disabled={loadingList}
            className="flex items-center gap-2 px-4 h-9 bg-secondary rounded-lg text-sm hover:bg-secondary/80 transition-colors disabled:opacity-50"
          >
            <Zap className="w-4 h-4" />
            全部检测
          </button>
          <button
            onClick={loadProviders}
            disabled={loadingList}
            className="flex items-center gap-2 px-4 h-9 bg-secondary rounded-lg text-sm hover:bg-secondary/80 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loadingList ? 'animate-spin' : ''}`} />
            刷新
          </button>
          <button
            onClick={startCreate}
            className="flex items-center gap-2 px-4 h-9 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            添加提供商
          </button>
        </div>
      </div>

      {/* 消息提示 */}
      {message && (
        <div className={`text-sm p-3 rounded-lg flex items-center justify-between ${
          messageType === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
        }`}>
          {message}
          <button onClick={() => setMessage('')} className="hover:opacity-70">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 表单 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setShowForm(false); setEditingProvider(null); resetForm(); }}>
          <div className="bg-card border border-border rounded-xl p-5 space-y-5 w-full max-w-2xl mx-4 modal-content-enter max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <h2 className="font-medium text-foreground">
            {editingProvider ? '编辑提供商' : '添加新提供商'}
          </h2>

          {/* 提供商类型选择 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {PROVIDER_TYPES.map(type => (
              <button
                key={type.value}
                onClick={() => onProviderTypeChange(type.value)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  formData.provider === type.value
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                    : 'border-border hover:border-primary/50 hover:bg-secondary/50'
                }`}
              >
                <p className="font-medium text-sm text-foreground">{type.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{type.desc}</p>
              </button>
            ))}
          </div>

          {/* 配置表单 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted-foreground mb-1.5 block">名称 *</label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="如: 阿里云百炼"
                className="w-full h-10 px-4 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1.5 block">模型 *</label>
              <div className="flex gap-2">
                <select
                  value={formData.model}
                  onChange={e => setFormData(prev => ({ ...prev, model: e.target.value }))}
                  className="flex-1 h-10 px-4 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  {formData.models.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={formData.model}
                  onChange={e => setFormData(prev => ({ ...prev, model: e.target.value }))}
                  placeholder="或自定义模型名"
                  className="flex-1 h-10 px-4 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">可从下拉列表选择预设模型，或直接输入自定义模型名称</p>
            </div>
            <div className="md:col-span-2">
              <label className="text-sm text-muted-foreground mb-1.5 block">服务地址 *</label>
              <input
                type="text"
                value={formData.baseUrl}
                onChange={e => setFormData(prev => ({ ...prev, baseUrl: e.target.value }))}
                placeholder="https://..."
                className="w-full h-10 px-4 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm text-muted-foreground mb-1.5 block">
                API密钥 {formData.provider !== 'ollama' && '*'}
                {editingProvider && editingProvider.apiKey && editingProvider.apiKey.includes('•') && (
                  <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-green-500/10 text-green-500 rounded">已配置</span>
                )}
              </label>
              <input
                type="password"
                value={formData.apiKey}
                onChange={e => setFormData(prev => ({ ...prev, apiKey: e.target.value }))}
                placeholder={
                  editingProvider && editingProvider.apiKey && editingProvider.apiKey.includes('•')
                    ? '已配置密钥，输入新密钥可替换，留空保持原密钥'
                    : formData.provider === 'ollama'
                      ? '本地服务无需密钥'
                      : 'sk-...'
                }
                className="w-full h-10 px-4 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
              {editingProvider && editingProvider.apiKey && editingProvider.apiKey.includes('•') && (
                <p className="text-xs text-muted-foreground mt-1">
                  当前密钥已保存（末尾{editingProvider.apiKey.replace(/•/g, '').length}位），留空保持原密钥不变
                </p>
              )}
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1.5 block">温度 (Temperature) ({formData.temperature})</label>
              <input
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={formData.temperature}
                onChange={e => setFormData(prev => ({ ...prev, temperature: Number(e.target.value) }))}
                className="w-full"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1.5 block">最大Token数</label>
              <input
                type="number"
                value={formData.maxTokens}
                onChange={e => setFormData(prev => ({ ...prev, maxTokens: Number(e.target.value) }))}
                className="w-full h-10 px-4 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1.5 block">超时时间 (毫秒)</label>
              <input
                type="number"
                value={formData.timeout}
                onChange={e => setFormData(prev => ({ ...prev, timeout: Number(e.target.value) }))}
                className="w-full h-10 px-4 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1.5 block">唤醒词</label>
              <input
                type="text"
                value={formData.wakeWord}
                onChange={e => setFormData(prev => ({ ...prev, wakeWord: e.target.value }))}
                placeholder="小牛"
                className="w-full h-10 px-4 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
              <p className="text-xs text-muted-foreground mt-1">消息以唤醒词开头时调用系统工具，否则直接对话</p>
            </div>
            <div className="md:col-span-2 flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isDefault === 1}
                  onChange={e => setFormData(prev => ({ ...prev, isDefault: e.target.checked ? 1 : 0 }))}
                  className="w-4 h-4 rounded border-border"
                />
                <span className="text-sm text-foreground">设为默认</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isActive === 1}
                  onChange={e => setFormData(prev => ({ ...prev, isActive: e.target.checked ? 1 : 0 }))}
                  className="w-4 h-4 rounded border-border"
                />
                <span className="text-sm text-foreground">启用</span>
              </label>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={editingProvider ? handleUpdate : handleCreate}
              disabled={loadingForm}
              className="flex items-center gap-2 px-4 h-9 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              {editingProvider ? '保存修改' : '创建'}
            </button>
            <button
              onClick={() => { setShowForm(false); setEditingProvider(null); resetForm(); }}
              className="flex items-center gap-2 px-4 h-9 bg-secondary rounded-lg text-sm hover:bg-secondary/80 transition-colors"
            >
              <X className="w-4 h-4" />
              取消
            </button>
          </div>
          </div>
        </div>
      )}

      {/* 提供商列表 */}
      <div className="space-y-3">
        {providers.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
            <Server className="w-8 h-8 mx-auto mb-2 opacity-50" />
            暂无AI提供商配置
          </div>
        ) : (
          providers.map((provider) => (
            <div
              key={provider.id}
              className={`bg-card border rounded-xl overflow-hidden transition-all card-hover-glow ${
                provider.isActive ? 'border-border' : 'border-border/50 opacity-60'
              }`}
            >
              {/* 头部行 */}
              <div className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-4">
                  <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Server className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-foreground">{provider.name}</h3>
                      {provider.isDefault === 1 && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded">默认</span>
                      )}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        provider.isActive ? 'bg-green-500/10 text-green-500' : 'bg-gray-500/10 text-gray-500'
                      }`}>
                        {provider.isActive ? '启用' : '禁用'}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {getProviderTypeLabel(provider.provider)} · {provider.model}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {/* 连通性状态 */}
                  <div className="mr-3 hidden md:block">
                    {getHealthBadge(provider.id)}
                  </div>

                  {/* 检测按钮 */}
                  <button
                    onClick={() => checkHealth(provider)}
                    disabled={checkingHealth[provider.id]}
                    className="p-2 rounded-lg hover:bg-secondary transition-colors disabled:opacity-50"
                    title="检测连通性"
                  >
                    <Zap className="w-4 h-4 text-muted-foreground" />
                  </button>

                  {/* 设为默认 */}
                  {provider.isActive && provider.isDefault !== 1 && (
                    <button
                      onClick={() => handleSetDefault(provider)}
                      className="p-2 rounded-lg hover:bg-secondary transition-colors"
                      title="设为默认"
                    >
                      <Star className="w-4 h-4 text-muted-foreground" />
                    </button>
                  )}

                  {/* 启用/禁用 */}
                  <button
                    onClick={() => handleToggleActive(provider)}
                    className="p-2 rounded-lg hover:bg-secondary transition-colors"
                    title={provider.isActive ? '禁用' : '启用'}
                  >
                    {provider.isActive ? (
                      <ToggleRight className="w-4 h-4 text-green-500" />
                    ) : (
                      <ToggleLeft className="w-4 h-4 text-gray-500" />
                    )}
                  </button>

                  {/* 编辑 */}
                  <button
                    onClick={() => startEdit(provider)}
                    className="p-2 rounded-lg hover:bg-secondary transition-colors"
                    title="编辑"
                  >
                    <Edit3 className="w-4 h-4 text-muted-foreground" />
                  </button>

                  {/* 删除 */}
                  <button
                    onClick={() => handleDelete(provider)}
                    className="p-2 rounded-lg hover:bg-red-500/10 transition-colors"
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>

                  {/* 展开/收起 */}
                  <button
                    onClick={() => setExpandedId(expandedId === provider.id ? null : provider.id)}
                    className="p-2 rounded-lg hover:bg-secondary transition-colors"
                  >
                    {expandedId === provider.id ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                </div>
              </div>

              {/* 展开详情 */}
              {expandedId === provider.id && (
                <div className="px-5 pb-4 border-t border-border/50 pt-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs mb-1">服务地址</p>
                      <p className="text-foreground font-mono text-xs truncate">{provider.baseUrl}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs mb-1">API密钥</p>
                      <p className="text-foreground font-mono text-xs">{provider.apiKey || '无'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs mb-1">温度 / 最大Token</p>
                      <p className="text-foreground">{provider.temperature} / {provider.maxTokens}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs mb-1">超时 / 唤醒词</p>
                      <p className="text-foreground">{provider.timeout}ms / {provider.wakeWord}</p>
                    </div>
                  </div>

                  {/* 健康状态详情 */}
                  {healthStatus[provider.id] && (
                    <div className="mt-3 p-3 bg-secondary/50 rounded-lg">
                      <div className="flex items-center gap-2 text-xs">
                        {healthStatus[provider.id]?.status === 'connected' ? (
                          <Wifi className="w-4 h-4 text-green-500" />
                        ) : (
                          <WifiOff className="w-4 h-4 text-red-500" />
                        )}
                        <span className={healthStatus[provider.id]?.status === 'connected' ? 'text-green-500' : 'text-red-500'}>
                          {healthStatus[provider.id]?.message}
                        </span>
                        {healthStatus[provider.id]?.latency && (
                          <span className="text-muted-foreground">({healthStatus[provider.id]?.latency}ms)</span>
                        )}
                      </div>
                      {healthStatus[provider.id]?.models && healthStatus[provider.id]!.models!.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {healthStatus[provider.id]!.models!.map(m => (
                            <span key={m} className="text-[10px] px-1.5 py-0.5 bg-background rounded border border-border">{m}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* 配置说明 */}
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <AlertCircle className="w-4 h-4 text-blue-500" />
          <p className="text-sm font-medium text-blue-500">配置说明</p>
        </div>
        <ol className="text-xs text-muted-foreground space-y-1 ml-5 list-decimal">
          <li><strong>Ollama</strong>：本地运行，无需API密钥，适合内网环境</li>
          <li><strong>阿里云百炼</strong>：需要阿里云账号和API Key，支持qwen系列模型</li>
          <li><strong>OpenAI</strong>：需要OpenAI API Key，支持GPT系列模型</li>
          <li><strong>自定义</strong>：支持任何OpenAI兼容格式的API服务</li>
          <li>默认提供商将用于AI助手的默认对话，可随时在聊天界面切换</li>
        </ol>
      </div>
    </div>
  )
}
