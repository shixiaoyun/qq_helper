import { create } from 'zustand'

interface UISettingsStore {
  pageSize: number
  loaded: boolean
  loadSettings: () => Promise<void>
  updatePageSize: (size: number) => Promise<void>
}

export const useUISettingsStore = create<UISettingsStore>((set) => ({
  pageSize: 16,
  loaded: false,

  loadSettings: async () => {
    try {
      const tokenStr = localStorage.getItem('auth-storage')
      if (!tokenStr) return
      const parsed = JSON.parse(tokenStr)
      const token = parsed?.state?.token
      if (!token) return
      const res = await fetch('/api/settings/ui', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success) {
        set({ pageSize: data.data.pageSize || 16, loaded: true })
      }
    } catch (err) {
      console.error('加载UI设置失败:', err)
    }
  },

  updatePageSize: async (size: number) => {
    const validSize = Math.max(1, Math.min(500, size))
    set({ pageSize: validSize })
    try {
      const tokenStr = localStorage.getItem('auth-storage')
      if (!tokenStr) return
      const parsed = JSON.parse(tokenStr)
      const token = parsed?.state?.token
      if (!token) return
      await fetch('/api/settings/ui', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'ui_page_size', value: String(validSize) })
      })
    } catch (err) {
      console.error('保存每页条数失败:', err)
    }
  }
}))
