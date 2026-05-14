import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect, useMemo } from 'react'
import {
  MessageSquare,
  Bug,
  Users,
  Settings,
  LogOut,
  ChevronDown,
  Shield,
  BarChart3,
  PanelLeft,
  PanelRight,
  Globe,
  Server,
  Wrench,
  Briefcase,
  Bell,
  Sun,
  Moon,
  Archive,
  ArrowUpCircle,
  Database,
  Zap,
} from 'lucide-react'
import { useAuthStore } from '../stores/auth'
import { useNotificationStore } from '../stores/notificationStore'
import { useSalesCrewStore } from '../stores/salesCrewStore'
import SalesCrewPanel from './SalesCrewPanel'
import AmbientBackground from './AmbientBackground'

export default function Layout() {
  const { user, isAdmin, canAccessAdmin, logout } = useAuthStore()
  const token = useAuthStore((s) => s.token)
  const { notifications, unreadCount, fetchTodayNotifications, markAllTodayRead } = useNotificationStore()
  const location = useLocation()
  const navigate = useNavigate()
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true)
  const [rightPanelOpen, setRightPanelOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark')
    }
    return false
  })
  const [currentDate, setCurrentDate] = useState(new Date())
  const { targetCustomer } = useSalesCrewStore()

  useEffect(() => {
    if (targetCustomer) {
      setRightPanelOpen(true)
    }
  }, [targetCustomer])

  const toggleTheme = () => {
    const newDark = !isDark
    setIsDark(newDark)
    document.documentElement.classList.toggle('dark', newDark)
  }

  useEffect(() => {
    if (token) {
      fetchTodayNotifications(token)
      const interval = setInterval(() => fetchTodayNotifications(token), 30000)
      return () => clearInterval(interval)
    }
  }, [token, fetchTodayNotifications])

  useEffect(() => {
    const updateDate = () => {
      const now = new Date()
      if (now.getDate() !== currentDate.getDate()) {
        setCurrentDate(now)
      }
    }
    updateDate()
    const interval = setInterval(updateDate, 60000)
    return () => clearInterval(interval)
  }, [currentDate])

  const handleBellClick = () => {
    if (token && unreadCount > 0) {
      markAllTodayRead(token)
    }
  }

  const formattedDate = useMemo(() => {
    const d = currentDate
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    const day = d.getDate()
    const weekDays = ['日', '一', '二', '三', '四', '五', '六']
    const w = weekDays[d.getDay()]
    return `${y}年${m}月${day}日 星期${w}`
  }, [currentDate])

  const marqueeItems = useMemo(() => {
    const tips = [
      { id: 'tip-1', title: '欢迎使用智能CRM系统 · 点击客户 ⚡ 按钮开启AI销售教练', source: 'system', icon: '🚀' },
      { id: 'tip-2', title: '使用AI对话快速生成客户跟进 · 提升工作效率', source: 'system', icon: '💡' },
      { id: 'tip-3', title: '客户看板支持自定义每页显示数量 · 可在底部切换', source: 'system', icon: '📊' },
    ]
    if (notifications.length === 0) return tips
    const mapped = notifications.map(n => ({
      id: `${n.source}-${n.id}`,
      title: n.title + (n.customer_name ? ` · ${n.customer_name}` : ''),
      source: n.source,
      icon: n.source === 'notification' ? '🔔' : n.source === 'task' ? '📋' : '✅',
    }))
    return [...mapped, ...tips]
  }, [notifications])

  const navItems = useMemo(() => {
    const items = [
      { path: '/crm', label: 'CRM工作台', icon: Briefcase },
      { path: '/crawler', label: '智能抓取', icon: Bug },
      { path: '/trash', label: '回收站', icon: Archive },
    ]
    if (isAdmin) {
      items.unshift({ path: '/chat', label: 'AI对话', icon: MessageSquare })
    }
    return items
  }, [isAdmin])

  const adminNavItems = [
    { path: '/admin', label: '用户管理', icon: Users, roles: ['admin'] },
    { path: '/admin/roles', label: '角色权限', icon: Shield, roles: ['admin'] },
    { path: '/admin/models', label: '模型配置', icon: Server, roles: ['admin'] },
    { path: '/admin/websearch', label: '联网搜索', icon: Globe, roles: ['admin'] },
    { path: '/admin/mcp', label: 'MCP工具', icon: Wrench, roles: ['admin'] },
    { path: '/admin/system', label: '智能体配置', icon: Settings, roles: ['admin'] },
    { path: '/admin/crm', label: 'CRM管理', icon: Briefcase, roles: ['admin', 'supervisor', 'user'] },
    { path: '/admin/upgrade', label: '系统升级', icon: ArrowUpCircle, roles: ['admin'] },
    { path: '/admin/niuma-integration', label: '牛马引擎集成', icon: Database, roles: ['admin', 'supervisor'] },
    { path: '/admin/stats', label: '数据统计', icon: BarChart3, roles: ['admin'] },
    { path: '/admin/settings', label: '系统设置', icon: Settings, roles: ['admin'] },
  ]

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="h-screen flex bg-background overflow-hidden relative">
      <AmbientBackground />
      <aside
        className={`${leftSidebarOpen ? 'w-64' : 'w-0'} transition-all duration-300 ease-out dark:bg-[rgba(10,14,30,0.8)] bg-card/80 backdrop-blur-xl dark:border-indigo-500/10 border-r border-border/50 flex flex-col overflow-hidden flex-shrink-0 relative z-10`}
      >
        <div className="h-14 flex items-center justify-between px-5 border-b border-border/50 flex-shrink-0">
          <div className="flex items-center">
            <div className="w-8 h-8 gradient-primary rounded-xl flex items-center justify-center mr-3 shadow-glow cursor-pointer hover:shadow-glow-lg transition-all duration-300" onClick={toggleTheme} title={isDark ? '切换到浅色模式' : '切换到深色模式'}>
              {isDark ? <Sun className="w-4 h-4 text-white" /> : <Moon className="w-4 h-4 text-white" />}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-base font-bold gradient-text">OQ助手</span>
              <span className="text-[10px] px-1.5 py-0.5 gradient-primary text-white rounded-md font-medium">Q1.31</span>
            </div>
          </div>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname === item.path
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`sidebar-item sidebar-glow ${isActive ? 'active' : 'text-muted-foreground'}`}
              >
                <Icon className="w-[18px] h-[18px]" />
                {item.label}
              </Link>
            )
          })}

          {canAccessAdmin && (
            <>
              <div className="pt-5 pb-2">
                <div className="flex items-center gap-2 px-3">
                  <Shield className="w-3 h-3 gradient-text" />
                  <span className="text-[10px] font-semibold gradient-text uppercase tracking-wider">
                    管理后台
                  </span>
                </div>
              </div>
              {adminNavItems
                .filter((item) => item.roles.includes(user?.role || ''))
                .map((item) => {
                  const Icon = item.icon
                  const isActive = location.pathname === item.path
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`sidebar-item sidebar-glow ${isActive ? 'active' : 'text-muted-foreground'}`}
                    >
                      <Icon className="w-[18px] h-[18px]" />
                      {item.label}
                    </Link>
                  )
                })}
            </>
          )}
        </nav>

        <div className="p-3 border-t border-border/50 flex-shrink-0">
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-accent/50 transition-all duration-200"
            >
              <div className="w-8 h-8 rounded-xl gradient-primary flex items-center justify-center flex-shrink-0 shadow-glow">
                <span className="text-xs font-semibold text-white">
                  {user?.nickname?.[0] || user?.username?.[0] || 'U'}
                </span>
              </div>
              <div className="flex-1 text-left min-w-0 overflow-hidden">
                <p className="text-sm font-medium text-foreground truncate">{user?.nickname || user?.username}</p>
                <p className="text-[10px] text-muted-foreground">{user?.role}</p>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            </button>

            {userMenuOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-2 glass-card rounded-xl shadow-glow-lg py-1 animate-fade-in-scale">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  退出登录
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 relative">
        <header className="h-12 flex items-center justify-between px-4 dark:border-indigo-500/10 border-b border-border/50 dark:bg-[rgba(10,14,30,0.7)] glass-card flex-shrink-0 relative z-10">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <button
              onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}
              className="p-2 rounded-xl btn-ghost flex-shrink-0"
              title={leftSidebarOpen ? '收起左侧栏' : '展开左侧栏'}
            >
              <PanelLeft className="w-4 h-4" />
            </button>
            <div className="h-5 w-px bg-border/50 flex-shrink-0" />

            <div className="flex-1 min-w-0 overflow-hidden relative h-8 flex items-center border-l border-border/40 border-r border-border/40 mx-2">
              <div className="relative w-full overflow-hidden px-3">
                <div className="whitespace-nowrap animate-marquee inline-flex" style={{ animationDuration: '25s' }}>
                  {[...marqueeItems, ...marqueeItems].map((item, i) => (
                    <span
                      key={`${item.id}-${i}`}
                      className="inline-flex items-center gap-1.5 text-xs mr-16 flex-shrink-0"
                    >
                      <span className="text-[11px]">{item.icon}</span>
                      <span className="text-muted-foreground whitespace-nowrap">{item.title}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="hidden md:flex items-center text-[11px] text-muted-foreground/70 whitespace-nowrap ml-1">
              {formattedDate}
            </div>

            <button
              onClick={handleBellClick}
              className="p-2 rounded-xl btn-ghost relative"
              title={unreadCount > 0 ? `今日${unreadCount}条未读通知，点击全部已读` : '暂无未读通知'}
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full gradient-primary text-[10px] font-bold text-white px-1 leading-none">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {canAccessAdmin && (
            <button
              onClick={() => setRightPanelOpen(!rightPanelOpen)}
              className="relative p-1.5 rounded-md transition-all duration-200"
              style={{
                transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
                color: rightPanelOpen ? '#ffffff' : isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)',
                backgroundColor: rightPanelOpen ? 'transparent' : 'transparent',
              }}
              onMouseEnter={(e) => {
                if (!rightPanelOpen) {
                  e.currentTarget.style.backgroundColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'
                  e.currentTarget.style.color = isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.8)'
                }
              }}
              onMouseLeave={(e) => {
                if (!rightPanelOpen) {
                  e.currentTarget.style.backgroundColor = 'transparent'
                  e.currentTarget.style.color = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)'
                }
              }}
              title={rightPanelOpen ? '收起右侧栏' : '展开右侧栏'}
            >
              {rightPanelOpen && (
                <div
                  className="absolute inset-0 rounded-md"
                  style={{
                    background: 'linear-gradient(135deg, hsl(var(--gradient-start)), hsl(var(--gradient-end)))',
                    zIndex: 0,
                  }}
                />
              )}
              <PanelRight className="w-4 h-4 relative z-10" />
            </button>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-auto relative z-10">
          <div key={location.pathname} className="page-transition h-full">
            <Outlet />
          </div>
        </main>
      </div>

      <aside
        className={`${rightPanelOpen ? 'w-80' : 'w-0'} transition-all duration-300 ease-out dark:bg-[rgba(10,14,30,0.8)] bg-card/80 backdrop-blur-xl dark:border-indigo-500/10 border-l border-border/50 flex flex-col overflow-hidden flex-shrink-0 relative z-10`}
      >
        {rightPanelOpen && (
          <>
            <div className="h-12 flex items-center justify-between px-4 border-b border-border/50 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 gradient-text" />
                <span className="text-sm font-semibold">销售教练</span>
              </div>
              <button
                onClick={() => setRightPanelOpen(false)}
                className="p-1.5 rounded-lg btn-ghost text-xs text-muted-foreground"
              >
                收起
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <SalesCrewPanel />
            </div>
          </>
        )}
      </aside>
    </div>
  )
}
