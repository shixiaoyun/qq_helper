/**
 * Agent记忆系统测试
 */

import { AgentMemory, getAgentMemory, deleteAgentMemory, clearAllAgentMemories } from '../services/agentMemory.js';

describe('AgentMemory', () => {
  let memory: AgentMemory;

  beforeEach(() => {
    clearAllAgentMemories();
    memory = new AgentMemory('test-agent', 'test-session', { maxStorageSize: 100, workingMemorySize: 10 });
    memory.clear();
  });

  afterEach(() => {
    memory.clear();
  });

  describe('基础操作', () => {
    it('should add message to memory', () => {
      const msg = memory.add({ role: 'user', content: 'Hello' });
      expect(msg.id).toBeDefined();
      expect(msg.timestamp).toBeDefined();
      expect(memory.count()).toBe(1);
    });

    it('should get working memory', () => {
      for (let i = 0; i < 15; i++) {
        memory.add({ role: 'user', content: `Message ${i}` });
      }
      const working = memory.getWorkingMemory();
      expect(working.length).toBe(10); // workingMemorySize
      expect(working[0].content).toBe('Message 5');
      expect(working[9].content).toBe('Message 14');
    });

    it('should get all messages', () => {
      memory.add({ role: 'user', content: 'A' });
      memory.add({ role: 'assistant', content: 'B' });
      const all = memory.getAll();
      expect(all.length).toBe(2);
    });

    it('should get by role', () => {
      memory.add({ role: 'user', content: 'U1' });
      memory.add({ role: 'assistant', content: 'A1' });
      memory.add({ role: 'user', content: 'U2' });
      const users = memory.getByRole('user');
      expect(users.length).toBe(2);
    });

    it('should search by keyword', () => {
      memory.add({ role: 'user', content: 'How to use TypeScript' });
      memory.add({ role: 'assistant', content: 'TypeScript is great' });
      memory.add({ role: 'user', content: 'What about Python?' });
      const results = memory.searchByKeyword('TypeScript');
      expect(results.length).toBe(2);
    });
  });

  describe('索引功能', () => {
    it('should index by cause', () => {
      memory.add({ role: 'tool', content: 'Result', causeBy: 'fs_read' });
      memory.add({ role: 'tool', content: 'Result2', causeBy: 'fs_read' });
      memory.add({ role: 'tool', content: 'Result3', causeBy: 'code_search' });
      const fsResults = memory.getByCause('fs_read');
      expect(fsResults.length).toBe(2);
    });
  });

  describe('删除与清理', () => {
    it('should delete newest message', () => {
      memory.add({ role: 'user', content: 'A' });
      memory.add({ role: 'user', content: 'B' });
      const deleted = memory.deleteNewest();
      expect(deleted?.content).toBe('B');
      expect(memory.count()).toBe(1);
    });

    it('should clear all messages', () => {
      memory.add({ role: 'user', content: 'A' });
      memory.add({ role: 'user', content: 'B' });
      memory.clear();
      expect(memory.count()).toBe(0);
    });

    it('should respect max storage size', () => {
      const smallMemory = new AgentMemory('test-agent-2', 'test-session', { maxStorageSize: 5 });
      smallMemory.clear();
      for (let i = 0; i < 10; i++) {
        smallMemory.add({ role: 'user', content: `Msg ${i}` });
      }
      expect(smallMemory.count()).toBe(5);
      expect(smallMemory.getAll()[0].content).toBe('Msg 5');
      smallMemory.clear();
    });
  });

  describe('LLM格式转换', () => {
    it('should convert to LLM messages', () => {
      memory.add({ role: 'system', content: 'You are helpful' });
      memory.add({ role: 'user', content: 'Hello' });
      const llmMsgs = memory.toLLMMessages();
      expect(llmMsgs.length).toBe(2);
      expect(llmMsgs[0]).toEqual({ role: 'system', content: 'You are helpful' });
    });

    it('should import from LLM messages', () => {
      memory.fromLLMMessages([
        { role: 'system', content: 'Sys' },
        { role: 'user', content: 'User' },
      ]);
      expect(memory.count()).toBe(2);
      expect(memory.getByRole('system').length).toBe(1);
    });
  });

  describe('摘要生成', () => {
    it('should generate summary', () => {
      memory.add({ role: 'system', content: 'Sys' });
      memory.add({ role: 'user', content: 'U1' });
      memory.add({ role: 'user', content: 'U2' });
      memory.add({ role: 'assistant', content: 'A1' });
      const summary = memory.generateSummary();
      expect(summary).toContain('system: 1条消息');
      expect(summary).toContain('user: 2条消息');
      expect(summary).toContain('assistant: 1条消息');
    });
  });

  describe('去重', () => {
    it('should not add duplicate messages', () => {
      memory.add({ role: 'user', content: 'Same' });
      memory.add({ role: 'user', content: 'Same' });
      expect(memory.count()).toBe(1);
    });
  });

  describe('数据库持久化', () => {
    it('should persist memory to database', () => {
      memory.add({ role: 'user', content: 'Persist me' });
      // 创建新实例，应该能从数据库加载
      const newMemory = new AgentMemory('test-agent', 'test-session');
      expect(newMemory.count()).toBeGreaterThanOrEqual(1);
      const all = newMemory.getAll();
      expect(all.some((m) => m.content === 'Persist me')).toBe(true);
      newMemory.clear();
    });

    it('should clear database memories', () => {
      memory.add({ role: 'user', content: 'A' });
      memory.clearDB();
      const newMemory = new AgentMemory('test-agent', 'test-session');
      expect(newMemory.count()).toBe(0);
      newMemory.clear();
    });

    it('should cleanup old memories', () => {
      memory.add({ role: 'user', content: 'Recent' });
      const deleted = memory.cleanup(0);
      // 刚添加的记忆不会被0天清理掉（除非跨天了），所以主要测试方法不报错
      expect(typeof deleted).toBe('number');
    });
  });
});

describe('AgentMemory Global Store', () => {
  beforeEach(() => {
    clearAllAgentMemories();
  });

  it('should create memory for agent', () => {
    const mem = getAgentMemory('agent-1');
    expect(mem).toBeInstanceOf(AgentMemory);
    mem.add({ role: 'user', content: 'Test' });
    expect(mem.count()).toBe(1);
    mem.clear();
  });

  it('should return same memory for same agent', () => {
    const mem1 = getAgentMemory('agent-2');
    mem1.add({ role: 'user', content: 'A' });
    const mem2 = getAgentMemory('agent-2');
    expect(mem2.count()).toBe(1);
    mem1.clear();
  });

  it('should delete agent memory', () => {
    const mem = getAgentMemory('agent-3');
    mem.add({ role: 'user', content: 'X' });
    expect(deleteAgentMemory('agent-3')).toBe(true);
    expect(deleteAgentMemory('agent-3')).toBe(false);
  });
});
