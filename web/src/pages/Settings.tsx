import { useState, useEffect, useCallback } from 'react'
import {
  Settings, RefreshCw, AlertCircle, CheckCircle2, Trash2, HardDrive, MessageSquare, FolderOpen, Zap, BarChart3,
} from 'lucide-react'
import axios from 'axios'
import { useAuthStore } from '../stores/auth'

interface SystemConfig {
  id: number
  key: string
  value: string
  description: string
  updatedAt: string
}

interface StorageStats {
  conversationCount: number
  messageCount: number
  tokenUsageCount: number
  estimatedBytes: number
  estimatedKB: number
  estimatedMB: number
  storageLimitMB: number
  dailyChatLimit: number
}

export default function SettingsPage() {
  const { isAdmin } = useAuthStore()
  const [configs, setConfigs] = useState<SystemConfig[]>([])
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error'>('success')
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [clearConfirmText, setClearConfirmText] = useState('')

  const loadConfigs = useCallback(async () => {
    if (!isAdmin) return
    setLoading(true)
    try {
      const resp = await axios.get('/api/admin/settings')
      const frameworkConfigs = resp.data.data.filter((c: SystemConfig) =>
        c.key === 'system_name'
      )
      setConfigs(frameworkConfigs)
    } catch (err: any) {
      showMessage(err.response?.data?.error || '加载失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [isAdmin])

  const loadStorageStats = useCallback(async () => {
    try {
      const resp = await axios.get('/api/auth/storage')
      setStorageStats(resp.data.data)
    } catch (err: any) {
      console.error('加载存储统计失败:', err)
    }
  }, [])

  useEffect(() => {
    loadConfigs()
    loadStorageStats()
  }, [loadConfigs, loadStorageStats])

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
      loadConfigs()
    } catch (err: any) {
      showMessage(err.response?.data?.error || '更新失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleClearData = async () => {
    if (clearConfirmText !== 'CLEAR_ALL_MY_DATA') {
      showMessage('确认码不正确', 'error')
      return
    }
    setLoading(true)
    try {
      await axios.post('/api/auth/clear-data', { confirm: 'CLEAR_ALL_MY_DATA' })
      showMessage('已清空所有个人数据', 'success')
      setShowClearConfirm(false)
      setClearConfirmText('')
      loadStorageStats()
    } catch (err: any) {
      showMessage(err.response?.data?.error || '清空失败', 'error')
    } finally {
      setLoading(false)
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
            <h1 className="text-xl font-bold text-foreground">系统设置</h1>
            <p className="text-sm text-muted-foreground">管理系统框架基本配置</p>
          </div>
        </div>
        <button
          onClick={loadConfigs}
          disabled={loading}
          className="flex items-center gap-2 px-4 h-9 bg-secondary rounded-lg text-sm hover:bg-secondary/80 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {/* 消息提示 */}
      {message && (
        <div className={`text-sm p-3 rounded-lg ${
          messageType === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
        }`}>
          {message}
        </div>
      )}

      {/* 框架配置 */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-medium text-foreground">框架配置</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">配置项</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">值</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">描述</th>
              </tr>
            </thead>
            <tbody>
              {configs.map((cfg) => (
                <tr key={cfg.id} className="border-b border-border/50 hover:bg-secondary/50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs">{cfg.key}</td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      defaultValue={cfg.value}
                      onBlur={e => updateConfig(cfg.key, e.target.value)}
                      className="w-full h-8 px-3 bg-background border border-input rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{cfg.description}</td>
                </tr>
              ))}
              {configs.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                    暂无框架配置项
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 我的存储空间 */}
      <div className="bg-card border border-border rounded-xl overflow-hidden card-hover-glow">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-medium text-foreground">我的存储空间</h2>
        </div>
        <div className="p-5">
          {storageStats ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="bg-secondary/30 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <FolderOpen className="w-4 h-4 text-primary" />
                    <span className="text-xs text-muted-foreground">对话数</span>
                  </div>
                  <p className="text-lg font-bold text-foreground">{storageStats.conversationCount}</p>
                </div>
                <div className="bg-secondary/30 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <MessageSquare className="w-4 h-4 text-primary" />
                    <span className="text-xs text-muted-foreground">消息数</span>
                  </div>
                  <p className="text-lg font-bold text-foreground">{storageStats.messageCount}</p>
                </div>
                <div className="bg-secondary/30 rounded-lg p-3 stat-card">
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className="w-4 h-4 text-primary" />
                    <span className="text-xs text-muted-foreground">Token记录</span>
                  </div>
                  <p className="text-lg font-bold text-foreground">{storageStats.tokenUsageCount}</p>
                </div>
              </div>

              {/* 存储配额进度条 */}
              <div className="bg-secondary/30 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-primary" />
                    <span className="text-sm text-muted-foreground">存储空间使用</span>
                  </div>
                  <span className="text-sm font-medium text-foreground">
                    {storageStats.estimatedMB > 1 ? `${storageStats.estimatedMB} MB` : `${storageStats.estimatedKB} KB`} / {storageStats.storageLimitMB} MB
                  </span>
                </div>
                <div className="w-full h-2.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      (storageStats.estimatedMB / storageStats.storageLimitMB) > 0.9 ? 'bg-orange-500' : 'bg-primary'
                    }`}
                    style={{ width: `${Math.min((storageStats.estimatedMB / storageStats.storageLimitMB) * 100, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  超过 {storageStats.storageLimitMB}MB 将自动清理最早的约100MB内容
                </p>
              </div>

              {/* 每日对话配额 */}
              <div className="bg-secondary/30 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-primary" />
                    <span className="text-sm text-muted-foreground">每日对话配额</span>
                  </div>
                  <span className="text-sm font-medium text-foreground">
                    上限 {storageStats.dailyChatLimit} 次/天
                  </span>
                </div>
              </div>

              {!showClearConfirm ? (
                <button
                  onClick={() => setShowClearConfirm(true)}
                  className="flex items-center gap-2 px-4 h-9 bg-destructive/10 text-destructive rounded-lg text-sm hover:bg-destructive/20 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  清空所有个人数据
                </button>
              ) : (
                <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4 space-y-3">
                  <p className="text-sm text-destructive font-medium">⚠️ 此操作不可恢复！</p>
                  <p className="text-xs text-muted-foreground">
                    请输入 <code className="bg-background px-1 py-0.5 rounded text-destructive">CLEAR_ALL_MY_DATA</code> 确认清空所有聊天记录和数据
                  </p>
                  <input
                    type="text"
                    value={clearConfirmText}
                    onChange={(e) => setClearConfirmText(e.target.value)}
                    placeholder="输入确认码"
                    className="w-full h-9 px-3 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-destructive/20 focus:border-destructive"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleClearData}
                      disabled={loading}
                      className="px-4 h-9 bg-destructive text-destructive-foreground rounded-lg text-sm hover:bg-destructive/90 transition-colors disabled:opacity-50"
                    >
                      {loading ? '清空中...' : '确认清空'}
                    </button>
                    <button
                      onClick={() => { setShowClearConfirm(false); setClearConfirmText('') }}
                      className="px-4 h-9 bg-secondary rounded-lg text-sm hover:bg-secondary/80 transition-colors"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-4">加载中...</div>
          )}
        </div>
      </div>

      {/* 配置说明 */}
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <AlertCircle className="w-4 h-4 text-blue-500" />
          <p className="text-sm font-medium text-blue-500">配置说明</p>
        </div>
        <ul className="text-xs text-muted-foreground space-y-1 ml-5 list-disc">
          <li>系统设置仅管理OQ助手框架本身的基本配置</li>
          <li>牛马AI引擎配置请前往「牛马引擎」菜单</li>
          <li>联网搜索配置请前往「联网搜索」菜单</li>
          <li>AI模型配置请前往「模型配置」菜单</li>
        </ul>
      </div>

      {/* 功能完善状态 */}
      <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle2 className="w-4 h-4 text-green-500" />
          <p className="text-sm font-medium text-green-500">已完成功能</p>
        </div>
        <div className="space-y-3">
          <div className="p-3 bg-background rounded-lg border border-green-200/50">
            <p className="text-xs font-medium text-foreground mb-1">多模态支持（图片/语音）</p>
            <p className="text-[10px] text-green-600">已实现以下功能：</p>
            <ul className="text-[10px] text-muted-foreground mt-1 ml-4 list-disc space-y-0.5">
              <li>图片上传与预览（支持多图，点击输入框旁的图片图标）</li>
              <li>语音输入（点击麦克风按钮录音，自动转文字）</li>
              <li>语音输出（TTS朗读，点击消息旁音量图标）</li>
              <li>图片随消息一起发送给AI（base64编码传输）</li>
            </ul>
          </div>
          <div className="p-3 bg-background rounded-lg border border-green-200/50">
            <p className="text-xs font-medium text-foreground mb-1">高级安全功能</p>
            <p className="text-[10px] text-green-600">已实现以下功能：</p>
            <ul className="text-[10px] text-muted-foreground mt-1 ml-4 list-disc space-y-0.5">
              <li>对话内容敏感词过滤（7大类别敏感词库，自动拦截并记录审计）</li>
              <li>API 速率限制（IP级别60次/分钟，用户级别100次/分钟）</li>
              <li>操作审计日志（记录所有聊天、管理操作到控制台）</li>
              <li>数据加密存储（AES-256-GCM加密敏感字段）</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
