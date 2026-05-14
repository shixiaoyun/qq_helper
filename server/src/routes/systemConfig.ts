import { Router } from 'express';
import { success, error } from '../utils/response.js';
import { authMiddleware } from '../utils/auth.js';
import type { AuthRequest } from '../utils/auth.js';
import { prisma } from '../config/prisma.js';

const router = Router();

// 获取所有系统配置
router.get('/', authMiddleware, async (_req: AuthRequest, res) => {
  try {
    const configs = await prisma.systemConfig.findMany();
    const configMap: Record<string, any> = {};
    for (const c of configs) {
      try {
        configMap[c.key] = JSON.parse(c.value);
      } catch {
        configMap[c.key] = c.value;
      }
    }
    return success(res, configMap);
  } catch (err: any) {
    return error(res, err.message || '获取配置失败', 500);
  }
});

// 获取单个配置
router.get('/:key', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const key = String(req.params.key);
    const config = await prisma.systemConfig.findUnique({
      where: { key },
    });
    if (!config) {
      return error(res, '配置不存在', 404);
    }
    let value: any = config.value;
    try {
      value = JSON.parse(value);
    } catch {
      // 保持字符串
    }
    return success(res, { key: config.key, value, description: config.description });
  } catch (err: any) {
    return error(res, err.message || '获取配置失败', 500);
  }
});

// 批量更新配置
router.put('/batch', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { configs } = req.body;
    if (!configs || typeof configs !== 'object') {
      return error(res, 'configs 必须是对象', 400);
    }

    const results = [];
    for (const [key, value] of Object.entries(configs)) {
      const strValue = typeof value === 'string' ? value : JSON.stringify(value);
      const upserted = await prisma.systemConfig.upsert({
        where: { key },
        update: { value: strValue },
        create: { key, value: strValue },
      });
      results.push(upserted);
    }

    return success(res, { updated: results.length });
  } catch (err: any) {
    return error(res, err.message || '更新配置失败', 500);
  }
});

// 更新单个配置
router.put('/:key', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const key = String(req.params.key);
    const { value, description } = req.body;
    const strValue = typeof value === 'string' ? value : JSON.stringify(value);

    const config = await prisma.systemConfig.upsert({
      where: { key },
      update: { value: strValue, description },
      create: { key, value: strValue, description },
    });

    return success(res, config);
  } catch (err: any) {
    return error(res, err.message || '更新配置失败', 500);
  }
});

// 删除配置
router.delete('/:key', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const key = String(req.params.key);
    await prisma.systemConfig.delete({
      where: { key },
    });
    return success(res, { deleted: true });
  } catch (err: any) {
    return error(res, err.message || '删除配置失败', 500);
  }
});

export default router;
