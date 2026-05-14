import { getDatabase } from '../config/database.js';
import { encrypt, decryptWithFallback, isEncryptedFormat } from '../services/dataEncryption.js';

export interface AIProviderConfig {
  id: number;
  name: string;
  provider: 'ollama' | 'dashscope' | 'openai' | 'custom' | 'deepseek';
  baseUrl: string;
  apiKey: string;
  model: string;
  models: string[];
  isActive: number;
  isDefault: number;
  temperature: number;
  maxTokens: number;
  timeout: number;
  wakeWord: string;
  createdAt: string;
  updatedAt: string;
}

export interface AIProviderStatus {
  provider: string;
  status: 'connected' | 'error' | 'checking';
  message: string;
  models?: string[];
  latency?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  messages: ChatMessage[];
  enableWebSearch?: boolean;
}

function safeParseJSON<T>(str: string, fallback: T): T {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

function decryptApiKey(encryptedKey: string): string {
  if (!encryptedKey) return '';
  if (!isEncryptedFormat(encryptedKey)) return encryptedKey;
  const { plaintext } = decryptWithFallback(encryptedKey);
  return plaintext || '';
}

function migrateEncryptedKey(row: any): void {
  const db = getDatabase();
  const currentKey = row.api_key;
  if (!currentKey || !isEncryptedFormat(currentKey)) return;
  const { plaintext, migrated } = decryptWithFallback(currentKey);
  if (plaintext && migrated) {
    const newEncrypted = encrypt(plaintext);
    db.prepare('UPDATE ai_providers SET api_key = ? WHERE id = ?').run(newEncrypted, row.id);
    console.log(`🔑 AI Provider [${row.name}] API Key 已迁移到当前加密密钥`);
  }
}

function encryptApiKey(plainKey: string): string {
  if (!plainKey) return '';
  // 如果已经是加密格式，不再重复加密
  if (plainKey.split(':').length === 3) return plainKey;
  return encrypt(plainKey);
}

export function getAllProviders(): AIProviderConfig[] {
  const db = getDatabase();
  const rows = db.prepare('SELECT * FROM ai_providers ORDER BY is_default DESC, id ASC').all() as any[];
  for (const row of rows) {
    migrateEncryptedKey(row);
  }
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    provider: row.provider,
    baseUrl: row.base_url,
    apiKey: decryptApiKey(row.api_key),
    model: row.model,
    models: safeParseJSON(row.models, []),
    isActive: row.is_active,
    isDefault: row.is_default,
    temperature: row.temperature,
    maxTokens: row.max_tokens,
    timeout: row.timeout,
    wakeWord: row.wake_word,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function getProviderById(id: number): AIProviderConfig | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM ai_providers WHERE id = ?').get(id) as any;
  if (!row) return null;
  migrateEncryptedKey(row);
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    baseUrl: row.base_url,
    apiKey: decryptApiKey(row.api_key),
    model: row.model,
    models: safeParseJSON(row.models, []),
    isActive: row.is_active,
    isDefault: row.is_default,
    temperature: row.temperature,
    maxTokens: row.max_tokens,
    timeout: row.timeout,
    wakeWord: row.wake_word,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getDefaultProvider(): AIProviderConfig | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM ai_providers WHERE is_default = 1 AND is_active = 1 LIMIT 1').get() as any;
  if (!row) {
    const first = db.prepare('SELECT * FROM ai_providers WHERE is_active = 1 ORDER BY id ASC LIMIT 1').get() as any;
    if (!first) return null;
    migrateEncryptedKey(first);
    return {
      id: first.id,
      name: first.name,
      provider: first.provider,
      baseUrl: first.base_url,
      apiKey: decryptApiKey(first.api_key),
      model: first.model,
      models: safeParseJSON(first.models, []),
      isActive: first.is_active,
      isDefault: first.is_default,
      temperature: first.temperature,
      maxTokens: first.max_tokens,
      timeout: first.timeout,
      wakeWord: first.wake_word,
      createdAt: first.created_at,
      updatedAt: first.updated_at,
    };
  }
  migrateEncryptedKey(row);
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    baseUrl: row.base_url,
    apiKey: decryptApiKey(row.api_key),
    model: row.model,
    models: safeParseJSON(row.models, []),
    isActive: row.is_active,
    isDefault: row.is_default,
    temperature: row.temperature,
    maxTokens: row.max_tokens,
    timeout: row.timeout,
    wakeWord: row.wake_word,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createProvider(config: Omit<AIProviderConfig, 'id' | 'createdAt' | 'updatedAt'>): number {
  const db = getDatabase();

  if (config.isDefault) {
    db.prepare('UPDATE ai_providers SET is_default = 0').run();
  }

  const stmt = db.prepare(`
    INSERT INTO ai_providers (name, provider, base_url, api_key, model, models, is_active, is_default, temperature, max_tokens, timeout, wake_word)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    config.name,
    config.provider,
    config.baseUrl,
    encryptApiKey(config.apiKey),
    config.model,
    JSON.stringify(config.models || []),
    config.isActive ?? 1,
    config.isDefault ?? 0,
    config.temperature ?? 0.7,
    config.maxTokens ?? 2048,
    config.timeout ?? 30000,
    config.wakeWord ?? '小牛'
  );

  return Number(result.lastInsertRowid);
}

export function updateProvider(id: number, config: Partial<AIProviderConfig>): boolean {
  const db = getDatabase();
  const existing = getProviderById(id);
  if (!existing) return false;

  if (config.isDefault) {
    db.prepare('UPDATE ai_providers SET is_default = 0').run();
  }

  const fields: string[] = [];
  const values: any[] = [];

  if (config.name !== undefined) { fields.push('name = ?'); values.push(config.name); }
  if (config.provider !== undefined) { fields.push('provider = ?'); values.push(config.provider); }
  if (config.baseUrl !== undefined) { fields.push('base_url = ?'); values.push(config.baseUrl); }
  if (config.apiKey !== undefined) { fields.push('api_key = ?'); values.push(encryptApiKey(config.apiKey)); }
  if (config.model !== undefined) { fields.push('model = ?'); values.push(config.model); }
  if (config.models !== undefined) { fields.push('models = ?'); values.push(JSON.stringify(config.models)); }
  if (config.isActive !== undefined) { fields.push('is_active = ?'); values.push(config.isActive); }
  if (config.isDefault !== undefined) { fields.push('is_default = ?'); values.push(config.isDefault); }
  if (config.temperature !== undefined) { fields.push('temperature = ?'); values.push(config.temperature); }
  if (config.maxTokens !== undefined) { fields.push('max_tokens = ?'); values.push(config.maxTokens); }
  if (config.timeout !== undefined) { fields.push('timeout = ?'); values.push(config.timeout); }
  if (config.wakeWord !== undefined) { fields.push('wake_word = ?'); values.push(config.wakeWord); }

  if (fields.length === 0) return false;

  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);

  const stmt = db.prepare(`UPDATE ai_providers SET ${fields.join(', ')} WHERE id = ?`);
  stmt.run(...values);
  return true;
}

export function deleteProvider(id: number): boolean {
  const db = getDatabase();
  const existing = getProviderById(id);
  if (!existing) return false;

  db.prepare('DELETE FROM ai_providers WHERE id = ?').run(id);

  if (existing.isDefault) {
    const first = db.prepare('SELECT id FROM ai_providers ORDER BY id ASC LIMIT 1').get() as any;
    if (first) {
      db.prepare('UPDATE ai_providers SET is_default = 1 WHERE id = ?').run(first.id);
    }
  }

  return true;
}

export async function checkProviderHealth(config: AIProviderConfig): Promise<AIProviderStatus> {
  const startTime = Date.now();
  const providerId = config.provider || 'unknown';

  try {
    switch (config.provider) {
      case 'ollama': {
        const resp = await fetch(`${config.baseUrl}/api/tags`, {
          method: 'GET',
          signal: AbortSignal.timeout(config.timeout || 10000),
        });
        if (resp.status === 200) {
          const data = await resp.json() as { models?: Array<{ name?: string }> };
          const models = (data.models || []).map((m: any) => m.name || '');
          return {
            provider: providerId,
            status: 'connected',
            message: `Connected, ${models.length} models available`,
            models,
            latency: Date.now() - startTime,
          };
        }
        return {
          provider: providerId,
          status: 'error',
          message: `HTTP ${resp.status}`,
          latency: Date.now() - startTime,
        };
      }

      case 'dashscope': {
        const resp = await fetch(`${config.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: config.model || 'qwen-turbo',
            messages: [{ role: 'user', content: 'hi' }],
            max_tokens: 1,
          }),
          signal: AbortSignal.timeout(config.timeout || 10000),
        });
        if (resp.ok) {
          return {
            provider: providerId,
            status: 'connected',
            message: 'API connected',
            latency: Date.now() - startTime,
          };
        }
        return {
          provider: providerId,
          status: 'error',
          message: `HTTP ${resp.status}`,
          latency: Date.now() - startTime,
        };
      }

      case 'openai':
      case 'deepseek':
      case 'custom': {
        const resp = await fetch(`${config.baseUrl}/models`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
          },
          signal: AbortSignal.timeout(config.timeout || 10000),
        });
        if (resp.ok) {
          const data = await resp.json() as { data?: Array<{ id?: string }> };
          const models = (data.data || []).map((m: any) => m.id || '').filter(Boolean);
          return {
            provider: providerId,
            status: 'connected',
            message: `Connected, ${models.length} models available`,
            models,
            latency: Date.now() - startTime,
          };
        }
        return {
          provider: providerId,
          status: 'error',
          message: `HTTP ${resp.status}`,
          latency: Date.now() - startTime,
        };
      }

      default:
        return {
          provider: providerId,
          status: 'error',
          message: 'Unknown provider type',
          latency: Date.now() - startTime,
        };
    }
  } catch (error: any) {
    return {
      provider: providerId,
      status: 'error',
      message: error.message || 'Connection failed',
      latency: Date.now() - startTime,
    };
  }
}

export async function chatWithProvider(
  config: AIProviderConfig,
  options: ChatOptions
): Promise<Response> {
  let model = options.model || config.model;
  const temperature = options.temperature ?? config.temperature ?? 0.7;
  const maxTokens = options.maxTokens ?? config.maxTokens ?? 2048;

  switch (config.provider) {
    case 'ollama': {
      const doOllamaChat = async (useModel: string): Promise<Response> => {
        const payload = {
          model: useModel,
          messages: options.messages,
          stream: options.stream ?? false,
          options: {
            temperature,
            num_predict: maxTokens,
          },
        };
        return fetch(`${config.baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(config.timeout || 120000),
        });
      };

      const resp = await doOllamaChat(model);
      if (resp.ok) return resp;

      if (resp.status === 404) {
        try {
          const tagsResp = await fetch(`${config.baseUrl}/api/tags`, {
            signal: AbortSignal.timeout(5000),
          });
          if (tagsResp.ok) {
            const tagsData = await tagsResp.json() as { models?: Array<{ name?: string }> };
            const availableModels: string[] = (tagsData.models || []).map((m: any) => m.name || '');
            if (availableModels.length > 0 && !availableModels.includes(model)) {
              model = availableModels[0];
              return doOllamaChat(model);
            }
          }
        } catch {}
      }
      return resp;
    }

    case 'dashscope': {
      const payload: any = {
        model,
        messages: options.messages,
        stream: options.stream ?? false,
        temperature,
        max_tokens: maxTokens,
      };

      if (options.enableWebSearch) {
        payload.enable_search = true;
        payload.search_options = {
          enable_source: true,
          max_results: 5,
        };
      }

      return fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Authorization': `Bearer ${config.apiKey}`,
          'Accept': 'application/json; charset=utf-8',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(config.timeout || 120000),
      });
    }

    case 'openai':
    case 'deepseek':
    case 'custom': {
      const payload = {
        model,
        messages: options.messages,
        stream: options.stream ?? false,
        temperature,
        max_tokens: maxTokens,
      };
      return fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Authorization': `Bearer ${config.apiKey}`,
          'Accept': 'application/json; charset=utf-8',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(config.timeout || 120000),
      });
    }

    default:
      throw new Error(`不支持的AI提供商: ${config.provider}`);
  }
}
