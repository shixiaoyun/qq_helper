import { useState, useEffect } from 'react'
import {
  Users, MessageSquare, Zap, TrendingUp,
  Activity, BarChart3,
} from 'lucide-react'
import axios from 'axios'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar,
} from 'recharts'
import { useAuthStore } from '../stores/auth'

interface StatsData {
  totalUsers: number
  totalConversations: number
  totalMessages: number
  totalTokens: number
  totalInputTokens: number
  totalOutputTokens: number
  todayTokens: number
  todayMessages: number
  todayUsers: number
}

interface DailyStat {
  date: string
  tokens: number
  inputTokens: number
  outputTokens: number
  messages: number
  users: number
}

export default function StatsPage() {
  const [stats, setStats] = useState<StatsData | null>(null)
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = useAuthStore.getState().token
        const headers = { 'Authorization': `Bearer ${token || ''}` }
        const [statsResp, dailyResp] = await Promise.all([
          axios.get('/api/admin/stats/overview', { headers }),
          axios.get('/api/admin/stats/daily?days=30', { headers }),
        ])

        setStats(statsResp.data.data)
        setDailyStats(dailyResp.data.data || [])
      } catch (err: any) {
        console.error('统计数据加载失败:', err)
        setStats({
          totalUsers: 0, totalConversations: 0, totalMessages: 0,
          totalTokens: 0, totalInputTokens: 0, totalOutputTokens: 0,
          todayTokens: 0, todayMessages: 0, todayUsers: 0,
        })
        setDailyStats([])
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="w-full max-w-4xl space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="skeleton-card">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex-1">
                    <div className="skeleton skeleton-text" style={{ width: '40%' }} />
                    <div className="skeleton skeleton-text mt-2" style={{ width: '60%', height: '1.25rem' }} />
                  </div>
                  <div className="skeleton skeleton-avatar" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const s = stats || {
    totalUsers: 0, totalConversations: 0, totalMessages: 0,
    totalTokens: 0, totalInputTokens: 0, totalOutputTokens: 0,
    todayTokens: 0, todayMessages: 0, todayUsers: 0,
  }

  const statCards = [
    { title: '总用户数', value: s.totalUsers, icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { title: '总会话数', value: s.totalConversations, icon: MessageSquare, color: 'text-green-500', bg: 'bg-green-500/10' },
    { title: '总消息数', value: s.totalMessages, icon: Activity, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
    { title: '总Token数', value: s.totalTokens, icon: Zap, color: 'text-purple-500', bg: 'bg-purple-500/10' },
  ]

  const todayCards = [
    { title: '今日Token', value: s.todayTokens, icon: TrendingUp },
    { title: '今日消息', value: s.todayMessages, icon: MessageSquare },
    { title: '今日活跃用户', value: s.todayUsers, icon: Users },
  ]

  return (
    <div className="space-y-6 p-2">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center">
          <BarChart3 className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">数据统计</h1>
          <p className="text-sm text-muted-foreground">查看系统整体运行数据</p>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon
          return (
            <div key={card.title} className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{card.title}</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{card.value.toLocaleString()}</p>
                </div>
                <div className={`w-10 h-10 ${card.bg} rounded-lg flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${card.color}`} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* 今日数据 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {todayCards.map((card) => {
          const Icon = card.icon
          return (
            <div key={card.title} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{card.title}</p>
                  <p className="text-lg font-semibold text-foreground">{card.value.toLocaleString()}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* 图表 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Token使用趋势 */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Token使用趋势（30天）</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={[...dailyStats].reverse()}>
                <defs>
                  <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(value) => value.slice(5)}
                />
                <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="tokens"
                  stroke="#3b82f6"
                  fillOpacity={1}
                  fill="url(#colorTokens)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 消息数趋势 */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">消息数趋势（30天）</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyStats}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(value) => value.slice(5)}
                />
                <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Bar dataKey="messages" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Token输入输出对比 */}
      <div className="bg-card border border-border rounded-xl p-5 card-hover-glow">
        <h3 className="text-sm font-semibold text-foreground mb-4">Token输入/输出对比（30天）</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dailyStats}>
              <defs>
                <linearGradient id="colorInput" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorOutput" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={(value) => value.slice(5)}
              />
              <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
              <Area type="monotone" dataKey="inputTokens" stroke="#3b82f6" fill="url(#colorInput)" name="输入Token" />
              <Area type="monotone" dataKey="outputTokens" stroke="#10b981" fill="url(#colorOutput)" name="输出Token" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
