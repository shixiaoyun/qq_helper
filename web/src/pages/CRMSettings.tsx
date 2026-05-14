import { useState, useEffect, useCallback } from 'react'
import {
  Settings, RefreshCw, X, ToggleLeft, ToggleRight,
  Zap, Link, Clock, Shield, AlertCircle, Save, Server,
} from 'lucide-react'
import axios from 'axios'
import { useAuthStore } from '../stores/auth'

interface CRMSettingsData {
  enabled: boolean
  aiSyncEnabled: boolean
  aiSyncInterval: number
  yikeEnabled: boolean
  yikeUrl: string
  yikeApiKey: string
  defaultReminderTime: number
  reminderUnit: 'minutes' | 'hours' | 'days'
}

const DEFAULT_SETTINGS: CRMSettingsData = {
  enabled: true,
  aiSyncEnabled: false,
  aiSyncInterval: 30,
  yikeEnabled: false,
  yikeUrl: '',
  yikeApiKey: '',
  defaultReminderTime: 24,
  reminderUnit: 'hours',
}

export default function CRMSettingsPage() {
  const { isAdmin } = useAuthStore()
  const [settings, setSettings] = useState<CRMSettingsData>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error'>('success')
  const [showApiKey, setShowApiKey] = useState(false)

  const loadSettings = useCallback(async () => {
    if (!isAdmin) return
    setLoading(true)
    try {
      const resp = await axios.get('/api/crm/settings')
      if (resp.data.data) {
        setSettings({
          ...DEFAULT_SETTINGS,
          ...resp.data.data,
        })
      }
    } catch (err: any) {
      showMessage(err.response?.data?.error || '加载设置失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [isAdmin])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const showMessage = (msg: string, type: 'success' | 'error') => {
    setMessage(msg)
    setMessageType(type)
    setTimeout(() => setMessage(''), 3000)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await axios.put('/api/crm/settings', settings)
      showMessage('保存成功', 'success')
    } catch (err: any) {
      showMessage(err.response?.data?.error || '保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  const updateSetting = <K extends keyof CRMSettingsData>(
    key: K,
    value: CRMSettingsData[K]
  ) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  if (!isAdmin) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-4">
          <Shield className="w-16 h-16 text-destructive mx-auto" />
          <h2 className="text-xl font-bold text-foreground">权限不足</h2>
          <p className="text-muted-foreground">您没有访问CRM设置页面的权限</p>
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
            <Settings className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">CRM设置</h1>
            <p className="text-sm text-muted-foreground">配置CRM功能、同步和集成选项</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadSettings}
            disabled={loading}
            className="flex items-center gap-2 px-4 h-9 bg-secondary rounded-lg text-sm hover:bg-secondary/80 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 h-9 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 btn-ripple"
          >
            <Save className="w-4 h-4" />
            {saving ? '保存中...' : '保存设置'}
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

      {/* 功能开关 */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-medium text-foreground">功能开关</h2>
          <p className="text-xs text-muted-foreground mt-1">启用或禁用CRM相关功能模块</p>
        </div>
        <div className="p-5 space-y-4">
          {/* CRM总开关 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center">
                <Settings className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">CRM功能</p>
                <p className="text-xs text-muted-foreground">启用CRM客户管理功能</p>
              </div>
            </div>
            <button
              onClick={() => updateSetting('enabled', !settings.enabled)}
              className="transition-colors"
            >
              {settings.enabled ? (
                <ToggleRight className="w-8 h-8 text-green-500" />
              ) : (
                <ToggleLeft className="w-8 h-8 text-muted-foreground" />
              )}
            </button>
          </div>

          <div className="border-t border-border/50" />

          {/* 牛马AI引擎同步 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-purple-500/10 rounded-lg flex items-center justify-center">
                <Zap className="w-4 h-4 text-purple-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">牛马AI引擎同步</p>
                <p className="text-xs text-muted-foreground">自动将客户数据同步到牛马AI引擎进行分析</p>
              </div>
            </div>
            <button
              onClick={() => updateSetting('aiSyncEnabled', !settings.aiSyncEnabled)}
              className="transition-colors"
            >
              {settings.aiSyncEnabled ? (
                <ToggleRight className="w-8 h-8 text-green-500" />
              ) : (
                <ToggleLeft className="w-8 h-8 text-muted-foreground" />
              )}
            </button>
          </div>

          {settings.aiSyncEnabled && (
            <div className="bg-secondary/30 rounded-lg p-4 ml-12">
              <label className="text-sm text-muted-foreground mb-1.5 block">
                同步间隔（分钟）
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={5}
                  max={120}
                  step={5}
                  value={settings.aiSyncInterval}
                  onChange={(e) => updateSetting('aiSyncInterval', Number(e.target.value))}
                  className="flex-1 h-2 bg-secondary rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-sm font-medium text-foreground w-16 text-right">
                  {settings.aiSyncInterval} 分钟
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                设置数据同步到牛马AI引擎的时间间隔，建议设置为 30 分钟
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 易客CRM集成配置 */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-medium text-foreground">易客CRM集成配置</h2>
          <p className="text-xs text-muted-foreground mt-1">配置与易客CRM系统的对接参数</p>
        </div>
        <div className="p-5 space-y-4">
          {/* 易客CRM开关 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-500/10 rounded-lg flex items-center justify-center">
                <Link className="w-4 h-4 text-blue-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">启用易客CRM集成</p>
                <p className="text-xs text-muted-foreground">将客户数据同步到易客CRM系统</p>
              </div>
            </div>
            <button
              onClick={() => updateSetting('yikeEnabled', !settings.yikeEnabled)}
              className="transition-colors"
            >
              {settings.yikeEnabled ? (
                <ToggleRight className="w-8 h-8 text-green-500" />
              ) : (
                <ToggleLeft className="w-8 h-8 text-muted-foreground" />
              )}
            </button>
          </div>

          {settings.yikeEnabled && (
            <div className="space-y-4 ml-12">
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">
                  易客CRM API地址
                </label>
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-muted-foreground" />
                  <input
                    type="url"
                    value={settings.yikeUrl}
                    onChange={(e) => updateSetting('yikeUrl', e.target.value)}
                    placeholder="https://api.yikecrm.com/v1"
                    className="flex-1 h-10 px-4 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  易客CRM系统的API基础地址
                </p>
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">
                  API Key
                </label>
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-muted-foreground" />
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={settings.yikeApiKey}
                    onChange={(e) => updateSetting('yikeApiKey', e.target.value)}
                    placeholder="输入易客CRM API Key"
                    className="flex-1 h-10 px-4 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                  <button
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="px-3 h-10 bg-secondary rounded-lg text-xs hover:bg-secondary/80 transition-colors"
                  >
                    {showApiKey ? '隐藏' : '显示'}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  用于身份验证的API密钥，请妥善保管
                </p>
              </div>

              {/* 连接测试 */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={async () => {
                    if (!settings.yikeUrl || !settings.yikeApiKey) {
                      showMessage('请先填写API地址和API Key', 'error')
                      return
                    }
                    setLoading(true)
                    try {
                      await axios.post('/api/crm/settings/test-yike', {
                        url: settings.yikeUrl,
                        apiKey: settings.yikeApiKey,
                      })
                      showMessage('连接测试成功', 'success')
                    } catch (err: any) {
                      showMessage(err.response?.data?.error || '连接测试失败', 'error')
                    } finally {
                      setLoading(false)
                    }
                  }}
                  disabled={loading}
                  className="flex items-center gap-2 px-4 h-9 bg-blue-500/10 text-blue-500 rounded-lg text-sm hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                >
                  <Zap className="w-4 h-4" />
                  {loading ? '测试中...' : '测试连接'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 默认跟进提醒时间 */}
      <div className="bg-card border border-border rounded-xl overflow-hidden card-hover-glow">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-medium text-foreground">跟进提醒设置</h2>
          <p className="text-xs text-muted-foreground mt-1">配置默认的跟进提醒时间</p>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-orange-500/10 rounded-lg flex items-center justify-center">
              <Clock className="w-4 h-4 text-orange-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">默认跟进提醒时间</p>
              <p className="text-xs text-muted-foreground">新增跟进记录时的默认提醒间隔</p>
            </div>
          </div>

          <div className="bg-secondary/30 rounded-lg p-4 ml-12">
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1}
                max={999}
                value={settings.defaultReminderTime}
                onChange={(e) => updateSetting('defaultReminderTime', Number(e.target.value))}
                className="w-24 h-10 px-4 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-center"
              />
              <select
                value={settings.reminderUnit}
                onChange={(e) => updateSetting('reminderUnit', e.target.value as CRMSettingsData['reminderUnit'])}
                className="h-10 px-4 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="minutes">分钟</option>
                <option value="hours">小时</option>
                <option value="days">天</option>
              </select>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              当添加跟进记录时，系统将在设定的时间后提醒您进行下一次跟进
            </p>
          </div>
        </div>
      </div>

      {/* 配置说明 */}
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <AlertCircle className="w-4 h-4 text-blue-500" />
          <p className="text-sm font-medium text-blue-500">配置说明</p>
        </div>
        <ul className="text-xs text-muted-foreground space-y-1 ml-5 list-disc">
          <li>CRM功能开关控制整个客户管理模块的启用状态</li>
          <li>牛马AI引擎同步可将客户数据用于AI分析和智能推荐</li>
          <li>易客CRM集成需要有效的API地址和密钥才能正常工作</li>
          <li>跟进提醒时间可根据业务需求灵活调整</li>
          <li>所有设置修改后需要点击「保存设置」按钮才能生效</li>
        </ul>
      </div>
    </div>
  )
}
