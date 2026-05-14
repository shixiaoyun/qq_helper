import { mcpRegistry } from '../mcp-tools/_core/index.js';
import { chatWithProvider, getDefaultProvider } from '../models/aiProvider.js';
import { salesCrewService } from './salesCrewService.js';
import { searchKnowledgeBase, formatKnowledgeContext } from './knowledgeBaseService.js';

// ==========================================
// 销售作战团队 - 多Agent协作引擎 (Q1.18)
// 反盗版专业化升级：
//   - 对话风格优化：模拟真人对话，限制长度，增加追问
//   - 五阶段心理模型：否认→恐慌→讨价还价→接受→执行
//   - 十大战术集成
// 业务模型：甲乙丙三方
//   甲方 = Autodesk等厂商
//   乙方 = 企业客户（使用盗版）
//   丙方 = 我们代理商（解决甲乙版权纠纷，唱白脸和事佬）
// 流程：发现客户 → 客户研究分析 → 法务联系确认 → 丙方销售出面解决 → 促成正版购买
// ==========================================

export interface AgentResponse {
  agentId: string;
  agentName: string;
  role: string;
  content: string;
  knowledgeRefs?: string[];
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
}

export interface CrewExecutionResult {
  sessionId: number;
  userMessage: string;
  agentResponses: AgentResponse[];
  finalSummary?: string;
  totalTokensIn: number;
  totalTokensOut: number;
}

// Q1.18: 客户五阶段心理模型
function detectPsychologyStage(message: string): string {
  const lowerMsg = message.toLowerCase();
  if (/没盗版|没用过|不承认|前任的事|不清楚/i.test(lowerMsg)) return 'denial';
  if (/害怕|担心|怎么办|会告我们|要罚款/i.test(lowerMsg)) return 'panic';
  if (/能打折吗|分期|便宜点|国产|考虑一下|研究/i.test(lowerMsg)) return 'bargaining';
  if (/配合|怎么做|需要买什么|签/i.test(lowerMsg)) return 'acceptance';
  if (/装软件|打款|部署|培训/i.test(lowerMsg)) return 'execution';
  return 'unknown';
}

// Q1.18: 根据心理阶段调整话术风格
function getStagePrompt(stage: string): string {
  const prompts: Record<string, string> = {
    denial: '客户处于否认期。不要戳穿，给台阶下。把"承认"变成"确认"。语气平和，不争论。',
    panic: '客户处于恐慌期。先安抚："别急，能解决"。传递厂商真实立场，但别夸大威胁。',
    bargaining: '客户处于讨价还价期。给分级方案，强调时间窗口。不轻易降价，但展示灵活性。',
    acceptance: '客户处于接受期。快速推进，防止反悔。给明确下一步动作。',
    execution: '客户处于执行期。持续跟进，确保验收。关注尾款和后续复购。',
    unknown: '客户心理阶段不明。先判断阶段，再针对性回应。',
  };
  return prompts[stage] || prompts.unknown;
}

// 各Agent人设 - Q1.18优化：更像真人对话
const AGENT_PERSONAS: Record<string, (_vendor?: string, context?: string, stage?: string) => string> = {
  'customer-researcher': (_vendor, context, stage) => `你叫老李，代理商客户研究专家，15年经验。

角色定位：丙方（代理商）的客户研究专家，帮销售摸清乙方（客户）底细。

${stage ? getStagePrompt(stage) : ''}

说话风格（必须严格遵守）：
- 像真人说话，短句，有节奏感
- 不说"首先/其次/最后"这种机械结构
- 不罗列12345，直接给结论
- 每段话不超过3句
- 总字数控制在200字以内
- 适当用口语化表达，比如"说白了""其实""您想啊"

输出格式：
1. 客户情况（2句话，直击要害）
2. 决策链（1句话，谁说了算）
3. 风险等级（1句话）
4. 下一步（1个具体动作）

${context ? '\n参考资料：\n' + context.slice(0, 1500) : ''}`,

  'product-expert': (_vendor, context, stage) => `你叫老王，代理商技术总监，12年经验。

角色定位：丙方（代理商）技术专家，给乙方（客户）配方案、算价格。

${stage ? getStagePrompt(stage) : ''}

说话风格（必须严格遵守）：
- 像跟熟人聊天，直接推荐
- 不说废话，不解释原理
- 给价格时直接说数字
- 每段话不超过3句
- 总字数控制在180字以内
- 用口语化表达，比如"我建议您...""说实话..."

输出格式：
1. 推荐方案（1句话）
2. 价格（1句话，代理商价 vs 官方价）
3. 为什么选这个（1句话）
4. 授权方式（1句话）

${context ? '\n参考资料：\n' + context.slice(0, 1500) : ''}`,

  'sales-coach': (_vendor, context, stage) => `你叫老赵，代理商销售培训经理，10年经验。

角色定位：丙方（代理商）销售教练，教销售怎么跟乙方（客户）谈。

${stage ? getStagePrompt(stage) : ''}

说话风格（必须严格遵守）：
- 像老销售带新人，直接给现成话术
- 不说理论，给例子
- 短句，有力，有画面感
- 每段话不超过3句
- 总字数控制在180字以内
- 用口语化表达，比如"您就这么说...""记住啊..."

输出格式：
1. 开场话术（1-2句，复制就能用）
2. 应对借口的话术（2个场景）
3. 逼单技巧（1句）

${context ? '\n参考资料：\n' + context.slice(0, 1500) : ''}`,

  'solution-architect': (_vendor, context, stage) => `你叫老陈，代理商方案架构师，8年经验。

角色定位：丙方（代理商）方案专家，给乙方（客户）出可落地的方案。

${stage ? getStagePrompt(stage) : ''}

说话风格（必须严格遵守）：
- 像项目经理汇报，分步骤
- 不说虚的，每步一句话
- 给时间节点
- 每段话不超过3句
- 总字数控制在180字以内
- 用口语化表达，比如"第一步...""然后..."

输出格式：
1. 方案要点（3步）
2. 时间节点（1句话）
3. 报价构成（1句话）

${context ? '\n参考资料：\n' + context.slice(0, 1500) : ''}`,

  'legal-compliance': (_vendor, context, stage) => `你叫老周，代理商法务顾问，专门处理软件合规。

角色定位：丙方（代理商）法务，但不是厂商法务！我们是帮乙方（客户）的，唱白脸、和事佬。

${stage ? getStagePrompt(stage) : ''}

说话风格（必须严格遵守）：
- 先安抚："别急，能解决"
- 给方案时直接说"我建议..."
- 强调"我们是代理商，站在你这边"
- 每段话不超过3句
- 总字数控制在200字以内
- 用口语化表达，比如"说白了...""您放心..."

输出格式：
1. 风险判断（1句话）
2. 化解策略（2句话）
3. 谈判要点（2条）
4. 给客户的话术（1段，可直接用）

${context ? '\n参考资料：\n' + context.slice(0, 1500) : ''}`,
};

// 销售总监整合 - Q1.18优化：更像真人
const MANAGER_PERSONA = (_vendor?: string, context?: string, stage?: string) => `你是张总，代理商销售总监，20年经验。

角色定位：丙方（代理商）老大，拍板的人。

${stage ? getStagePrompt(stage) : ''}

说话风格（必须严格遵守）：
- 像开早会，直接给结论
- 分配任务，谁干啥
- 不说废话，不解释为什么
- 每段话不超过3句
- 总字数控制在200字以内
- 用口语化表达，比如"就这么办...""听我的..."

输出格式：
1. 形势判断（2句话）
2. 行动指令（分人分配，每人一句话）
3. 时间节点（1句话）
4. 拍板（1句话）

${context ? '\n参考资料：\n' + context.slice(0, 1000) : ''}`;

// 判断需要哪些Agent参与
// Q1.20优化：优先使用Crew定义，fallback到关键字匹配
// Q1.28修复：支持Discovery教练，修复crewId前缀映射
function selectAgentsForTask(message: string, crewId?: string): string[] {
  // 如果指定了Crew，优先使用Crew定义的Agent列表
  // 支持前端简写crewId（如'first-contact'）映射到完整crewId（'crew-first-contact'）
  if (crewId) {
    let crew = mcpRegistry.getCrew(crewId);
    // 尝试添加'crew-'前缀查找
    if (!crew && !crewId.startsWith('crew-')) {
      crew = mcpRegistry.getCrew(`crew-${crewId}`);
    }
    if (crew && crew.agents.length > 0) {
      return crew.agents;
    }
  }

  // Fallback: 关键字匹配
  const lowerMsg = message.toLowerCase();
  const agents: string[] = [];

  if (/盗版|合规|法务|律师|律师函|起诉|授权|正版|侵权/i.test(lowerMsg)) {
    agents.push('legal-compliance');
  }
  if (/产品|功能|版本|价格|报价|配置|推荐|对比|license|授权/i.test(lowerMsg)) {
    agents.push('product-expert');
  }
  if (/客户|公司|行业|决策|预算|需求|痛点|名单|企业/i.test(lowerMsg)) {
    agents.push('customer-researcher');
  }
  if (/话术|怎么说|如何回复|应对|异议|谈判|沟通/i.test(lowerMsg)) {
    agents.push('sales-coach');
  }
  if (/方案|实施|部署|规划|架构|设计|计划/i.test(lowerMsg)) {
    agents.push('solution-architect');
  }
  // Q1.28新增：Discovery教练关键字匹配
  if (/discovery|提问|问题|诊断|差距|痛点|需求|现状|spin|gap|sandler|通话|教练|辅导|复盘|脚本/i.test(lowerMsg)) {
    agents.push('discovery-coach');
  }

  if (agents.length === 0) {
    agents.push('sales-coach');
  }

  return agents;
}

// 从知识库检索 - Q1.20优化：优先使用Agent配置的知识库列表
async function searchKnowledgeForAgent(agentId: string, query: string, vendor?: string): Promise<string> {
  try {
    let allResults: any[] = [];

    // 1. 检索厂商知识库
    if (vendor) {
      const vendorResults = await searchKnowledgeBase(vendor, query, 2);
      allResults = allResults.concat(vendorResults);
    }

    // 2. 使用Agent配置的知识库列表进行检索
    const agentConfig = mcpRegistry.getAgent(agentId);
    const kbIds = agentConfig?.knowledgeBases || [];
    for (const kbId of kbIds) {
      try {
        const results = await searchKnowledgeBase(kbId, query, 2);
        allResults = allResults.concat(results);
      } catch {
        // 知识库可能不存在，跳过
      }
    }

    // 3. Fallback: 检索反盗版专用知识库
    if (allResults.length === 0) {
      const piracyResults = await searchKnowledgeBase('autodesk', query + ' 反盗版 合规', 2);
      allResults = allResults.concat(piracyResults);
    }

    if (allResults.length === 0) return '';

    // 去重
    const seen = new Set();
    const unique = allResults.filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

    return formatKnowledgeContext(unique.slice(0, 3));
  } catch (err: any) {
    console.warn('[SalesCrewEngine] 知识库检索失败:', err.message);
    return '';
  }
}

// 流式执行
export async function executeCrewChatStream(
  userId: number,
  sessionId: number,
  message: string,
  crewId?: string,
  vendor?: string,
  overrideModel?: string,
  onAgentStart?: (agentId: string, agentName: string) => void,
  onAgentChunk?: (agentId: string, chunk: string) => void,
  onAgentComplete?: (agentId: string, fullContent: string, tokensIn: number, tokensOut: number) => void,
  onSummaryStart?: () => void,
  onSummaryChunk?: (chunk: string) => void,
  onSummaryComplete?: (fullContent: string, tokensIn: number, tokensOut: number) => void
): Promise<void> {
  // 保存用户消息
  salesCrewService.addMessage({
    sessionId,
    userId,
    role: 'user',
    content: message,
  });

  // 获取历史上下文
  const recentMessages = salesCrewService.getRecentMessages(sessionId, 5);
  const history = recentMessages.map(m => ({
    role: m.role === 'user' ? 'user' : 'assistant' as 'user' | 'assistant',
    content: m.content,
  }));

  // 选择Agent
  const agentIds = selectAgentsForTask(message, crewId);
  console.log(`[SalesCrewEngine] 流式，参与: ${agentIds.join(', ')}`);

  // Q1.18: 检测客户心理阶段
  const psychologyStage = detectPsychologyStage(message);

  const estimateTokens = (text: string): number => {
    let count = 0;
    for (const char of text) {
      count += char.charCodeAt(0) > 127 ? 1.5 : 0.6;
    }
    return Math.ceil(count);
  };

  // 串行执行各Agent
  const agentResponses: AgentResponse[] = [];

  for (const agentId of agentIds) {
    const agent = mcpRegistry.getAgent(agentId);
    if (!agent) continue;

    onAgentStart?.(agentId, agent.name);

    const startTime = Date.now();
    const knowledgeContext = await searchKnowledgeForAgent(agentId, message, vendor);

    // Q1.20优化：优先从mcpRegistry读取Agent配置，AGENT_PERSONAS作为fallback
    let systemPrompt: string;
    if (agent.backstory && agent.backstory.length > 10) {
      systemPrompt = `${agent.backstory}

${psychologyStage ? getStagePrompt(psychologyStage) : ''}

${knowledgeContext ? '参考资料：\n' + knowledgeContext.slice(0, 1500) : ''}`;
    } else {
      const promptBuilder = AGENT_PERSONAS[agentId];
      systemPrompt = promptBuilder
        ? promptBuilder(vendor, knowledgeContext, psychologyStage)
        : `你是${agent.name}，${agent.role}`;
    }

    const providerConfig = getDefaultProvider();
    if (!providerConfig) {
      onAgentComplete?.(agentId, '系统出问题了。', 0, 0);
      continue;
    }

    const promptText = systemPrompt + '\n' + message;
    const tokensIn = estimateTokens(promptText);

    try {
      const agentModel = overrideModel || agent.model || providerConfig.model;
      const agentTemp = agent.temperature ?? 0.7;
      const agentMaxTokens = agent.maxTokens ?? 4096;
      const aiResp = await chatWithProvider(providerConfig, {
        messages: [
          { role: 'system', content: systemPrompt },
          ...history,
          { role: 'user', content: message },
        ],
        model: agentModel,
        temperature: agentTemp,
        maxTokens: agentMaxTokens,
        stream: true,
      });

      if (!aiResp.ok || !aiResp.body) {
        const errorText = await aiResp.text().catch(() => `HTTP ${aiResp.status}`);
        onAgentComplete?.(agentId, `出错：${errorText}`, tokensIn, 0);
        continue;
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
              const chunk = parsed.choices?.[0]?.delta?.content || '';
              if (chunk) {
                fullContent += chunk;
                onAgentChunk?.(agentId, chunk);
              }
            } catch {
              // 忽略
            }
          }
        }
      }

      // Q1.28: 后处理 - 移除400字符截断限制，保留完整回复
      fullContent = fullContent.trim();

      const latencyMs = Date.now() - startTime;
      const tokensOut = estimateTokens(fullContent);

      agentResponses.push({
        agentId,
        agentName: agent.name,
        role: agent.role,
        content: fullContent,
        latencyMs,
        tokensIn,
        tokensOut,
      });

      salesCrewService.addMessage({
        sessionId,
        userId,
        role: 'assistant',
        agentId,
        agentName: agent.name,
        content: fullContent,
        latencyMs,
        tokensInput: tokensIn,
        tokensOutput: tokensOut,
      });

      onAgentComplete?.(agentId, fullContent, tokensIn, tokensOut);

    } catch (err: any) {
      onAgentComplete?.(agentId, `出错：${err.message}`, tokensIn, 0);
    }
  }

  // 销售总监整合
  if (agentResponses.length > 1) {
    onSummaryStart?.();

    const summarizePrompt = `客户问题：${message}

团队意见：
${agentResponses.map(r => `${r.agentName}：${r.content.slice(0, 120)}${r.content.length > 120 ? '...' : ''}\n`).join('\n')}

直接给结论和指令。200字以内。像真人说话，短句。`;

    const providerConfig = getDefaultProvider();
    if (providerConfig) {
      try {
        // Q1.20优化：使用mcpRegistry中sales-manager的配置
        const mgr = mcpRegistry.getAgent('sales-manager');
        const mgrSystem = mgr?.backstory
          ? `${mgr.backstory}\n\n${psychologyStage ? getStagePrompt(psychologyStage) : ''}`
          : MANAGER_PERSONA(vendor, '', psychologyStage);
        const mgrModel = overrideModel || mgr?.model || 'qwen-plus';
        const mgrTemp = mgr?.temperature ?? 0.6;
        const mgrMaxTokens = mgr?.maxTokens ?? 2048;

        const promptText = mgrSystem + '\n' + summarizePrompt;
        const tokensIn = estimateTokens(promptText);

        const aiResp = await chatWithProvider(providerConfig, {
          messages: [
            { role: 'system', content: mgrSystem },
            { role: 'user', content: summarizePrompt },
          ],
          model: mgrModel,
          temperature: mgrTemp,
          maxTokens: mgrMaxTokens,
          stream: true,
        });

        if (aiResp.ok && aiResp.body) {
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
                  const chunk = parsed.choices?.[0]?.delta?.content || '';
                  if (chunk) {
                    fullContent += chunk;
                    onSummaryChunk?.(chunk);
                  }
                } catch {
                  // 忽略
                }
              }
            }
          }

          // Q1.18: 后处理
          fullContent = fullContent.trim();
          if (fullContent.length > 300) {
            fullContent = fullContent.slice(0, 300) + '...';
          }

          const tokensOut = estimateTokens(fullContent);

          salesCrewService.addMessage({
            sessionId,
            userId,
            role: 'assistant',
            agentId: 'sales-manager',
            agentName: '销售总监',
            content: fullContent,
            tokensInput: tokensIn,
            tokensOutput: tokensOut,
          });

          onSummaryComplete?.(fullContent, tokensIn, tokensOut);
        }
      } catch (err: any) {
        onSummaryComplete?.(`出错：${err.message}`, 0, 0);
      }
    }
  }
}
