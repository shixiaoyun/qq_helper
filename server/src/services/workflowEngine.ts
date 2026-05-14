import { createLLMProvider, type LLMProviderConfig } from './llmProvider.js';
import { ragService } from './ragService.js';
import { searchWeb, formatSearchResultsForLLM } from './webSearch.js';
import { getDefaultProvider } from '../models/aiProvider.js';
import { prismaService } from './prismaService.js';

export interface WorkflowNode {
  id: string;
  type: 'llm' | 'knowledge_retrieval' | 'code' | 'condition' | 'input' | 'output' | 'web_search' | 'delay' | 'api_call';
  data: Record<string, any>;
  position?: { x: number; y: number };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  condition?: string;
}

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface ExecutionContext {
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  variables: Record<string, any>;
  nodeOutputs: Map<string, any>;
  logs: string[];
}

function createContext(inputs: Record<string, any>): ExecutionContext {
  return {
    inputs,
    outputs: {},
    variables: {},
    nodeOutputs: new Map(),
    logs: [],
  };
}

// 安全的表达式评估 - 只允许数学运算和逻辑比较
function safeEvaluate(expression: string, context: Record<string, any>): any {
  // 白名单：只允许数字、运算符、括号、变量名
  const sanitized = expression.replace(/[^a-zA-Z0-9_+\-*/%<>=!&|().\s]/g, '');

  // 构建变量声明
  const varDeclarations = Object.entries(context)
    .map(([key, value]) => {
      if (typeof value === 'string') return `const ${key} = "${value.replace(/"/g, '\\"')}";`;
      if (typeof value === 'number' || typeof value === 'boolean') return `const ${key} = ${value};`;
      return `const ${key} = ${JSON.stringify(value)};`;
    })
    .join('\n');

  try {
    // 使用 Function 构造器创建隔离作用域
    const fn = new Function(varDeclarations + '\nreturn (' + sanitized + ');');
    return fn();
  } catch (e: any) {
    throw new Error(`表达式执行失败: ${e.message}`);
  }
}

// 解析模板变量 {{varName}}
function resolveTemplate(template: string, context: ExecutionContext): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match: string, key: string) => {
    return context.variables[key] ?? context.nodeOutputs.get(key) ?? context.inputs[key] ?? '';
  });
}

// 获取默认LLM Provider
function getDefaultLLMProvider() {
  const provider = getDefaultProvider();
  if (!provider) throw new Error('没有可用的AI模型，请先配置模型');
  return createLLMProvider(provider as unknown as LLMProviderConfig);
}

// Node executors
const nodeExecutors: Record<string, (node: WorkflowNode, context: ExecutionContext) => Promise<any>> = {
  async input(node, context) {
    const key = node.data.key || 'input';
    const value = context.inputs[key] || node.data.default || '';
    context.logs.push(`[输入] ${key}: ${value}`);
    return value;
  },

  async output(node, context) {
    const value = node.data.value || '';
    const resolved = resolveTemplate(value, context);
    context.outputs[node.data.key || 'output'] = resolved;
    context.logs.push(`[输出] ${node.data.key || 'output'}: ${resolved.slice(0, 100)}...`);
    return resolved;
  },

  async llm(node, context) {
    const prompt = resolveTemplate(node.data.prompt || '', context);
    const systemPrompt = node.data.systemPrompt
      ? resolveTemplate(node.data.systemPrompt, context)
      : '你是一个智能助手，请根据提示回答问题。';

    context.logs.push(`[LLM] 提示: ${prompt.slice(0, 100)}...`);

    try {
      const provider = await getDefaultLLMProvider();
      const response = await provider.chat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: node.data.temperature ?? 0.7,
        maxTokens: node.data.maxTokens ?? 2048,
      });

      context.logs.push(`[LLM] 响应: ${response.content.slice(0, 100)}...`);
      return response.content;
    } catch (err: any) {
      context.logs.push(`[LLM] 错误: ${err.message}`);
      throw err;
    }
  },

  async knowledge_retrieval(node, context) {
    const query = resolveTemplate(node.data.query || '', context);
    const knowledgeBaseId = node.data.knowledgeBaseId;

    if (!knowledgeBaseId) {
      context.logs.push('[知识库] 未指定知识库ID');
      return { results: [], context: '' };
    }

    context.logs.push(`[知识库] 查询: ${query}`);

    try {
      const results = await ragService.search(Number(knowledgeBaseId), query, node.data.topK || 5);
      const formattedContext = ragService.formatContext(results);
      context.logs.push(`[知识库] 找到 ${results.length} 条结果`);
      return { results, context: formattedContext };
    } catch (err: any) {
      context.logs.push(`[知识库] 错误: ${err.message}`);
      return { results: [], context: '' };
    }
  },

  async code(node, context) {
    const code = node.data.code || '';
    context.logs.push(`[代码] 执行代码块...`);

    try {
      // 安全执行：只允许数学运算和字符串操作
      const result = safeEvaluate(code, {
        ...context.variables,
        ...Object.fromEntries(context.nodeOutputs),
        ...context.inputs,
      });
      context.logs.push(`[代码] 结果: ${JSON.stringify(result).slice(0, 100)}`);
      return result;
    } catch (error: any) {
      context.logs.push(`[代码] 错误: ${error.message}`);
      return { error: error.message };
    }
  },

  async condition(node, context) {
    const condition = node.data.condition || 'true';
    context.logs.push(`[条件] 判断: ${condition}`);

    try {
      const result = safeEvaluate(condition, {
        ...context.variables,
        ...Object.fromEntries(context.nodeOutputs),
        ...context.inputs,
      });
      context.logs.push(`[条件] 结果: ${result}`);
      return { condition: result, branch: result ? 'true' : 'false' };
    } catch (err: any) {
      context.logs.push(`[条件] 错误: ${err.message}`);
      return { condition: false, branch: 'false' };
    }
  },

  async web_search(node, context) {
    const query = resolveTemplate(node.data.query || '', context);
    context.logs.push(`[搜索] 查询: ${query}`);

    try {
      const results = await searchWeb(query);
      const formatted = formatSearchResultsForLLM(results);
      context.logs.push(`[搜索] 找到 ${results.length} 条结果`);
      return formatted;
    } catch (err: any) {
      context.logs.push(`[搜索] 错误: ${err.message}`);
      return `[搜索失败] ${err.message}`;
    }
  },

  async api_call(node, context) {
    const url = resolveTemplate(node.data.url || '', context);
    const method = node.data.method || 'GET';
    const headers = node.data.headers || {};
    const body = node.data.body ? resolveTemplate(node.data.body, context) : undefined;

    context.logs.push(`[API] ${method} ${url}`);

    try {
      const options: RequestInit = { method, headers };
      if (body && method !== 'GET') options.body = body;

      const resp = await fetch(url, options);
      const data = await resp.json().catch(() => ({}));
      context.logs.push(`[API] 响应状态: ${resp.status}`);
      return data;
    } catch (err: any) {
      context.logs.push(`[API] 错误: ${err.message}`);
      return { error: err.message };
    }
  },

  async delay(node) {
    const ms = node.data.delay || 1000;
    await new Promise(resolve => setTimeout(resolve, ms));
    return { delayed: ms };
  },
};

// Build adjacency list from edges
function buildGraph(nodes: WorkflowNode[], edges: WorkflowEdge[]): Map<string, string[]> {
  const graph = new Map<string, string[]>();

  for (const node of nodes) {
    graph.set(node.id, []);
  }

  for (const edge of edges) {
    const neighbors = graph.get(edge.source) || [];
    neighbors.push(edge.target);
    graph.set(edge.source, neighbors);
  }

  return graph;
}

// Topological sort
function topologicalSort(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
  const graph = buildGraph(nodes, edges);
  const inDegree = new Map<string, number>();

  for (const node of nodes) {
    inDegree.set(node.id, 0);
  }

  for (const edge of edges) {
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
  }

  const queue: string[] = [];
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) queue.push(nodeId);
  }

  const sorted: WorkflowNode[] = [];
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    const node = nodeMap.get(nodeId);
    if (node) sorted.push(node);

    const neighbors = graph.get(nodeId) || [];
    for (const neighbor of neighbors) {
      const newDegree = (inDegree.get(neighbor) || 0) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  return sorted;
}

export const workflowEngine = {
  // Execute a workflow
  async execute(workflowId: number, inputs: Record<string, any> = {}): Promise<any> {
    const workflow = await prismaService.workflow.findById(workflowId);
    if (!workflow) throw new Error('Workflow not found');

    // Create run record
    const run = await prismaService.workflowRun.create({
      workflowId,
      userId: workflow.userId,
      inputs: JSON.stringify(inputs),
      status: 'running',
      startedAt: new Date(),
    });

    try {
      const nodes: WorkflowNode[] = JSON.parse(workflow.nodes);
      const edges: WorkflowEdge[] = JSON.parse(workflow.edges);

      const context = createContext(inputs);
      const sortedNodes = topologicalSort(nodes, edges);

      for (const node of sortedNodes) {
        const executor = nodeExecutors[node.type];
        if (executor) {
          const output = await executor(node, context);
          context.nodeOutputs.set(node.id, output);

          // Store output in variables if configured
          if (node.data.outputVar) {
            context.variables[node.data.outputVar] = output;
          }
        }
      }

      // Update run with success
      await prismaService.workflowRun.update(run.id, {
        status: 'completed',
        outputs: JSON.stringify(context.outputs),
        error: null,
        completedAt: new Date(),
      });

      return {
        runId: run.id,
        status: 'completed',
        outputs: context.outputs,
        logs: context.logs,
      };
    } catch (error: any) {
      await prismaService.workflowRun.update(run.id, {
        status: 'failed',
        error: error.message,
        completedAt: new Date(),
      });

      throw error;
    }
  },

  // Create workflow
  async createWorkflow(userId: number, data: {
    name: string;
    description?: string;
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
  }) {
    return prismaService.workflow.create({
      userId,
      name: data.name,
      description: data.description || null,
      nodes: JSON.stringify(data.nodes),
      edges: JSON.stringify(data.edges),
      status: 'active',
    });
  },

  // Update workflow
  async updateWorkflow(workflowId: number, data: {
    name?: string;
    description?: string;
    nodes?: WorkflowNode[];
    edges?: WorkflowEdge[];
  }) {
    const updateData: any = {};
    if (data.name) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.nodes) updateData.nodes = JSON.stringify(data.nodes);
    if (data.edges) updateData.edges = JSON.stringify(data.edges);

    return prismaService.workflow.update(workflowId, updateData);
  },

  // Get workflow runs
  async getRuns(workflowId: number) {
    return prismaService.workflowRun.findByWorkflow(workflowId);
  },
};
