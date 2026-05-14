import { createLLMProvider, type LLMProviderConfig } from './llmProvider.js';
import { mcpService } from './mcpService.js';
import { getDefaultProvider } from '../models/aiProvider.js';
import { prismaService } from './prismaService.js';

export interface AgentConfig {
  name: string;
  role: string;
  goal: string;
  backstory?: string;
  tools?: string[];
  model?: string;
  temperature?: number;
}

export interface CrewConfig {
  name: string;
  description?: string;
  process?: 'sequential' | 'hierarchical';
  agents: number[]; // Agent IDs
}

export interface TaskResult {
  agent: string;
  task: string;
  result: string;
  thought?: string;
  action?: string;
  observation?: string;
}

export interface ReActStep {
  thought: string;
  action?: string;
  actionInput?: string;
  observation?: string;
  finalAnswer?: string;
}

// 获取默认LLM Provider
function getDefaultLLMProvider() {
  const provider = getDefaultProvider();
  if (!provider) throw new Error('没有可用的AI模型，请先配置模型');
  return createLLMProvider(provider as unknown as LLMProviderConfig);
}

// ReAct Agent 核心：思考-行动-观察循环
async function runReActAgent(
  agent: any,
  task: string,
  context: TaskResult[],
  maxSteps = 10
): Promise<{ result: string; steps: ReActStep[] }> {
  const provider = await getDefaultLLMProvider();
  const steps: ReActStep[] = [];

  // 构建系统提示
  const systemPrompt = `你是一个智能Agent，名字是${agent.name}。
角色: ${agent.role}
目标: ${agent.goal}
背景: ${agent.backstory || '无'}

你必须使用ReAct模式（思考-行动-观察）来解决问题。

格式要求：
思考: [你的思考过程]
行动: [工具名称] [输入参数]
观察: [行动结果]
...
最终答案: [你的最终回答]

可用工具:
- web_search: 联网搜索信息
- calculator: 数学计算
- code_execute: 执行代码
- knowledge_base: 查询知识库

如果没有合适的工具，直接给出最终答案。`;

  // currentTask used in loop below
  void task;
  const history: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
  ];

  // 添加上下文
  if (context.length > 0) {
    const contextStr = context.map(c => `- ${c.agent}: ${c.result}`).join('\n');
    history.push({ role: 'user', content: `之前的执行结果:\n${contextStr}\n\n当前任务: ${task}` });
  } else {
    history.push({ role: 'user', content: `任务: ${task}` });
  }

  for (let step = 0; step < maxSteps; step++) {
    // 调用LLM思考
    const response = await provider.chat({
      messages: history,
      temperature: agent.temperature ?? 0.7,
      maxTokens: 2048,
    });

    const content = response.content;

    // 解析ReAct步骤
    const thoughtMatch = content.match(/思考:\s*([^\n]+(?:\n(?!(?:行动:|最终答案:))[^\n]+)*)/);
    const actionMatch = content.match(/行动:\s*(\w+)\s*(.*)/);
    const finalAnswerMatch = content.match(/最终答案:\s*([\s\S]+)/);

    if (finalAnswerMatch) {
      const finalAnswer = finalAnswerMatch[1].trim();
      steps.push({
        thought: thoughtMatch?.[1]?.trim() || '直接给出答案',
        finalAnswer,
      });
      return { result: finalAnswer, steps };
    }

    if (thoughtMatch && actionMatch) {
      const thought = thoughtMatch[1].trim();
      const actionName = actionMatch[1].trim();
      const actionInput = actionMatch[2].trim();

      // 执行工具
      let observation = '';
      try {
        observation = await executeTool(actionName, actionInput);
      } catch (err: any) {
        observation = `工具执行失败: ${err.message}`;
      }

      steps.push({ thought, action: actionName, actionInput, observation });

      // 更新历史
      history.push({ role: 'assistant', content: `思考: ${thought}\n行动: ${actionName} ${actionInput}` });
      history.push({ role: 'user', content: `观察: ${observation}` });
    } else {
      // 没有匹配到标准格式，当作最终答案
      steps.push({ thought: content.slice(0, 200), finalAnswer: content });
      return { result: content, steps };
    }
  }

  // 达到最大步数
  const finalResponse = await provider.chat({
    messages: [...history, { role: 'user', content: '请基于以上观察和思考，给出最终答案。' }],
    temperature: 0.7,
    maxTokens: 2048,
  });

  steps.push({ thought: '达到最大步数，总结结果', finalAnswer: finalResponse.content });
  return { result: finalResponse.content, steps };
}

// 工具执行器
async function executeTool(toolName: string, input: string): Promise<string> {
  // 首先检查是否是MCP工具
  const mcpTool = mcpService.getTool(toolName);
  if (mcpTool) {
    try {
      // 尝试解析输入为JSON对象
      let args = {};
      try {
        args = JSON.parse(input);
      } catch {
        // 如果不是JSON格式，尝试作为单个参数处理
        if (input && input.trim()) {
          args = { value: input };
        }
      }

      const result = await mcpService.executeTool(toolName, args);
      if (result.success) {
        return typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2);
      } else {
        return `工具执行失败: ${result.error}`;
      }
    } catch (err: any) {
      return `MCP工具执行失败: ${err.message}`;
    }
  }

  // 内置工具
  switch (toolName) {
    case 'web_search': {
      const { searchWeb } = await import('./webSearch.js');
      const results = await searchWeb(input);
      return results.map((r: any, i: number) => `${i + 1}. ${r.title}: ${r.content?.slice(0, 200)}`).join('\n');
    }
    case 'calculator': {
      try {
        // 安全计算
        const sanitized = input.replace(/[^0-9+\-*/().\s]/g, '');
        const fn = new Function(`return (${sanitized})`);
        return String(fn());
      } catch {
        return '计算错误';
      }
    }
    case 'code_execute': {
      try {
        const sanitized = input.replace(/[^a-zA-Z0-9_+\-*/%<>=!&|().\s\[\]{}'"`,:;]/g, '');
        const fn = new Function(`return (${sanitized})`);
        return String(fn());
      } catch (err: any) {
        return `代码执行错误: ${err.message}`;
      }
    }
    case 'knowledge_base': {
      return `[知识库查询] 查询: ${input} (需要指定知识库ID)`;
    }
    case 'system_info': {
      // 获取系统信息工具
      const sysTool = mcpService.getTool('system_info');
      if (sysTool) {
        try {
          const args = JSON.parse(input);
          const result = await mcpService.executeTool('system_info', args);
          return result.success ? JSON.stringify(result.data, null, 2) : `获取失败: ${result.error}`;
        } catch {
          return '系统信息获取失败';
        }
      }
      return '系统信息工具不可用';
    }
    default:
      return `未知工具: ${toolName}`;
  }
}

// Agent execution
export const agentService = {
  // Create agent
  async createAgent(userId: number, config: AgentConfig) {
    return prismaService.agent.create({
      userId,
      name: config.name,
      role: config.role,
      goal: config.goal,
      backstory: config.backstory || null,
      tools: JSON.stringify(config.tools || []),
      model: config.model || 'gpt-4',
      temperature: config.temperature || 0.7,
      status: 'active',
    });
  },

  // Create crew
  async createCrew(userId: number, config: CrewConfig) {
    const crew = await prismaService.crew.create({
      userId,
      name: config.name,
      description: config.description || null,
      process: config.process || 'sequential',
      status: 'active',
    });

    // Add members
    for (let i = 0; i < config.agents.length; i++) {
      await prismaService.crewMember.create({
        crewId: crew.id,
        agentId: config.agents[i],
        order: i,
      });
    }

    return crew;
  },

  // Execute crew task with real LLM
  async executeCrew(crewId: number, userId: number, task: string): Promise<any> {
    const crew = await prismaService.crew.findById(crewId);
    if (!crew) throw new Error('Crew not found');

    const members = await prismaService.crewMember.findByCrew(crewId);
    if (members.length === 0) throw new Error('Crew has no agents');

    // Create run record
    const run = await prismaService.agentRun.create({
      crewId,
      userId,
      task,
      status: 'running',
      startedAt: new Date(),
    });

    try {
      const results: TaskResult[] = [];
      const allSteps: Record<string, ReActStep[]> = {};

      if (crew.process === 'sequential') {
        // Sequential execution with ReAct
        for (const member of members) {
          const agent = member.agent;
          const { result, steps } = await runReActAgent(agent, task, results);
          allSteps[agent.name] = steps;
          results.push({
            agent: agent.name,
            task,
            result,
            thought: steps.map(s => s.thought).join('\n'),
          });
        }
      } else {
        // Hierarchical execution
        const manager = members[0];
        const workers = members.slice(1);

        // Manager plans
        const { result: plan, steps: managerSteps } = await runReActAgent(
          manager.agent,
          `作为管理者，请为以下任务制定执行计划: ${task}`,
          []
        );
        allSteps[manager.agent.name] = managerSteps;

        // Workers execute
        for (const worker of workers) {
          const { result, steps } = await runReActAgent(
            worker.agent,
            `执行计划: ${plan}\n\n具体任务: ${task}`,
            results
          );
          allSteps[worker.agent.name] = steps;
          results.push({
            agent: worker.agent.name,
            task,
            result,
            thought: steps.map(s => s.thought).join('\n'),
          });
        }
      }

      const finalResult = results.map(r => `[${r.agent}] ${r.result}`).join('\n\n');

      await prismaService.agentRun.update(run.id, {
        status: 'completed',
        result: finalResult,
        completedAt: new Date(),
      });

      return {
        runId: run.id,
        status: 'completed',
        results,
        steps: allSteps,
        finalResult,
      };
    } catch (error: any) {
      await prismaService.agentRun.update(run.id, {
        status: 'failed',
        error: error.message,
        completedAt: new Date(),
      });
      throw error;
    }
  },

  // Execute single agent task directly
  async executeAgent(agentId: number, task: string): Promise<any> {
    const agent = await prismaService.agent.findById(agentId);
    if (!agent) throw new Error('Agent not found');

    const { result, steps } = await runReActAgent(agent, task, []);

    return {
      agent: agent.name,
      task,
      result,
      steps,
    };
  },

  // Get crew runs
  async getCrewRuns(crewId: number) {
    return prismaService.agentRun.findByCrew(crewId);
  },

  // Delete crew and members
  async deleteCrew(crewId: number) {
    await prismaService.crewMember.deleteByCrew(crewId);
    await prismaService.crew.delete(crewId);
  },
};
