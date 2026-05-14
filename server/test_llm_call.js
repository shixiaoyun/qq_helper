/**
 * 测试Agent真实调用百炼LLM
 */

const { getDefaultProvider } = require('./dist/models/aiProvider.js');

async function testLLMCall() {
  console.log('=== 测试百炼LLM调用 ===\n');

  try {
    // 1. 检查Provider配置
    console.log('[1] 检查默认Provider...');
    const provider = getDefaultProvider();
    if (!provider) {
      console.log('❌ 没有可用的Provider');
      return;
    }
    console.log('✅ Provider配置:');
    console.log('   - 名称:', provider.name);
    console.log('   - 类型:', provider.provider);
    console.log('   - 模型:', provider.model);
    console.log('   - BaseURL:', provider.baseUrl);
    console.log('   - API Key:', provider.apiKey ? provider.apiKey.slice(0, 10) + '...' : '空');

    // 2. 测试直接调用LLM
    console.log('\n[2] 测试直接调用百炼LLM...');
    const messages = [
      { role: 'system', content: '你是一个有帮助的AI助手。' },
      { role: 'user', content: '请用一句话介绍自己' },
    ];

    const body = {
      model: provider.model,
      messages,
      temperature: 0.7,
      max_tokens: 512,
    };

    console.log('   请求体:', JSON.stringify(body, null, 2));

    const resp = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });

    console.log('   响应状态:', resp.status);

    if (!resp.ok) {
      const errText = await resp.text();
      console.log('❌ LLM调用失败:', errText);
      return;
    }

    const data = await resp.json();
    console.log('✅ LLM调用成功!');
    console.log('   模型:', data.model);
    console.log('   回复:', data.choices?.[0]?.message?.content);
    console.log('   用量:', JSON.stringify(data.usage));

    // 3. 测试Agent工具调用
    console.log('\n[3] 测试Agent工具调用...');
    const { initMCPTools, executeMCPTool } = require('./dist/services/mcpTools.js');
    await initMCPTools();

    const agentResult = await executeMCPTool('agent_run', {
      type: 'Test',
      description: '请用一句话介绍自己',
      sync: true,
    });

    console.log('✅ Agent执行完成!');
    console.log('   Agent ID:', agentResult.agentId);
    console.log('   状态:', agentResult.status);
    console.log('   结果:', agentResult.result);
    console.log('   记忆摘要:', agentResult.memorySummary);

  } catch (err) {
    console.error('❌ 测试失败:', err.message);
    console.error(err.stack);
  }
}

testLLMCall();
