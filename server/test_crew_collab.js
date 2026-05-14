require('dotenv').config({ path: './.env' });
const { getDefaultProvider } = require('./dist/models/aiProvider.js');
const { initMCPTools, executeMCPTool, listMCPTools } = require('./dist/services/mcpTools.js');

async function testCrewCollaboration() {
  console.log('\n========== 多Agent协作测试 ==========\n');

  await initMCPTools();
  const tools = listMCPTools();
  const crewTools = tools.filter(t => t.name.startsWith('crew_'));
  console.log('Crew工具数量:', crewTools.length);
  console.log('Crew工具列表:', crewTools.map(t => t.name).join(', '));

  const provider = getDefaultProvider();
  if (!provider) {
    console.error('错误: 没有可用的AI Provider');
    process.exit(1);
  }
  console.log('\n使用Provider:', provider.name || provider.model);
  console.log('API Key:', provider.apiKey ? provider.apiKey.slice(0, 10) + '...' : '空');

  console.log('\n----------- 测试1: crew_list (无活动Crew) -----------');
  const listResult = await executeMCPTool('crew_list', {});
  console.log('crew_list结果:', JSON.stringify(listResult, null, 2));

  console.log('\n----------- 测试2: crew_execute (顺序执行) -----------');
  console.log('开始测试顺序执行模式...\n');

  const startTime = Date.now();
  const crewResult = await executeMCPTool('crew_execute', {
    name: '代码开发流程',
    tasks: [
      {
        id: 'task-1',
        agentType: 'Explorer',
        description: '搜索SOLO CN项目相关的技术栈信息，了解项目使用的前后端技术',
        instructions: '请使用web_search搜索SOLO CN项目的技术栈信息，重点关注它使用的前后端框架。',
      },
      {
        id: 'task-2',
        agentType: 'Analyzer',
        description: '分析技术栈选择的原因和优劣',
        instructions: '基于上一个任务的搜索结果，分析这些技术栈的特点和适用场景。',
      },
      {
        id: 'task-3',
        agentType: 'Summarizer',
        description: '总结分析结果并给出建议',
        instructions: '将分析结果整理成简洁的总结报告。',
      },
    ],
    sync: true,
    timeout: 120000,
  });

  const duration = Date.now() - startTime;
  console.log('\ncrew_execute执行结果:');
  console.log('  成功:', crewResult.success);
  console.log('  Crew ID:', crewResult.crewId);
  console.log('  模式:', crewResult.mode);
  console.log('  状态:', crewResult.status);
  console.log('  任务数:', crewResult.taskCount);
  console.log('  耗时:', (duration / 1000).toFixed(1), '秒');

  if (crewResult.results) {
    console.log('\n任务结果:');
    for (const r of crewResult.results) {
      console.log(`\n  [${r.taskId}]`);
      console.log('  结果:', r.result.slice(0, 200) + (r.result.length > 200 ? '...' : ''));
    }
  }

  if (crewResult.error) {
    console.log('\n错误:', crewResult.error);
  }

  console.log('\n----------- 测试3: crew_status (查看状态) -----------');
  if (crewResult.crewId) {
    const statusResult = await executeMCPTool('crew_status', { crewId: crewResult.crewId });
    console.log('crew_status结果:', JSON.stringify(statusResult, null, 2));
  }

  console.log('\n----------- 测试4: crew_message (消息传递) -----------');
  console.log('发送直接消息...');
  const sendResult = await executeMCPTool('crew_message', {
    action: 'send',
    to: 'agent-001',
    from: 'main-agent',
    content: '这是一条测试消息',
  });
  console.log('发送结果:', JSON.stringify(sendResult, null, 2));

  console.log('发布消息到频道...');
  const pubResult = await executeMCPTool('crew_message', {
    action: 'publish',
    channel: 'test-channel',
    subject: '系统通知',
    content: '这是一条广播消息',
  });
  console.log('发布结果:', JSON.stringify(pubResult, null, 2));

  console.log('订阅频道...');
  const subResult = await executeMCPTool('crew_subscribe', {
    agentId: 'agent-001',
    channel: 'test-channel',
  });
  console.log('订阅结果:', JSON.stringify(subResult, null, 2));

  console.log('接收消息...');
  const recvResult = await executeMCPTool('crew_message', {
    action: 'receive',
    to: 'agent-001',
  });
  console.log('接收结果:', JSON.stringify(recvResult, null, 2));

  console.log('\n----------- 测试5: crew_parallel (并行执行) -----------');
  console.log('开始测试并行执行模式...\n');

  const parallelStart = Date.now();
  const parallelResult = await executeMCPTool('crew_parallel', {
    name: '并行数据分析',
    tasks: [
      {
        id: 'data-1',
        agentType: 'Researcher',
        description: '搜索AI Agent框架的技术发展趋势',
      },
      {
        id: 'data-2',
        agentType: 'Researcher',
        description: '搜索LSP（语言服务器协议）的最新应用场景',
      },
      {
        id: 'data-3',
        agentType: 'Researcher',
        description: '搜索MCP（模型上下文协议）的生态发展',
      },
    ],
    sync: true,
    timeout: 180000,
  });

  const parallelDuration = Date.now() - parallelStart;
  console.log('\ncrew_parallel执行结果:');
  console.log('  成功:', parallelResult.success);
  console.log('  Crew ID:', parallelResult.crewId);
  console.log('  模式:', parallelResult.mode);
  console.log('  状态:', parallelResult.status);
  console.log('  任务数:', parallelResult.taskCount);
  console.log('  总耗时:', (parallelDuration / 1000).toFixed(1), '秒');
  console.log('  实际耗时:', parallelResult.duration ? (parallelResult.duration / 1000).toFixed(1) + '秒' : 'N/A');

  if (parallelResult.results) {
    console.log('\n并行任务结果:');
    for (const r of parallelResult.results) {
      console.log(`\n  [${r.taskId}]`);
      console.log('  结果:', r.result.slice(0, 150) + (r.result.length > 150 ? '...' : ''));
    }
  }

  console.log('\n========== 多Agent协作测试完成 ==========\n');
}

testCrewCollaboration().catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});
