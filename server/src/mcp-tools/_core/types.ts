// ==========================================
// MCP核心类型定义
// ==========================================

export interface MCPToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface MCPTool extends MCPToolDefinition {
  execute: (args: Record<string, any>) => Promise<any>;
}

export interface MCPAgent {
  id: string;
  name: string;
  role: string;
  goal: string;
  backstory: string;
  tools: string[];
  knowledgeBases: string[];
  model: string;
  temperature?: number;
  maxTokens?: number;
  enabled?: boolean;
}

export interface MCPTask {
  id: string;
  name: string;
  description: string;
  agent: string;
  context?: string;
  expectedOutput: string;
  dependencies?: string[];
  enabled?: boolean;
}

export interface MCPCrew {
  id: string;
  name: string;
  description: string;
  process: 'sequential' | 'hierarchical' | 'parallel';
  agents: string[];
  tasks: string[];
  enabled?: boolean;
}

export interface MCPKnowledgeBase {
  id: string;
  name: string;
  vendor: string;
  path: string;
  documents: string[];
  embeddingModel?: string;
}

export interface ToolModule {
  name: string;
  description: string;
  version: string;
  register: (registry: MCPRegistry) => void | Promise<void>;
}

export class MCPRegistry {
  private tools = new Map<string, MCPTool>();
  private agents = new Map<string, MCPAgent>();
  private tasks = new Map<string, MCPTask>();
  private crews = new Map<string, MCPCrew>();
  private knowledgeBases = new Map<string, MCPKnowledgeBase>();

  registerTool(tool: MCPTool): void {
    if (this.tools.has(tool.name)) {
      console.warn(`[MCP] 工具 ${tool.name} 已存在，将被覆盖`);
    }
    this.tools.set(tool.name, tool);
  }

  registerAgent(agent: MCPAgent): void {
    if (this.agents.has(agent.id)) {
      console.warn(`[MCP] Agent ${agent.id} 已存在，将被覆盖`);
    }
    this.agents.set(agent.id, agent);
  }

  removeAgent(id: string): boolean {
    const existed = this.agents.has(id);
    if (existed) {
      this.agents.delete(id);
      console.log(`[MCP] Agent ${id} 已移除`);
    }
    return existed;
  }

  registerTask(task: MCPTask): void {
    if (this.tasks.has(task.id)) {
      console.warn(`[MCP] 任务 ${task.id} 已存在，将被覆盖`);
    }
    this.tasks.set(task.id, task);
  }

  registerCrew(crew: MCPCrew): void {
    if (this.crews.has(crew.id)) {
      console.warn(`[MCP] Crew ${crew.id} 已存在，将被覆盖`);
    }
    this.crews.set(crew.id, crew);
  }

  registerKnowledgeBase(kb: MCPKnowledgeBase): void {
    if (this.knowledgeBases.has(kb.id)) {
      console.warn(`[MCP] 知识库 ${kb.id} 已存在，将被覆盖`);
    }
    this.knowledgeBases.set(kb.id, kb);
  }

  getTool(name: string): MCPTool | undefined {
    return this.tools.get(name);
  }

  getAgent(id: string): MCPAgent | undefined {
    return this.agents.get(id);
  }

  getTask(id: string): MCPTask | undefined {
    return this.tasks.get(id);
  }

  getCrew(id: string): MCPCrew | undefined {
    return this.crews.get(id);
  }

  getKnowledgeBase(id: string): MCPKnowledgeBase | undefined {
    return this.knowledgeBases.get(id);
  }

  listTools(): Array<{ name: string; description: string; parameters: any }> {
    return Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }

  listAgents(): MCPAgent[] {
    return Array.from(this.agents.values());
  }

  listTasks(): MCPTask[] {
    return Array.from(this.tasks.values());
  }

  listCrews(): MCPCrew[] {
    return Array.from(this.crews.values());
  }

  listKnowledgeBases(): MCPKnowledgeBase[] {
    return Array.from(this.knowledgeBases.values());
  }

  async executeTool(name: string, args: Record<string, any>): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, error: `工具不存在: ${name}` };
    }
    try {
      return await tool.execute(args);
    } catch (err: any) {
      return { success: false, error: err.message || '工具执行失败' };
    }
  }

  getStats() {
    return {
      tools: this.tools.size,
      agents: this.agents.size,
      tasks: this.tasks.size,
      crews: this.crews.size,
      knowledgeBases: this.knowledgeBases.size,
    };
  }
}

export const mcpRegistry = new MCPRegistry();
