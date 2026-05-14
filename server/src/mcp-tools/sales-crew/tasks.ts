import { mcpRegistry, type MCPTask } from '../_core/index.js';
import { salesAgents } from './agents.js';

// ==========================================
// 销售作战团队 - 任务定义 (Q1.28)
// 覆盖销售全流程 + 反盗版专项任务 + Discovery教练任务
// ==========================================

const tasks: MCPTask[] = [
  {
    id: 'task-customer-research',
    name: '客户背景研究',
    description: '分析客户公司背景、行业特点、决策链、采购历史',
    agent: 'customer-researcher',
    expectedOutput: '客户画像报告，包含：公司基本信息、行业分析、决策链图谱、商机等级评估、潜在痛点',
    enabled: true,
  },
  {
    id: 'task-first-contact-prep',
    name: '初次接触准备',
    description: '准备首次接触客户的话术、资料、演示方案',
    agent: 'sales-coach',
    expectedOutput: '初次接触话术脚本、开场白建议、破冰话题、价值主张陈述',
    enabled: true,
  },
  {
    id: 'task-product-match',
    name: '产品方案匹配',
    description: '根据客户需求匹配最佳产品版本和配置',
    agent: 'product-expert',
    expectedOutput: '产品推荐方案，包含：推荐版本、功能对比、竞品分析、ROI计算、报价建议',
    enabled: true,
  },
  {
    id: 'task-objection-handling',
    name: '异议处理训练',
    description: '针对客户常见异议提供应对话术和策略',
    agent: 'sales-coach',
    expectedOutput: '异议处理话术集，包含：价格异议、竞品异议、决策异议、时机异议的标准应对',
    enabled: true,
  },
  {
    id: 'task-demo-prep',
    name: '产品演示准备',
    description: '准备针对性的产品演示方案',
    agent: 'solution-architect',
    expectedOutput: '演示方案文档，包含：演示流程、重点功能、客户案例、互动环节设计',
    enabled: true,
  },
  {
    id: 'task-negotiation-strategy',
    name: '谈判策略制定',
    description: '制定价格谈判和合同条款谈判策略',
    agent: 'sales-coach',
    expectedOutput: '谈判策略报告，包含：底价设定、让步空间、交换条件、合同条款建议',
    enabled: true,
  },
  {
    id: 'task-proposal-generation',
    name: '方案书生成',
    description: '生成完整的销售方案书',
    agent: 'solution-architect',
    expectedOutput: '销售方案书，包含：需求分析、方案设计、产品清单、报价明细、实施计划',
    enabled: true,
  },
  {
    id: 'task-follow-up-plan',
    name: '跟进计划制定',
    description: '制定客户跟进计划和节奏',
    agent: 'sales-manager',
    expectedOutput: '跟进计划表，包含：跟进时间节点、沟通方式、内容要点、预期目标',
    enabled: true,
  },
  // Q1.18新增：反盗版专项任务
  {
    id: 'task-piracy-intelligence',
    name: '盗版情报分析',
    description: '分析盗版企业画像、决策链、攻单窗口',
    agent: 'customer-researcher',
    expectedOutput: '盗版企业情报报告：企业画像、决策链图谱、攻单窗口、合规阶段判断',
    enabled: true,
  },
  {
    id: 'task-compliance-assessment',
    name: '合规风险评估',
    description: '评估客户软件合规风险等级和化解方案',
    agent: 'legal-compliance',
    expectedOutput: '合规风险评估报告：风险等级、法律后果、化解路径、代理商协调方案',
    enabled: true,
  },
  {
    id: 'task-license-design',
    name: '正版化方案设计',
    description: '设计四级正版化方案（A完整/B核心/C最小/D分期）',
    agent: 'product-expert',
    expectedOutput: '四级方案设计：完整正版化/核心优先/最小合规/分期过渡，含价格和折扣',
    enabled: true,
  },
  {
    id: 'task-legal-negotiation',
    name: '法务谈判策略',
    description: '制定与厂商法务和客户的三方谈判策略',
    agent: 'legal-compliance',
    expectedOutput: '谈判策略：三方博弈分析、谈判节奏、底线设定、话术脚本',
    enabled: true,
  },
  {
    id: 'task-piracy-script',
    name: '反盗版话术生成',
    description: '生成反盗版场景专用话术脚本',
    agent: 'sales-coach',
    expectedOutput: '完整话术脚本：首次电话、上门提案、微信跟进、异议处理',
    enabled: true,
  },
  {
    id: 'task-post-call-analysis',
    name: '战后复盘分析',
    description: '分析销售对话，生成复盘报告和成单预测',
    agent: 'sales-manager',
    expectedOutput: '复盘报告：态度评级、决策链完整度、成单概率、下一步行动',
    enabled: true,
  },
  // Q1.27新增：Discovery教练专项任务
  {
    id: 'task-discovery-coaching',
    name: 'Discovery通话辅导',
    description: '辅导销售设计Discovery问题序列、诊断通话结构、提升提问质量',
    agent: 'discovery-coach',
    expectedOutput: 'Discovery辅导报告：问题序列设计、通话结构优化、SPIN/Gap/Sandler框架应用建议、改进要点',
    enabled: true,
  },
  {
    id: 'task-discovery-script',
    name: 'Discovery话术生成',
    description: '生成完整的Discovery通话脚本，包含开场前置约定、问题序列、沉默策略',
    agent: 'discovery-coach',
    expectedOutput: '完整Discovery脚本：前置约定话术、SPIN问题序列、Implication深挖问题、Need-Payoff引导话术、锁定下一步脚本',
    enabled: true,
  },
  {
    id: 'task-gap-analysis',
    name: '客户差距分析',
    description: '帮助销售诊断客户当前状态与期望未来状态之间的差距，量化业务影响',
    agent: 'discovery-coach',
    expectedOutput: '差距分析报告：当前状态诊断、未来状态描述、差距量化（收入/成本/风险/人）、根因分析、不作为代价',
    enabled: true,
  },
  {
    id: 'task-call-review',
    name: 'Discovery通话复盘',
    description: '复盘销售Discovery通话录音/记录，指出问题、评分、给出改进建议',
    agent: 'discovery-coach',
    expectedOutput: '通话复盘报告：提问质量评分、60/40法则检查、Implication问题深度评估、过早Pitch标记、具体改进建议',
    enabled: true,
  },
];

// 获取当前启用的Agent ID集合
function getEnabledAgentIds(): Set<string> {
  return new Set(salesAgents.filter(a => a.enabled !== false).map(a => a.id));
}

export function registerSalesTasks(): void {
  const enabledAgentIds = getEnabledAgentIds();
  let registeredCount = 0;

  for (const task of tasks) {
    if (task.enabled === false) {
      console.log(`[SalesCrew] 任务 ${task.id} 已禁用，跳过注册`);
      continue;
    }

    // 如果任务指定的Agent已被禁用，跳过该任务
    if (!enabledAgentIds.has(task.agent)) {
      console.log(`[SalesCrew] 任务 ${task.id} 的Agent ${task.agent} 已禁用，跳过注册`);
      continue;
    }

    mcpRegistry.registerTask(task);
    registeredCount++;
  }

  console.log(`[SalesCrew] 已注册 ${registeredCount} 个销售任务（含反盗版专项任务）`);
}
