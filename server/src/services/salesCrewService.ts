import { getDatabase } from '../config/database.js';

export interface SalesCrewSession {
  id: number;
  userId: number;
  customerId: number | null;
  crewId: string | null;
  vendor: string | null;
  title: string | null;
  status: string;
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SalesCrewMessage {
  id: number;
  sessionId: number;
  userId: number;
  role: string;
  agentId: string | null;
  agentName: string | null;
  content: string;
  knowledgeRefs: string;
  tokensInput: number;
  tokensOutput: number;
  latencyMs: number | null;
  status: string;
  createdAt: string;
}

// Q1.18新增：战后复盘分析结果
export interface CallAnalysisResult {
  sessionId: number;
  attitudeStage: string; // denial/panic/bargaining/acceptance/execution
  decisionChainCompleteness: number; // 0-100
  bossContacted: boolean;
  cfoContacted: boolean;
  itAttitude: string; // hostile/neutral/cooperative
  deadlineDays: number | null;
  domesticCadThreat: boolean;
  closeProbability: number; // 5-95
  nextActions: string[];
  riskFactors: string[];
}

export const salesCrewService = {
  // 创建会话
  createSession(userId: number, crewId?: string, vendor?: string, title?: string, customerId?: number): number {
    const db = getDatabase();
    const result = db.prepare(
      'INSERT INTO sales_crew_sessions (user_id, customer_id, crew_id, vendor, title) VALUES (?, ?, ?, ?, ?)'
    ).run(userId, customerId || null, crewId || null, vendor || null, title || '新会话');
    return Number(result.lastInsertRowid);
  },

  // 根据客户ID获取会话
  getSessionByCustomer(userId: number, customerId: number): SalesCrewSession | null {
    const db = getDatabase();
    const row = db.prepare(
      'SELECT * FROM sales_crew_sessions WHERE user_id = ? AND customer_id = ? AND status = ? ORDER BY last_message_at DESC LIMIT 1'
    ).get(userId, customerId, 'active') as any;
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      customerId: row.customer_id,
      crewId: row.crew_id,
      vendor: row.vendor,
      title: row.title,
      status: row.status,
      messageCount: row.message_count,
      lastMessageAt: row.last_message_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  },

  // 获取用户的所有会话
  getSessionsByUser(userId: number, limit = 50): SalesCrewSession[] {
    const db = getDatabase();
    const rows = db.prepare(
      'SELECT * FROM sales_crew_sessions WHERE user_id = ? AND status = ? ORDER BY last_message_at DESC, created_at DESC LIMIT ?'
    ).all(userId, 'active', limit) as any[];
    return rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      customerId: row.customer_id,
      crewId: row.crew_id,
      vendor: row.vendor,
      title: row.title,
      status: row.status,
      messageCount: row.message_count,
      lastMessageAt: row.last_message_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  },

  // 获取单个会话
  getSession(sessionId: number): SalesCrewSession | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM sales_crew_sessions WHERE id = ?').get(sessionId) as any;
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      customerId: row.customer_id,
      crewId: row.crew_id,
      vendor: row.vendor,
      title: row.title,
      status: row.status,
      messageCount: row.message_count,
      lastMessageAt: row.last_message_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  },

  // 更新会话标题
  updateSessionTitle(sessionId: number, title: string): void {
    const db = getDatabase();
    db.prepare('UPDATE sales_crew_sessions SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(title, sessionId);
  },

  // 删除会话（软删除）
  deleteSession(sessionId: number): void {
    const db = getDatabase();
    db.prepare('UPDATE sales_crew_sessions SET status = ?, deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run('deleted', sessionId);
  },

  // Q1.21新增：恢复已删除的会话
  restoreSession(sessionId: number): boolean {
    const db = getDatabase();
    const result = db.prepare(
      "UPDATE sales_crew_sessions SET status = 'active', deleted_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'deleted'"
    ).run(sessionId);
    return result.changes > 0;
  },

  // Q1.21新增：获取用户的已删除会话（回收站）
  getDeletedSessionsByUser(userId: number, limit = 50): SalesCrewSession[] {
    const db = getDatabase();
    const rows = db.prepare(
      'SELECT * FROM sales_crew_sessions WHERE user_id = ? AND status = ? ORDER BY deleted_at DESC LIMIT ?'
    ).all(userId, 'deleted', limit) as any[];
    return rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      customerId: row.customer_id,
      crewId: row.crew_id,
      vendor: row.vendor,
      title: row.title,
      status: row.status,
      messageCount: row.message_count,
      lastMessageAt: row.last_message_at,
      createdAt: row.created_at,
      updatedAt: row.deleted_at || row.updated_at, // 回收站中显示删除时间
    }));
  },

  // Q1.21新增：永久删除会话及其所有消息和分析数据
  permanentDeleteSession(sessionId: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM sales_crew_messages WHERE session_id = ?').run(sessionId);
    db.prepare('DELETE FROM sales_crew_analysis WHERE session_id = ?').run(sessionId);
    db.prepare('DELETE FROM sales_crew_sessions WHERE id = ?').run(sessionId);
  },

  // 添加消息
  addMessage(data: {
    sessionId: number;
    userId: number;
    role: string;
    agentId?: string;
    agentName?: string;
    content: string;
    knowledgeRefs?: string[];
    tokensInput?: number;
    tokensOutput?: number;
    latencyMs?: number;
    status?: string;
    errorMessage?: string;
  }): number {
    const db = getDatabase();
    const result = db.prepare(
      `INSERT INTO sales_crew_messages
       (session_id, user_id, role, agent_id, agent_name, content, knowledge_refs, tokens_input, tokens_output, latency_ms, status, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      data.sessionId,
      data.userId,
      data.role,
      data.agentId || null,
      data.agentName || null,
      data.content,
      JSON.stringify(data.knowledgeRefs || []),
      data.tokensInput || 0,
      data.tokensOutput || 0,
      data.latencyMs || null,
      data.status || 'ok',
      data.errorMessage || null
    );

    // 更新会话消息数和时间
    db.prepare(
      'UPDATE sales_crew_sessions SET message_count = message_count + 1, last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(data.sessionId);

    return Number(result.lastInsertRowid);
  },

  // 获取会话的所有消息
  getMessagesBySession(sessionId: number): SalesCrewMessage[] {
    const db = getDatabase();
    const rows = db.prepare(
      'SELECT * FROM sales_crew_messages WHERE session_id = ? ORDER BY created_at ASC'
    ).all(sessionId) as any[];
    return rows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      userId: row.user_id,
      role: row.role,
      agentId: row.agent_id,
      agentName: row.agent_name,
      content: row.content,
      knowledgeRefs: row.knowledge_refs,
      tokensInput: row.tokens_input,
      tokensOutput: row.tokens_output,
      latencyMs: row.latency_ms,
      status: row.status,
      createdAt: row.created_at,
    }));
  },

  // 获取会话最近的N条消息（用于上下文）
  getRecentMessages(sessionId: number, limit = 10): SalesCrewMessage[] {
    const db = getDatabase();
    const rows = db.prepare(
      'SELECT * FROM sales_crew_messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?'
    ).all(sessionId, limit) as any[];
    return rows.reverse().map(row => ({
      id: row.id,
      sessionId: row.session_id,
      userId: row.user_id,
      role: row.role,
      agentId: row.agent_id,
      agentName: row.agent_name,
      content: row.content,
      knowledgeRefs: row.knowledge_refs,
      tokensInput: row.tokens_input,
      tokensOutput: row.tokens_output,
      latencyMs: row.latency_ms,
      status: row.status,
      createdAt: row.created_at,
    }));
  },

  // ==========================================
  // Q1.18新增：战后复盘与成单预测
  // ==========================================

  // 分析会话，生成战后复盘报告
  analyzeSession(sessionId: number): CallAnalysisResult {
    const db = getDatabase();
    const messages = db.prepare(
      'SELECT * FROM sales_crew_messages WHERE session_id = ? ORDER BY created_at ASC'
    ).all(sessionId) as any[];

    // 分析客户态度阶段
    let attitudeStage = 'unknown';
    const allContent = messages.map(m => m.content).join(' ').toLowerCase();

    if (/配合|买|签|可以|同意/i.test(allContent) && /装|部署|打款/i.test(allContent)) {
      attitudeStage = 'execution';
    } else if (/配合|怎么做|需要|可以/i.test(allContent)) {
      attitudeStage = 'acceptance';
    } else if (/打折|分期|便宜|考虑|研究|国产/i.test(allContent)) {
      attitudeStage = 'bargaining';
    } else if (/担心|害怕|怎么办|罚款|告/i.test(allContent)) {
      attitudeStage = 'panic';
    } else if (/没用过|没盗版|不清楚|前任/i.test(allContent)) {
      attitudeStage = 'denial';
    }

    // 检测决策链接触情况
    const bossContacted = /老板|张总|李总|总经理|董事长/i.test(allContent);
    const cfoContacted = /财务|CFO|总监|会计/i.test(allContent);
    const itContacted = /IT|技术|工程师|主管/i.test(allContent);

    // IT态度判断
    let itAttitude = 'neutral';
    if (/麻烦|工作量|重装|难|抵触/i.test(allContent)) itAttitude = 'hostile';
    else if (/可以|配合|没问题/i.test(allContent)) itAttitude = 'cooperative';

    // 检测deadline
    let deadlineDays: number | null = null;
    const deadlineMatch = allContent.match(/(\d+)\s*天/);
    if (deadlineMatch) deadlineDays = parseInt(deadlineMatch[1]);

    // 检测国产CAD威胁
    const domesticCadThreat = /国产|中望|浩辰|CAXA|替代/i.test(allContent);

    // 计算决策链完整度
    let decisionChainCompleteness = 0;
    if (bossContacted) decisionChainCompleteness += 40;
    if (cfoContacted) decisionChainCompleteness += 30;
    if (itContacted) decisionChainCompleteness += 20;
    if (deadlineDays !== null) decisionChainCompleteness += 10;

    // 成单预测模型（基于技术文档的公式）
    let closeProbability = 10; // 基础概率

    // 态度系数
    const attitudeScores: Record<string, number> = {
      denial: -20,
      panic: -10,
      bargaining: 10,
      acceptance: 30,
      execution: 50,
      unknown: 0,
    };
    closeProbability += attitudeScores[attitudeStage] || 0;

    // 决策链系数
    if (bossContacted) closeProbability += 20;
    if (cfoContacted) closeProbability += 15;
    if (itAttitude === 'cooperative') closeProbability += 5;
    if (itAttitude === 'hostile') closeProbability -= 5;

    // 时间压力系数
    if (deadlineDays !== null) {
      if (deadlineDays > 30) closeProbability += 0;
      else if (deadlineDays > 15) closeProbability += 10;
      else if (deadlineDays > 7) closeProbability += 20;
      else closeProbability += 25;
    }

    // 竞争威胁（负向）
    if (domesticCadThreat) closeProbability -= 20;

    // 限制范围
    closeProbability = Math.max(5, Math.min(95, closeProbability));

    // 生成下一步行动建议
    const nextActions: string[] = [];
    if (!bossContacted) nextActions.push('🔴 48小时内约见老板——决策链缺失最大风险点');
    if (!cfoContacted) nextActions.push('🔴 必须接触CFO——财务不点头老板也拍不了板');
    if (attitudeStage === 'denial') nextActions.push('🔴 发送「合规风险可视化材料」——提升紧迫感');
    if (attitudeStage === 'panic') nextActions.push('🟡 安抚情绪，强调代理商帮助者角色');
    if (attitudeStage === 'bargaining') nextActions.push('🟡 准备分级报价方案，锁定折扣');
    if (domesticCadThreat) nextActions.push('🟡 准备「国产CAD迁移成本分析」——提前拦截替代方案');
    if (deadlineDays !== null && deadlineDays < 15) nextActions.push('🔴 向厂商法务申请延长deadline——显示协调诚意');
    if (nextActions.length === 0) nextActions.push('🟢 准备合同，安排签约流程');

    // 风险因素
    const riskFactors: string[] = [];
    if (attitudeStage === 'denial') riskFactors.push('客户否认使用盗版，需给台阶下');
    if (!bossContacted) riskFactors.push('未接触决策者');
    if (!cfoContacted) riskFactors.push('财务未参与，预算可能受阻');
    if (itAttitude === 'hostile') riskFactors.push('IT抵触，执行阻力大');
    if (domesticCadThreat) riskFactors.push('国产CAD替代威胁');
    if (deadlineDays !== null && deadlineDays < 7) riskFactors.push('deadline紧迫，决策时间不足');

    return {
      sessionId,
      attitudeStage,
      decisionChainCompleteness,
      bossContacted,
      cfoContacted,
      itAttitude,
      deadlineDays,
      domesticCadThreat,
      closeProbability,
      nextActions,
      riskFactors,
    };
  },

  // 保存复盘分析结果
  saveAnalysis(sessionId: number, analysis: CallAnalysisResult): void {
    const db = getDatabase();
    db.prepare(
      `INSERT OR REPLACE INTO sales_crew_analysis
       (session_id, attitude_stage, decision_chain_completeness, boss_contacted, cfo_contacted,
        it_attitude, deadline_days, domestic_cad_threat, close_probability, next_actions, risk_factors, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    ).run(
      sessionId,
      analysis.attitudeStage,
      analysis.decisionChainCompleteness,
      analysis.bossContacted ? 1 : 0,
      analysis.cfoContacted ? 1 : 0,
      analysis.itAttitude,
      analysis.deadlineDays,
      analysis.domesticCadThreat ? 1 : 0,
      analysis.closeProbability,
      JSON.stringify(analysis.nextActions),
      JSON.stringify(analysis.riskFactors)
    );
  },

  // 获取复盘分析结果
  getAnalysis(sessionId: number): CallAnalysisResult | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM sales_crew_analysis WHERE session_id = ?').get(sessionId) as any;
    if (!row) return null;
    return {
      sessionId: row.session_id,
      attitudeStage: row.attitude_stage,
      decisionChainCompleteness: row.decision_chain_completeness,
      bossContacted: !!row.boss_contacted,
      cfoContacted: !!row.cfo_contacted,
      itAttitude: row.it_attitude,
      deadlineDays: row.deadline_days,
      domesticCadThreat: !!row.domestic_cad_threat,
      closeProbability: row.close_probability,
      nextActions: JSON.parse(row.next_actions || '[]'),
      riskFactors: JSON.parse(row.risk_factors || '[]'),
    };
  },
};
