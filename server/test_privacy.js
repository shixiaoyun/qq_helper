require('dotenv').config({ path: './.env' });

const { PrivacyGuard } = require('./dist/services/privacyGuard.js');

function testPrivacy() {
  console.log('\n========== 隐私保护测试 ==========\n');

  const guard = new PrivacyGuard();

  console.log('----------- 测试1: 脱敏API Key -----------');
  const apiKeyText = '我的API Key是 sk-6806e6d35170498ab7ca357cd14d2d43，请帮我测试';
  const sanitized1 = guard.sanitize(apiKeyText);
  console.log('原文:', apiKeyText);
  console.log('脱敏:', sanitized1);
  console.log('');

  console.log('----------- 测试2: 脱敏密码 -----------');
  const passwordText = 'password=123456789\n密码是: mySecret123';
  const sanitized2 = guard.sanitize(passwordText);
  console.log('原文:', passwordText);
  console.log('脱敏:', sanitized2);
  console.log('');

  console.log('----------- 测试3: 脱敏邮箱 -----------');
  const emailText = '联系邮箱是 admin@example.com 和 user@test.com';
  const sanitized3 = guard.sanitize(emailText);
  console.log('原文:', emailText);
  console.log('脱敏:', sanitized3);
  console.log('');

  console.log('----------- 测试4: 脱敏手机号 -----------');
  const phoneText = '联系电话: 13800138000';
  const sanitized4 = guard.sanitize(phoneText);
  console.log('原文:', phoneText);
  console.log('脱敏:', sanitized4);
  console.log('');

  console.log('----------- 测试5: 脱敏IP地址 -----------');
  const ipText = '服务器IP: 192.168.1.1 和 10.0.0.1';
  const sanitized5 = guard.sanitize(ipText);
  console.log('原文:', ipText);
  console.log('脱敏:', sanitized5);
  console.log('');

  console.log('----------- 测试6: 脱敏数据库URL -----------');
  const dbText = 'DATABASE_URL=mongodb://user:pass@localhost:27017/db';
  const sanitized6 = guard.sanitize(dbText);
  console.log('原文:', dbText);
  console.log('脱敏:', sanitized6);
  console.log('');

  console.log('----------- 测试7: 脱敏文件路径 -----------');
  const pathText = '文件路径: D:\\Users\\Admin\\Documents\\secret.txt';
  const sanitized7 = guard.sanitize(pathText);
  console.log('原文:', pathText);
  console.log('脱敏:', sanitized7);
  console.log('');

  console.log('----------- 测试8: 对象脱敏 -----------');
  const obj = {
    name: '测试项目',
    apiKey: 'sk-1234567890abcdef',
    config: {
      password: 'mySecret',
      email: 'admin@test.com',
    },
    description: '这是一个测试项目，联系邮箱是 test@example.com',
  };
  const sanitizedObj = guard.sanitizeObject(obj);
  console.log('原文对象:', JSON.stringify(obj, null, 2));
  console.log('脱敏对象:', JSON.stringify(sanitizedObj, null, 2));
  console.log('');

  console.log('----------- 测试9: 消息脱敏 -----------');
  const messages = [
    { role: 'system', content: '你是一个AI助手' },
    { role: 'user', content: '我的API Key是 sk-abc123，请帮我调用接口' },
    { role: 'assistant', content: '好的，我来帮您处理' },
    { role: 'tool', content: '结果: { "status": "ok", "data": "mongodb://user:pass@db" }' },
  ];
  const sanitizedMessages = guard.sanitizeMessages(messages);
  console.log('原文消息:');
  messages.forEach((m, i) => console.log(`  [${i}] ${m.role}: ${m.content}`));
  console.log('脱敏消息:');
  sanitizedMessages.forEach((m, i) => console.log(`  [${i}] ${m.role}: ${m.content}`));
  console.log('');

  console.log('----------- 测试10: 加密/解密 -----------');
  const secret = '这是一个需要加密的敏感信息';
  const encrypted = guard.encrypt(secret);
  console.log('原文:', secret);
  console.log('加密:', encrypted);
  const decrypted = guard.decrypt(encrypted);
  console.log('解密:', decrypted);
  console.log('');

  console.log('----------- 统计信息 -----------');
  const stats = guard.getStats();
  console.log('脱敏规则数:', stats.patternsRedacted);
  console.log('加密字段数:', stats.fieldsEncrypted);
  console.log('');

  console.log('========== 隐私保护测试完成 ==========\n');
}

testPrivacy();
