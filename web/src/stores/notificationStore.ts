import { create } from 'zustand'
import { apiFetch } from '../lib/api'

interface TodayNotification {
  id: number
  type: string
  title: string
  content?: string
  source: 'notification' | 'task' | 'todo'
  due_date?: string
  customer_name?: string
  assigned_by_name?: string
  created_at: string
}

interface NotificationState {
  notifications: TodayNotification[]
  unreadCount: number
  loading: boolean
  fetchTodayNotifications: (token: string) => Promise<void>
  markAllTodayRead: (token: string) => Promise<void>
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,

  fetchTodayNotifications: async (token: string) => {
    set({ loading: true })
    try {
      const resp = await apiFetch('/api/crm/notifications/today-unread', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await resp.json()
      if (data.success) {
        const items: TodayNotification[] = data.data || []
        set({ notifications: items, unreadCount: items.length, loading: false })
      } else {
        set({ loading: false })
      }
    } catch {
      set({ loading: false })
    }
  },

  markAllTodayRead: async (token: string) => {
    try {
      await apiFetch('/api/crm/notifications/mark-today-read', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      set({ notifications: [], unreadCount: 0 })
    } catch {
      // 静默失败
    }
  },
}))