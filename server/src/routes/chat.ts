import { Router } from 'express';
import { z } from 'zod';
import { success, error } from '../utils/response.js';
import { authMiddleware, requireAuth } from '../utils/auth.js';
import type { AuthRequest } from '../utils/auth.js';
import { trashService } from '../services/trashService.js';
import {
  createConversation,
  getConversationById,
  getConversationsByUser,
  updateConversation,
  deleteConversation,
  createMessage,
  getMessagesByConversation,
  getMessagesForContext,
  clearConversationMessages,
  autoCleanupUserStorage,
} from '../models/conversation.js';
import { recordTokenUsage } from '../models/stats.js';
import { getProviderById, getDefaultProvider, chatWithProvider } from '../models/aiProvider.js';
import { isNiumaEngineEnabled, isWebSearchEnabled } from '../models/systemConfig.js';
import {
  callNiumaTool,
  parseToolCall,
  removeToolCallMarkers,
} from '../services/niumaTools.js';
import { searchWeb, formatSearchResultsForLLM } from '../services/webSearch.js';
import { checkDailyChatLimit, incrementTodayChatCount } from '../models/dailyChatLimit.js';
import { getUserById } from '../models/user.js';
import { setupSSE, sendSSEChunk, sendSSEDone, sendSSEError, sendSSEThinking, sendSSEToolCall } from '../services/streamService.js';
import { mcpService } from '../services/mcpService.js';
import { ragService } from '../services/ragService.js';
import { filterSensitiveWords } from '../services/sensitiveWordFilter.js';
import { RateLimiter } from '../services/rateLimiter.js';
import { logAudit } from '../services/auditLog.js';
const LEGACY_AUDIT_CHAT = 'chat_message' as const;

const router = Router();
const rateLimiter = new RateLimiter();

// GET /api/chat/conversations
router.get('/conversations', authMiddleware, requireAuth, async (req: AuthRequest, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 50;
    const status = req.query.status ? Number(req.query.status) : undefined;
    const search = req.query.search as string | undefined;

    const result = getConversationsByUser(req.user!.id, { page, pageSize, status, search });

    return success(res, {
      conversations: result.conversations,
      total: result.total,
      page,
      pageSize,
    });
  } catch (err: any) {
    return error(res, err.message || '获取会话列表失败', 500);
  }
});

// POST /api/chat/conversations
router.post('/conversations', authMiddleware, requireAuth, async (req: AuthRequest, res) => {
  try {
    const { title, providerId, model, systemPrompt, temperature, maxTokens } = req.body;

    const conversation = createConversation({
      userId: req.user!.id,
      title,
      providerId: providerId ? Number(providerId) : undefined,
      model,
      systemPrompt,
      temperature,
      maxTokens,
    });

    return success(res, conversation, '创建成功');
  } catch (err: any) {
    return error(res, err.message || '创建会话失败', 500);
  }
});

// PUT /api/chat/conversations/:id
router.put('/conversations/:id', authMiddleware, requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const conversation = getConversationById(id);

    if (!conversation || conversation.user_id !== req.user!.id) {
      return error(res, '会话不存在或无权限', 404);
    }

    const { title, providerId, model, systemPrompt, temperature, maxTokens, status } = req.body;
    updateConversation(id, {
      title,
      provider_id: providerId ? Number(providerId) : undefined,
      model,
      system_prompt: systemPrompt,
      temperature,
      max_tokens: maxTokens,
      status,
    });

    return success(res, null, '更新成功');
  } catch (err: any) {
    return error(res, err.message || '更新失败', 500);
  }
});

// DELETE /api/chat/conversations/:id
router.delete('/conversations/:id', authMiddleware, requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const conversation = getConversationById(id);

    if (!conversation || conversation.user_id !== req.user!.id) {
      return error(res, '会话不存在或无权限', 404);
    }

    trashService.moveToTrash('conversations', conversation.id, conversation, conversation.title || `对话#${conversation.id}`, conversation.user_id, req.user!.id);
    deleteConversation(id);
    return success(res, null, '已移入回收站');
  } catch (err: any) {
    return error(res, err.message || '删除失败', 500);
  }
});

// GET /api/chat/conversations/:id/messages
router.get('/conversations/:id/messages', authMiddleware, requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const conversation = getConversationById(id);

    if (!conversation || conversation.user_id !== req.user!.id) {
      return error(res, '会话不存在或无权限', 404);
    }

    const messages = getMessagesByConversation(id);
    return success(res, { messages, conversation });
  } catch (err: any) {
    return error(res, err.message || '获取消息失败', 500);
  }
});

// DELETE /api/chat/conversations/:id/messages
router.delete('/conversations/:id/messages', authMiddleware, requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const conversation = getConversationById(id);

    if (!conversation || conversation.user_id !== req.user!.id) {
      return error(res, '会话不存在或无权限', 404);
    }

    clearConversationMessages(id);
    return success(res, null, '清空成功');
  } catch (err: any) {
    return error(res, err.message || '清空失败', 500);
  }
});

// POST /api/chat - 非流式对话
router.post('/', authMiddleware, requireAuth, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      conversationId: z.number().optional(),
      message: z.string().min(1),
      imageUrls: z.array(z.string()).optional(),
      providerId: z.number().optional(),
      model: z.string().optional(),
      stream: z.boolean().optional(),
      enableTools: z.boolean().optional(),
      enableWebSearch: z.boolean().optional(),
      enableMCP: z.boolean().optional(),
      knowledgeBaseIds: z.array(z.number()).optional(),
      temperature: z.number().optional(),
      maxTokens: z.number().optional(),
    });

    const data = schema.parse(req.body);
    const userId = req.user!.id;
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

    // API速率限制检查
    const rateLimitCheck = rateLimiter.check(clientIp, userId);
    if (!rateLimitCheck.allowed) {
      return error(res, '请求过于频繁，请稍后再试', 429);
    }

    // 敏感词过滤
    const filterResult = filterSensitiveWords(data.message);
    if (filterResult.hasSensitive) {
      logAudit(LEGACY_AUDIT_CHAT, userId, { action: '敏感词拦截', matchedWords: filterResult.matchedWords, originalMessage: data.message }, clientIp);
      return error(res, `消息包含敏感内容，已被拦截。检测到: ${filterResult.matchedWords.map(w => w.word).join(', ')}`, 400);
    }

    // 检查每日对话次数限制
    const userInfo = getUserById(userId);
    if (!userInfo) {
      return error(res, '用户不存在', 404);
    }

    const chatLimitCheck = checkDailyChatLimit(userId, userInfo.daily_chat_limit);
    if (!chatLimitCheck.allowed) {
      return error(res, `今日对话次数已达上限 (${userInfo.daily_chat_limit}次)，请明天再试`, 429);
    }

    // 检查并自动清理存储空间
    const cleanupResult = autoCleanupUserStorage(userId, userInfo.storage_limit_mb);
    if (cleanupResult.cleaned) {
      console.log(`[Storage Cleanup] User ${userId}: freed ${cleanupResult.freedMB}MB, deleted ${cleanupResult.deletedConversations} conversations`);
    }

    // 获取或创建会话
    let conversationId = data.conversationId;
    let providerConfig = null;

    if (!conversationId) {
      if (data.providerId) {
        providerConfig = getProviderById(data.providerId);
      }
      if (!providerConfig) {
        providerConfig = getDefaultProvider();
      }
      if (!providerConfig) {
        return error(res, '没有可用的AI提供商，请先配置', 400);
      }

      const newConversation = createConversation({
        userId,
        title: data.message.slice(0, 50) + (data.message.length > 50 ? '...' : ''),
        providerId: providerConfig.id,
        model: data.model || providerConfig.model,
      });
      conversationId = newConversation.id;
    } else {
      const conversation = getConversationById(conversationId);
      if (!conversation || conversation.user_id !== userId) {
        return error(res, '会话不存在或无权限', 404);
      }
      if (conversation.provider_id) {
        providerConfig = getProviderById(conversation.provider_id);
      }
      if (!providerConfig) {
        providerConfig = getDefaultProvider();
      }
    }

    if (!providerConfig || providerConfig.isActive !== 1) {
      return error(res, '所选AI提供商不可用', 400);
    }

    // 保存用户消息（包含图片）
    const userContentParts: string[] = [data.message];
    if (data.imageUrls && data.imageUrls.length > 0) {
      for (const imageUrl of data.imageUrls) {
        userContentParts.push(`\n![image](${imageUrl})`);
      }
    }
    const userContent = userContentParts.join('');

    createMessage({
      conversationId,
      userId,
      role: 'user',
      content: userContent,
      provider: providerConfig.name,
      model: data.model || providerConfig.model,
    });

    // 构建消息历史
    const chatMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

    // 判断是否启用工具
    const webSearchEnabled = data.enableWebSearch === true && isWebSearchEnabled();
    const mcpEnabled = data.enableMCP === true;

    // 系统提示词
    let systemPrompt = '你是OQ助手，一个专业、友好的AI助手。请用中文回答用户的问题。';
    if (mcpEnabled) {
      systemPrompt += '\n\n' + mcpService.getToolsPrompt();
    }
    chatMessages.push({ role: 'system', content: systemPrompt });

    // 联网搜索
    let searchResultsText = '';
    if (webSearchEnabled) {
      try {
        const searchResults = await searchWeb(data.message, 5);
        searchResultsText = formatSearchResultsForLLM(searchResults);
        chatMessages.push({
          role: 'system',
          content: `【联网搜索已执行】以下是与用户问题相关的最新网络信息，请在回答中参考：\n\n${searchResultsText}`,
        });
      } catch (e: any) {
        chatMessages.push({
          role: 'system',
          content: `【联网搜索失败】${e.message}，请基于已有知识回答。`,
        });
      }
    }

    // RAG知识库检索
    if (data.knowledgeBaseIds && data.knowledgeBaseIds.length > 0) {
      try {
        const ragContext = await ragService.enhanceConversation(conversationId, data.knowledgeBaseIds, data.message);
        if (ragContext) {
          chatMessages.push({ role: 'system', content: ragContext });
        }
      } catch (e: any) {
        console.warn('[RAG] 知识库检索失败:', e.message);
      }
    }

    // 历史消息
    const historyMessages = getMessagesForContext(conversationId, 20);
    for (const msg of historyMessages) {
      if (msg.role === 'system') continue;
      chatMessages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
    }

    const userMessageContent = data.imageUrls && data.imageUrls.length > 0
      ? `[图片附件: ${data.imageUrls.length}张]\n${data.message}`
      : data.message;
    chatMessages.push({ role: 'user', content: userMessageContent });

    // MCP自动工具调用
    if (mcpEnabled) {
      const { content: finalContent, toolCalls } = await mcpService.autoToolLoop(chatMessages, 5);

      const startTime = Date.now();
      const latencyMs = Date.now() - startTime;
      const usedModel = data.model || providerConfig.model;
      const tokensInput = estimateTokens(chatMessages);
      const tokensOutput = estimateTokens([{ role: 'assistant', content: finalContent }]);

      // 保存AI回复
      const aiMessage = createMessage({
        conversationId,
        userId,
        role: 'assistant',
        content: finalContent,
        provider: providerConfig.name,
        model: usedModel,
        tokensInput,
        tokensOutput,
        latencyMs,
      });

      recordTokenUsage({
        userId,
        conversationId,
        messageId: aiMessage.id,
        provider: providerConfig.name,
        model: usedModel,
        tokensInput,
        tokensOutput,
      });

      incrementTodayChatCount(userId);

      return success(res, {
        message: { id: aiMessage.id, role: 'assistant', content: finalContent },
        conversationId,
        provider: providerConfig.name,
        model: usedModel,
        latencyMs,
        tokensInput,
        tokensOutput,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        todayChatCount: getTodayChatCount(userId),
        dailyChatLimit: userInfo.daily_chat_limit,
      });
    }

    // 第一轮AI调用
    const startTime = Date.now();
    const aiResp = await chatWithProvider(providerConfig, {
      messages: chatMessages,
      model: data.model || providerConfig.model,
      temperature: data.temperature,
      maxTokens: data.maxTokens,
      stream: data.stream,
    });

    if (!aiResp.ok) {
      const errorText = await aiResp.text().catch(() => `HTTP ${aiResp.status}`);
      throw new Error(`AI提供商请求失败(${aiResp.status}): ${errorText.substring(0, 200)}`);
    }

    const aiData = await aiResp.json() as Record<string, any>;
    const latencyMs = Date.now() - startTime;

    let aiContent = aiData.choices?.[0]?.message?.content || aiData.message?.content || '';
    const usedModel = aiData.model || data.model || providerConfig.model;
    const tokensInput = aiData.usage?.prompt_tokens || estimateTokens(chatMessages);
    const tokensOutput = aiData.usage?.completion_tokens || estimateTokens([{ role: 'assistant', content: aiContent }]);

    // 工具调用检测（牛马引擎工具）
    let toolResultText = '';
    if (data.enableTools !== false && isNiumaEngineEnabled()) {
      const toolCall = parseToolCall(aiContent);
      if (toolCall) {
        createMessage({
          conversationId,
          userId,
          role: 'assistant',
          content: aiContent,
          provider: providerConfig.name,
          model: usedModel,
          tokensInput,
          tokensOutput,
          latencyMs,
        });

        const toolResult = await callNiumaTool(toolCall.toolName, toolCall.args);

        if (toolResult.success) {
          toolResultText = JSON.stringify(toolResult.result, null, 2);
          chatMessages.push({ role: 'assistant', content: aiContent });
          chatMessages.push({
            role: 'system',
            content: `【工具执行结果】\n工具: ${toolCall.toolName}\n参数: ${JSON.stringify(toolCall.args)}\n结果: ${toolResultText}\n\n请根据工具结果回答用户的问题。`,
          });

          const secondResp = await chatWithProvider(providerConfig, {
            messages: chatMessages,
            model: data.model || providerConfig.model,
            temperature: data.temperature,
            maxTokens: data.maxTokens,
            stream: false,
          });

          if (secondResp.ok) {
            const secondData = await secondResp.json() as Record<string, any>;
            aiContent = secondData.choices?.[0]?.message?.content || secondData.message?.content || '';
          }
        } else {
          toolResultText = toolResult.error || '工具执行失败';
          chatMessages.push({ role: 'assistant', content: aiContent });
          chatMessages.push({
            role: 'system',
            content: `【工具执行失败】\n工具: ${toolCall.toolName}\n错误: ${toolResultText}\n\n请告诉用户工具调用失败，并尝试直接回答。`,
          });

          const secondResp = await chatWithProvider(providerConfig, {
            messages: chatMessages,
            model: data.model || providerConfig.model,
            temperature: data.temperature,
            maxTokens: data.maxTokens,
            stream: false,
          });

          if (secondResp.ok) {
            const secondData = await secondResp.json() as Record<string, any>;
            aiContent = secondData.choices?.[0]?.message?.content || secondData.message?.content || '';
          }
        }
      }
    }

    // 清理工具标记
    aiContent = removeToolCallMarkers(aiContent);

    // 保存最终AI回复
    const aiMessage = createMessage({
      conversationId,
      userId,
      role: 'assistant',
      content: aiContent,
      provider: providerConfig.name,
      model: usedModel,
      tokensInput,
      tokensOutput,
      latencyMs,
    });

    recordTokenUsage({
      userId,
      conversationId,
      messageId: aiMessage.id,
      provider: providerConfig.name,
      model: usedModel,
      tokensInput,
      tokensOutput,
    });

    const newChatCount = incrementTodayChatCount(userId);

    // 记录审计日志
    logAudit(LEGACY_AUDIT_CHAT, userId, { conversationId, messageLength: data.message.length, provider: providerConfig.name, model: usedModel, hasToolCall: !!toolResultText }, clientIp);

    return success(res, {
      message: { id: aiMessage.id, role: 'assistant', content: aiContent },
      conversationId,
      provider: providerConfig.name,
      model: usedModel,
      latencyMs,
      tokensInput,
      tokensOutput,
      toolCall: toolResultText ? true : false,
      todayChatCount: newChatCount,
      dailyChatLimit: userInfo.daily_chat_limit,
    });
  } catch (err: any) {
    return error(res, err.message || '对话失败', 500);
  }
});

// POST /api/chat/stream - SSE流式对话（带思考过程和工具调用展示）
router.post('/stream', authMiddleware, requireAuth, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      conversationId: z.number().optional(),
      message: z.string().min(1),
      imageUrls: z.array(z.string()).optional(),
      providerId: z.number().optional(),
      model: z.string().optional(),
      enableTools: z.boolean().optional(),
      enableWebSearch: z.boolean().optional(),
      enableMCP: z.boolean().optional(),
      knowledgeBaseIds: z.array(z.number()).optional(),
      temperature: z.number().optional(),
      maxTokens: z.number().optional(),
    });

    const data = schema.parse(req.body);
    const userId = req.user!.id;
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

    // API速率限制检查
    const rateLimitCheck = rateLimiter.check(clientIp, userId);
    if (!rateLimitCheck.allowed) {
      return sendSSEError(res, '请求过于频繁，请稍后再试');
    }

    // 敏感词过滤
    const filterResult = filterSensitiveWords(data.message);
    if (filterResult.hasSensitive) {
      logAudit(LEGACY_AUDIT_CHAT, userId, { action: '敏感词拦截', matchedWords: filterResult.matchedWords, originalMessage: data.message }, clientIp);
      return sendSSEError(res, `消息包含敏感内容，已被拦截。检测到: ${filterResult.matchedWords.map(w => w.word).join(', ')}`);
    }

    // 检查每日对话次数限制
    const userInfo = getUserById(userId);
    if (!userInfo) {
      return sendSSEError(res, '用户不存在');
    }

    const chatLimitCheck = checkDailyChatLimit(userId, userInfo.daily_chat_limit);
    if (!chatLimitCheck.allowed) {
      return sendSSEError(res, `今日对话次数已达上限 (${userInfo.daily_chat_limit}次)，请明天再试`);
    }

    // 获取或创建会话
    let conversationId = data.conversationId;
    let providerConfig = null;

    if (!conversationId) {
      if (data.providerId) {
        providerConfig = getProviderById(data.providerId);
      }
      if (!providerConfig) {
        providerConfig = getDefaultProvider();
      }
      if (!providerConfig) {
        return sendSSEError(res, '没有可用的AI提供商，请先配置');
      }

      const newConversation = createConversation({
        userId,
        title: data.message.slice(0, 50) + (data.message.length > 50 ? '...' : ''),
        providerId: providerConfig.id,
        model: data.model || providerConfig.model,
      });
      conversationId = newConversation.id;
    } else {
      const conversation = getConversationById(conversationId);
      if (!conversation || conversation.user_id !== userId) {
        return sendSSEError(res, '会话不存在或无权限');
      }
      if (conversation.provider_id) {
        providerConfig = getProviderById(conversation.provider_id);
      }
      if (!providerConfig) {
        providerConfig = getDefaultProvider();
      }
    }

    if (!providerConfig || providerConfig.isActive !== 1) {
      return sendSSEError(res, '所选AI提供商不可用');
    }

    // 保存用户消息（包含图片）
    const streamUserContentParts: string[] = [data.message];
    if (data.imageUrls && data.imageUrls.length > 0) {
      for (const imageUrl of data.imageUrls) {
        streamUserContentParts.push(`\n![image](${imageUrl})`);
      }
    }
    const streamUserContent = streamUserContentParts.join('');

    createMessage({
      conversationId,
      userId,
      role: 'user',
      content: streamUserContent,
      provider: providerConfig.name,
      model: data.model || providerConfig.model,
    });

    // 设置SSE
    setupSSE(res);

    // 构建消息历史
    const chatMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

    const webSearchEnabled = data.enableWebSearch === true && isWebSearchEnabled();
    const mcpEnabled = data.enableMCP === true;

    let systemPrompt = '你是OQ助手，一个专业、友好的AI助手。请用中文回答用户的问题。';
    if (mcpEnabled) {
      systemPrompt += '\n\n' + mcpService.getToolsPrompt();
    }
    chatMessages.push({ role: 'system', content: systemPrompt });

    // 联网搜索
    if (webSearchEnabled) {
      try {
        sendSSEThinking(res, '正在搜索网络信息...');
        const searchResults = await searchWeb(data.message, 5);
        const searchResultsText = formatSearchResultsForLLM(searchResults);
        chatMessages.push({
          role: 'system',
          content: `【联网搜索已执行】以下是与用户问题相关的最新网络信息，请在回答中参考：\n\n${searchResultsText}`,
        });
      } catch (e: any) {
        chatMessages.push({
          role: 'system',
          content: `【联网搜索失败】${e.message}，请基于已有知识回答。`,
        });
      }
    }

    // RAG知识库检索
    if (data.knowledgeBaseIds && data.knowledgeBaseIds.length > 0) {
      try {
        sendSSEThinking(res, '正在检索知识库...');
        const ragContext = await ragService.enhanceConversation(conversationId, data.knowledgeBaseIds, data.message);
        if (ragContext) {
          chatMessages.push({ role: 'system', content: ragContext });
        }
      } catch (e: any) {
        console.warn('[RAG] 知识库检索失败:', e.message);
      }
    }

    // 历史消息
    const historyMessages = getMessagesForContext(conversationId, 20);
    for (const msg of historyMessages) {
      if (msg.role === 'system') continue;
      chatMessages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
    }

    const streamUserMessageContent = data.imageUrls && data.imageUrls.length > 0
      ? `[图片附件: ${data.imageUrls.length}张]\n${data.message}`
      : data.message;
    chatMessages.push({ role: 'user', content: streamUserMessageContent });

    // MCP自动工具调用（流式）
    if (mcpEnabled) {
      sendSSEThinking(res, '正在分析是否需要调用工具...');
      const { content: finalContent, toolCalls } = await mcpService.autoToolLoop(chatMessages, 5);

      for (const tc of toolCalls) {
        sendSSEToolCall(res, tc.name, tc.args, 'success', tc.result);
      }

      // 发送最终结果
      for (let i = 0; i < finalContent.length; i += 10) {
        sendSSEChunk(res, { content: finalContent.slice(i, i + 10) });
      }

      const latencyMs = 0;
      const usedModel = data.model || providerConfig.model;
      const tokensInput = estimateTokens(chatMessages);
      const tokensOutput = estimateTokens([{ role: 'assistant', content: finalContent }]);

      const aiMessage = createMessage({
        conversationId,
        userId,
        role: 'assistant',
        content: finalContent,
        provider: providerConfig.name,
        model: usedModel,
        tokensInput,
        tokensOutput,
        latencyMs,
      });

      recordTokenUsage({
        userId,
        conversationId,
        messageId: aiMessage.id,
        provider: providerConfig.name,
        model: usedModel,
        tokensInput,
        tokensOutput,
      });

      incrementTodayChatCount(userId);

      sendSSEChunk(res, {
        done: true,
        metadata: {
          conversationId,
          messageId: aiMessage.id,
          provider: providerConfig.name,
          model: usedModel,
          latencyMs,
          tokensInput,
          tokensOutput,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        },
      });
      sendSSEDone(res);
      return;
    }

    // 流式调用AI
    sendSSEThinking(res, '正在思考...');
    const startTime = Date.now();
    const aiResp = await chatWithProvider(providerConfig, {
      messages: chatMessages,
      model: data.model || providerConfig.model,
      temperature: data.temperature,
      maxTokens: data.maxTokens,
      stream: true,
    });

    if (!aiResp.ok || !aiResp.body) {
      const errorText = await aiResp.text().catch(() => `HTTP ${aiResp.status}`);
      return sendSSEError(res, `AI提供商请求失败(${aiResp.status}): ${errorText.substring(0, 200)}`);
    }

    const reader = aiResp.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6);
          if (dataStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(dataStr);
            const chunk = parsed.choices?.[0]?.delta?.content || parsed.message?.content || '';
            if (chunk) {
              fullContent += chunk;
              sendSSEChunk(res, { content: chunk });
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
    }

    const latencyMs = Date.now() - startTime;
    const usedModel = data.model || providerConfig.model;
    const tokensInput = estimateTokens(chatMessages);
    const tokensOutput = estimateTokens([{ role: 'assistant', content: fullContent }]);

    // 清理工具标记
    fullContent = removeToolCallMarkers(fullContent);

    // 保存AI回复
    const aiMessage = createMessage({
      conversationId,
      userId,
      role: 'assistant',
      content: fullContent,
      provider: providerConfig.name,
      model: usedModel,
      tokensInput,
      tokensOutput,
      latencyMs,
    });

    recordTokenUsage({
      userId,
      conversationId,
      messageId: aiMessage.id,
      provider: providerConfig.name,
      model: usedModel,
      tokensInput,
      tokensOutput,
    });

    incrementTodayChatCount(userId);

    sendSSEChunk(res, {
      done: true,
      metadata: {
        conversationId,
        messageId: aiMessage.id,
        provider: providerConfig.name,
        model: usedModel,
        latencyMs,
        tokensInput,
        tokensOutput,
      },
    });
    sendSSEDone(res);
  } catch (err: any) {
    sendSSEError(res, err.message || '对话失败');
  }
});

function estimateTokens(messages: Array<{ role: string; content: string }>): number {
  let total = 0;
  for (const msg of messages) {
    total += Math.ceil(msg.content.length / 4);
  }
  return total;
}

function getTodayChatCount(userId: number): number {
  const { getTodayChatCount } = require('../models/dailyChatLimit.js');
  return getTodayChatCount(userId);
}

export default router;
