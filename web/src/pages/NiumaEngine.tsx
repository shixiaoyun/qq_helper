import { useState, useEffect, useCallback } from 'react'
import {
  Cpu, Wifi, WifiOff, RefreshCw, AlertCircle,
  ToggleLeft, ToggleRight, Server, Activity, Wrench,
} from 'lucide-react'
import axios from 'axios'
import { useAuthStore } from '../stores/auth'

interface NiumaHealth {
  status: 'connected' | 'error'
  message: string
  latency?: number
}

interface ToolInfo {
  name: string
  description: string
  parameters: any
}

export default function NiumaEnginePage() {
  const { isAdmin } = useAuthStore()
  const [config, setConfig] = useState({
    url: 'http://localhost:1080',
    enabled: true,
  })
  const [health, setHealth] = useState<NiumaHealth | null>(null)
  const [tools, setTools] = useState<ToolInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error'>('success')
  const [checking, setChecking] = useState(false)

  const loadConfig = useCallback(async () => {
    try {
      const resp = await axios.get('/api/admin/niuma-engine/config')
      setConfig({
        url: resp.data.data.url,
        enabled: resp.data.data.enabled,
      })
    } catch {
      // ignore
    }
  }, [])

  const checkHealth = async () => {
    setChecking(true)
    try {
      const resp = await axios.get('/api/admin/niuma-engine/health')
      setHealth(resp.data.data)
    } catch (err: any) {
      setHealth({
        status: 'error',
        message: err.response?.data?.error || '检测失败',
      })
    } finally {
      setChecking(false)
    }
  }

  const loadTools = async () => {
    setLoading(true)
    try {
      const resp = await axios.get('/api/admin/niuma-engine/tools')
      setTools(resp.data.data || [])
    } catch {
      setTools([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isAdmin) {
      loadConfig()
      checkHealth()
      loadTools()
    }
  }, [isAdmin, loadConfig])

  const showMessage = (msg: string, type: 'success' | 'error') => {
    setMessage(msg)
    setMessageType(type)
    setTimeout(() => setMessage(''), 3000)
  }

  const updateConfig = async (key: string, value: string) => {
    setLoading(true)
    try {
      await axios.put('/api/admin/settings', { key, value })
      showMessage('更新成功', 'success')
      loadConfig()
    } catch (err: any) {
      showMessage(err.response?.data?.error || '更新失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleToggleEnabled = () => {
    updateConfig('niuma_engine_enabled', config.enabled ? '0' : '1')
    setConfig(prev => ({ ...prev, enabled: !prev.enabled }))
  }

  if (!isAdmin) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-4">
          <Cpu className="w-16 h-16 text-destructive mx-auto" />
          <h2 className="text-xl font-bold text-foreground">权限不足</h2>
          <p className="text-muted-foreground">您没有访问牛马AI引擎管理页面的权限</p>
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
            <Cpu className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">牛马AI引擎</h1>
            <p className="text-sm text-muted-foreground">管理牛马AI引擎连接和工具调用</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={checkHealth}
            disabled={checking}
            className="flex items-center gap-2 px-4 h-9 bg-secondary rounded-lg text-sm hover:bg-secondary/80 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
            检测连通性
          </button>
        </div>
      </div>

      {/* 消息提示 */}
      {message && (
        <div className={`text-sm p-3 rounded-lg ${
          messageType === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
        }`}>
          {message}
        </div>
      )}

      {/* 连接状态卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`bg-card border rounded-xl p-5 ${
          health?.status === 'connected' ? 'border-green-500/30' : 'border-border'
        }`}>
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              health?.status === 'connected' ? 'bg-green-500/10' : 'bg-red-500/10'
            }`}>
              {health?.status === 'connected' ? (
                <Wifi className="w-5 h-5 text-green-500" />
              ) : (
                <WifiOff className="w-5 h-5 text-red-500" />
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">连接状态</p>
              <p className={`text-xs ${health?.status === 'connected' ? 'text-green-500' : 'text-red-500'}`}>
                {health?.message || '未检测'}
              </p>
            </div>
          </div>
          {health?.latency && (
            <p className="text-xs text-muted-foreground">延迟: {health.latency}ms</p>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-5 card-hover-glow">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
              <Server className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">服务地址</p>
              <p className="text-xs text-muted-foreground font-mono">{config.url}</p>
            </div>
          </div>
          <input
            type="text"
            defaultValue={config.url}
            onBlur={e => updateConfig('niuma_engine_url', e.target.value)}
            className="w-full h-8 px-3 bg-background border border-input rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
              <Activity className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">工具调用</p>
              <p className="text-xs text-muted-foreground">
                {config.enabled ? '已启用' : '已禁用'}
              </p>
            </div>
          </div>
          <button
            onClick={handleToggleEnabled}
            className={`flex items-center gap-2 px-3 h-8 rounded-lg text-sm transition-colors ${
              config.enabled
                ? 'bg-green-500/10 text-green-500'
                : 'bg-gray-500/10 text-gray-500'
            }`}
          >
            {config.enabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
            {config.enabled ? '已启用' : '已禁用'}
          </button>
        </div>
      </div>

      {/* 可用工具列表 */}
      <div className="bg-card border border-border rounded-xl overflow-hidden card-hover-glow">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Wrench className="w-5 h-5 text-primary" />
            <h2 className="font-medium text-foreground">可用工具</h2>
          </div>
          <button
            onClick={loadTools}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 h-8 bg-secondary rounded-lg text-xs hover:bg-secondary/80 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
        <div className="divide-y divide-border">
          {tools.length === 0 ? (
            <div className="px-5 py-8 text-center text-muted-foreground">
              <Wrench className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">无法获取工具列表，请检查牛马引擎连接</p>
            </div>
          ) : (
            tools.map((tool, idx) => (
              <div key={idx} className="px-5 py-4 hover:bg-secondary/30 transition-colors">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{tool.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded">工具</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{tool.description}</p>
                {tool.parameters && (
                  <div className="mt-2 p-2 bg-secondary/50 rounded-lg">
                    <p className="text-[10px] text-muted-foreground font-mono">
                      {JSON.stringify(tool.parameters, null, 2)}
                    </p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* 配置说明 */}
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <AlertCircle className="w-4 h-4 text-blue-500" />
          <p className="text-sm font-medium text-blue-500">功能说明</p>
        </div>
        <ul className="text-xs text-muted-foreground space-y-1 ml-5 list-disc">
          <li>牛马AI引擎提供企业数据查询、盗版分析等专业工具</li>
          <li>在AI对话页面开启「工具」按钮后，AI助手会自动判断是否需要调用这些工具</li>
          <li>确保牛马引擎服务已启动（默认端口1080）并在此配置正确的服务地址</li>
          <li>工具调用需要AI提供商支持足够长的上下文（建议max_tokens ≥ 4096）</li>
        </ul>
      </div>
    </div>
  )
}
