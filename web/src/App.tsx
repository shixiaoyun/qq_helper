import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from './stores/auth'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage from './pages/Login'
import RegisterPage from './pages/Register'
import ChatPage from './pages/Chat'
import AdminPage from './pages/Admin'

import RoleManagePage from './pages/RoleManage'
import ModelConfigPage from './pages/ModelConfig'
import SettingsPage from './pages/Settings'
import WebSearchPage from './pages/WebSearch'
import StatsPage from './pages/Stats'
import SmartCrawlerPage from './pages/SmartCrawler'
import MCPManagePage from './pages/MCPManage'
import SystemConfigPage from './pages/SystemConfig'
import CRMManagePage from './pages/CRMManage'
import TrashPage from './pages/Trash'
import EmployeeWorkbenchPage from './pages/employeeworkbench'
import SystemUpgradePage from './pages/SystemUpgrade'
import NiumaIntegrationPage from './pages/NiumaIntegration'

function App() {
  const { fetchUser, isAuthenticated, isLoading } = useAuthStore()

  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  if (isLoading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-6 bg-background">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-2 border-primary/20"></div>
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin"></div>
          <div className="absolute inset-2 rounded-full border-2 border-transparent border-t-[hsl(var(--gradient-end))] animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full gradient-primary animate-pulse"></div>
          </div>
        </div>
        <p className="text-sm text-muted-foreground animate-pulse">正在初始化系统...</p>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={!isAuthenticated ? <LoginPage /> : <Navigate to="/chat" />} />
      <Route path="/register" element={!isAuthenticated ? <RegisterPage /> : <Navigate to="/chat" />} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/" element={<Navigate to="/chat" />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/crm" element={<EmployeeWorkbenchPage />} />
        <Route path="/crawler" element={<SmartCrawlerPage />} />
        <Route path="/trash" element={<TrashPage />} />
      </Route>
      <Route element={<ProtectedRoute requireAdmin><Layout /></ProtectedRoute>}>
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/admin/roles" element={<RoleManagePage />} />
        <Route path="/admin/models" element={<ModelConfigPage />} />
        <Route path="/admin/websearch" element={<WebSearchPage />} />
        <Route path="/admin/settings" element={<SettingsPage />} />
        <Route path="/admin/stats" element={<StatsPage />} />
        <Route path="/admin/mcp" element={<MCPManagePage />} />
        <Route path="/admin/system" element={<SystemConfigPage />} />
        <Route path="/admin/upgrade" element={<SystemUpgradePage />} />
      </Route>
      <Route element={<ProtectedRoute requireSupervisor><Layout /></ProtectedRoute>}>
        <Route path="/admin/crm" element={<CRMManagePage />} />
        <Route path="/admin/niuma-integration" element={<NiumaIntegrationPage />} />
      </Route>
    </Routes>
  )
}

export default App
