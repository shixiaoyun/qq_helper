import { getDatabase } from '../config/database.js';

export interface SystemConfig {
  id: number;
  key: string;
  value: string;
  description: string;
  updated_at: string;
}

export function getAllConfigs(): SystemConfig[] {
  const db = getDatabase();
  return db.prepare('SELECT * FROM system_config ORDER BY key ASC').all() as SystemConfig[];
}

export function getConfigByKey(key: string): string | null {
  const db = getDatabase();
  const row = db.prepare('SELECT value FROM system_config WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value || null;
}

export function getConfigBool(key: string): boolean {
  const value = getConfigByKey(key);
  return value === '1' || value === 'true';
}

export function setConfig(key: string, value: string): boolean {
  const db = getDatabase();
  const stmt = db.prepare('UPDATE system_config SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?');
  const result = stmt.run(value, key);
  return result.changes > 0;
}

export function getNiumaEngineUrl(): string {
  return getConfigByKey('niuma_engine_url') || 'http://localhost:1080';
}

export function isNiumaEngineEnabled(): boolean {
  return getConfigBool('niuma_engine_enabled');
}

export function isWebSearchEnabled(): boolean {
  return getConfigBool('web_search_enabled');
}

export function getWebSearchConfig(): { apiKey: string; apiUrl: string } {
  return {
    apiKey: getConfigByKey('web_search_api_key') || '',
    apiUrl: getConfigByKey('web_search_api_url') || 'https://api.bochaai.com/v1/web-search',
  };
}
