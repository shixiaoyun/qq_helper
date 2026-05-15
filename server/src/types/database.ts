/**
 * 数据库模型类型定义 - 替代 as any 的强制转换
 */

// 用户相关
export interface User {
  id: number;
  username: string;
  email: string | null;
  phone: string | null;
  password_hash: string;
  nickname: string | null;
  avatar: string | null;
  role: string;
  status: number;
  email_verified: number;
  phone_verified: number;
  last_login_at: string | null;
  last_login_ip: string | null;
  storage_limit_mb: number;
  daily_chat_limit: number;
  created_at: string;
  updated_at: string;
}

export interface UserSettings {
  id: number;
  user_id: number;
  default_provider_id: number | null;
  temperature: number;
  max_tokens: number;
  theme: string;
  language: string;
  enable_web_search: number;
  enable_tools: number;
  created_at: string;
  updated_at: string;
}

// 角色相关
export interface Role {
  id: number;
  name: string;
  label: string;
  permissions: string;
  description: string | null;
  created_at: string;
}

// AI 提供商
export interface AIProvider {
  id: number;
  name: string;
  provider: string;
  base_url: string;
  api_key: string | null;
  model: string;
  models: string;
  is_active: number;
  is_default: number;
  temperature: number;
  max_tokens: number;
  timeout: number;
  wake_word: string;
  created_at: string;
  updated_at: string;
}

// 对话相关
export interface Conversation {
  id: number;
  user_id: number;
  title: string | null;
  provider_id: number | null;
  model: string | null;
  temperature: number | null;
  max_tokens: number | null;
  system_prompt: string | null;
  is_pinned: number;
  is_archived: number;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: number;
  conversation_id: number;
  user_id: number;
  role: string;
  content: string;
  media_urls: string | null;
  metadata: string | null;
  token_count: number | null;
  created_at: string;
}

// 爬虫任务
export interface CrawlTask {
  id: number;
  user_id: number;
  url: string;
  title: string | null;
  html_content: string | null;
  markdown_content: string | null;
  status: string;
  depth: number;
  max_depth: number | null;
  follow_links: number;
  cookie: string | null;
  user_agent: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

// 系统配置
export interface SystemConfig {
  id: number;
  key: string;
  value: string;
  description: string | null;
  data_type: string;
  created_at: string;
  updated_at: string;
}

// 知识库相关
export interface KnowledgeBase {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  type: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeEntry {
  id: number;
  knowledge_base_id: number;
  source_type: string;
  source_path: string;
  title: string | null;
  content: string | null;
  md5_hash: string | null;
  created_at: string;
  updated_at: string;
}

// 工作流相关
export interface Workflow {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  config: string;
  status: string;
  created_at: string;
  updated_at: string;
}

// 令牌限制
export interface TokenLimit {
  id: number;
  user_id: number;
  limit_type: string;
  daily_limit: number;
  monthly_limit: number | null;
  used_today: number;
  reset_time: string | null;
  created_at: string;
  updated_at: string;
}

// 每日聊天限制
export interface DailyChatLimit {
  id: number;
  user_id: number;
  daily_limit: number;
  used_today: number;
  last_reset_at: string;
  created_at: string;
  updated_at: string;
}

// 通用数据库查询结果类型
export interface QueryResult<T> {
  data: T | null;
  error?: string;
}

export interface QueryResults<T> {
  data: T[];
  error?: string;
}
