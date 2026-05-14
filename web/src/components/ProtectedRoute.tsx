import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../stores/auth'

interface ProtectedRouteProps {
  children: React.ReactNode
  requireAdmin?: boolean
  requireSupervisor?: boolean
}

export default function ProtectedRoute({ children, requireAdmin = false, requireSupervisor = false }: ProtectedRouteProps) {
  const { isAuthenticated, isAdmin, canAccessAdmin, isLoading } = useAuthStore()

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/chat" replace />
  }

  if (requireSupervisor && !canAccessAdmin) {
    return <Navigate to="/chat" replace />
  }

  return <>{children}</>
}
