/**
 * 更新百炼API Key到数据库
 */

import { getDatabase } from '../config/database.js';
import { encrypt } from '../services/dataEncryption.js';

const DASHSCOPE_API_KEY = 'sk-6806e6d35170498ab7ca357cd14d2d43';

function updateDashscopeKey() {
  try {
    const db = getDatabase();

    // 检查百炼provider是否存在
    const provider = db.prepare('SELECT id, api_key FROM ai_providers WHERE provider = ?').get('dashscope') as any;

    if (!provider) {
      console.log('❌ 百炼provider不存在，请先初始化数据库');
      process.exit(1);
    }

    // 加密API Key
    const encryptedKey = encrypt(DASHSCOPE_API_KEY);

    // 更新数据库
    db.prepare('UPDATE ai_providers SET api_key = ? WHERE provider = ?').run(encryptedKey, 'dashscope');

    console.log('✅ 百炼API Key已更新到数据库');
    console.log(`   Provider ID: ${provider.id}`);
    console.log(`   加密格式: ${encryptedKey.slice(0, 20)}...`);

    // 验证更新
    const updated = db.prepare('SELECT api_key FROM ai_providers WHERE provider = ?').get('dashscope') as any;
    if (updated.api_key === encryptedKey) {
      console.log('✅ 验证通过：数据库中的Key已更新');
    } else {
      console.log('❌ 验证失败：数据库中的Key未正确更新');
    }

    process.exit(0);
  } catch (err: any) {
    console.error('❌ 更新失败:', err.message);
    process.exit(1);
  }
}

updateDashscopeKey();
