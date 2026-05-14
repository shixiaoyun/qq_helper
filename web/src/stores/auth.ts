import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api, setAuthToken } from '../lib/api'

export interface User {
  id: number
  username: string
  nickname: string | null
  email: string | null
  phone: string | null
  avatar: string | null
  role: string
  status: number
  lastLoginAt: string | null
  storageLimitMB: number
  dailyChatLimit: number
}

export interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  isAdmin: boolean
  isSupervisor: boolean
  canAccessAdmin: boolean

  login: (username: string, password: string) => Promise<{ success: boolean; message: string }>
  register: (data: { username: string; password: string; email?: string; nickname?: string }) => Promise<{ success: boolean; message: string }>
  logout: () => void
  fetchUser: () => Promise<void>
  updateProfile: (data: Partial<User>) => Promise<{ success: boolean; message: string }>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: true,
      isAdmin: false,
      isSupervisor: false,
      canAccessAdmin: false,

      login: async (username: string, password: string) => {
        try {
          const resp = await api.post('/api/auth/login', { username, password })
          const { user, token } = resp.data.data
          const isAdmin = user.role === 'admin'
          const isSupervisor = user.role === 'supervisor'

          set({
            user,
            token,
            isAuthenticated: true,
            isAdmin,
            isSupervisor,
            canAccessAdmin: isAdmin || isSupervisor,
          })

          setAuthToken(token)
          return { success: true, message: '登录成功' }
        } catch (err: any) {
          const msg = err.response?.data?.error
          if (msg === '用户名或密码错误') return { success: false, message: '用户名或密码错误' }
          if (msg === '接口不存在') return { success: false, message: '服务连接异常，请稍后重试' }
          return { success: false, message: msg || '登录失败，请检查网络连接' }
        }
      },

      register: async (data) => {
        try {
          const resp = await api.post('/api/auth/register', data)
          const { user, token } = resp.data.data
          const isAdmin = user.role === 'admin'
          const isSupervisor = user.role === 'supervisor'

          set({
            user,
            token,
            isAuthenticated: true,
            isAdmin,
            isSupervisor,
            canAccessAdmin: isAdmin || isSupervisor,
          })

          setAuthToken(token)
          return { success: true, message: '注册成功' }
        } catch (err: any) {
          const msg = err.response?.data?.error
          if (msg === '用户名已被注册') return { success: false, message: '该用户名已被注册' }
          if (msg === '邮箱已被注册') return { success: false, message: '该邮箱已被注册' }
          return { success: false, message: msg || '注册失败，请稍后重试' }
        }
      },

      logout: () => {
        set({ user: null, token: null, isAuthenticated: false, isAdmin: false, isSupervisor: false, canAccessAdmin: false })
        setAuthToken(null)
      },

      fetchUser: async () => {
        try {
          const token = get().token
          if (!token) {
            set({ isLoading: false })
            return
          }

          setAuthToken(token)
          const resp = await api.get('/api/auth/me')
          const user = resp.data.data.user
          const isAdmin = user.role === 'admin'
          const isSupervisor = user.role === 'supervisor'

          set({
            user,
            isAuthenticated: true,
            isAdmin,
            isSupervisor,
            canAccessAdmin: isAdmin || isSupervisor,
            isLoading: false,
          })
        } catch {
          set({ user: null, token: null, isAuthenticated: false, isAdmin: false, isSupervisor: false, canAccessAdmin: false, isLoading: false })
          setAuthToken(null)
        }
      },

      updateProfile: async (data) => {
        try {
          await api.put('/api/auth/profile', data)
          set({ user: { ...get().user!, ...data } })
          return { success: true, message: '更新成功' }
        } catch (err: any) {
          return { success: false, message: err.response?.data?.error || '资料更新失败，请稍后重试' }
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ token: state.token }),
    }
  )
)
