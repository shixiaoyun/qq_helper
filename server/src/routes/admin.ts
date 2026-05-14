import { Router } from 'express';
import { z } from 'zod';
import { success, error, paginated } from '../utils/response.js';
import { authMiddleware, requireAdmin } from '../utils/auth.js';
import type { AuthRequest } from '../utils/auth.js';
import { trashService } from '../services/trashService.js';
import {
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  updatePassword,
  getUserById,
} from '../models/user.js';
import {
  getUsageStats,
  getDailyUsageStats,
  getModelUsageStats,
  getUserRanking,
  getAllUsersStorageStats,
  clearUserAllData,
} from '../models/stats.js';
import {
  getAllConfigs,
  setConfig,
  getNiumaEngineUrl,
  isNiumaEngineEnabled,
  isWebSearchEnabled,
  getWebSearchConfig,
} from '../models/systemConfig.js';
import { checkNiumaEngineHealth, getNiumaToolList } from '../services/niumaTools.js';
import { searchWeb } from '../services/webSearch.js';
import { getAllUsersTodayChatStats } from '../models/dailyChatLimit.js';
import { getConfigByKey } from '../models/systemConfig.js';

const router = Router();

// GET /api/admin/users
router.get('/users', authMiddleware, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 20;
    const role = req.query.role as string | undefined;
    const status = req.query.status ? Number(req.query.status) : undefined;
    const search = req.query.search as string | undefined;

    const result = getAllUsers({ page, pageSize, role, status, search });

    return paginated(
      res,
      result.users.map(u => ({
        id: u.id,
        username: u.username,
        email: u.email,
        phone: u.phone,
        nickname: u.nickname,
        avatar: u.avatar,
        role: u.role,
        status: u.status,
        lastLoginAt: u.last_login_at,
        createdAt: u.created_at,
      })),
      page,
      pageSize,
      result.total,
    );
  } catch (err: any) {
    return error(res, err.message || '获取用户列表失败', 500);
  }
});

// POST /api/admin/users
router.post('/users', authMiddleware, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      username: z.string().min(3).max(30),
      password: z.string().min(6),
      email: z.string().email().optional(),
      nickname: z.string().optional(),
      role: z.enum(['admin', 'supervisor', 'user']).optional(),
    });

    const data = schema.parse(req.body);
    const user = createUser({
      username: data.username,
      password: data.password,
      email: data.email,
      nickname: data.nickname,
      role: data.role || 'user',
    });

    return success(res, {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      email: user.email,
      role: user.role,
    }, '创建成功');
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return error(res, err.errors[0].message, 400);
    }
    return error(res, err.message || '创建失败', 500);
  }
});

// PUT /api/admin/users/:id
router.put('/users/:id', authMiddleware, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { nickname, email, role, status } = req.body;

    const success_update = updateUser(id, { nickname, email, role, status });
    if (!success_update) {
      return error(res, '用户不存在', 404);
    }

    return success(res, null, '更新成功');
  } catch (err: any) {
    return error(res, err.message || '更新失败', 500);
  }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', authMiddleware, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const user = getUserById(id);
    if (user) {
      trashService.moveToTrash('users', user.id, user, user.nickname || user.username);
    }
    const success_delete = deleteUser(id);
    if (!success_delete) {
      return error(res, '用户不存在', 404);
    }

    return success(res, null, '已移入回收站');
  } catch (err: any) {
    return error(res, err.message || '删除失败', 500);
  }
});

// POST /api/admin/users/:id/reset-password
router.post('/users/:id/reset-password', authMiddleware, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return error(res, '密码长度不能少于6位', 400);
    }

    const user = getUserById(id);
    if (!user) {
      return error(res, '用户不存在', 404);
    }

    updatePassword(id, newPassword);
    return success(res, null, '密码重置成功');
  } catch (err: any) {
    return error(res, err.message || '重置失败', 500);
  }
});

// GET /api/admin/stats/overview
router.get('/stats/overview', authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const stats = getUsageStats();
    return success(res, stats);
  } catch (err: any) {
    return error(res, err.message || '获取统计失败', 500);
  }
});

// GET /api/admin/stats/daily
router.get('/stats/daily', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const days = Number(req.query.days) || 30;
    const stats = getDailyUsageStats(days);
    return success(res, stats);
  } catch (err: any) {
    return error(res, err.message || '获取统计失败', 500);
  }
});

// GET /api/admin/stats/models
router.get('/stats/models', authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const stats = getModelUsageStats();
    return success(res, stats);
  } catch (err: any) {
    return error(res, err.message || '获取统计失败', 500);
  }
});

// GET /api/admin/stats/users
router.get('/stats/users', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const stats = getUserRanking(limit);
    return success(res, stats);
  } catch (err: any) {
    return error(res, err.message || '获取统计失败', 500);
  }
});

// GET /api/admin/settings - 获取系统配置
router.get('/settings', authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const configs = getAllConfigs();
    return success(res, configs.map(c => ({
      id: c.id,
      key: c.key,
      value: c.value,
      description: c.description,
      updatedAt: c.updated_at,
    })));
  } catch (err: any) {
    return error(res, err.message || '获取配置失败', 500);
  }
});

// PUT /api/admin/settings - 更新系统配置
router.put('/settings', authMiddleware, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { key, value } = req.body;
    if (!key) {
      return error(res, '缺少key参数', 400);
    }

    const success_update = setConfig(key, String(value));
    if (!success_update) {
      return error(res, '配置项不存在', 404);
    }

    return success(res, null, '更新成功');
  } catch (err: any) {
    return error(res, err.message || '更新失败', 500);
  }
});

// GET /api/admin/niuma-engine/health - 检测牛马引擎连通性
router.get('/niuma-engine/health', authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const health = await checkNiumaEngineHealth();
    return success(res, health);
  } catch (err: any) {
    return error(res, err.message || '检测失败', 500);
  }
});

// GET /api/admin/niuma-engine/config - 获取牛马引擎配置
router.get('/niuma-engine/config', authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const webSearch = getWebSearchConfig();
    return success(res, {
      url: getNiumaEngineUrl(),
      enabled: isNiumaEngineEnabled(),
      webSearchEnabled: isWebSearchEnabled(),
      webSearchApiKey: webSearch.apiKey ? '••••••••' + webSearch.apiKey.slice(-4) : '',
      webSearchApiUrl: webSearch.apiUrl,
    });
  } catch (err: any) {
    return error(res, err.message || '获取配置失败', 500);
  }
});

// GET /api/admin/niuma-engine/tools - 获取牛马引擎工具列表
router.get('/niuma-engine/tools', authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const tools = await getNiumaToolList();
    return success(res, tools);
  } catch (err: any) {
    return error(res, err.message || '获取工具列表失败', 500);
  }
});

// GET /api/admin/users/storage - 获取所有用户存储空间统计
router.get('/users/storage', authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const stats = getAllUsersStorageStats();
    return success(res, stats.map(s => ({
      ...s,
      estimatedKB: Math.round(s.estimatedBytes / 1024 * 100) / 100,
      estimatedMB: Math.round(s.estimatedBytes / 1024 / 1024 * 100) / 100,
    })));
  } catch (err: any) {
    return error(res, err.message || '获取存储统计失败', 500);
  }
});

// POST /api/admin/users/:id/clear-data - 管理员清空指定用户所有数据
router.post('/users/:id/clear-data', authMiddleware, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { confirm } = req.body;

    if (confirm !== 'ADMIN_CLEAR_USER_DATA') {
      return error(res, '需要管理员确认码', 400);
    }

    const user = getUserById(id);
    if (!user) {
      return error(res, '用户不存在', 404);
    }

    // 不能清空系统管理员数据
    if (user.id === 1) {
      return error(res, '不能清空系统管理员的数据', 403);
    }

    clearUserAllData(id);
    return success(res, null, `已清空用户 ${user.username} 的所有数据`);
  } catch (err: any) {
    return error(res, err.message || '清空数据失败', 500);
  }
});

// GET /api/admin/users/chat-stats - 获取所有用户今日对话统计
router.get('/users/chat-stats', authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const stats = getAllUsersTodayChatStats();
    return success(res, stats);
  } catch (err: any) {
    return error(res, err.message || '获取对话统计失败', 500);
  }
});

// PUT /api/admin/users/:id/quota - 更新用户配额
router.put('/users/:id/quota', authMiddleware, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { storage_limit_mb, daily_chat_limit } = req.body;

    const user = getUserById(id);
    if (!user) {
      return error(res, '用户不存在', 404);
    }

    // 不能修改系统管理员的配额
    if (user.id === 1) {
      return error(res, '不能修改系统管理员的配额', 403);
    }

    const minStorage = Number(getConfigByKey('min_storage_limit_mb')) || 100;
    const maxStorage = Number(getConfigByKey('max_storage_limit_mb')) || 10240;

    const updates: { storage_limit_mb?: number; daily_chat_limit?: number } = {};

    if (storage_limit_mb !== undefined) {
      const val = Number(storage_limit_mb);
      if (val < minStorage || val > maxStorage) {
        return error(res, `存储空间必须在 ${minStorage}MB ~ ${maxStorage}MB 之间`, 400);
      }
      updates.storage_limit_mb = val;
    }

    if (daily_chat_limit !== undefined) {
      const val = Number(daily_chat_limit);
      if (val < 1 || val > 9999) {
        return error(res, '每日对话次数必须在 1 ~ 9999 之间', 400);
      }
      updates.daily_chat_limit = val;
    }

    const success_update = updateUser(id, updates);
    if (!success_update) {
      return error(res, '更新失败', 500);
    }

    return success(res, null, '配额更新成功');
  } catch (err: any) {
    return error(res, err.message || '更新配额失败', 500);
  }
});

// POST /api/admin/web-search/test - 测试联网搜索
router.post('/web-search/test', authMiddleware, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { query } = req.body;
    if (!query) {
      return error(res, '缺少搜索关键词', 400);
    }

    const results = await searchWeb(query, 5);
    return success(res, results);
  } catch (err: any) {
    return error(res, err.message || '搜索失败', 500);
  }
});

export default router;
