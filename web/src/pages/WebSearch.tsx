import { useState, useEffect, useCallback } from 'react'
import {
  Globe, AlertCircle,
  ToggleLeft, ToggleRight, Key, Search, FileText,
} from 'lucide-react'
import axios from 'axios'
import { useAuthStore } from '../stores/auth'

interface SearchTestResult {
  title: string
  url: string
  snippet: string
  siteName?: string
}

export default function WebSearchPage() {
  const { isAdmin } = useAuthStore()
  const [config, setConfig] = useState({
    enabled: true,
    apiUrl: 'https://api.bochaai.com/v1/web-search',
    apiKey: '',
  })
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error'>('success')
  const [testQuery, setTestQuery] = useState('')
  const [testResults, setTestResults] = useState<SearchTestResult[]>([])
  const [testing, setTesting] = useState(false)

  const loadConfig = useCallback(async () => {
    try {
      const resp = await axios.get('/api/admin/niuma-engine/config')
      setConfig({
        enabled: resp.data.data.webSearchEnabled,
        apiUrl: resp.data.data.webSearchApiUrl,
        apiKey: resp.data.data.webSearchApiKey,
      })
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    if (isAdmin) {
      loadConfig()
    }
  }, [isAdmin, loadConfig])

  const showMessage = (msg: string, type: 'success' | 'error') => {
    setMessage(msg)
    setMessageType(type)
    setTimeout(() => setMessage(''), 3000)
  }

  const updateConfig = async (key: string, value: string) => {
    try {
      await axios.put('/api/admin/settings', { key, value })
      showMessage('更新成功', 'success')
      loadConfig()
    } catch (err: any) {
      showMessage(err.response?.data?.error || '更新失败', 'error')
    }
  }

  const handleToggleEnabled = () => {
    updateConfig('web_search_enabled', config.enabled ? '0' : '1')
    setConfig(prev => ({ ...prev, enabled: !prev.enabled }))
  }

  const testSearch = async () => {
    if (!testQuery.trim()) {
      showMessage('请输入测试搜索关键词', 'error')
      return
    }
    if (!config.apiKey) {
      showMessage('请先配置API密钥', 'error')
      return
    }

    setTesting(true)
    setTestResults([])
    try {
      const resp = await axios.post('/api/admin/web-search/test', { query: testQuery })
      setTestResults(resp.data.data || [])
      showMessage(`搜索完成，找到 ${resp.data.data?.length || 0} 条结果`, 'success')
    } catch (err: any) {
      showMessage(err.response?.data?.error || '搜索测试失败', 'error')
    } finally {
      setTesting(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-4">
          <Globe className="w-16 h-16 text-destructive mx-auto" />
          <h2 className="text-xl font-bold text-foreground">权限不足</h2>
          <p className="text-muted-foreground">您没有访问联网搜索管理页面的权限</p>
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
            <Globe className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">联网搜索</h1>
            <p className="text-sm text-muted-foreground">管理联网搜索配置和测试搜索功能</p>
          </div>
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

      {/* 配置卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-5 card-hover-glow">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
              <Globe className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">功能状态</p>
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

        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">API地址</p>
              <p className="text-xs text-muted-foreground font-mono truncate">{config.apiUrl}</p>
            </div>
          </div>
          <input
            type="text"
            defaultValue={config.apiUrl}
            onBlur={e => updateConfig('web_search_api_url', e.target.value)}
            className="w-full h-8 px-3 bg-background border border-input rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>

        <div className="bg-card border border-border rounded-xl p-5 card-hover-glow">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
              <Key className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">API密钥</p>
              <p className="text-xs text-muted-foreground">
                {config.apiKey ? '已配置' : '未配置'}
              </p>
            </div>
          </div>
          <input
            type="password"
            defaultValue={config.apiKey}
            onBlur={e => updateConfig('web_search_api_key', e.target.value)}
            placeholder="输入博查搜索API密钥"
            className="w-full h-8 px-3 bg-background border border-input rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
      </div>

      {/* 搜索测试 */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          <Search className="w-5 h-5 text-primary" />
          <h2 className="font-medium text-foreground">搜索测试</h2>
        </div>

        <div className="flex gap-3">
          <input
            type="text"
            value={testQuery}
            onChange={e => setTestQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && testSearch()}
            placeholder="输入测试搜索关键词..."
            className="flex-1 h-10 px-4 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          <button
            onClick={testSearch}
            disabled={testing || !testQuery.trim()}
            className="flex items-center gap-2 px-4 h-10 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <Search className="w-4 h-4" />
            {testing ? '搜索中...' : '测试搜索'}
          </button>
        </div>

        {testResults.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">搜索结果 ({testResults.length} 条)</p>
            {testResults.map((result, idx) => (
              <div key={idx} className="p-3 bg-secondary/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">[{idx + 1}]</span>
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    {result.title}
                  </a>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{result.siteName || result.url}</p>
                <p className="text-xs text-foreground mt-1">{result.snippet}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 配置说明 */}
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <AlertCircle className="w-4 h-4 text-blue-500" />
          <p className="text-sm font-medium text-blue-500">功能说明</p>
        </div>
        <ul className="text-xs text-muted-foreground space-y-1 ml-5 list-disc">
          <li>联网搜索使用博查搜索API，需要配置有效的API密钥</li>
          <li>在AI对话页面开启「联网」按钮后，AI助手会自动搜索网络信息辅助回答</li>
          <li>搜索内容会作为上下文注入到AI对话中，帮助AI获取最新信息</li>
          <li>API密钥请从博查搜索官网获取：https://bochaai.com</li>
        </ul>
      </div>
    </div>
  )
}
