import { Router } from 'express';
import { z } from 'zod';
import { success, error } from '../utils/response.js';
import { authMiddleware, requireAuth } from '../utils/auth.js';
import type { AuthRequest } from '../utils/auth.js';
import { prismaService } from '../services/prismaService.js';
import { agentService } from '../services/agentService.js';
import { trashService } from '../services/trashService.js';

const router = Router();

// === Agent Routes ===

// GET /api/agents - List agents
router.get('/agents', authMiddleware, requireAuth, async (req: AuthRequest, res) => {
  try {
    const agents = await prismaService.agent.findByUser(req.user!.id);
    return success(res, agents);
  } catch (err: any) {
    return error(res, err.message || '获取Agent失败', 500);
  }
});

// POST /api/agents - Create agent
router.post('/agents', authMiddleware, requireAuth, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(100),
      role: z.string().min(1),
      goal: z.string().min(1),
      backstory: z.string().optional(),
      tools: z.array(z.string()).optional(),
      model: z.string().optional(),
      temperature: z.number().optional(),
    });

    const data = schema.parse(req.body);
    const agent = await agentService.createAgent(req.user!.id, data);
    return success(res, agent, 'Agent创建成功');
  } catch (err: any) {
    return error(res, err.message || '创建Agent失败', 500);
  }
});

// GET /api/agents/:id - Get agent
router.get('/agents/:id', authMiddleware, requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const agent = await prismaService.agent.findById(id);

    if (!agent || agent.userId !== req.user!.id) {
      return error(res, 'Agent不存在或无权限', 404);
    }

    return success(res, agent);
  } catch (err: any) {
    return error(res, err.message || '获取Agent失败', 500);
  }
});

// PUT /api/agents/:id - Update agent
router.put('/agents/:id', authMiddleware, requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const agent = await prismaService.agent.findById(id);

    if (!agent || agent.userId !== req.user!.id) {
      return error(res, 'Agent不存在或无权限', 404);
    }

    const updateData: any = {};
    if (req.body.name) updateData.name = req.body.name;
    if (req.body.role) updateData.role = req.body.role;
    if (req.body.goal) updateData.goal = req.body.goal;
    if (req.body.backstory !== undefined) updateData.backstory = req.body.backstory;
    if (req.body.tools) updateData.tools = JSON.stringify(req.body.tools);
    if (req.body.model) updateData.model = req.body.model;
    if (req.body.temperature !== undefined) updateData.temperature = req.body.temperature;

    const updated = await prismaService.agent.update(id, updateData);
    return success(res, updated, 'Agent更新成功');
  } catch (err: any) {
    return error(res, err.message || '更新Agent失败', 500);
  }
});

// DELETE /api/agents/:id - Delete agent
router.delete('/agents/:id', authMiddleware, requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const agent = await prismaService.agent.findById(id);

    if (!agent || agent.userId !== req.user!.id) {
      return error(res, 'Agent不存在或无权限', 404);
    }

    trashService.moveToTrash('agents', agent.id, agent, agent.name, agent.userId, req.user!.id);
    await prismaService.agent.delete(id);
    return success(res, null, '已移入回收站');
  } catch (err: any) {
    return error(res, err.message || '删除Agent失败', 500);
  }
});

// === Crew Routes ===

// GET /api/crews - List crews
router.get('/crews', authMiddleware, requireAuth, async (req: AuthRequest, res) => {
  try {
    const crews = await prismaService.crew.findByUser(req.user!.id);
    return success(res, crews);
  } catch (err: any) {
    return error(res, err.message || '获取Crew失败', 500);
  }
});

// POST /api/crews - Create crew
router.post('/crews', authMiddleware, requireAuth, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(100),
      description: z.string().optional(),
      process: z.enum(['sequential', 'hierarchical']).optional(),
      agents: z.array(z.number()).min(1),
    });

    const data = schema.parse(req.body);
    const crew = await agentService.createCrew(req.user!.id, data);
    return success(res, crew, 'Crew创建成功');
  } catch (err: any) {
    return error(res, err.message || '创建Crew失败', 500);
  }
});

// GET /api/crews/:id - Get crew with members
router.get('/crews/:id', authMiddleware, requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const crew = await prismaService.crew.findById(id);

    if (!crew || crew.userId !== req.user!.id) {
      return error(res, 'Crew不存在或无权限', 404);
    }

    return success(res, crew);
  } catch (err: any) {
    return error(res, err.message || '获取Crew失败', 500);
  }
});

// DELETE /api/crews/:id - Delete crew
router.delete('/crews/:id', authMiddleware, requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const crew = await prismaService.crew.findById(id);

    if (!crew || crew.userId !== req.user!.id) {
      return error(res, 'Crew不存在或无权限', 404);
    }

    trashService.moveToTrash('crews', crew.id, crew, crew.name, crew.userId, req.user!.id);
    await agentService.deleteCrew(id);
    return success(res, null, '已移入回收站');
  } catch (err: any) {
    return error(res, err.message || '删除Crew失败', 500);
  }
});

// POST /api/crews/:id/execute - Execute crew task
router.post('/crews/:id/execute', authMiddleware, requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const crew = await prismaService.crew.findById(id);

    if (!crew || crew.userId !== req.user!.id) {
      return error(res, 'Crew不存在或无权限', 404);
    }

    const schema = z.object({
      task: z.string().min(1),
    });

    const data = schema.parse(req.body);
    const result = await agentService.executeCrew(id, req.user!.id, data.task);
    return success(res, result, '任务执行成功');
  } catch (err: any) {
    return error(res, err.message || '执行任务失败', 500);
  }
});

// GET /api/crews/:id/runs - Get crew runs
router.get('/crews/:id/runs', authMiddleware, requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const runs = await agentService.getCrewRuns(id);
    return success(res, runs);
  } catch (err: any) {
    return error(res, err.message || '获取运行记录失败', 500);
  }
});

export default router;
