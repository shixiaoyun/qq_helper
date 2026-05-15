import Database from 'better-sqlite3';
import path from 'path';
import bcrypt from 'bcryptjs';
import { encrypt, decryptWithFallback, isEncryptedFormat, getCurrentKeyFingerprint } from '../services/dataEncryption.js';

const DB_PATH = path.resolve(process.cwd(), 'database/app.db');

let dbInstance: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!dbInstance) {
    dbInstance = new Database(DB_PATH);
    dbInstance.pragma('journal_mode = WAL');
    // 设置UTF-8编码以支持中文
    dbInstance.pragma('encoding = "UTF-8"');
  }
  return dbInstance;
}

export function initDatabase(): void {
  const db = getDatabase();

  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE,
      phone TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      nickname TEXT,
      avatar TEXT,
      role TEXT DEFAULT 'user',
      status INTEGER DEFAULT 1,
      email_verified INTEGER DEFAULT 0,
      phone_verified INTEGER DEFAULT 0,
      last_login_at DATETIME,
      last_login_ip TEXT,
      storage_limit_mb INTEGER DEFAULT 1024,
      daily_chat_limit INTEGER DEFAULT 99,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Roles table
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      label TEXT NOT NULL,
      permissions TEXT DEFAULT '[]',
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // User settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      default_provider_id INTEGER,
      temperature REAL DEFAULT 0.7,
      max_tokens INTEGER DEFAULT 2048,
      theme TEXT DEFAULT 'system',
      language TEXT DEFAULT 'zh-CN',
      enable_web_search INTEGER DEFAULT 1,
      enable_tools INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // AI Providers table
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_providers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      provider TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_key TEXT,
      model TEXT NOT NULL,
      models TEXT DEFAULT '[]',
      is_active INTEGER DEFAULT 1,
      is_default INTEGER DEFAULT 0,
      temperature REAL DEFAULT 0.7,
      max_tokens INTEGER DEFAULT 2048,
      timeout INTEGER DEFAULT 30000,
      wake_word TEXT DEFAULT '小牛',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Conversations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT,
      provider_id INTEGER,
      model TEXT,
      system_prompt TEXT,
      temperature REAL,
      max_tokens INTEGER,
      status INTEGER DEFAULT 1,
      message_count INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      total_input_tokens INTEGER DEFAULT 0,
      total_output_tokens INTEGER DEFAULT 0,
      last_message_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (provider_id) REFERENCES ai_providers(id)
    )
  `);

  // Messages table
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tool_calls TEXT,
      tool_results TEXT,
      tokens_input INTEGER DEFAULT 0,
      tokens_output INTEGER DEFAULT 0,
      provider TEXT,
      model TEXT,
      latency_ms INTEGER,
      status TEXT DEFAULT 'ok',
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Token usage table
  db.exec(`
    CREATE TABLE IF NOT EXISTS token_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      conversation_id INTEGER NOT NULL,
      message_id INTEGER NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      tokens_input INTEGER DEFAULT 0,
      tokens_output INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      cost_estimate REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    )
  `);

  // Daily chat limits table
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_chat_limits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      chat_date TEXT NOT NULL,
      chat_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, chat_date),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // System config table
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      description TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Crawl tasks table
  db.exec(`
    CREATE TABLE IF NOT EXISTS crawl_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT UNIQUE NOT NULL,
      url TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      keyword TEXT,
      platform TEXT,
      pages INTEGER DEFAULT 2,
      results TEXT DEFAULT '[]',
      error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Knowledge bases table
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_bases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'active',
      document_count INTEGER DEFAULT 0,
      chunk_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Documents table
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      knowledge_base_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      original_name TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      content TEXT,
      status TEXT DEFAULT 'processing',
      chunk_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Document chunks table
  db.exec(`
    CREATE TABLE IF NOT EXISTS document_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      knowledge_base_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      embedding TEXT,
      chunk_index INTEGER NOT NULL,
      metadata TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
      FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
    )
  `);

  // Workflows table
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      nodes TEXT DEFAULT '[]',
      edges TEXT DEFAULT '[]',
      status TEXT DEFAULT 'draft',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Workflow runs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workflow_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      inputs TEXT DEFAULT '{}',
      outputs TEXT,
      status TEXT DEFAULT 'pending',
      started_at DATETIME,
      completed_at DATETIME,
      error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Agents table
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      goal TEXT NOT NULL,
      backstory TEXT,
      tools TEXT DEFAULT '[]',
      model TEXT DEFAULT 'gpt-4',
      temperature REAL DEFAULT 0.7,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Crews table
  db.exec(`
    CREATE TABLE IF NOT EXISTS crews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      process TEXT DEFAULT 'sequential',
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Crew members table
  db.exec(`
    CREATE TABLE IF NOT EXISTS crew_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      crew_id INTEGER NOT NULL,
      agent_id INTEGER NOT NULL,
      "order" INTEGER DEFAULT 0,
      UNIQUE(crew_id, agent_id),
      FOREIGN KEY (crew_id) REFERENCES crews(id) ON DELETE CASCADE,
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
    )
  `);

  // Agent runs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      crew_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      task TEXT NOT NULL,
      result TEXT,
      status TEXT DEFAULT 'pending',
      started_at DATETIME,
      completed_at DATETIME,
      error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (crew_id) REFERENCES crews(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Audit logs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      resource TEXT NOT NULL,
      details TEXT,
      ip TEXT,
      user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Sensitive words table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sensitive_words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word TEXT NOT NULL UNIQUE,
      category TEXT DEFAULT 'general',
      level INTEGER DEFAULT 1,
      enabled INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // MCP configs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS mcp_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      type TEXT DEFAULT 'builtin',
      config TEXT DEFAULT '{}',
      enabled INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Agent memories table
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      session_key TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      cause_by TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create index for faster queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_agent_memories_agent_session 
    ON agent_memories(agent_id, session_key)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_agent_memories_timestamp 
    ON agent_memories(timestamp)
  `);

  // Insert default roles
  const roles = [
    { name: 'admin', label: '管理员', permissions: JSON.stringify(['*']), description: '系统管理员，拥有全部权限' },
    { name: 'supervisor', label: '主管', permissions: JSON.stringify(['chat', 'read', 'tools', 'web_search', 'crm_manage']), description: '团队主管，可管理CRM客户和团队成员' },
    { name: 'user', label: '成员', permissions: JSON.stringify(['chat', 'read']), description: '普通成员，可使用AI对话和查看分配的客户' },
  ];

  for (const role of roles) {
    const exists = db.prepare('SELECT id FROM roles WHERE name = ?').get(role.name);
    if (!exists) {
      db.prepare('INSERT INTO roles (name, label, permissions, description) VALUES (?, ?, ?, ?)').run(role.name, role.label, role.permissions, role.description);
    } else {
      // 更新现有角色的标签和描述
      db.prepare('UPDATE roles SET label = ?, description = ? WHERE name = ?').run(role.label, role.description, role.name);
    }
  }

  // 删除已废弃的vip角色
  db.prepare("DELETE FROM roles WHERE name = 'vip'").run();

  // Insert default system config
  const configs = [
    { key: 'web_search_enabled', value: '1', description: '是否启用联网搜索' },
    { key: 'tools_enabled', value: '1', description: '是否启用系统工具' },
    { key: 'registration_enabled', value: '1', description: '是否开放注册' },
  ];

  for (const config of configs) {
    const exists = db.prepare('SELECT id FROM system_config WHERE key = ?').get(config.key);
    if (!exists) {
      db.prepare('INSERT INTO system_config (key, value, description) VALUES (?, ?, ?)').run(config.key, config.value, config.description);
    }
  }

  // Insert or reset default admin user
  const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  const adminPasswordHash = bcrypt.hashSync('admin123', 10);
  if (!adminExists) {
    db.prepare(
      'INSERT INTO users (username, email, password_hash, nickname, role, status, daily_chat_limit) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run('admin', 'admin@example.com', adminPasswordHash, '超级管理员', 'admin', 1, 9999);
    console.log('✅ Default admin user created (admin / admin123)');
  } else {
    // Reset admin password and status on every startup to ensure login works
    db.prepare(
      'UPDATE users SET password_hash = ?, status = 1, role = ? WHERE username = ?'
    ).run(adminPasswordHash, 'admin', 'admin');
    console.log('✅ Admin user password reset (admin / admin123)');
  }

  // Insert default AI providers
  const dashscopeApiKey = process.env.NIUMA_ENGINE_API_KEY || '';
  const hasDashscopeKey = !!dashscopeApiKey;

  const ollamaExists = db.prepare('SELECT id FROM ai_providers WHERE provider = ?').get('ollama');
  if (!ollamaExists) {
    db.prepare(
      'INSERT INTO ai_providers (name, provider, base_url, api_key, model, models, is_active, is_default, temperature, max_tokens, timeout, wake_word) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      'Ollama本地模型',
      'ollama',
      'http://localhost:11434',
      '',
      'deepseek-r1:7b',
      '["deepseek-r1:7b","llama3.2","qwen2.5"]',
      1,
      hasDashscopeKey ? 0 : 1,  // 如果有百炼Key，Ollama不设为默认
      0.7,
      2048,
      120000,
      '小牛'
    );
    console.log('✅ Default Ollama provider created');
  }

  const dashscopeExists = db.prepare('SELECT id FROM ai_providers WHERE provider = ?').get('dashscope');
  if (!dashscopeExists) {
    db.prepare(
      'INSERT INTO ai_providers (name, provider, base_url, api_key, model, models, is_active, is_default, temperature, max_tokens, timeout, wake_word) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      '阿里云百炼',
      'dashscope',
      'https://dashscope.aliyuncs.com/compatible-mode/v1',
      dashscopeApiKey ? encrypt(dashscopeApiKey) : '',
      'qwen-turbo',
      '["qwen-turbo","qwen-plus","qwen-max"]',
      1,
      hasDashscopeKey ? 1 : 0,  // 如果有Key，设为默认
      0.7,
      2048,
      60000,
      '小牛'
    );
    console.log('✅ Default Dashscope provider created');
  } else if (dashscopeApiKey) {
    // 如果已存在但环境变量中有API Key，更新它
    const currentKey = db.prepare('SELECT api_key FROM ai_providers WHERE provider = ?').get('dashscope') as any;
    if (!currentKey?.api_key) {
      db.prepare('UPDATE ai_providers SET api_key = ? WHERE provider = ?').run(encrypt(dashscopeApiKey), 'dashscope');
      console.log('✅ Dashscope API Key updated from environment');
    }
    // 确保有Key的百炼是默认提供商
    db.prepare('UPDATE ai_providers SET is_default = 1 WHERE provider = ?').run('dashscope');
    db.prepare('UPDATE ai_providers SET is_default = 0 WHERE provider = ?').run('ollama');
    console.log('✅ Dashscope set as default provider');
  }

  const deepseekApiKey = process.env.DEEPSEEK_API_KEY || '';
  const deepseekExists = db.prepare('SELECT id FROM ai_providers WHERE provider = ?').get('deepseek');
  if (!deepseekExists) {
    db.prepare(
      'INSERT INTO ai_providers (name, provider, base_url, api_key, model, models, is_active, is_default, temperature, max_tokens, timeout, wake_word) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      'DeepSeek',
      'deepseek',
      'https://api.deepseek.com/v1',
      encrypt(deepseekApiKey),
      'deepseek-v4-pro',
      '["deepseek-v4-pro","deepseek-v4-flash"]',
      1,
      0,
      0.7,
      8192,
      120000,
      '小牛'
    );
    console.log('✅ Default DeepSeek provider created');
  }

  // 自动迁移加密密钥 - 将旧密钥加密的数据转换为当前密钥
  try {
    const fingerprint = getCurrentKeyFingerprint();
    const storedFp = db.prepare('SELECT value FROM system_config WHERE key = ?').get('encryption_key_fingerprint') as any;

    const keyChanged = storedFp && storedFp.value !== fingerprint;

    if (keyChanged) {
      console.log('⚠️  检测到 ENCRYPTION_KEY 已变更！');
      console.log(`   旧指纹: ${storedFp.value}`);
      console.log(`   新指纹: ${fingerprint}`);
    }

    const providers = db.prepare('SELECT id, name, api_key FROM ai_providers WHERE api_key IS NOT NULL AND api_key != \'\'').all() as any[];
    let migratedCount = 0;
    for (const p of providers) {
      if (!p.api_key || !isEncryptedFormat(p.api_key)) continue;
      const { plaintext, migrated } = decryptWithFallback(p.api_key);
      if (plaintext && migrated) {
        db.prepare('UPDATE ai_providers SET api_key = ? WHERE id = ?').run(encrypt(plaintext), p.id);
        migratedCount++;
      }
    }

    if (migratedCount > 0) {
      console.log(`🔑 已迁移 ${migratedCount} 个 AI Provider API Key 到当前加密密钥`);
    } else if (keyChanged) {
      console.log('🔑 密钥指纹已变更但无需迁移（所有数据已是最新密钥格式）');
    }

    // 更新密钥指纹
    if (!storedFp) {
      db.prepare('INSERT INTO system_config (key, value, description) VALUES (?, ?, ?)').run(
        'encryption_key_fingerprint', fingerprint, '当前加密密钥指纹，用于检测密钥变更'
      );
    } else if (storedFp.value !== fingerprint) {
      db.prepare('UPDATE system_config SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?').run(
        fingerprint, 'encryption_key_fingerprint'
      );
    }
  } catch (e: any) {
    console.warn('⚠️  加密密钥迁移跳过:', e.message);
  }

  // ==========================================
  // CRM 销售跟进系统表结构 (Q1.14)
  // ==========================================

  // 客户表 - 四大厂商(Autodesk/SketchUp/Adobe/达索)的产品销售客户
  db.exec(`
    CREATE TABLE IF NOT EXISTS crm_customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      company TEXT,
      industry TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      source TEXT DEFAULT 'manual',
      source_detail TEXT,
      vendor TEXT DEFAULT 'autodesk',
      product_interest TEXT DEFAULT '[]',
      budget_range TEXT,
      decision_maker TEXT,
      urgency_level INTEGER DEFAULT 3,
      status TEXT DEFAULT 'lead',
      assigned_to INTEGER,
      notes TEXT,
      last_contact_at DATETIME,
      next_follow_up_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // 销售任务表 - 任务委派
  db.exec(`
    CREATE TABLE IF NOT EXISTS crm_sales_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      customer_id INTEGER,
      assigned_to INTEGER NOT NULL,
      assigned_by INTEGER NOT NULL,
      priority TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'pending',
      due_date DATETIME,
      completed_at DATETIME,
      result_notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES crm_customers(id) ON DELETE SET NULL,
      FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // 待办事项表
  db.exec(`
    CREATE TABLE IF NOT EXISTS crm_todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT DEFAULT 'general',
      priority TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'pending',
      related_customer_id INTEGER,
      related_task_id INTEGER,
      due_date DATETIME,
      reminder_at DATETIME,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (related_customer_id) REFERENCES crm_customers(id) ON DELETE SET NULL,
      FOREIGN KEY (related_task_id) REFERENCES crm_sales_tasks(id) ON DELETE SET NULL
    )
  `);

  // 日历事件表 - 定时任务/会议/跟进提醒
  db.exec(`
    CREATE TABLE IF NOT EXISTS crm_calendar_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      event_type TEXT DEFAULT 'follow_up',
      related_customer_id INTEGER,
      related_task_id INTEGER,
      start_time DATETIME NOT NULL,
      end_time DATETIME,
      is_all_day INTEGER DEFAULT 0,
      location TEXT,
      reminder_minutes INTEGER DEFAULT 15,
      recurrence_rule TEXT,
      status TEXT DEFAULT 'scheduled',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (related_customer_id) REFERENCES crm_customers(id) ON DELETE SET NULL,
      FOREIGN KEY (related_task_id) REFERENCES crm_sales_tasks(id) ON DELETE SET NULL
    )
  `);

  // 跟进记录表
  db.exec(`
    CREATE TABLE IF NOT EXISTS crm_follow_ups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      follow_up_type TEXT DEFAULT 'phone',
      content TEXT NOT NULL,
      outcome TEXT,
      next_action TEXT,
      next_follow_up_date DATETIME,
      attachments TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES crm_customers(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // CRM同步日志表 - 与牛马AI引擎/易客CRM同步
  db.exec(`
    CREATE TABLE IF NOT EXISTS crm_sync_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sync_type TEXT NOT NULL,
      direction TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      records_count INTEGER DEFAULT 0,
      success_count INTEGER DEFAULT 0,
      fail_count INTEGER DEFAULT 0,
      error_message TEXT,
      request_payload TEXT,
      response_payload TEXT,
      started_at DATETIME,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // CRM设置表
  db.exec(`
    CREATE TABLE IF NOT EXISTS crm_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      description TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 创建CRM相关索引
  db.exec(`CREATE INDEX IF NOT EXISTS idx_crm_customers_assigned ON crm_customers(assigned_to)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_crm_customers_status ON crm_customers(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_crm_customers_vendor ON crm_customers(vendor)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_crm_sales_tasks_assigned ON crm_sales_tasks(assigned_to)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_crm_sales_tasks_status ON crm_sales_tasks(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_crm_todos_user ON crm_todos(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_crm_todos_status ON crm_todos(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_crm_calendar_user ON crm_calendar_events(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_crm_calendar_start ON crm_calendar_events(start_time)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_crm_followups_customer ON crm_follow_ups(customer_id)`);

  // 插入默认CRM设置
  const crmSettings = [
    { key: 'crm_enabled', value: '1', description: '是否启用CRM功能' },
    { key: 'auto_sync_niuma', value: '0', description: '是否自动同步牛马AI引擎客户' },
    { key: 'sync_interval_minutes', value: '60', description: '自动同步间隔(分钟)' },
    { key: 'default_vendor', value: 'autodesk', description: '默认厂商' },
    { key: 'follow_up_reminder_default', value: '15', description: '默认跟进提醒(分钟)' },
    { key: 'ecrm_integration_enabled', value: '0', description: '是否启用易客CRM集成' },
    { key: 'ecrm_base_url', value: '', description: '易客CRM地址' },
    { key: 'ecrm_api_key', value: '', description: '易客CRM API密钥' },
  ];

  for (const setting of crmSettings) {
    const exists = db.prepare('SELECT id FROM crm_settings WHERE key = ?').get(setting.key);
    if (!exists) {
      db.prepare('INSERT INTO crm_settings (key, value, description) VALUES (?, ?, ?)')
        .run(setting.key, setting.value, setting.description);
    }
  }

  // 插入示例客户数据(仅首次初始化)
  const demoCustomers = [
    {
      name: '张经理', company: '重庆建筑设计院', industry: '建筑设计',
      phone: '13800138001', email: 'zhang@cqad.com',
      vendor: 'autodesk', product_interest: '["AutoCAD","Revit"]',
      status: 'lead', urgency_level: 4, budget_range: '50-100万'
    },
    {
      name: '李工', company: '成都三维科技', industry: '三维建模',
      phone: '13900139002', email: 'li@cd3d.com',
      vendor: 'sketchup', product_interest: '["SketchUp Pro","V-Ray"]',
      status: 'contacted', urgency_level: 3, budget_range: '10-30万'
    },
    {
      name: '王总监', company: '上海创意传媒', industry: '广告设计',
      phone: '13700137003', email: 'wang@shcm.com',
      vendor: 'adobe', product_interest: '["Photoshop","Illustrator","After Effects"]',
      status: 'negotiating', urgency_level: 5, budget_range: '30-80万'
    },
    {
      name: '陈总', company: '北京智能制造', industry: '制造业',
      phone: '13600136004', email: 'chen@bjzm.com',
      vendor: 'dassault', product_interest: '["CATIA","SOLIDWORKS"]',
      status: 'lead', urgency_level: 2, budget_range: '100万以上'
    },
  ];

  const customerCount = db.prepare('SELECT COUNT(*) as count FROM crm_customers').get() as any;
  if (customerCount.count === 0) {
    for (const customer of demoCustomers) {
      db.prepare(
        `INSERT INTO crm_customers (name, company, industry, phone, email, vendor, product_interest, status, urgency_level, budget_range)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        customer.name, customer.company, customer.industry,
        customer.phone, customer.email, customer.vendor,
        customer.product_interest, customer.status, customer.urgency_level, customer.budget_range
      );
    }
    console.log('✅ CRM demo customers created');
  }

  // ==========================================
  // 销售作战团队 - 会话持久化表 (Q1.17)
  // ==========================================

  // 销售作战会话表
  db.exec(`
    CREATE TABLE IF NOT EXISTS sales_crew_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      customer_id INTEGER,
      crew_id TEXT,
      vendor TEXT,
      title TEXT,
      status TEXT DEFAULT 'active',
      message_count INTEGER DEFAULT 0,
      last_message_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (customer_id) REFERENCES crm_customers(id) ON DELETE SET NULL
    )
  `);

  // 销售作战消息表 - 支持多Agent消息
  db.exec(`
    CREATE TABLE IF NOT EXISTS sales_crew_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      agent_id TEXT,
      agent_name TEXT,
      content TEXT NOT NULL,
      knowledge_refs TEXT DEFAULT '[]',
      tokens_input INTEGER DEFAULT 0,
      tokens_output INTEGER DEFAULT 0,
      latency_ms INTEGER,
      status TEXT DEFAULT 'ok',
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sales_crew_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // 创建索引
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sales_sessions_user ON sales_crew_sessions(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sales_sessions_status ON sales_crew_sessions(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sales_messages_session ON sales_crew_messages(session_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sales_messages_agent ON sales_crew_messages(agent_id)`);

  // ==========================================
  // Q1.18新增：销售作战战后复盘分析表
  // ==========================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS sales_crew_analysis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL UNIQUE,
      attitude_stage TEXT DEFAULT 'unknown',
      decision_chain_completeness INTEGER DEFAULT 0,
      boss_contacted INTEGER DEFAULT 0,
      cfo_contacted INTEGER DEFAULT 0,
      it_attitude TEXT DEFAULT 'neutral',
      deadline_days INTEGER,
      domestic_cad_threat INTEGER DEFAULT 0,
      close_probability INTEGER DEFAULT 10,
      next_actions TEXT DEFAULT '[]',
      risk_factors TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sales_crew_sessions(id) ON DELETE CASCADE
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_sales_analysis_session ON sales_crew_analysis(session_id)`);

  // ==========================================
  // Q1.18新增：CRM任务分派系统表
  // ==========================================

  // 客户分派规则表
  db.exec(`
    CREATE TABLE IF NOT EXISTS crm_assignment_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      rule_type TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      priority INTEGER DEFAULT 0,
      config TEXT DEFAULT '{}',
      vendor_filter TEXT,
      status_filter TEXT,
      created_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // 员工技能/专长表
  db.exec(`
    CREATE TABLE IF NOT EXISTS crm_user_skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      vendor TEXT NOT NULL,
      proficiency_level INTEGER DEFAULT 3,
      is_primary INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, vendor)
    )
  `);

  // 员工负责地域表
  db.exec(`
    CREATE TABLE IF NOT EXISTS crm_user_territories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      province TEXT NOT NULL,
      city TEXT,
      is_primary INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // 提醒记录表
  db.exec(`
    CREATE TABLE IF NOT EXISTS crm_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      related_customer_id INTEGER,
      related_task_id INTEGER,
      is_read INTEGER DEFAULT 0,
      read_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (related_customer_id) REFERENCES crm_customers(id) ON DELETE SET NULL,
      FOREIGN KEY (related_task_id) REFERENCES crm_sales_tasks(id) ON DELETE SET NULL
    )
  `);

  // 客户分派历史表
  db.exec(`
    CREATE TABLE IF NOT EXISTS crm_assignment_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      from_user_id INTEGER,
      to_user_id INTEGER NOT NULL,
      assigned_by INTEGER NOT NULL,
      assignment_type TEXT NOT NULL,
      rule_id INTEGER,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES crm_customers(id) ON DELETE CASCADE,
      FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (rule_id) REFERENCES crm_assignment_rules(id) ON DELETE SET NULL
    )
  `);

  // 客户状态变更历史表
  db.exec(`
    CREATE TABLE IF NOT EXISTS crm_customer_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      old_status TEXT,
      new_status TEXT NOT NULL,
      changed_by INTEGER NOT NULL,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES crm_customers(id) ON DELETE CASCADE,
      FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // ==========================================
  // Q1.20新增：销售管道表
  // ==========================================

  // 销售管道阶段表
  db.exec(`
    CREATE TABLE IF NOT EXISTS crm_pipeline_stages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      order_index INTEGER NOT NULL DEFAULT 0,
      color TEXT DEFAULT '#3b82f6',
      probability INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 销售管道中的商机/交易表
  db.exec(`
    CREATE TABLE IF NOT EXISTS crm_deals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      customer_id INTEGER NOT NULL,
      stage_id INTEGER NOT NULL,
      value REAL DEFAULT 0,
      expected_close_date DATETIME,
      assigned_to INTEGER,
      priority TEXT DEFAULT 'medium',
      probability INTEGER,
      notes TEXT,
      lost_reason TEXT,
      status TEXT DEFAULT 'open',
      created_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES crm_customers(id) ON DELETE CASCADE,
      FOREIGN KEY (stage_id) REFERENCES crm_pipeline_stages(id) ON DELETE RESTRICT,
      FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // 创建索引
  db.exec(`CREATE INDEX IF NOT EXISTS idx_assignment_rules_active ON crm_assignment_rules(is_active, priority)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_user_skills_vendor ON crm_user_skills(vendor, proficiency_level)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON crm_notifications(user_id, is_read, created_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_notifications_type ON crm_notifications(type, created_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_assignment_history_customer ON crm_assignment_history(customer_id, created_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_assignment_history_to_user ON crm_assignment_history(to_user_id, created_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_status_history_customer ON crm_customer_status_history(customer_id, created_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_pipeline_stages_order ON crm_pipeline_stages(order_index)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_deals_stage ON crm_deals(stage_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_deals_assigned ON crm_deals(assigned_to)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_deals_status ON crm_deals(status)`);

  // 插入默认销售管道阶段
  const defaultStages = [
    { name: '线索', order_index: 1, color: '#94a3b8', probability: 10 },
    { name: '初步接触', order_index: 2, color: '#60a5fa', probability: 25 },
    { name: '需求确认', order_index: 3, color: '#34d399', probability: 40 },
    { name: '方案演示', order_index: 4, color: '#a78bfa', probability: 60 },
    { name: '商务谈判', order_index: 5, color: '#fbbf24', probability: 80 },
    { name: '合同签署', order_index: 6, color: '#f472b6', probability: 95 },
    { name: '成交', order_index: 7, color: '#22c55e', probability: 100 },
    { name: '流失', order_index: 8, color: '#ef4444', probability: 0 },
  ];

  for (const stage of defaultStages) {
    const exists = db.prepare('SELECT id FROM crm_pipeline_stages WHERE name = ?').get(stage.name);
    if (!exists) {
      db.prepare('INSERT INTO crm_pipeline_stages (name, order_index, color, probability) VALUES (?, ?, ?, ?)')
        .run(stage.name, stage.order_index, stage.color, stage.probability);
    }
  }

  // 新增CRM设置项
  const newCrmSettings = [
    { key: 'overdue_reminder_days', value: '3', description: '超时未跟进提醒天数' },
    { key: 'auto_assign_enabled', value: '0', description: '是否启用自动分派' },
    { key: 'default_assignment_rule', value: 'round_robin', description: '默认分派规则类型' },
    { key: 'pipeline_enabled', value: '1', description: '是否启用销售管道' },
  ];

  for (const setting of newCrmSettings) {
    const exists = db.prepare('SELECT id FROM crm_settings WHERE key = ?').get(setting.key);
    if (!exists) {
      db.prepare('INSERT INTO crm_settings (key, value, description) VALUES (?, ?, ?)')
        .run(setting.key, setting.value, setting.description);
    }
  }

    // 回收站表 (Q1.24同步修复)
  db.exec(`
    CREATE TABLE IF NOT EXISTS trash_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_table TEXT NOT NULL,
      original_id INTEGER NOT NULL,
      data TEXT NOT NULL,
      summary TEXT,
      user_id INTEGER,
      deleted_by INTEGER,
      restored INTEGER DEFAULT 0,
      restored_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_trash_original_table ON trash_items(original_table)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_trash_original_id ON trash_items(original_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_trash_user_id ON trash_items(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_trash_restored ON trash_items(restored)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_trash_created_at ON trash_items(created_at)`);

  // 系统升级历史表
  db.exec(`
    CREATE TABLE IF NOT EXISTS upgrade_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      version_from TEXT,
      version_to TEXT,
      filename TEXT,
      backup_file TEXT,
      status TEXT NOT NULL DEFAULT 'success',
      message TEXT,
      operator_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (operator_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // ==========================================
  // Q1.28新增：牛马AI引擎集成表
  // ==========================================

  // 牛马引擎导入历史表
  db.exec(`
    CREATE TABLE IF NOT EXISTS niuma_import_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER,
      niuma_id INTEGER NOT NULL,
      imported_by INTEGER NOT NULL,
      import_filters TEXT DEFAULT '{}',
      raw_data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES crm_customers(id) ON DELETE SET NULL,
      FOREIGN KEY (imported_by) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // 牛马引擎同步策略表
  db.exec(`
    CREATE TABLE IF NOT EXISTS niuma_sync_strategy (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      auto_sync_enabled INTEGER DEFAULT 0,
      sync_interval_hours INTEGER DEFAULT 24,
      sync_filters TEXT DEFAULT '{}',
      auto_assign_enabled INTEGER DEFAULT 0,
      assign_strategy TEXT DEFAULT 'auto',
      deduplication_enabled INTEGER DEFAULT 1,
      dedup_field TEXT DEFAULT 'niuma_id',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 创建索引
  db.exec(`CREATE INDEX IF NOT EXISTS idx_niuma_import_history_niuma_id ON niuma_import_history(niuma_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_niuma_import_history_customer ON niuma_import_history(customer_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_niuma_import_history_imported_by ON niuma_import_history(imported_by)`);

  // 为crm_customers添加牛马引擎相关字段
  try {
    db.exec(`ALTER TABLE crm_customers ADD COLUMN niuma_id INTEGER`);
  } catch { /* 已存在 */ }
  try {
    db.exec(`ALTER TABLE crm_customers ADD COLUMN niuma_metadata TEXT`);
  } catch { /* 已存在 */ }

  db.exec(`CREATE INDEX IF NOT EXISTS idx_crm_customers_niuma_id ON crm_customers(niuma_id)`);

  // ==========================================
  // Q1.31新增：团队成员工作统计表
  // ==========================================

  // 成员工作统计快照表（按日记录）
  db.exec(`
    CREATE TABLE IF NOT EXISTS crm_member_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      stat_date TEXT NOT NULL,
      customer_count INTEGER DEFAULT 0,
      new_customers INTEGER DEFAULT 0,
      follow_up_count INTEGER DEFAULT 0,
      task_count INTEGER DEFAULT 0,
      task_completed INTEGER DEFAULT 0,
      task_overdue INTEGER DEFAULT 0,
      deal_count INTEGER DEFAULT 0,
      deal_value REAL DEFAULT 0,
      deal_won INTEGER DEFAULT 0,
      deal_lost INTEGER DEFAULT 0,
      todo_count INTEGER DEFAULT 0,
      todo_completed INTEGER DEFAULT 0,
      calendar_events INTEGER DEFAULT 0,
      activity_score INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // 成员活动日志表
  db.exec(`
    CREATE TABLE IF NOT EXISTS crm_member_activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      activity_type TEXT NOT NULL,
      activity_title TEXT NOT NULL,
      activity_detail TEXT,
      related_customer_id INTEGER,
      related_deal_id INTEGER,
      related_task_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (related_customer_id) REFERENCES crm_customers(id) ON DELETE SET NULL
    )
  `);

  // 创建索引
  db.exec(`CREATE INDEX IF NOT EXISTS idx_member_stats_user_date ON crm_member_stats(user_id, stat_date)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_member_stats_date ON crm_member_stats(stat_date)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_member_activities_user ON crm_member_activities(user_id, created_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_member_activities_type ON crm_member_activities(activity_type, created_at)`);

  // ==========================================
  // Token阈值管理表 (Q1.31)
  // ==========================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS token_limits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      daily_limit INTEGER DEFAULT 1000000,
      weekly_limit INTEGER DEFAULT 5000000,
      monthly_limit INTEGER DEFAULT 10000000,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // ==========================================
  // 自定义AI专家角色表 (Q1.31)
  // ==========================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS custom_agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      goal TEXT NOT NULL,
      backstory TEXT DEFAULT '',
      tools TEXT DEFAULT '[]',
      knowledge_bases TEXT DEFAULT '[]',
      model TEXT DEFAULT 'deepseek-v4-pro',
      temperature REAL DEFAULT 0.7,
      max_tokens INTEGER DEFAULT 4096,
      enabled INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('✅ Database initialized (better-sqlite3)');
}
