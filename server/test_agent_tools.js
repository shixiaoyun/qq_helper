/**
 * 测试Agent多轮工具调用（ReAct模式）
 */

const { initMCPTools, executeMCPTool } = require('./dist/services/mcpTools.js');

async function testAgentWithTools() {
  console.log('=== 测试Agent多轮工具调用 ===\n');

  try {
    await initMCPTools();

    // 测试：让Agent使用fs_read工具读取文件
    console.log('[1] 测试Agent使用工具...');
    const result = await executeMCPTool('agent_run', {
      type: 'FileReader',
      description: '请读取文件 D:\\工作\\SOLO CN\\niuma-ai-platform-Q1.10\\server\\package.json 并告诉我它的版本号',
      sync: true,
    });

    console.log('✅ Agent执行完成!');
    console.log('   Agent ID:', result.agentId);
    console.log('   状态:', result.status);
    console.log('   结果:', result.result);
    console.log('   记忆摘要:', result.memorySummary);

    // 查询Agent记忆
    console.log('\n[2] 查询Agent记忆...');
    const memory = await executeMCPTool('agent_memory', {
      agentId: result.agentId,
      action: 'summary',
    });
    console.log('   记忆摘要:', memory.summary);
    console.log('   总消息数:', memory.totalMessages);

    // 查询工作记忆
    const working = await executeMCPTool('agent_memory', {
      agentId: result.agentId,
      action: 'working',
      k: 10,
    });
    console.log('\n[3] 工作记忆（最近10条）:');
    working.messages.forEach((m, i) => {
      console.log(`   [${i}] ${m.role}: ${m.content.slice(0, 80)}...`);
    });

  } catch (err) {
    console.error('❌ 测试失败:', err.message);
    console.error(err.stack);
  }
}

testAgentWithTools();
