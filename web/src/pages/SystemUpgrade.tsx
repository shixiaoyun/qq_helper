import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import {
  Upload, Download, RotateCcw, HardDrive, Zap, Clock, Shield,
  Package, Trash2, AlertTriangle, CheckCircle, XCircle,
  RefreshCw, FolderOpen, History, ArrowUpCircle, Server
} from 'lucide-react'

interface VersionInfo {
  version: string
  name: string
  nodeVersion: string
  platform: string
  uptime: number
  startTime: string
}

interface BackupItem {
  filename: string
  size: number
  sizeFormatted: string
  createdAt: string
}

interface HistoryItem {
  id: number
  action: string
  version_from: string | null
  version_to: string | null
  filename: string | null
  backup_file: string | null
  status: string
  message: string | null
  operator_name: string | null
  created_at: string
}

type TabType = 'backups' | 'upgrades' | 'history'

const actionLabels: Record<string, string> = {
  backup: '创建备份',
  upgrade: '系统升级',
  rollback: '系统回滚',
}

const actionIcons: Record<string, any> = {
  backup: HardDrive,
  upgrade: ArrowUpCircle,
  rollback: RotateCcw,
}

export default function SystemUpgradePage() {
  const [activeTab, setActiveTab] = useState<TabType>('backups')
  const [loading, setLoading] = useState(true)

  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null)
  const [backups, setBackups] = useState<BackupItem[]>([])
  const [upgrades, setUpgrades] = useState<BackupItem[]>([])
  const [history, setHistory] = useState<HistoryItem[]>([])

  const [backupCreating, setBackupCreating] = useState(false)
  const [backupName, setBackupName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [executing, setExecuting] = useState<string | null>(null)
  const [rollingBack, setRollingBack] = useState<string | null>(null)
  const [targetVersion, setTargetVersion] = useState('')

  const loadAll = useCallback(async () => {
    try {
      const [vRes, bRes, uRes, hRes] = await Promise.all([
        axios.get('/api/system/upgrade/version'),
        axios.get('/api/system/upgrade/backups'),
        axios.get('/api/system/upgrade/upgrades'),
        axios.get('/api/system/upgrade/history'),
      ])
      setVersionInfo(vRes.data.data)
      setBackups(bRes.data.data || [])
      setUpgrades(uRes.data.data || [])
      setHistory(hRes.data.items || [])
    } catch (e: any) {
      console.error('加载失败:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const createBackup = async () => {
    setBackupCreating(true)
    try {
      const r = await axios.post('/api/system/upgrade/backup', backupName ? { name: backupName } : {})
      if (r.data.success) {
        setBackupName('')
        await loadAll()
      }
    } catch (e: any) {
      alert('备份失败: ' + (e.response?.data?.error || e.message))
    } finally {
      setBackupCreating(false)
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.zip')) {
      alert('请上传 .zip 格式的升级包')
      return
    }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const r = await axios.post('/api/system/upgrade/upload', formData)
      if (r.data.success) {
        await loadAll()
        setActiveTab('upgrades')
      }
    } catch (e: any) {
      alert('上传失败: ' + (e.response?.data?.error || e.message))
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const executeUpgrade = async (filename: string) => {
    if (!targetVersion.trim()) {
      alert('请输入目标版本号')
      return
    }
    if (!confirm(`确定要执行升级到 ${targetVersion} 吗？系统将自动备份并重启。`)) return
    setExecuting(filename)
    try {
      const r = await axios.post('/api/system/upgrade/execute', { filename, targetVersion })
      if (r.data.success) {
        alert(r.data.message || '升级成功')
      }
    } catch (e: any) {
      alert('升级失败: ' + (e.response?.data?.error || e.message))
    } finally {
      setExecuting(null)
    }
  }

  const rollbackTo = async (filename: string) => {
    if (!confirm(`确定要回滚到备份 ${filename} 吗？系统将重启。`)) return
    setRollingBack(filename)
    try {
      const r = await axios.post('/api/system/upgrade/rollback', { filename })
      if (r.data.success) {
        alert(r.data.message || '回滚成功')
      }
    } catch (e: any) {
      alert('回滚失败: ' + (e.response?.data?.error || e.message))
    } finally {
      setRollingBack(null)
    }
  }

  const deleteFile = async (type: 'backups' | 'upgrades', filename: string) => {
    if (!confirm(`确定要删除 ${filename} 吗？`)) return
    try {
      await axios.delete(`/api/system/upgrade/${type}/${filename}`)
      await loadAll()
    } catch (e: any) {
      alert('删除失败: ' + (e.response?.data?.error || e.message))
    }
  }

  const downloadBackup = (filename: string) => {
    window.open(`/api/system/upgrade/download/${filename}`, '_blank')
  }

  const formatDate = (d: string) => {
    const date = new Date(d)
    return date.toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  }

  const formatUptime = (s: number) => {
    const d = Math.floor(s / 86400)
    const h = Math.floor((s % 86400) / 3600)
    const m = Math.floor((s % 3600) / 60)
    if (d > 0) return `${d}天 ${h}小时 ${m}分钟`
    if (h > 0) return `${h}小时 ${m}分钟`
    return `${m}分钟`
  }

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>加载中...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">系统升级</h1>
          <p className="text-sm text-muted-foreground mt-1">管理系统备份、升级包上传和版本更新</p>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card rounded-xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <Package className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">当前版本</p>
            <p className="text-lg font-bold text-foreground font-mono">{versionInfo?.version || '-'}</p>
          </div>
        </div>
        <div className="glass-card rounded-xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center">
            <HardDrive className="w-6 h-6 text-green-400" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">备份数量</p>
            <p className="text-lg font-bold text-foreground font-mono">{backups.length} 个</p>
          </div>
        </div>
        <div className="glass-card rounded-xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center">
            <Upload className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">升级包</p>
            <p className="text-lg font-bold text-foreground font-mono">{upgrades.length} 个</p>
          </div>
        </div>
        <div className="glass-card rounded-xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <Clock className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">运行时长</p>
            <p className="text-lg font-bold text-foreground font-mono">{versionInfo ? formatUptime(versionInfo.uptime) : '-'}</p>
          </div>
        </div>
      </div>

      {/* 系统信息 */}
      {versionInfo && (
        <div className="glass-card rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Server className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">系统信息</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">平台名称：</span>
              <span className="text-foreground font-medium">{versionInfo.name}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Node.js：</span>
              <span className="text-foreground font-mono">{versionInfo.nodeVersion}</span>
            </div>
            <div>
              <span className="text-muted-foreground">操作系统：</span>
              <span className="text-foreground font-mono">{versionInfo.platform}</span>
            </div>
            <div>
              <span className="text-muted-foreground">启动时间：</span>
              <span className="text-foreground">{formatDate(versionInfo.startTime)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Tab 导航 */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-secondary/50 w-fit">
        {[
          { key: 'backups', label: '备份管理', icon: HardDrive },
          { key: 'upgrades', label: '升级中心', icon: ArrowUpCircle },
          { key: 'history', label: '操作历史', icon: History },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as TabType)}
            className={`flex items-center gap-2 px-4 h-9 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ========== 备份管理 ========== */}
      {activeTab === 'backups' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-48">
              <label className="block text-xs text-muted-foreground mb-1">备份名称（可选）</label>
              <input
                type="text"
                value={backupName}
                onChange={e => setBackupName(e.target.value)}
                placeholder="留空自动命名"
                className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <button
              onClick={createBackup}
              disabled={backupCreating}
              className="flex items-center gap-2 h-10 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {backupCreating ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <HardDrive className="w-4 h-4" />
              )}
              {backupCreating ? '创建中...' : '创建备份'}
            </button>
          </div>

          {backups.length === 0 ? (
            <div className="glass-card rounded-xl p-12 text-center">
              <FolderOpen className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">暂无备份，点击上方按钮创建第一个备份</p>
            </div>
          ) : (
            <div className="glass-card rounded-xl overflow-hidden">
              <table className="w-full">
                <thead className="bg-secondary/50">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">文件名</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden sm:table-cell">大小</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden md:table-cell">创建时间</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.map(b => (
                    <tr key={b.filename} className="border-t border-border/50 hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <HardDrive className="w-4 h-4 text-green-400 flex-shrink-0" />
                          <span className="text-sm font-mono text-foreground truncate max-w-[200px]">{b.filename}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground hidden sm:table-cell">{b.sizeFormatted}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground hidden md:table-cell">{formatDate(b.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => downloadBackup(b.filename)}
                            className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                            title="下载"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => rollbackTo(b.filename)}
                            disabled={rollingBack === b.filename}
                            className="p-2 rounded-lg hover:bg-amber-500/10 text-amber-400 transition-colors disabled:opacity-50"
                            title="回滚到此备份"
                          >
                            {rollingBack === b.filename ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <RotateCcw className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={() => deleteFile('backups', b.filename)}
                            className="p-2 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                            title="删除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========== 升级中心 ========== */}
      {activeTab === 'upgrades' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 h-10 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-50">
              {uploading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              {uploading ? '上传中...' : '上传升级包'}
              <input
                type="file"
                accept=".zip"
                onChange={handleUpload}
                className="hidden"
                disabled={uploading}
              />
            </label>
          </div>

          {upgrades.length === 0 ? (
            <div className="glass-card rounded-xl p-12 text-center">
              <Package className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">暂无升级包，点击上方按钮上传升级包</p>
            </div>
          ) : (
            <div className="glass-card rounded-xl overflow-hidden">
              <table className="w-full">
                <thead className="bg-secondary/50">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">文件名</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden sm:table-cell">大小</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden md:table-cell">上传时间</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {upgrades.map(u => (
                    <tr key={u.filename} className="border-t border-border/50 hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-purple-400 flex-shrink-0" />
                          <span className="text-sm font-mono text-foreground truncate max-w-[200px]">{u.filename}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground hidden sm:table-cell">{u.sizeFormatted}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground hidden md:table-cell">{formatDate(u.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <input
                            type="text"
                            value={targetVersion}
                            onChange={e => setTargetVersion(e.target.value)}
                            placeholder="版本号"
                            className="w-20 h-8 px-2 rounded-lg border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
                          />
                          <button
                            onClick={() => executeUpgrade(u.filename)}
                            disabled={executing === u.filename}
                            className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-500 transition-colors disabled:opacity-50"
                          >
                            {executing === u.filename ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                              <Zap className="w-3 h-3" />
                            )}
                            执行升级
                          </button>
                          <button
                            onClick={() => deleteFile('upgrades', u.filename)}
                            className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                            title="删除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 升级提示 */}
          <div className="glass-card rounded-xl p-4 border-l-4 border-amber-500/50">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">升级前请注意：</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>升级前系统将<strong className="text-foreground">自动创建备份</strong></li>
                  <li>升级过程中系统将<strong className="text-foreground">短暂不可用</strong></li>
                  <li>升级完成后系统将<strong className="text-foreground">自动重启</strong>以应用更新</li>
                  <li>如升级失败，可使用<strong className="text-foreground">备份管理</strong>中的回滚功能恢复</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========== 操作历史 ========== */}
      {activeTab === 'history' && (
        <div>
          {history.length === 0 ? (
            <div className="glass-card rounded-xl p-12 text-center">
              <History className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">暂无操作记录</p>
            </div>
          ) : (
            <div className="glass-card rounded-xl overflow-hidden">
              <table className="w-full">
                <thead className="bg-secondary/50">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">操作</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden sm:table-cell">版本</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden md:table-cell">文件</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden lg:table-cell">状态</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">操作人</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground hidden sm:table-cell">时间</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(h => {
                    const ActionIcon = actionIcons[h.action] || History
                    return (
                      <tr key={h.id} className="border-t border-border/50 hover:bg-secondary/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <ActionIcon className="w-4 h-4 text-primary/70 flex-shrink-0" />
                            <span className="text-sm text-foreground font-medium">{actionLabels[h.action] || h.action}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground hidden sm:table-cell">
                          {h.version_from && <span className="font-mono">{h.version_from}</span>}
                          {h.version_to && <span className="font-mono"> → {h.version_to}</span>}
                        </td>
                        <td className="px-4 py-3 text-sm font-mono text-muted-foreground truncate max-w-[160px] hidden md:table-cell">
                          {h.filename || h.backup_file || '-'}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <span className={`flex items-center gap-1 text-xs ${
                            h.status === 'success' ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {h.status === 'success' ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                            {h.status === 'success' ? '成功' : '失败'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{h.operator_name || '-'}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground text-right hidden sm:table-cell">
                          {formatDate(h.created_at)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 安全提示 */}
      <div className="glass-card rounded-xl p-4 border border-border">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">安全策略</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>所有升级操作仅<strong className="text-foreground">管理员</strong>可执行</li>
              <li>升级前必须<strong className="text-foreground">先创建备份</strong>，系统执行升级时也会自动备份</li>
              <li>备份文件包含完整源代码和数据库，建议<strong className="text-foreground">下载到本地</strong>妥善保管</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}