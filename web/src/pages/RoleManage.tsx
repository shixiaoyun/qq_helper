import { useState, useEffect, useCallback } from 'react'
import {
  Shield, Plus, Trash2, Edit3, Check, X, RefreshCw,
} from 'lucide-react'
import axios from 'axios'
import { useAuthStore } from '../stores/auth'

interface Role {
  id: number
  name: string
  label: string
  permissions: string[]
  description: string | null
  createdAt: string
}

interface PermissionDef {
  key: string
  label: string
  category: string
}

const PERMISSION_CATEGORIES = ['仪表盘', 'AI功能', '管理功能']

export default function RoleManagePage() {
  const { isAdmin } = useAuthStore()
  const [roles, setRoles] = useState<Role[]>([])
  const [permissions, setPermissions] = useState<PermissionDef[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error'>('success')

  const [showForm, setShowForm] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    label: '',
    description: '',
    permissions: [] as string[],
  })

  const loadRoles = useCallback(async () => {
    setLoading(true)
    try {
      const [rolesResp, permsResp] = await Promise.all([
        axios.get('/api/admin/roles'),
        axios.get('/api/admin/roles/permissions'),
      ])
      setRoles(rolesResp.data.data)
      setPermissions(permsResp.data.data)
    } catch (err: any) {
      showMessage(err.response?.data?.error || '加载失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAdmin) {
      loadRoles()
    }
  }, [loadRoles, isAdmin])

  const showMessage = (msg: string, type: 'success' | 'error') => {
    setMessage(msg)
    setMessageType(type)
    setTimeout(() => setMessage(''), 3000)
  }

  const handleCreate = async () => {
    if (!formData.name || !formData.label) {
      showMessage('角色标识和名称不能为空', 'error')
      return
    }

    setLoading(true)
    try {
      await axios.post('/api/admin/roles', formData)
      showMessage('创建成功', 'success')
      setShowForm(false)
      resetForm()
      loadRoles()
    } catch (err: any) {
      showMessage(err.response?.data?.error || '创建失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdate = async () => {
    if (!editingRole) return

    setLoading(true)
    try {
      await axios.put(`/api/admin/roles/${editingRole.id}`, {
        label: formData.label,
        description: formData.description,
        permissions: formData.permissions,
      })
      showMessage('更新成功', 'success')
      setShowForm(false)
      setEditingRole(null)
      resetForm()
      loadRoles()
    } catch (err: any) {
      showMessage(err.response?.data?.error || '更新失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (role: Role) => {
    if (role.name === 'admin' || role.name === 'supervisor' || role.name === 'user') {
      showMessage('系统内置角色不能删除', 'error')
      return
    }

    if (!confirm(`确定要删除角色 "${role.label}" 吗？`)) return

    setLoading(true)
    try {
      await axios.delete(`/api/admin/roles/${role.id}`)
      showMessage('删除成功', 'success')
      loadRoles()
    } catch (err: any) {
      showMessage(err.response?.data?.error || '删除失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  const startEdit = (role: Role) => {
    setEditingRole(role)
    setFormData({
      name: role.name,
      label: role.label,
      description: role.description || '',
      permissions: role.permissions || [],
    })
    setShowForm(true)
  }

  const startCreate = () => {
    setEditingRole(null)
    resetForm()
    setShowForm(true)
  }

  const resetForm = () => {
    setFormData({
      name: '',
      label: '',
      description: '',
      permissions: [],
    })
  }

  const togglePermission = (permKey: string) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permKey)
        ? prev.permissions.filter(p => p !== permKey)
        : [...prev.permissions, permKey],
    }))
  }

  const isSystemRole = (name: string) => ['admin', 'supervisor', 'user'].includes(name)

  if (!isAdmin) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-4">
          <Shield className="w-16 h-16 text-destructive mx-auto" />
          <h2 className="text-xl font-bold text-foreground">权限不足</h2>
          <p className="text-muted-foreground">您没有访问角色管理页面的权限</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">角色权限管理</h1>
            <p className="text-sm text-muted-foreground">管理系统角色和权限定义</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadRoles}
            disabled={loading}
            className="flex items-center gap-2 px-4 h-9 bg-secondary rounded-lg text-sm hover:bg-secondary/80 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
          <button
            onClick={startCreate}
            className="flex items-center gap-2 px-4 h-9 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors btn-ripple"
          >
            <Plus className="w-4 h-4" />
            添加角色
          </button>
        </div>
      </div>

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

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setShowForm(false); setEditingRole(null); resetForm(); }}>
          <div className="bg-card border border-border rounded-xl p-5 space-y-4 w-full max-w-lg mx-4 modal-content-enter" onClick={e => e.stopPropagation()}>
          <h2 className="font-medium text-foreground">
            {editingRole ? '编辑角色' : '添加新角色'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted-foreground mb-1.5 block">角色标识 {!editingRole && '*'}</label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                disabled={!!editingRole}
                placeholder="如: editor"
                className="w-full h-10 px-4 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1.5 block">角色名称 *</label>
              <input
                type="text"
                value={formData.label}
                onChange={e => setFormData(prev => ({ ...prev, label: e.target.value }))}
                placeholder="如: 编辑者"
                className="w-full h-10 px-4 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm text-muted-foreground mb-1.5 block">描述</label>
              <input
                type="text"
                value={formData.description}
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="角色描述..."
                className="w-full h-10 px-4 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label className="text-sm text-muted-foreground mb-2 block">权限配置</label>
            <div className="space-y-3">
              {PERMISSION_CATEGORIES.map(category => (
                <div key={category} className="bg-secondary/50 rounded-lg p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">{category}</p>
                  <div className="flex flex-wrap gap-2">
                    {permissions.filter(p => p.category === category).map(perm => (
                      <button
                        key={perm.key}
                        onClick={() => togglePermission(perm.key)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          formData.permissions.includes(perm.key)
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-background border border-border text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {formData.permissions.includes(perm.key) && <Check className="w-3 h-3 inline mr-1" />}
                        {perm.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={editingRole ? handleUpdate : handleCreate}
              disabled={loading}
              className="flex items-center gap-2 px-4 h-9 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              {editingRole ? '保存修改' : '创建'}
            </button>
            <button
              onClick={() => { setShowForm(false); setEditingRole(null); resetForm(); }}
              className="flex items-center gap-2 px-4 h-9 bg-secondary rounded-lg text-sm hover:bg-secondary/80 transition-colors"
            >
              <X className="w-4 h-4" />
              取消
            </button>
          </div>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden card-hover-glow">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">角色</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">标识</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">权限</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">描述</th>
                <th className="text-right px-4 py-3 text-muted-foreground font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {roles.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    暂无角色数据
                  </td>
                </tr>
              ) : (
                roles.map((role) => (
                  <tr key={role.id} className="border-b border-border/50 hover:bg-secondary/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{role.label}</span>
                        {isSystemRole(role.name) && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded">系统</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{role.name}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {role.permissions?.map(perm => {
                          const permDef = permissions.find(p => p.key === perm)
                          return (
                            <span key={perm} className="text-[10px] px-1.5 py-0.5 bg-secondary rounded">
                              {permDef?.label || perm}
                            </span>
                          )
                        })}
                        {role.permissions?.includes('*') && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded">全部权限</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{role.description || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => startEdit(role)}
                          className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
                          title="编辑"
                        >
                          <Edit3 className="w-4 h-4 text-muted-foreground" />
                        </button>
                        {!isSystemRole(role.name) && (
                          <button
                            onClick={() => handleDelete(role)}
                            className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                            title="删除"
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
