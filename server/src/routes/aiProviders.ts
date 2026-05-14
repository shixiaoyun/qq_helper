import { Router } from 'express';
import { z } from 'zod';
import { success, error } from '../utils/response.js';
import { authMiddleware, requireAdmin } from '../utils/auth.js';
import type { AuthRequest } from '../utils/auth.js';
import { trashService } from '../services/trashService.js';
import {
  getAllProviders,
  getProviderById,
  createProvider,
  updateProvider,
  deleteProvider,
  checkProviderHealth,
} from '../models/aiProvider.js';

const router = Router();

// GET /api/admin/ai-providers - 管理员获取所有提供商
router.get('/ai-providers', authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const providers = getAllProviders();
    return success(res, providers.map(p => ({
      id: p.id,
      name: p.name,
      provider: p.provider,
      baseUrl: p.baseUrl,
      apiKey: p.apiKey ? '••••••••' + p.apiKey.slice(-4) : '',
      model: p.model,
      models: p.models,
      isActive: p.isActive,
      isDefault: p.isDefault,
      temperature: p.temperature,
      maxTokens: p.maxTokens,
      timeout: p.timeout,
      wakeWord: p.wakeWord,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })));
  } catch (err: any) {
    return error(res, err.message || '获取提供商列表失败', 500);
  }
});

// GET /api/ai-providers - 用户获取启用的提供商列表
router.get('/ai-providers', authMiddleware, async (_req, res) => {
  try {
    const providers = getAllProviders().filter(p => p.isActive === 1);
    return success(res, providers.map(p => ({
      id: p.id,
      name: p.name,
      provider: p.provider,
      model: p.model,
      models: p.models,
      isDefault: p.isDefault,
      temperature: p.temperature,
      maxTokens: p.maxTokens,
    })));
  } catch (err: any) {
    return error(res, err.message || '获取提供商列表失败', 500);
  }
});

// POST /api/admin/ai-providers
router.post('/ai-providers', authMiddleware, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      name: z.string().min(1),
      provider: z.enum(['ollama', 'dashscope', 'openai', 'custom', 'deepseek']),
      baseUrl: z.string().min(1),
      apiKey: z.string().optional(),
      model: z.string().min(1),
      models: z.array(z.string()).optional(),
      isActive: z.number().optional(),
      isDefault: z.number().optional(),
      temperature: z.number().optional(),
      maxTokens: z.number().optional(),
      timeout: z.number().optional(),
      wakeWord: z.string().optional(),
    });

    const data = schema.parse(req.body);

    const id = createProvider({
      name: data.name,
      provider: data.provider,
      baseUrl: data.baseUrl,
      apiKey: data.apiKey || '',
      model: data.model,
      models: data.models || [data.model],
      isActive: data.isActive ?? 1,
      isDefault: data.isDefault ?? 0,
      temperature: data.temperature ?? 0.7,
      maxTokens: data.maxTokens ?? 2048,
      timeout: data.timeout ?? 30000,
      wakeWord: data.wakeWord ?? '小牛',
    });

    return success(res, { id }, '创建成功');
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return error(res, err.errors[0].message, 400);
    }
    return error(res, err.message || '创建失败', 500);
  }
});

// PUT /api/admin/ai-providers
router.put('/ai-providers', authMiddleware, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      id: z.number(),
      name: z.string().optional(),
      provider: z.enum(['ollama', 'dashscope', 'openai', 'custom', 'deepseek']).optional(),
      baseUrl: z.string().optional(),
      apiKey: z.string().optional(),
      model: z.string().optional(),
      models: z.array(z.string()).optional(),
      isActive: z.number().optional(),
      isDefault: z.number().optional(),
      temperature: z.number().optional(),
      maxTokens: z.number().optional(),
      timeout: z.number().optional(),
      wakeWord: z.string().optional(),
    });

    const data = schema.parse(req.body);
    const { id, ...updateData } = data;

    // 如果 apiKey 包含掩码字符或为空字符串，则不更新
    const filteredUpdate: any = { ...updateData };
    if (filteredUpdate.apiKey && filteredUpdate.apiKey.includes('•')) {
      delete filteredUpdate.apiKey;
    }
    if (filteredUpdate.apiKey === '') {
      delete filteredUpdate.apiKey;
    }

    const success_update = updateProvider(id, filteredUpdate);
    if (!success_update) {
      return error(res, '提供商不存在', 404);
    }

    return success(res, null, '更新成功');
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return error(res, err.errors[0].message, 400);
    }
    return error(res, err.message || '更新失败', 500);
  }
});

// DELETE /api/admin/ai-providers?id=:id
router.delete('/ai-providers', authMiddleware, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.query.id);
    if (!id) {
      return error(res, '缺少id参数', 400);
    }

    const provider = getProviderById(Number(id));
    if (provider) {
      trashService.moveToTrash('ai_providers', provider.id, provider, provider.name);
    }
    const success_delete = deleteProvider(id);
    if (!success_delete) {
      return error(res, '提供商不存在', 404);
    }

    return success(res, null, '已移入回收站');
  } catch (err: any) {
    return error(res, err.message || '删除失败', 500);
  }
});

// POST /api/admin/ai-providers/health - 测试连通性
router.post('/ai-providers/health', authMiddleware, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.body;
    if (!id) {
      return error(res, '缺少id参数', 400);
    }

    const provider = getProviderById(Number(id));
    if (!provider) {
      return error(res, '提供商不存在', 404);
    }

    const status = await checkProviderHealth(provider);
    return success(res, status);
  } catch (err: any) {
    return error(res, err.message || '检测失败', 500);
  }
});

export default router;
