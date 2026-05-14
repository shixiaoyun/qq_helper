// LLM Provider implementations for OQ Assistant
import { defaultPrivacyGuard } from './privacyGuard.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

export interface ChatOptions {
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

export interface ChatResponse {
  content: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  latencyMs: number;
}

export interface LLMProviderConfig {
  id: number;
  name: string;
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  models: string[];
  isActive: boolean;
  isDefault: boolean;
  temperature: number;
  maxTokens: number;
  timeout: number;
}

export interface LLMProvider {
  config: LLMProviderConfig;
  chat(options: ChatOptions): Promise<ChatResponse>;
  stream(options: ChatOptions): AsyncGenerator<string>;
  healthCheck(): Promise<{ status: 'connected' | 'error'; message: string; latency?: number; models?: string[] }>;
}

export class OllamaProvider implements LLMProvider {
  constructor(public config: LLMProviderConfig) {}

  async chat(options: ChatOptions): Promise<ChatResponse> {
    const startTime = Date.now();
    const resp = await fetch(`${this.config.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options.model || this.config.model,
        messages: options.messages,
        stream: false,
        options: {
          temperature: options.temperature ?? this.config.temperature,
          num_predict: options.maxTokens ?? this.config.maxTokens,
        },
      }),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!resp.ok) throw new Error(`Ollama error: ${resp.status}`);

    const data = await resp.json() as any;
    const content = data.message?.content || '';

    return {
      content,
      model: options.model || this.config.model,
      tokensInput: estimateTokens(options.messages),
      tokensOutput: estimateTokens([{ role: 'assistant', content }]),
      latencyMs: Date.now() - startTime,
    };
  }

  async *stream(options: ChatOptions): AsyncGenerator<string> {
    const resp = await fetch(`${this.config.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options.model || this.config.model,
        messages: options.messages,
        stream: true,
        options: {
          temperature: options.temperature ?? this.config.temperature,
          num_predict: options.maxTokens ?? this.config.maxTokens,
        },
      }),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!resp.ok || !resp.body) throw new Error(`Ollama stream error: ${resp.status}`);

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.message?.content) {
            yield parsed.message.content;
          }
        } catch {
        }
      }
    }
  }

  async healthCheck(): Promise<{ status: 'connected' | 'error'; message: string; latency?: number; models?: string[] }> {
    const start = Date.now();
    try {
      const resp = await fetch(`${this.config.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(10000),
      });
      if (resp.ok) {
        const data = await resp.json() as { models?: Array<{ name?: string }> };
        const models = (data.models || []).map((m: any) => m.name || '');
        return { status: 'connected', message: `Connected, ${models.length} models`, latency: Date.now() - start, models };
      }
      return { status: 'error', message: `HTTP ${resp.status}`, latency: Date.now() - start };
    } catch (e: any) {
      return { status: 'error', message: e.message, latency: Date.now() - start };
    }
  }
}

export class OpenAICompatibleProvider implements LLMProvider {
  constructor(public config: LLMProviderConfig) {}

  async chat(options: ChatOptions): Promise<ChatResponse> {
    const startTime = Date.now();
    // 隐私保护：脱敏敏感信息
    const sanitizedMessages = defaultPrivacyGuard.sanitizeMessages(options.messages);
    const resp = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model || this.config.model,
        messages: sanitizedMessages,
        stream: false,
        temperature: options.temperature ?? this.config.temperature,
        max_tokens: options.maxTokens ?? this.config.maxTokens,
      }),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!resp.ok) throw new Error(`API error: ${resp.status}`);

    const data = await resp.json() as any;
    const content = data.choices?.[0]?.message?.content || '';

    return {
      content,
      model: options.model || this.config.model,
      tokensInput: data.usage?.prompt_tokens || estimateTokens(options.messages),
      tokensOutput: data.usage?.completion_tokens || estimateTokens([{ role: 'assistant', content }]),
      latencyMs: Date.now() - startTime,
    };
  }

  async *stream(options: ChatOptions): AsyncGenerator<string> {
    // 隐私保护：脱敏敏感信息
    const sanitizedMessages = defaultPrivacyGuard.sanitizeMessages(options.messages);
    const resp = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model || this.config.model,
        messages: sanitizedMessages,
        stream: true,
        temperature: options.temperature ?? this.config.temperature,
        max_tokens: options.maxTokens ?? this.config.maxTokens,
      }),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!resp.ok || !resp.body) throw new Error(`API stream error: ${resp.status}`);

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) yield content;
          } catch {
          }
        }
      }
    }
  }

  async healthCheck(): Promise<{ status: 'connected' | 'error'; message: string; latency?: number; models?: string[] }> {
    const start = Date.now();
    try {
      const resp = await fetch(`${this.config.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${this.config.apiKey}` },
        signal: AbortSignal.timeout(10000),
      });
      if (resp.ok) {
        const data = await resp.json() as { data?: Array<{ id?: string }> };
        const models = (data.data || []).map((m: any) => m.id || '').filter(Boolean);
        return { status: 'connected', message: `Connected, ${models.length} models`, latency: Date.now() - start, models };
      }
      return { status: 'error', message: `HTTP ${resp.status}`, latency: Date.now() - start };
    } catch (e: any) {
      return { status: 'error', message: e.message, latency: Date.now() - start };
    }
  }
}

function estimateTokens(messages: ChatMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    total += Math.ceil(msg.content.length / 4);
  }
  return total;
}

export function createLLMProvider(config: LLMProviderConfig): LLMProvider {
  switch (config.provider) {
    case 'ollama':
      return new OllamaProvider(config);
    case 'openai':
    case 'dashscope':
    case 'deepseek':
    case 'custom':
      return new OpenAICompatibleProvider(config);
    default:
      return new OpenAICompatibleProvider(config);
  }
}
