import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { existsSync } from 'fs';
import { join } from 'path';

interface LSPMessage {
  jsonrpc: string;
  id?: number;
  method?: string;
  params?: any;
  result?: any;
  error?: any;
}

interface LSPServerConfig {
  command: string;
  args: string[];
  rootPath: string;
  language: string;
}

export type LSPHealthStatus = 'healthy' | 'unhealthy' | 'dead';

export interface LSPHealthInfo {
  status: LSPHealthStatus;
  language: string;
  rootPath: string;
  initialized: boolean;
  processAlive: boolean;
  lastHealthCheckAt: string | null;
  restartCount: number;
  maxRestarts: number;
  uptimeMs: number | null;
  message: string;
}

// 语言服务器自动发现配置
const LANGUAGE_SERVER_DISCOVERY: Record<string, {
  commands: string[];  // 尝试的命令列表（按优先级）
  args: string[];      // 参数
  fileExtensions: string[];
}> = {
  typescript: {
    commands: [
      'typescript-language-server',
      'node',
    ],
    args: ['--stdio'],
    fileExtensions: ['.ts', '.tsx', '.js', '.jsx'],
  },
  javascript: {
    commands: [
      'typescript-language-server',
      'node',
    ],
    args: ['--stdio'],
    fileExtensions: ['.js', '.jsx', '.ts', '.tsx'],
  },
  python: {
    commands: [
      'pyright-langserver',
      'pylsp',
      'python-language-server',
    ],
    args: ['--stdio'],
    fileExtensions: ['.py'],
  },
  go: {
    commands: [
      'gopls',
    ],
    args: [],
    fileExtensions: ['.go'],
  },
  rust: {
    commands: [
      'rust-analyzer',
    ],
    args: [],
    fileExtensions: ['.rs'],
  },
};

// 自动发现语言服务器路径
function discoverLanguageServer(language: string): { command: string; args: string[] } | null {
  const config = LANGUAGE_SERVER_DISCOVERY[language];
  if (!config) return null;

  // 1. 尝试直接从PATH查找
  for (const cmd of config.commands) {
    if (cmd === 'node') {
      // 特殊处理：typescript-language-server通过node运行
      const tsServerPath = findTSServerPath();
      if (tsServerPath) {
        return { command: 'node', args: [tsServerPath, ...config.args] };
      }
    } else {
      // 检查命令是否在PATH中
      try {
        const { execSync } = require('child_process');
        execSync(`${cmd} --version`, { stdio: 'pipe' });
        return { command: cmd, args: config.args };
      } catch {
        // 命令不存在，继续尝试下一个
      }
    }
  }

  // 2. 尝试常见安装路径
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const commonPaths: string[] = [];

  if (process.platform === 'win32') {
    commonPaths.push(
      join(home, 'AppData', 'Roaming', 'npm', 'typescript-language-server.cmd'),
      join(home, 'AppData', 'Roaming', 'npm', 'typescript-language-server.ps1'),
      join(home, 'AppData', 'Roaming', 'npm', 'node_modules', 'typescript-language-server', 'lib', 'cli.mjs'),
      join(home, 'scoop', 'shims', 'typescript-language-server.exe'),
      'C:\\Program Files\\nodejs\\typescript-language-server.cmd',
    );
  } else {
    commonPaths.push(
      '/usr/local/bin/typescript-language-server',
      '/usr/bin/typescript-language-server',
      join(home, '.local', 'bin', 'typescript-language-server'),
      join(home, '.npm-global', 'bin', 'typescript-language-server'),
      '/opt/homebrew/bin/typescript-language-server',
    );
  }

  for (const path of commonPaths) {
    if (existsSync(path)) {
      if (path.endsWith('.mjs')) {
        return { command: 'node', args: [path, ...config.args] };
      }
      return { command: path, args: config.args };
    }
  }

  return null;
}

// 查找TypeScript语言服务器路径
function findTSServerPath(): string | null {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const candidates = [
    join(home, 'AppData', 'Roaming', 'npm', 'node_modules', 'typescript-language-server', 'lib', 'cli.mjs'),
    join(home, '.npm-global', 'lib', 'node_modules', 'typescript-language-server', 'lib', 'cli.mjs'),
    '/usr/local/lib/node_modules/typescript-language-server/lib/cli.mjs',
    '/usr/lib/node_modules/typescript-language-server/lib/cli.mjs',
    join(home, '.config', 'yarn', 'global', 'node_modules', 'typescript-language-server', 'lib', 'cli.mjs'),
  ];

  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return null;
}

class LSPClient extends EventEmitter {
  private process: ChildProcess | null = null;
  private messageBuffer = '';
  private nextId = 1;
  private pendingRequests = new Map<number, { resolve: (value: any) => void; reject: (reason: any) => void }>();
  private initialized = false;
  private serverConfig: LSPServerConfig;
  private restartCount = 0;
  private maxRestarts = 3;
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private healthCheckIntervalMs = 30000;
  private isStopping = false;

  // Health monitoring
  private healthStatus: LSPHealthStatus = 'unhealthy';
  private lastHealthCheckAt: Date | null = null;
  private restartBackoffMs = 1000;
  private maxBackoffMs = 32000;
  private currentBackoffMs = 1000;
  private startTime: Date | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private healthCheckTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(language: string, rootPath: string) {
    super();
    const discovered = discoverLanguageServer(language);
    if (!discovered) {
      throw new Error(`无法找到${language}的语言服务器，请安装对应工具`);
    }
    this.serverConfig = {
      command: discovered.command,
      args: discovered.args,
      rootPath,
      language,
    };
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.isStopping = false;
        this.process = spawn(this.serverConfig.command, this.serverConfig.args, {
          cwd: this.serverConfig.rootPath,
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: process.platform === 'win32',
        });

        this.process.stdout!.on('data', (data: Buffer) => {
          this.handleData(data);
        });
        this.process.stderr!.on('data', (data: Buffer) => {
          const msg = data.toString().trim();
          if (msg && !msg.includes('npm notice')) {
            // 限制stderr输出，避免刷屏
            if (msg.length > 300) {
              console.error(`[LSP stderr] ${msg.slice(0, 300)}...`);
            } else {
              console.error(`[LSP stderr] ${msg}`);
            }
          }
        });
        this.process.on('exit', (code) => {
          this.initialized = false;
          this.healthStatus = 'unhealthy';
          this.emit('exit', code);
          if (!this.isStopping) {
            this.onConnectionError(`进程退出，代码: ${code}`);
          }
        });
        this.process.on('error', (err) => {
          this.healthStatus = 'unhealthy';
          this.emit('error', err);
          if (!this.isStopping) {
            this.onConnectionError(`进程错误: ${err.message}`);
          }
          reject(err);
        });

        setTimeout(async () => {
          try {
            await this.initialize();
            this.initialized = true;
            this.healthStatus = 'healthy';
            this.startTime = new Date();
            this.restartCount = 0; // 重置重启计数
            this.currentBackoffMs = this.restartBackoffMs; // 重置退避
            this.startHealthCheck();
            resolve();
          } catch (err) {
            this.healthStatus = 'unhealthy';
            reject(err);
          }
        }, 1000);
      } catch (err) {
        this.healthStatus = 'unhealthy';
        reject(err);
      }
    });
  }

  private startHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    this.healthCheckInterval = setInterval(() => {
      if (this.isStopping) return;
      this.sendHealthCheck().catch(() => {
        // 健康检查失败，onTimeout 会处理
      });
    }, this.healthCheckIntervalMs);
  }

  async sendHealthCheck(): Promise<boolean> {
    this.lastHealthCheckAt = new Date();

    // 检查进程是否存活
    if (!this.process || this.process.killed) {
      this.healthStatus = 'unhealthy';
      this.onConnectionError('健康检查：进程已死亡');
      return false;
    }

    if (!this.initialized) {
      this.healthStatus = 'unhealthy';
      return false;
    }

    try {
      // 使用 LSP 的通用请求作为心跳检测
      // 发送一个空 hover 请求到无效位置，期望快速返回 null 结果
      const uri = `file://${join(this.serverConfig.rootPath, '__health_check__.tmp')}`;
      await Promise.race([
        this.sendRequest('textDocument/hover', {
          textDocument: { uri },
          position: { line: 0, character: 0 },
        }, 5000),
        new Promise<never>((_, reject) => {
          this.healthCheckTimeout = setTimeout(() => {
            reject(new Error('健康检查超时'));
          }, 5000);
        }),
      ]);

      if (this.healthCheckTimeout) {
        clearTimeout(this.healthCheckTimeout);
        this.healthCheckTimeout = null;
      }

      // 任何响应（包括null）都表示连接正常
      this.healthStatus = 'healthy';
      return true;
    } catch (err: any) {
      if (this.healthCheckTimeout) {
        clearTimeout(this.healthCheckTimeout);
        this.healthCheckTimeout = null;
      }
      this.healthStatus = 'unhealthy';
      if (err.message?.includes('超时') || err.message?.includes('timeout')) {
        this.onTimeout('健康检查请求超时');
      } else {
        this.onConnectionError(`健康检查失败: ${err.message}`);
      }
      return false;
    }
  }

  isHealthy(): boolean {
    return this.healthStatus === 'healthy' && this.initialized && this.process !== null && !this.process.killed;
  }

  getHealthStatus(): LSPHealthInfo {
    const now = new Date();
    const uptimeMs = this.startTime ? now.getTime() - this.startTime.getTime() : null;
    let message = '';
    switch (this.healthStatus) {
      case 'healthy':
        message = 'LSP client 运行正常';
        break;
      case 'unhealthy':
        message = this.restartCount >= this.maxRestarts
          ? 'LSP client 不健康，已达到最大重启次数'
          : 'LSP client 不健康，将尝试自动重启';
        break;
      case 'dead':
        message = 'LSP client 已标记为死亡，不再尝试重启';
        break;
    }
    return {
      status: this.healthStatus,
      language: this.serverConfig.language,
      rootPath: this.serverConfig.rootPath,
      initialized: this.initialized,
      processAlive: this.process !== null && !this.process.killed,
      lastHealthCheckAt: this.lastHealthCheckAt ? this.lastHealthCheckAt.toISOString() : null,
      restartCount: this.restartCount,
      maxRestarts: this.maxRestarts,
      uptimeMs,
      message,
    };
  }

  private onConnectionError(reason: string): void {
    console.error(`[LSP] 连接错误: ${reason}`);
    this.healthStatus = 'unhealthy';
    this.initialized = false;
    if (!this.isStopping) {
      this.restart();
    }
  }

  private onTimeout(reason: string): void {
    console.error(`[LSP] 超时: ${reason}`);
    this.healthStatus = 'unhealthy';
    this.initialized = false;
    if (!this.isStopping) {
      this.restart();
    }
  }

  private restart(): void {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    if (this.restartCount >= this.maxRestarts) {
      this.markDead();
      return;
    }

    this.restartCount++;
    const backoff = this.currentBackoffMs;
    console.log(`[LSP] 将在 ${backoff}ms 后尝试重启 (${this.restartCount}/${this.maxRestarts})...`);

    this.restartTimer = setTimeout(() => {
      if (this.isStopping) return;
      this.stopInternal();
      this.start().catch((err) => {
        console.error(`[LSP] 重启失败: ${err.message}`);
        // 启动失败会再次触发 onConnectionError，继续重试
      });
    }, backoff);

    // 指数退避
    this.currentBackoffMs = Math.min(this.currentBackoffMs * 2, this.maxBackoffMs);
  }

  private markDead(): void {
    this.healthStatus = 'dead';
    this.initialized = false;
    console.error(`[LSP] 客户端已死亡: ${this.serverConfig.language} @ ${this.serverConfig.rootPath}，不再尝试重启`);
    this.emit('dead');
    this.stopInternal();
  }

  private stopInternal(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.healthCheckTimeout) {
      clearTimeout(this.healthCheckTimeout);
      this.healthCheckTimeout = null;
    }
    if (this.process) {
      try {
        this.sendNotification('exit', {});
      } catch {
        // ignore
      }
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill();
        }
        this.process = null;
      }, 500);
    }
    this.initialized = false;
  }

  private async initialize(): Promise<void> {
    const rootUri = `file://${this.serverConfig.rootPath}`;
    await this.sendRequest('initialize', {
      processId: process.pid,
      rootUri,
      capabilities: {
        textDocument: {
          synchronization: { dynamicRegistration: false, willSave: false, willSaveWaitUntil: false, didSave: false },
          completion: { dynamicRegistration: false, completionItem: { snippetSupport: false } },
          hover: { dynamicRegistration: false, contentFormat: ['plaintext', 'markdown'] },
          definition: { dynamicRegistration: false, linkSupport: false },
          documentSymbol: { dynamicRegistration: false, hierarchicalDocumentSymbolSupport: true },
          codeAction: { dynamicRegistration: false },
          formatting: { dynamicRegistration: false },
          rename: { dynamicRegistration: false },
          publishDiagnostics: { relatedInformation: true, versionSupport: false },
        },
        workspace: {
          workspaceFolders: true,
          configuration: false,
          didChangeConfiguration: { dynamicRegistration: false },
        },
      },
      workspaceFolders: [{ uri: rootUri, name: 'project' }],
    });
    this.sendNotification('initialized', {});
  }

  private handleData(data: Buffer): void {
    this.messageBuffer += data.toString();

    while (true) {
      const headerMatch = this.messageBuffer.match(/Content-Length: (\d+)\r\n\r\n/);
      if (!headerMatch) break;

      const contentLength = parseInt(headerMatch[1], 10);
      const headerEnd = this.messageBuffer.indexOf('\r\n\r\n') + 4;
      const messageEnd = headerEnd + contentLength;

      if (this.messageBuffer.length < messageEnd) break;

      const messageStr = this.messageBuffer.slice(headerEnd, messageEnd);
      this.messageBuffer = this.messageBuffer.slice(messageEnd);

      try {
        const message: LSPMessage = JSON.parse(messageStr);
        this.handleMessage(message);
      } catch {
        // Ignore parse errors
      }
    }
  }

  private handleMessage(message: LSPMessage): void {
    if (message.id !== undefined && message.result !== undefined) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        pending.resolve(message.result);
        this.pendingRequests.delete(message.id);
      }
    } else if (message.id !== undefined && message.error !== undefined) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        pending.reject(message.error);
        this.pendingRequests.delete(message.id);
      }
    } else if (message.method === 'textDocument/publishDiagnostics') {
      this.emit('diagnostics', message.params);
    }
  }

  private sendMessage(message: LSPMessage): void {
    if (!this.process || !this.process.stdin) return;
    const json = JSON.stringify(message);
    const data = `Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`;
    this.process.stdin.write(data);
  }

  private sendRequest(method: string, params: any, timeoutMs = 10000): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`LSP请求超时: ${method}`));
      }, timeoutMs);
      this.pendingRequests.set(id, {
        resolve: (value: any) => { clearTimeout(timeout); resolve(value); },
        reject: (reason: any) => { clearTimeout(timeout); reject(reason); },
      });
      this.sendMessage({ jsonrpc: '2.0', id, method, params });
    });
  }

  private sendNotification(method: string, params: any): void {
    this.sendMessage({ jsonrpc: '2.0', method, params });
  }

  getLanguage(): string {
    return this.serverConfig.language;
  }

  getRootPath(): string {
    return this.serverConfig.rootPath;
  }

  async openDocument(uri: string, languageId: string, content: string): Promise<void> {
    if (!this.initialized) throw new Error('LSP server not initialized');
    this.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId,
        version: 1,
        text: content,
      },
    });
  }

  async getDocumentSymbols(uri: string): Promise<any> {
    if (!this.initialized) throw new Error('LSP server not initialized');
    return this.sendRequest('textDocument/documentSymbol', {
      textDocument: { uri },
    });
  }

  async getHover(uri: string, line: number, character: number): Promise<any> {
    if (!this.initialized) throw new Error('LSP server not initialized');
    return this.sendRequest('textDocument/hover', {
      textDocument: { uri },
      position: { line, character },
    });
  }

  async getDiagnostics(uri: string): Promise<any[]> {
    if (!this.initialized) throw new Error('LSP server not initialized');
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve([]), 5000);
      const handler = (params: any) => {
        if (params.uri === uri) {
          clearTimeout(timeout);
          this.off('diagnostics', handler);
          resolve(params.diagnostics || []);
        }
      };
      this.on('diagnostics', handler);
    });
  }

  async getDefinition(uri: string, line: number, character: number): Promise<any> {
    if (!this.initialized) throw new Error('LSP server not initialized');
    return this.sendRequest('textDocument/definition', {
      textDocument: { uri },
      position: { line, character },
    });
  }

  async getReferences(uri: string, line: number, character: number): Promise<any> {
    if (!this.initialized) throw new Error('LSP server not initialized');
    return this.sendRequest('textDocument/references', {
      textDocument: { uri },
      position: { line, character },
      context: { includeDeclaration: true },
    });
  }

  stop(): void {
    this.isStopping = true;
    this.stopInternal();
    this.healthStatus = 'unhealthy';
  }
}

const lspClients = new Map<string, LSPClient>();

export async function getLSPClient(language: string, rootPath: string): Promise<LSPClient> {
  const key = `${language}:${rootPath}`;
  if (!lspClients.has(key)) {
    const client = new LSPClient(language, rootPath);
    await client.start();
    lspClients.set(key, client);
  }
  const client = lspClients.get(key)!;
  // 健康检查：如果客户端不健康且未死亡，重新创建
  if (!client.isHealthy() && client.getHealthStatus().status !== 'dead') {
    console.log(`[LSP] 客户端不健康，重新创建: ${key}`);
    client.stop();
    lspClients.delete(key);
    const newClient = new LSPClient(language, rootPath);
    await newClient.start();
    lspClients.set(key, newClient);
    return newClient;
  }
  // 如果客户端已死亡，仍然返回但会抛出错误让调用方处理
  if (client.getHealthStatus().status === 'dead') {
    throw new Error(`LSP client 已死亡: ${key}，请使用 lsp_restart 工具手动重启`);
  }
  return client;
}

export function getAllLSPClients(): LSPClient[] {
  return Array.from(lspClients.values());
}

export function getLSPClientByKey(key: string): LSPClient | undefined {
  return lspClients.get(key);
}

export function removeLSPClient(key: string): boolean {
  const client = lspClients.get(key);
  if (client) {
    client.stop();
    lspClients.delete(key);
    return true;
  }
  return false;
}

export function stopAllLSPClients(): void {
  for (const client of lspClients.values()) {
    client.stop();
  }
  lspClients.clear();
}

export async function restartLSPClient(key: string): Promise<{ success: boolean; message: string }> {
  const existing = lspClients.get(key);
  let language = '';
  let rootPath = '';

  if (existing) {
    const info = existing.getHealthStatus();
    language = info.language;
    rootPath = info.rootPath;
    existing.stop();
    lspClients.delete(key);
  } else {
    // 尝试从 key 解析
    const parts = key.split(':');
    if (parts.length >= 2) {
      language = parts[0];
      rootPath = parts.slice(1).join(':');
    }
  }

  if (!language || !rootPath) {
    return { success: false, message: `无法解析客户端 key: ${key}` };
  }

  try {
    const newClient = new LSPClient(language, rootPath);
    await newClient.start();
    lspClients.set(key, newClient);
    return { success: true, message: `LSP client 已重启: ${key}` };
  } catch (err: any) {
    return { success: false, message: `重启失败: ${err.message}` };
  }
}

export { LSPClient };
