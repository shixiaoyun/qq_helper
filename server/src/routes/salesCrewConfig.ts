import { Router } from 'express';
import { authMiddleware, requireAdmin } from '../utils/auth.js';
import { mcpRegistry } from '../mcp-tools/index.js';
import { getDatabase } from '../config/database.js';
import { chatWithProvider, getDefaultProvider } from '../models/aiProvider.js';
// 测试接口不依赖知识库，避免搜索超时拖慢响应

const router = Router();

// 内置Agent ID列表（不允许删除）
const BUILT_IN_AGENT_IDS = new Set([
  'sales-manager', 'customer-researcher', 'product-expert',
  'sales-coach', 'solution-architect', 'legal-compliance', 'discovery-coach',
]);

// ==========================================
// 销售作战团队配置管理 API (Q1.17)
// 支持：
// 1. Agent角色管理（CRUD）
// 2. Crew工作流管理
// 3. 提示词模板管理
// 4. 模型参数调整
// 5. Agent实时测试（接入真实AI模型）
// ==========================================

// 获取所有Agent配置
router.get('/agents', authMiddleware, (_req, res) => {
  try {
    const agents = mcpRegistry.listAgents();
    res.json({ success: true, data: agents });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取单个Agent配置
router.get('/agents/:agentId', authMiddleware, (req, res) => {
  try {
    const agent = mcpRegistry.getAgent(req.params.agentId as string);
    if (!agent) {
      res.status(404).json({ success: false, error: 'Agent不存在' });
      return;
    }
    res.json({ success: true, data: agent });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 更新Agent配置
router.put('/agents/:agentId', authMiddleware, (req, res) => {
  try {
    const { name, role, goal, backstory, model, temperature, maxTokens } = req.body;
    const agent = mcpRegistry.getAgent(req.params.agentId as string);
    if (!agent) {
      res.status(404).json({ success: false, error: 'Agent不存在' });
      return;
    }

    // 更新配置
    const updatedAgent = {
      ...agent,
      name: name || agent.name,
      role: role || agent.role,
      goal: goal || agent.goal,
      backstory: backstory || agent.backstory,
      model: model || agent.model,
      temperature: temperature !== undefined ? temperature : agent.temperature,
      maxTokens: maxTokens !== undefined ? maxTokens : agent.maxTokens,
    };

    mcpRegistry.registerAgent(updatedAgent);

    // 如果是自定义Agent，同步更新到数据库
    if (!BUILT_IN_AGENT_IDS.has(req.params.agentId as string)) {
      try {
        const db = getDatabase();
        db.prepare(`
          UPDATE custom_agents SET
            name = ?, role = ?, goal = ?, backstory = ?,
            model = ?, temperature = ?, max_tokens = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE agent_id = ?
        `).run(
          updatedAgent.name, updatedAgent.role, updatedAgent.goal, updatedAgent.backstory,
          updatedAgent.model, updatedAgent.temperature, updatedAgent.maxTokens,
          req.params.agentId
        );
      } catch (dbErr: any) {
        console.warn('[SalesCrewConfig] 自定义Agent数据库更新失败:', dbErr.message);
      }
    }

    res.json({ success: true, data: updatedAgent });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 创建自定义Agent
router.post('/agents', authMiddleware, requireAdmin, (req, res) => {
  try {
    const { name, role, goal, backstory, model, temperature, maxTokens, tools, knowledgeBases } = req.body;
    if (!name || !role || !goal) {
      res.status(400).json({ success: false, error: '名称、角色定位、目标为必填项' });
      return;
    }

    const db = getDatabase();

    // 生成唯一agent_id
    const agentId = `custom-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    const newAgent = {
      id: agentId,
      name,
      role,
      goal,
      backstory: backstory || '',
      tools: tools || [],
      knowledgeBases: knowledgeBases || [],
      model: model || 'deepseek-v4-pro',
      temperature: temperature ?? 0.7,
      maxTokens: maxTokens ?? 4096,
      enabled: true,
    };

    // 写入数据库
    db.prepare(`
      INSERT INTO custom_agents (agent_id, name, role, goal, backstory, tools, knowledge_bases, model, temperature, max_tokens, enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      agentId, name, role, goal, backstory || '',
      JSON.stringify(tools || []), JSON.stringify(knowledgeBases || []),
      newAgent.model, newAgent.temperature, newAgent.maxTokens, 1
    );

    // 注册到MCPRegistry
    mcpRegistry.registerAgent(newAgent);

    res.json({ success: true, data: newAgent });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 删除自定义Agent
router.delete('/agents/:agentId', authMiddleware, requireAdmin, (req, res) => {
  try {
    const agentId = req.params.agentId as string;

    // 检查是否为内置Agent
    if (BUILT_IN_AGENT_IDS.has(agentId)) {
      res.status(400).json({ success: false, error: '内置Agent不允许删除' });
      return;
    }

    const agent = mcpRegistry.getAgent(agentId);
    if (!agent) {
      res.status(404).json({ success: false, error: 'Agent不存在' });
      return;
    }

    // 从数据库删除
    const db = getDatabase();
    const result = db.prepare('DELETE FROM custom_agents WHERE agent_id = ?').run(agentId);
    if (result.changes === 0) {
      res.status(404).json({ success: false, error: '数据库记录不存在' });
      return;
    }

    // 从MCPRegistry移除
    mcpRegistry.removeAgent(agentId);

    res.json({ success: true, data: { agentId }, message: 'Agent已删除' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取所有Crew配置
router.get('/crews', authMiddleware, (_req, res) => {
  try {
    const crews = mcpRegistry.listCrews();
    res.json({ success: true, data: crews });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取所有任务配置
router.get('/tasks', authMiddleware, (_req, res) => {
  try {
    const tasks = mcpRegistry.listTasks();
    res.json({ success: true, data: tasks });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取系统统计信息
router.get('/stats', authMiddleware, (_req, res) => {
  try {
    const stats = mcpRegistry.getStats();
    res.json({ success: true, data: stats });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 测试Agent（接入真实AI模型，流式响应）
router.post('/agents/:agentId/test', authMiddleware, async (req, res) => {
  try {
    const { message, vendor } = req.body;
    const agentId = req.params.agentId as string;

    const agent = mcpRegistry.getAgent(agentId);
    if (!agent) {
      res.status(404).json({ success: false, error: 'Agent不存在' });
      return;
    }

    // 获取AI提供商配置
    const providerConfig = getDefaultProvider();
    if (!providerConfig) {
      res.status(500).json({ success: false, error: '未找到可用的AI提供商' });
      return;
    }

    // 测试模式：不搜索知识库，直接用Agent的backstory作为提示词
    // 知识库搜索会拖慢响应速度（特别是牛马引擎不可用时）
    const systemPrompt = agent.backstory;

    // 调用AI模型
    const startTime = Date.now();
    const aiResp = await chatWithProvider(providerConfig, {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
      model: agent.model || providerConfig.model,
      temperature: agent.temperature ?? 0.7,
      maxTokens: agent.maxTokens ?? 2048,
      stream: false,
    });

    if (!aiResp.ok) {
      const errorText = await aiResp.text().catch(() => `HTTP ${aiResp.status}`);
      res.status(500).json({ success: false, error: `AI调用失败: ${errorText}` });
      return;
    }

    const data = await aiResp.json() as any;
    const content = data.choices?.[0]?.message?.content || data.message?.content || '无响应';
    const latencyMs = Date.now() - startTime;

    // 估算token
    const estimateTokens = (text: string): number => {
      let count = 0;
      for (const char of text) {
        count += char.charCodeAt(0) > 127 ? 1.5 : 0.6;
      }
      return Math.ceil(count);
    };

    const tokensIn = estimateTokens(systemPrompt + message);
    const tokensOut = estimateTokens(content);

    res.json({
      success: true,
      data: {
        agentId,
        agentName: agent.name,
        testMessage: message,
        vendor,
        response: content,
        config: {
          model: agent.model || providerConfig.model,
          temperature: agent.temperature ?? 0.7,
          maxTokens: agent.maxTokens ?? 2048,
        },
        latencyMs,
        tokensIn,
        tokensOut,
        knowledgeUsed: false,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
