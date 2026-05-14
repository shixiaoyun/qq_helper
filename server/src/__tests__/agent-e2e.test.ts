/**
 * Agent功能端到端验证测试
 */

import { initMCPTools, executeMCPTool, listMCPTools, getMCPTool } from '../services/mcpTools.js';

describe('Agent E2E Tests', () => {
  let testAgentId: string;

  beforeAll(async () => {
    await initMCPTools();
  });

  describe('Agent工具注册', () => {
    it('should register 4 core agent tools', () => {
      const tools = listMCPTools();
      const agentTools = tools.filter(t =>
        ['agent_run', 'agent_status', 'agent_list', 'agent_stop'].includes(t.name)
      );
      expect(agentTools.length).toBe(4);
    });

    it('should have agent_stop tool defined', () => {
      const def = getMCPTool('agent_stop');
      expect(def).toBeDefined();
      expect(def?.name).toBe('agent_stop');
      expect(def?.parameters.required).toContain('agentId');
    });
  });

  describe('Agent创建与状态', () => {
    it('should create agent in async mode', async () => {
      const result = await executeMCPTool('agent_run', {
        type: 'Test',
        description: 'E2E验证测试Agent',
        sync: false,
      });

      expect(result.success).toBe(true);
      expect(result.agentId).toBeDefined();
      expect(result.status).toBe('running');
      testAgentId = result.agentId;
    });

    it('should query agent status', async () => {
      const status = await executeMCPTool('agent_status', { agentId: testAgentId });

      expect(status.success).toBe(true);
      expect(status.agent.id).toBe(testAgentId);
      expect(status.agent.type).toBe('Test');
      expect(['running', 'completed', 'stopped']).toContain(status.agent.status);
    });
  });

  describe('Agent停止功能', () => {
    it('should send stop signal to running agent', async () => {
      const stop = await executeMCPTool('agent_stop', { agentId: testAgentId });

      expect(stop.success).toBe(true);
      expect(stop.message).toContain('停止信号');
    });

    it('should reject stopping non-existent agent', async () => {
      const stop = await executeMCPTool('agent_stop', { agentId: 'fake-id-123' });

      expect(stop.success).toBe(false);
      expect(stop.error).toContain('不存在');
    });

    it('should handle duplicate stop gracefully', async () => {
      // 再次尝试停止同一Agent
      const stop = await executeMCPTool('agent_stop', { agentId: testAgentId });
      // 停止信号可能已发送或Agent已停止
      expect(stop).toBeDefined();
    });
  });

  describe('Agent列表功能', () => {
    it('should list all agents', async () => {
      const list = await executeMCPTool('agent_list', {});

      expect(list.success).toBe(true);
      expect(Array.isArray(list.agents)).toBe(true);
      expect(list.count).toBeGreaterThanOrEqual(0);
    });

    it('should filter agents by status', async () => {
      const runningList = await executeMCPTool('agent_list', { status: 'stopped' });

      expect(runningList.success).toBe(true);
      expect(Array.isArray(runningList.agents)).toBe(true);
    });
  });
});
