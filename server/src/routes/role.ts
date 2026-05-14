import { Router } from 'express';
import { z } from 'zod';
import { success, error } from '../utils/response.js';
import { authMiddleware, requireAdmin } from '../utils/auth.js';
import type { AuthRequest } from '../utils/auth.js';
import { trashService } from '../services/trashService.js';
import {
  getAllRoles,
  createRole,
  updateRole,
  deleteRole,
} from '../models/role.js';

const router = Router();

// 权限定义列表
export const PERMISSION_DEFINITIONS = [
  { key: 'dashboard:view', label: '查看仪表盘', category: '仪表盘' },
  { key: 'ai:chat', label: 'AI对话', category: 'AI功能' },
  { key: 'ai:advanced', label: '高级AI功能', category: 'AI功能' },
  { key: 'ai:web_search', label: '联网搜索', category: 'AI功能' },
  { key: 'user:manage', label: '用户管理', category: '管理功能' },
  { key: 'role:manage', label: '角色管理', category: '管理功能' },
  { key: 'ai:manage', label: 'AI模型管理', category: '管理功能' },
  { key: 'stats:view', label: '查看统计', category: '管理功能' },
  { key: 'system:manage', label: '系统设置', category: '管理功能' },
];

// GET /api/admin/roles
router.get('/roles', authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const roles = getAllRoles();
    return success(res, roles.map(r => ({
      id: r.id,
      name: r.name,
      label: r.label,
      permissions: JSON.parse(r.permissions || '[]'),
      description: r.description,
      createdAt: r.created_at,
    })));
  } catch (err: any) {
    return error(res, err.message || '获取角色列表失败', 500);
  }
});

// GET /api/admin/roles/permissions
router.get('/roles/permissions', authMiddleware, requireAdmin, async (_req, res) => {
  try {
    return success(res, PERMISSION_DEFINITIONS);
  } catch (err: any) {
    return error(res, err.message || '获取权限定义失败', 500);
  }
});

// POST /api/admin/roles
router.post('/roles', authMiddleware, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      name: z.string().min(2).max(30),
      label: z.string().min(1).max(50),
      permissions: z.array(z.string()),
      description: z.string().optional(),
    });

    const data = schema.parse(req.body);

    // 检查角色名是否已存在
    const existing = getAllRoles().find(r => r.name === data.name);
    if (existing) {
      return error(res, '角色标识已存在', 400);
    }

    const role = createRole({
      name: data.name,
      label: data.label,
      permissions: data.permissions,
      description: data.description,
    });

    return success(res, {
      id: role.id,
      name: role.name,
      label: role.label,
      permissions: JSON.parse(role.permissions || '[]'),
      description: role.description,
    }, '创建成功');
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return error(res, err.errors[0].message, 400);
    }
    return error(res, err.message || '创建失败', 500);
  }
});

// PUT /api/admin/roles/:id
router.put('/roles/:id', authMiddleware, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { label, permissions, description } = req.body;

    const success_update = updateRole(id, {
      label,
      permissions,
      description,
    });

    if (!success_update) {
      return error(res, '角色不存在', 404);
    }

    return success(res, null, '更新成功');
  } catch (err: any) {
    return error(res, err.message || '更新失败', 500);
  }
});

// DELETE /api/admin/roles/:id
router.delete('/roles/:id', authMiddleware, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const allRoles = getAllRoles();
    const role = allRoles.find((r) => r.id === id) as any;
    if (role) {
      trashService.moveToTrash('roles', role.id, role, role.name);
    }
    const success_delete = deleteRole(id);
    if (!success_delete) {
      return error(res, '角色不存在', 404);
    }
    return success(res, null, '已移入回收站');
  } catch (err: any) {
    return error(res, err.message || '删除失败', 500);
  }
});

export default router;
