import { env } from '../config/env.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

export interface ChatOptions {
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
  enableWebSearch?: boolean;
  enableTools?: boolean;
  model?: string;
  provider?: string;
}

export interface ChatResponse {
  content: string;
  provider: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  latencyMs: number;
  toolUsed?: string;
}

const NIUMA_ENGINE_URL = env.NIUMA_ENGINE_URL || 'http://localhost:1078';

export async function chatWithNiumaEngine(options: ChatOptions): Promise<ChatResponse> {
  const startTime = Date.now();

  try {
    const resp = await fetch(`${NIUMA_ENGINE_URL}/api/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: options.messages[options.messages.length - 1]?.content || '',
        providerId: options.provider ? getProviderId(options.provider) : undefined,
        stream: options.stream || false,
        enableWebSearch: options.enableWebSearch !== false,
        enableTools: options.enableTools !== false,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
      }),
    });

    if (!resp.ok) {
      const errorText = await resp.text().catch(() => `HTTP ${resp.status}`);
      throw new Error(`OQ引擎请求失败(${resp.status}): ${errorText.substring(0, 200)}`);
    }

    const data = await resp.json() as Record<string, any>;
    const latencyMs = Date.now() - startTime;

    return {
      content: data.message?.content || data.content || '',
      provider: data.provider || options.provider || 'niuma',
      model: data.model || options.model || 'default',
      tokensInput: data.tokensInput || estimateTokens(options.messages),
      tokensOutput: data.tokensOutput || estimateTokens([{ role: 'assistant', content: data.message?.content || '' }]),
      latencyMs,
      toolUsed: data.toolUsed,
    };
  } catch (err: any) {
    throw new Error(`调用OQ引擎失败: ${err.message}`);
  }
}

export async function chatWithNiumaEngineStream(
  options: ChatOptions,
  onChunk: (chunk: string) => void
): Promise<ChatResponse> {
  const startTime = Date.now();
  let fullContent = '';

  try {
    const resp = await fetch(`${NIUMA_ENGINE_URL}/api/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({
        message: options.messages[options.messages.length - 1]?.content || '',
        providerId: options.provider ? getProviderId(options.provider) : undefined,
        stream: true,
        enableWebSearch: options.enableWebSearch !== false,
        enableTools: options.enableTools !== false,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
      }),
    });

    if (!resp.ok) {
      const errorText = await resp.text().catch(() => `HTTP ${resp.status}`);
      throw new Error(`牛马AI引擎请求失败(${resp.status}): ${errorText.substring(0, 200)}`);
    }

    const reader = resp.body?.getReader();
    if (!reader) {
      throw new Error('无法获取响应流');
    }

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
            const chunk = parsed.content || '';
            if (chunk) {
              fullContent += chunk;
              onChunk(chunk);
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
    }

    const latencyMs = Date.now() - startTime;

    return {
      content: fullContent,
      provider: options.provider || 'niuma',
      model: options.model || 'default',
      tokensInput: estimateTokens(options.messages),
      tokensOutput: estimateTokens([{ role: 'assistant', content: fullContent }]),
      latencyMs,
    };
  } catch (err: any) {
    throw new Error(`调用牛马AI引擎失败: ${err.message}`);
  }
}

function getProviderId(provider: string): number | undefined {
  const providerMap: Record<string, number> = {
    'ollama': 1,
    'bailian': 2,
    'openai': 3,
  };
  return providerMap[provider.toLowerCase()];
}

function estimateTokens(messages: ChatMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    total += Math.ceil(msg.content.length / 4);
  }
  return total;
}
