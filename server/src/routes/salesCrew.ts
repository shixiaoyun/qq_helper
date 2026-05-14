import { Router } from 'express';
import { authMiddleware } from '../utils/auth.js';
import { mcpRegistry } from '../mcp-tools/index.js';
import { salesCrewService } from '../services/salesCrewService.js';
import { trashService } from '../services/trashService.js';
import { executeCrewChatStream } from '../services/salesCrewEngine.js';
import { checkUserTokenLimits } from '../models/tokenLimits.js';
import { getDatabase } from '../config/database.js';

const router = Router();

// ==========================================
// 销售作战团队 API路由 (Q1.17)
// ==========================================

// 获取可用的Crew列表
router.get('/crews', authMiddleware, (_req, res) => {
  try {
    const crews = mcpRegistry.listCrews();
    res.json({ success: true, data: crews });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取Agent列表
router.get('/agents', authMiddleware, (_req, res) => {
  try {
    const agents = mcpRegistry.listAgents();
    res.json({ success: true, data: agents });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取任务列表
router.get('/tasks', authMiddleware, (_req, res) => {
  try {
    const tasks = mcpRegistry.listTasks();
    res.json({ success: true, data: tasks });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 会话管理 API
// ==========================================

router.post('/sessions', authMiddleware, (req, res) => {
  try {
    const userId = (req as any).user?.id || 1;
    const { crewId, vendor, title, customerId } = req.body;
    const sessionId = salesCrewService.createSession(userId, crewId, vendor, title, customerId);
    const session = salesCrewService.getSession(sessionId);
    res.json({ success: true, data: session });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 根据客户ID获取或创建会话
router.get('/sessions/customer/:customerId', authMiddleware, (req, res) => {
  try {
    const userId = (req as any).user?.id || 1;
    const customerId = parseInt(req.params.customerId as string);
    const db = getDatabase();
    let session = salesCrewService.getSessionByCustomer(userId, customerId);
    if (!session) {
      const customer = db.prepare('SELECT company, name FROM crm_customers WHERE id = ?').get(customerId) as any;
      const title = customer ? `${customer.company || customer.name} 销售教练` : '销售教练';
      const sessionId = salesCrewService.createSession(userId, undefined, undefined, title, customerId);
      session = salesCrewService.getSession(sessionId);
    }
    const messages = session ? salesCrewService.getMessagesBySession(session.id) : [];
    res.json({ success: true, data: { session, messages } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/sessions', authMiddleware, (req, res) => {
  try {
    const userId = (req as any).user?.id || 1;
    const sessions = salesCrewService.getSessionsByUser(userId);
    res.json({ success: true, data: sessions });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/sessions/:sessionId', authMiddleware, (req, res) => {
  try {
    const sessionId = parseInt(req.params.sessionId as string);
    const session = salesCrewService.getSession(sessionId);
    if (!session) {
      res.status(404).json({ success: false, error: '会话不存在' });
      return;
    }
    const messages = salesCrewService.getMessagesBySession(sessionId);
    res.json({ success: true, data: { session, messages } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/sessions/:sessionId', authMiddleware, (req, res) => {
  try {
    const sessionId = parseInt(req.params.sessionId as string);
    const userId = (req as any).user?.id;
    const session = salesCrewService.getSession(sessionId);
    const messages = salesCrewService.getRecentMessages(sessionId, 1000);
    if (session) {
      trashService.moveToTrash('sales_crew_sessions', sessionId, {
        session,
        messages,
      }, session.title || `会话#${sessionId}`, userId, userId);
    }
    salesCrewService.deleteSession(sessionId);
    res.json({ success: true, message: '已移入回收站' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Q1.21新增：获取回收站中的会话列表
router.get('/sessions/deleted', authMiddleware, (req, res) => {
  try {
    const userId = (req as any).user?.id || 1;
    const sessions = salesCrewService.getDeletedSessionsByUser(userId);
    res.json({ success: true, data: sessions });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Q1.21新增：从回收站恢复会话
router.put('/sessions/:sessionId/restore', authMiddleware, (req, res) => {
  try {
    const sessionId = parseInt(req.params.sessionId as string);
    const restored = salesCrewService.restoreSession(sessionId);
    if (!restored) {
      res.status(404).json({ success: false, error: '会话不存在或未被删除' });
      return;
    }
    res.json({ success: true, message: '会话已恢复' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Q1.21新增：永久删除会话（回收站中彻底删除）
router.delete('/sessions/:sessionId/permanent', authMiddleware, (req, res) => {
  try {
    const sessionId = parseInt(req.params.sessionId as string);
    salesCrewService.permanentDeleteSession(sessionId);
    res.json({ success: true, message: '会话已永久删除' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 多Agent协作对话 API - 流式响应
// ==========================================

router.post('/chat', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).user?.id || 1;
    const { message, sessionId, crewId, vendor, model } = req.body;

    if (!message) {
      res.status(400).json({ success: false, error: '消息不能为空' });
      return;
    }

    // Token阈值检查
    const tokenCheck = checkUserTokenLimits(userId);
    if (!tokenCheck.allowed) {
      res.status(429).json({ success: false, error: tokenCheck.message });
      return;
    }

    // 获取或创建会话
    let currentSessionId = sessionId;
    if (!currentSessionId) {
      currentSessionId = salesCrewService.createSession(userId, crewId, vendor, message.slice(0, 30));
    }

    // 设置SSE响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    (res as any).flushHeaders?.();

    // 发送会话ID
    res.write(`data: ${JSON.stringify({ type: 'session', sessionId: currentSessionId })}

`);

    let summarySent = false;
    let totalTokensIn = 0;
    let totalTokensOut = 0;

    // 执行多Agent协作
    await executeCrewChatStream(
      userId,
      currentSessionId,
      message,
      crewId,
      vendor,
      model,
      // onAgentStart
      (agentId, agentName) => {
        res.write(`data: ${JSON.stringify({ type: 'agent_start', agentId, agentName })}

`);
      },
      // onAgentChunk
      (agentId, chunk) => {
        res.write(`data: ${JSON.stringify({ type: 'agent_chunk', agentId, chunk })}

`);
      },
      // onAgentComplete
      (agentId, fullContent, tokensIn, tokensOut) => {
        totalTokensIn += tokensIn || 0;
        totalTokensOut += tokensOut || 0;
        res.write(`data: ${JSON.stringify({ type: 'agent_complete', agentId, fullContent, tokensIn, tokensOut })}

`);
      },
      // onSummaryStart
      () => {
        res.write(`data: ${JSON.stringify({ type: 'summary_start' })}

`);
      },
      // onSummaryChunk
      (chunk) => {
        res.write(`data: ${JSON.stringify({ type: 'summary_chunk', chunk })}

`);
      },
      // onSummaryComplete
      (fullContent, tokensIn, tokensOut) => {
        totalTokensIn += tokensIn || 0;
        totalTokensOut += tokensOut || 0;
        summarySent = true;
        res.write(`data: ${JSON.stringify({ type: 'summary_complete', fullContent, tokensIn, tokensOut })}

`);
        res.write(`data: ${JSON.stringify({ type: 'done' })}

`);
        res.end();

        // 记录Token使用
        try {
          const dbToken = getDatabase();
          dbToken.prepare(
            'INSERT INTO token_usage (user_id, conversation_id, message_id, provider, model, tokens_input, tokens_output, total_tokens) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          ).run(userId, currentSessionId, 0, 'deepseek', model || 'deepseek-v4-pro', totalTokensIn, totalTokensOut, totalTokensIn + totalTokensOut);
        } catch (e) {
          console.error('[SalesCrew] 记录Token使用失败:', e);
        }
      }
    );

    // 如果没有触发summary_complete（单Agent情况），发送done并记录token
    if (!summarySent && !res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type: 'done' })}

`);
      res.end();

      try {
        const dbToken = getDatabase();
        dbToken.prepare(
          'INSERT INTO token_usage (user_id, conversation_id, message_id, provider, model, tokens_input, tokens_output, total_tokens) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(userId, currentSessionId, 0, 'deepseek', model || 'deepseek-v4-pro', totalTokensIn, totalTokensOut, totalTokensIn + totalTokensOut);
      } catch (e) {
        console.error('[SalesCrew] 记录Token使用失败:', e);
      }
    }

  } catch (err: any) {
    console.error('[SalesCrew] 对话错误:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message });
    } else if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}

`);
      res.end();
    }
  }
});

// 执行特定工具
router.post('/tool/:toolName', authMiddleware, async (req, res) => {
  try {
    const toolName = req.params.toolName as string;
    const args = req.body;
    const result = await mcpRegistry.executeTool(toolName, args);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取MCP统计信息
router.get('/stats', authMiddleware, (_req, res) => {
  try {
    const stats = mcpRegistry.getStats();
    res.json({ success: true, data: stats });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// Q1.18新增：战后复盘与成单预测API
// ==========================================

// 生成战后复盘分析
router.post('/sessions/:sessionId/analyze', authMiddleware, (req, res) => {
  try {
    const sessionId = parseInt(req.params.sessionId as string);
    const analysis = salesCrewService.analyzeSession(sessionId);
    salesCrewService.saveAnalysis(sessionId, analysis);
    res.json({ success: true, data: analysis });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取战后复盘分析
router.get('/sessions/:sessionId/analysis', authMiddleware, (req, res) => {
  try {
    const sessionId = parseInt(req.params.sessionId as string);
    const analysis = salesCrewService.getAnalysis(sessionId);
    if (!analysis) {
      res.status(404).json({ success: false, error: '分析结果不存在' });
      return;
    }
    res.json({ success: true, data: analysis });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取成单预测（实时计算）
router.get('/sessions/:sessionId/prediction', authMiddleware, (req, res) => {
  try {
    const sessionId = parseInt(req.params.sessionId as string);
    const analysis = salesCrewService.analyzeSession(sessionId);

    // 生成预测报告
    const prediction = {
      sessionId,
      closeProbability: analysis.closeProbability,
      probabilityLevel: analysis.closeProbability >= 70 ? 'high' :
                        analysis.closeProbability >= 40 ? 'medium' : 'low',
      attitudeStage: analysis.attitudeStage,
      attitudeStageLabel: {
        denial: '否认期',
        panic: '恐慌期',
        bargaining: '讨价还价期',
        acceptance: '接受期',
        execution: '执行期',
        unknown: '未知',
      }[analysis.attitudeStage] || '未知',
      decisionChainCompleteness: analysis.decisionChainCompleteness,
      keyRisks: analysis.riskFactors,
      nextActions: analysis.nextActions,
      estimatedCloseDays: analysis.attitudeStage === 'execution' ? 7 :
                          analysis.attitudeStage === 'acceptance' ? 14 :
                          analysis.attitudeStage === 'bargaining' ? 30 :
                          analysis.attitudeStage === 'panic' ? 45 :
                          analysis.attitudeStage === 'denial' ? 60 : null,
    };

    res.json({ success: true, data: prediction });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
