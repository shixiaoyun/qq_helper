import { Router } from 'express';
import { success, error } from '../utils/response.js';
import { authMiddleware } from '../utils/auth.js';
import type { AuthRequest } from '../utils/auth.js';
import { mcpRegistry } from '../mcp-tools/_core/index.js';
import { salesAgents } from '../mcp-tools/sales-crew/agents.js';
import { prisma } from '../config/prisma.js';

// Q1.31: 同步内存中Agent的启用状态
function syncAgentEnabledInMemory(agentId: string, enabled: boolean): void {
  const agent = salesAgents.find(a => a.id === agentId);
  if (agent) {
    agent.enabled = enabled;
    console.log(`[MCPAgents] 内存同步: Agent ${agentId} enabled=${enabled}`);
  }
}

const router = Router();

// 获取所有Agent（含启用状态）
router.get('/', authMiddleware, async (_req: AuthRequest, res) => {
  try {
    const agents = mcpRegistry.listAgents();
    const disabledConfig = await prisma.systemConfig.findUnique({
      where: { key: 'mcp_disabled_agents' },
    });
    const disabledAgents: string[] = disabledConfig ? JSON.parse(disabledConfig.value) : [];

    const agentsWithStatus = agents.map(a => ({
      id: a.id,
      name: a.name,
      role: a.role,
      goal: a.goal,
      model: a.model,
      enabled: !disabledAgents.includes(a.id),
    }));

    return success(res, {
      agents: agentsWithStatus,
      total: agentsWithStatus.length,
      enabled: agentsWithStatus.filter(a => a.enabled).length,
      disabled: agentsWithStatus.filter(a => !a.enabled).length,
    });
  } catch (err: any) {
    return error(res, err.message || '获取Agent列表失败', 500);
  }
});

// 启用/禁用Agent
router.put('/:id/toggle', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = String(req.params.id);
    const { enabled } = req.body;

    // 验证Agent是否存在
    const agent = mcpRegistry.getAgent(id);
    if (!agent) {
      return error(res, 'Agent不存在', 404);
    }

    const disabledConfig = await prisma.systemConfig.findUnique({
      where: { key: 'mcp_disabled_agents' },
    });
    let disabledAgents: string[] = disabledConfig ? JSON.parse(disabledConfig.value) : [];

    if (enabled) {
      disabledAgents = disabledAgents.filter(a => a !== id);
    } else {
      if (!disabledAgents.includes(id)) {
        disabledAgents.push(id);
      }
    }

    await prisma.systemConfig.upsert({
      where: { key: 'mcp_disabled_agents' },
      update: { value: JSON.stringify(disabledAgents) },
      create: { key: 'mcp_disabled_agents', value: JSON.stringify(disabledAgents) },
    });

    // Q1.31: 同步内存状态
    syncAgentEnabledInMemory(id, enabled);

    return success(res, { id, name: agent.name, enabled, disabledCount: disabledAgents.length });
  } catch (err: any) {
    return error(res, err.message || '切换Agent状态失败', 500);
  }
});

// 获取单个Agent详情
router.get('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = String(req.params.id);
    const agent = mcpRegistry.getAgent(id);
    if (!agent) {
      return error(res, 'Agent不存在', 404);
    }

    const disabledConfig = await prisma.systemConfig.findUnique({
      where: { key: 'mcp_disabled_agents' },
    });
    const disabledAgents: string[] = disabledConfig ? JSON.parse(disabledConfig.value) : [];

    return success(res, {
      ...agent,
      enabled: !disabledAgents.includes(id),
    });
  } catch (err: any) {
    return error(res, err.message || '获取Agent详情失败', 500);
  }
});

export default router;
