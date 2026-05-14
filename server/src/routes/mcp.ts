import { Router } from 'express';
import { success, error } from '../utils/response.js';
import { authMiddleware } from '../utils/auth.js';
import type { AuthRequest } from '../utils/auth.js';
import { listMCPTools, executeMCPTool } from '../services/mcpTools.js';
import { getDatabase } from '../config/database.js';

const router = Router();

// GET /api/mcp/agents - 获取所有Agent列表（公开，含启用状态）
router.get('/agents', authMiddleware, async (_req: AuthRequest, res) => {
  try {
    const db = getDatabase();
    const agents = db.prepare('SELECT id, name, goal as description, role, status as enabled FROM agents ORDER BY id').all();
    return success(res, agents);
  } catch (err: any) {
    return error(res, err.message || '获取Agent列表失败', 500);
  }
});

// GET /api/mcp/tools - 列出所有可用工具
router.get('/tools', authMiddleware, async (_req: AuthRequest, res) => {
  try {
    const tools = listMCPTools();
    return success(res, { tools, total: tools.length });
  } catch (err: any) {
    return error(res, err.message || '获取工具列表失败', 500);
  }
});

// POST /api/mcp/execute - 执行工具
router.post('/execute', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { tool, args = {} } = req.body;

    if (!tool) {
      return error(res, '缺少工具名称', 400);
    }

    const result = await executeMCPTool(tool, args);
    return success(res, result);
  } catch (err: any) {
    return error(res, err.message || '执行工具失败', 500);
  }
});

// POST /api/mcp/batch - 批量执行工具
router.post('/batch', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { commands } = req.body;

    if (!Array.isArray(commands)) {
      return error(res, 'commands 必须是数组', 400);
    }

    const results = [];
    for (const cmd of commands) {
      const result = await executeMCPTool(cmd.tool, cmd.args || {});
      results.push({ tool: cmd.tool, args: cmd.args, result });
    }

    return success(res, { results });
  } catch (err: any) {
    return error(res, err.message || '批量执行失败', 500);
  }
});

export default router;
