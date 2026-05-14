import { Response } from 'express';

export interface StreamChunk {
  content?: string;
  done?: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
  // 思考过程展示
  thinking?: string;
  toolCall?: {
    name: string;
    args: Record<string, any>;
    result?: any;
    status: 'calling' | 'success' | 'error';
  };
}

export function setupSSE(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
}

export function sendSSEChunk(res: Response, chunk: StreamChunk): void {
  res.write(`data: ${JSON.stringify(chunk)}\n\n`);
}

export function sendSSEDone(res: Response): void {
  res.write(`data: [DONE]\n\n`);
  res.end();
}

export function sendSSEError(res: Response, error: string): void {
  sendSSEChunk(res, { error, done: true });
  res.end();
}

// 发送思考过程
export function sendSSEThinking(res: Response, thought: string): void {
  sendSSEChunk(res, { thinking: thought });
}

// 发送工具调用状态
export function sendSSEToolCall(
  res: Response,
  name: string,
  args: Record<string, any>,
  status: 'calling' | 'success' | 'error',
  result?: any
): void {
  sendSSEChunk(res, {
    toolCall: { name, args, status, result },
  });
}
