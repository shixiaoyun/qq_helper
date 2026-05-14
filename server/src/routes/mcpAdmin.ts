import { Router } from 'express';
import { success, error } from '../utils/response.js';
import { authMiddleware } from '../utils/auth.js';
import type { AuthRequest } from '../utils/auth.js';
import { mcpService } from '../services/mcpService.js';
import { listMCPTools, executeMCPTool } from '../services/mcpTools.js';
import { prisma } from '../config/prisma.js';

const router = Router();

// 获取所有MCP工具（带启用状态）
router.get('/tools', authMiddleware, async (_req: AuthRequest, res) => {
  try {
    // 获取工具列表
    const allTools = listMCPTools();
    const builtinTools = mcpService.listTools().filter(t =>
      !allTools.find(mt => mt.name === t.name)
    );
    const combinedTools = [...builtinTools, ...allTools];

    // 获取禁用状态
    const disabledConfig = await prisma.systemConfig.findUnique({
      where: { key: 'mcp_disabled_tools' },
    });
    const disabledTools: string[] = disabledConfig ? JSON.parse(disabledConfig.value) : [];

    const toolsWithStatus = combinedTools.map(t => ({
      ...t,
      enabled: !disabledTools.includes(t.name),
      category: getToolCategory(t.name),
    }));

    return success(res, {
      tools: toolsWithStatus,
      total: toolsWithStatus.length,
      enabled: toolsWithStatus.filter(t => t.enabled).length,
      disabled: toolsWithStatus.filter(t => !t.enabled).length,
    });
  } catch (err: any) {
    return error(res, err.message || '获取工具列表失败', 500);
  }
});

// 启用/禁用工具
router.put('/tools/:name/toggle', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const name = String(req.params.name);
    const { enabled } = req.body;

    const disabledConfig = await prisma.systemConfig.findUnique({
      where: { key: 'mcp_disabled_tools' },
    });
    let disabledTools: string[] = disabledConfig ? JSON.parse(disabledConfig.value) : [];

    if (enabled) {
      disabledTools = disabledTools.filter(t => t !== name);
    } else {
      if (!disabledTools.includes(name)) {
        disabledTools.push(name);
      }
    }

    await prisma.systemConfig.upsert({
      where: { key: 'mcp_disabled_tools' },
      update: { value: JSON.stringify(disabledTools) },
      create: { key: 'mcp_disabled_tools', value: JSON.stringify(disabledTools) },
    });

    return success(res, { name, enabled, disabledCount: disabledTools.length });
  } catch (err: any) {
    return error(res, err.message || '切换工具状态失败', 500);
  }
});

// 测试工具
router.post('/tools/:name/test', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const name = String(req.params.name);
    const { args = {} } = req.body;

    const result = await executeMCPTool(name, args);
    return success(res, result);
  } catch (err: any) {
    return error(res, err.message || '测试工具失败', 500);
  }
});

// 获取工具调用统计
router.get('/stats', authMiddleware, async (_req: AuthRequest, res) => {
  try {
    // 这里可以从日志或专门的统计表获取数据
    // 简化版本返回模拟数据
    return success(res, {
      totalCalls: 0,
      successRate: 100,
      avgLatency: 0,
      topTools: [],
      recentCalls: [],
    });
  } catch (err: any) {
    return error(res, err.message || '获取统计失败', 500);
  }
});

function getToolCategory(name: string): string {
  if (name.startsWith('browser_')) return 'browser';
  if (name.startsWith('fs_')) return 'filesystem';
  if (name.startsWith('git_')) return 'git';
  if (name.startsWith('db_')) return 'database';
  if (name.startsWith('shell_')) return 'shell';
  if (name.startsWith('http_') || name.startsWith('api_')) return 'api';
  if (name.startsWith('code_')) return 'code';
  if (name === 'system_info') return 'system';
  return 'other';
}

export default router;
