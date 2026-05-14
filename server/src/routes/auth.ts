import { Router } from 'express';
import { z } from 'zod';
import { createToken, verifyPassword } from '../utils/auth.js';
import { success, error } from '../utils/response.js';
import {
  createUser,
  getUserByUsername,
  getUserByEmail,
  updateLastLogin,
  updateUser,
  updatePassword,
} from '../models/user.js';
import { clearAllUserConversations, getUserStorageStats } from '../models/conversation.js';
import { authMiddleware, requireAuth } from '../utils/auth.js';
import type { AuthRequest } from '../utils/auth.js';

const router = Router();

const registerSchema = z.object({
  username: z.string().min(3).max(30),
  password: z.string().min(6),
  email: z.string().email().optional(),
  nickname: z.string().optional(),
});

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const data = registerSchema.parse(req.body);

    const existingUser = getUserByUsername(data.username);
    if (existingUser) {
      return error(res, '用户名已被注册', 409);
    }

    if (data.email) {
      const existingEmail = getUserByEmail(data.email);
      if (existingEmail) {
        return error(res, '邮箱已被注册', 409);
      }
    }

    const user = createUser({
      username: data.username,
      password: data.password,
      email: data.email,
      nickname: data.nickname,
      role: 'user',
    });

    const token = await createToken({
      id: user.id,
      username: user.username,
      role: user.role,
    });

    return success(res, {
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
      },
      token,
    }, '注册成功');
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return error(res, err.errors[0].message, 400);
    }
    return error(res, err.message || '注册失败', 500);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const data = loginSchema.parse(req.body);

    const user = getUserByUsername(data.username);
    if (!user || user.status !== 1) {
      return error(res, '用户名或密码错误', 401);
    }

    const valid = verifyPassword(data.password, user.password_hash);
    if (!valid) {
      return error(res, '用户名或密码错误', 401);
    }

    updateLastLogin(user.id, req.ip || '127.0.0.1');

    const token = await createToken({
      id: user.id,
      username: user.username,
      role: user.role,
    });

    return success(res, {
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
      },
      token,
    }, '登录成功');
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return error(res, err.errors[0].message, 400);
    }
    return error(res, err.message || '登录失败', 500);
  }
});

// POST /api/auth/logout
router.post('/logout', (_req, res) => {
  return success(res, null, '退出登录成功');
});

// GET /api/auth/me
router.get('/me', authMiddleware, requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = getUserByUsername(req.user!.username);
    if (!user) {
      return error(res, '用户不存在', 404);
    }

    return success(res, {
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        email: user.email,
        phone: user.phone,
        avatar: user.avatar,
        role: user.role,
        status: user.status,
        lastLoginAt: user.last_login_at,
        storageLimitMB: user.storage_limit_mb,
        dailyChatLimit: user.daily_chat_limit,
      },
    });
  } catch (err: any) {
    return error(res, err.message || '获取用户信息失败', 500);
  }
});

// PUT /api/auth/profile
router.put('/profile', authMiddleware, requireAuth, async (req: AuthRequest, res) => {
  try {
    const { nickname, email } = req.body;
    const success_update = updateUser(req.user!.id, { nickname, email });

    if (!success_update) {
      return error(res, '更新失败', 400);
    }

    return success(res, null, '更新成功');
  } catch (err: any) {
    return error(res, err.message || '更新失败', 500);
  }
});

// GET /api/auth/storage - 获取当前用户存储统计
router.get('/storage', authMiddleware, requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = getUserByUsername(req.user!.username);
    const stats = getUserStorageStats(req.user!.id);
    return success(res, {
      ...stats,
      storageLimitMB: user?.storage_limit_mb || 1024,
      dailyChatLimit: user?.daily_chat_limit || 99,
    });
  } catch (err: any) {
    return error(res, err.message || '获取存储统计失败', 500);
  }
});

// POST /api/auth/clear-data - 清空当前用户所有数据
router.post('/clear-data', authMiddleware, requireAuth, async (req: AuthRequest, res) => {
  try {
    const { confirm } = req.body;
    if (confirm !== 'CLEAR_ALL_MY_DATA') {
      return error(res, '需要确认码才能清空数据', 400);
    }

    clearAllUserConversations(req.user!.id);
    return success(res, null, '已清空所有个人数据');
  } catch (err: any) {
    return error(res, err.message || '清空数据失败', 500);
  }
});

// PUT /api/auth/password
router.put('/password', authMiddleware, requireAuth, async (req: AuthRequest, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword || newPassword.length < 6) {
      return error(res, '密码长度不能少于6位', 400);
    }

    const user = getUserByUsername(req.user!.username);
    if (!user) {
      return error(res, '用户不存在', 404);
    }

    const valid = verifyPassword(oldPassword, user.password_hash);
    if (!valid) {
      return error(res, '原密码错误', 401);
    }

    updatePassword(user.id, newPassword);
    return success(res, null, '密码修改成功');
  } catch (err: any) {
    return error(res, err.message || '修改失败', 500);
  }
});

export default router;
