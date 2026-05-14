import { mcpRegistry, type MCPCrew } from '../_core/index.js';
import { salesAgents } from './agents.js';

// ==========================================
// 销售作战团队 - Crew定义
// 预定义的6大销售工作流
// ==========================================

const crews: MCPCrew[] = [
  {
    id: 'crew-first-contact',
    name: '新客户初次接触',
    description: '针对新客户的完整初次接触流程：客户研究 → Discovery设计 → 话术准备 → 产品匹配',
    process: 'sequential',
    agents: ['sales-manager', 'customer-researcher', 'discovery-coach', 'sales-coach', 'product-expert'],
    tasks: ['task-customer-research', 'task-discovery-script', 'task-first-contact-prep', 'task-product-match'],
    enabled: true,
  },
  {
    id: 'crew-objection-training',
    name: '异议处理训练',
    description: '针对客户异议的角色扮演训练流程',
    process: 'sequential',
    agents: ['sales-manager', 'sales-coach'],
    tasks: ['task-objection-handling'],
    enabled: true,
  },
  {
    id: 'crew-demo-preparation',
    name: '产品演示准备',
    description: '完整的产品演示准备流程：客户研究 → 方案设计 → 演示准备',
    process: 'sequential',
    agents: ['sales-manager', 'customer-researcher', 'solution-architect', 'product-expert'],
    tasks: ['task-customer-research', 'task-product-match', 'task-demo-prep'],
    enabled: true,
  },
  {
    id: 'crew-negotiation',
    name: '谈判签约辅导',
    description: '谈判策略制定和签约辅导流程',
    process: 'hierarchical',
    agents: ['sales-manager', 'sales-coach', 'solution-architect'],
    tasks: ['task-negotiation-strategy', 'task-proposal-generation', 'task-follow-up-plan'],
    enabled: true,
  },
  {
    id: 'crew-discovery-session',
    name: 'Discovery专项训练',
    description: 'Discovery方法论专项训练：差距分析 → 话术生成 → 通话辅导 → 复盘改进',
    process: 'sequential',
    agents: ['sales-manager', 'discovery-coach', 'customer-researcher'],
    tasks: [
      'task-gap-analysis',
      'task-discovery-script',
      'task-discovery-coaching',
      'task-call-review',
    ],
    enabled: true,
  },
  {
    id: 'crew-full-pipeline',
    name: '完整销售管道',
    description: '从客户研究到签约的完整销售流程（含Discovery深度挖掘）',
    process: 'sequential',
    agents: ['sales-manager', 'customer-researcher', 'discovery-coach', 'sales-coach', 'product-expert', 'solution-architect'],
    tasks: [
      'task-customer-research',
      'task-gap-analysis',
      'task-discovery-script',
      'task-first-contact-prep',
      'task-product-match',
      'task-demo-prep',
      'task-objection-handling',
      'task-negotiation-strategy',
      'task-proposal-generation',
      'task-follow-up-plan',
    ],
    enabled: true,
  },
];

// 获取当前启用的Agent ID集合
function getEnabledAgentIds(): Set<string> {
  return new Set(salesAgents.filter(a => a.enabled !== false).map(a => a.id));
}

// 过滤Crew中已禁用的Agent
function filterCrewAgents(crew: MCPCrew, enabledAgentIds: Set<string>): MCPCrew {
  const filteredAgents = crew.agents.filter(id => enabledAgentIds.has(id));
  return {
    ...crew,
    agents: filteredAgents,
  };
}

export function registerSalesCrews(): void {
  const enabledAgentIds = getEnabledAgentIds();
  let registeredCount = 0;

  for (const crew of crews) {
    if (crew.enabled === false) {
      console.log(`[SalesCrew] Crew ${crew.id} 已禁用，跳过注册`);
      continue;
    }

    const filteredCrew = filterCrewAgents(crew, enabledAgentIds);

    // 如果过滤后没有可用Agent，跳过该Crew
    if (filteredCrew.agents.length === 0) {
      console.log(`[SalesCrew] Crew ${crew.id} 的所有Agent均已禁用，跳过注册`);
      continue;
    }

    // 如果过滤后有Agent缺失，记录警告
    if (filteredCrew.agents.length < crew.agents.length) {
      const disabledAgents = crew.agents.filter(id => !enabledAgentIds.has(id));
      console.log(`[SalesCrew] Crew ${crew.id} 已过滤禁用Agent: [${disabledAgents.join(', ')}]`);
    }

    mcpRegistry.registerCrew(filteredCrew);
    registeredCount++;
  }

  console.log(`[SalesCrew] 已注册 ${registeredCount} 个销售Crew`);
}
