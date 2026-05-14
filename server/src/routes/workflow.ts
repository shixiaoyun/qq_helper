import { Router } from 'express';
import { z } from 'zod';
import { success, error } from '../utils/response.js';
import { authMiddleware, requireAuth } from '../utils/auth.js';
import type { AuthRequest } from '../utils/auth.js';
import { prismaService } from '../services/prismaService.js';
import { workflowEngine } from '../services/workflowEngine.js';
import { trashService } from '../services/trashService.js';

const router = Router();

// GET /api/workflows - List workflows
router.get('/workflows', authMiddleware, requireAuth, async (req: AuthRequest, res) => {
  try {
    const workflows = await prismaService.workflow.findByUser(req.user!.id);
    return success(res, workflows);
  } catch (err: any) {
    return error(res, err.message || '获取工作流失败', 500);
  }
});

// POST /api/workflows - Create workflow
router.post('/workflows', authMiddleware, requireAuth, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(100),
      description: z.string().optional(),
      nodes: z.array(z.any()),
      edges: z.array(z.any()),
    });

    const data = schema.parse(req.body);
    const workflow = await workflowEngine.createWorkflow(req.user!.id, data);
    return success(res, workflow, '工作流创建成功');
  } catch (err: any) {
    return error(res, err.message || '创建工作流失败', 500);
  }
});

// GET /api/workflows/:id - Get workflow
router.get('/workflows/:id', authMiddleware, requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const workflow = await prismaService.workflow.findById(id);

    if (!workflow || workflow.userId !== req.user!.id) {
      return error(res, '工作流不存在或无权限', 404);
    }

    return success(res, workflow);
  } catch (err: any) {
    return error(res, err.message || '获取工作流失败', 500);
  }
});

// PUT /api/workflows/:id - Update workflow
router.put('/workflows/:id', authMiddleware, requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const workflow = await prismaService.workflow.findById(id);

    if (!workflow || workflow.userId !== req.user!.id) {
      return error(res, '工作流不存在或无权限', 404);
    }

    const schema = z.object({
      name: z.string().optional(),
      description: z.string().optional(),
      nodes: z.array(z.any()).optional(),
      edges: z.array(z.any()).optional(),
    });

    const data = schema.parse(req.body);
    const updated = await workflowEngine.updateWorkflow(id, data);
    return success(res, updated, '工作流更新成功');
  } catch (err: any) {
    return error(res, err.message || '更新工作流失败', 500);
  }
});

// DELETE /api/workflows/:id - Delete workflow
router.delete('/workflows/:id', authMiddleware, requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const workflow = await prismaService.workflow.findById(id);

    if (!workflow || workflow.userId !== req.user!.id) {
      return error(res, '工作流不存在或无权限', 404);
    }

    trashService.moveToTrash('workflows', workflow.id, workflow, workflow.name, workflow.userId, req.user!.id);
    await prismaService.workflow.delete(id);
    return success(res, null, '已移入回收站');
  } catch (err: any) {
    return error(res, err.message || '删除工作流失败', 500);
  }
});

// POST /api/workflows/:id/execute - Execute workflow
router.post('/workflows/:id/execute', authMiddleware, requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const workflow = await prismaService.workflow.findById(id);

    if (!workflow || workflow.userId !== req.user!.id) {
      return error(res, '工作流不存在或无权限', 404);
    }

    const inputs = req.body.inputs || {};
    const result = await workflowEngine.execute(id, inputs);
    return success(res, result, '工作流执行成功');
  } catch (err: any) {
    return error(res, err.message || '执行工作流失败', 500);
  }
});

// GET /api/workflows/:id/runs - Get workflow runs
router.get('/workflows/:id/runs', authMiddleware, requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const runs = await workflowEngine.getRuns(id);
    return success(res, runs);
  } catch (err: any) {
    return error(res, err.message || '获取运行记录失败', 500);
  }
});

export default router;
