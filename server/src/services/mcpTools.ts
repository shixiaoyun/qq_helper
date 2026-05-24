import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, writeFile, readdir, stat, mkdir } from 'fs/promises';
import { join, extname, dirname } from 'path';
import * as os from 'os';
import { prisma } from '../config/prisma.js';
import { glob } from 'glob';
import { getDefaultProvider } from '../models/aiProvider.js';
import { getLSPClient, getAllLSPClients, restartLSPClient } from './lspClient.js';
import { getAgentMemory } from './agentMemory.js';
import { defaultPrivacyGuard } from './privacyGuard.js';
import { registerCodeSemanticSearchTools } from './codeSemanticSearch.js';
import { queryAuditLogs, getAuditStats, AuditAction } from './auditLog.js';
import { getSensitiveWordFilter, type ReplacementMode } from './sensitiveWordFilter.js';

const execAsync = promisify(exec);

export interface MCPToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface MCPTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  execute: (args: Record<string, any>) => Promise<any>;
}

const toolsRegistry = new Map<string, MCPTool>();

// ============ 文件系统工具 ============

function registerFileTools() {
  toolsRegistry.set('fs_read', {
    name: 'fs_read',
    description: '读取文件内容，支持各种文本文件',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径（绝对路径或相对于工作目录）' },
        encoding: { type: 'string', description: '文件编码', enum: ['utf-8', 'gbk', 'base64'] },
      },
      required: ['path'],
    },
    execute: async ({ path, encoding = 'utf-8' }) => {
      try {
        const content = await readFile(path, encoding as BufferEncoding);
        const isBinary = encoding === 'base64' || !content.toString().includes('\u0000');
        const contentStr = Buffer.isBuffer(content) ? content.toString(encoding as BufferEncoding) : String(content);
        return {
          success: true,
          path,
          encoding,
          content: isBinary ? contentStr : '[二进制文件无法显示]',
          size: contentStr.length,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  toolsRegistry.set('fs_write', {
    name: 'fs_write',
    description: '写入内容到文件，如果文件存在则覆盖',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径' },
        content: { type: 'string', description: '文件内容' },
        encoding: { type: 'string', description: '文件编码', enum: ['utf-8', 'gbk', 'base64'] },
      },
      required: ['path', 'content'],
    },
    execute: async ({ path, content, encoding = 'utf-8' }) => {
      try {
        await writeFile(path, content, encoding as BufferEncoding);
        return { success: true, path, bytesWritten: content.length };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  toolsRegistry.set('fs_list', {
    name: 'fs_list',
    description: '列出目录下的文件和文件夹',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '目录路径' },
        recursive: { type: 'boolean', description: '是否递归列出子目录' },
        maxDepth: { type: 'number', description: '最大递归深度（recursive=true时有效）' },
      },
      required: ['path'],
    },
    execute: async ({ path, recursive = false, maxDepth = 3 }) => {
      try {
        const result: any[] = [];

        async function walk(dir: string, depth = 0) {
          if (depth > maxDepth) return;
          const entries = await readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            try {
              const info = await stat(fullPath);
              result.push({
                name: entry.name,
                path: fullPath,
                type: entry.isDirectory() ? 'directory' : 'file',
                size: info.size,
                extension: entry.isFile() ? extname(entry.name) : null,
                modified: info.mtime.toISOString(),
              });
              if (entry.isDirectory() && recursive) {
                await walk(fullPath, depth + 1);
              }
            } catch {
              result.push({ name: entry.name, path: fullPath, type: 'unknown', error: '无法访问' });
            }
          }
        }

        await walk(path);
        return { success: true, path, items: result, total: result.length };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  toolsRegistry.set('fs_mkdir', {
    name: 'fs_mkdir',
    description: '创建目录（支持递归创建）',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '目录路径' },
        recursive: { type: 'boolean', description: '是否递归创建父目录' },
      },
      required: ['path'],
    },
    execute: async ({ path, recursive = true }) => {
      try {
        await mkdir(path, { recursive });
        return { success: true, path };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  toolsRegistry.set('fs_stat', {
    name: 'fs_stat',
    description: '获取文件或目录的详细信息',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件或目录路径' },
      },
      required: ['path'],
    },
    execute: async ({ path }) => {
      try {
        const info = await stat(path);
        return {
          success: true,
          path,
          type: info.isFile() ? 'file' : info.isDirectory() ? 'directory' : 'other',
          size: info.size,
          created: info.birthtime.toISOString(),
          modified: info.mtime.toISOString(),
          accessed: info.atime.toISOString(),
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });
}

// ============ Git 工具 ============

function registerGitTools() {
  toolsRegistry.set('git_status', {
    name: 'git_status',
    description: '查看 Git 仓库的当前状态',
    parameters: {
      type: 'object',
      properties: {
        repoPath: { type: 'string', description: 'Git 仓库路径（默认为当前目录）' },
      },
    },
    execute: async ({ repoPath = '.' }) => {
      try {
        const { stdout } = await execAsync('git status --short', { cwd: repoPath });
        return {
          success: true,
          repoPath,
          status: stdout || '工作区干净',
          hasChanges: stdout.trim().length > 0,
        };
      } catch (err: any) {
        return { success: false, error: err.stderr || err.message };
      }
    },
  });

  toolsRegistry.set('git_log', {
    name: 'git_log',
    description: '查看 Git 提交历史',
    parameters: {
      type: 'object',
      properties: {
        repoPath: { type: 'string', description: 'Git 仓库路径' },
        limit: { type: 'number', description: '限制显示的提交数量（默认10）' },
        format: { type: 'string', description: '输出格式', enum: ['short', 'full', 'oneline'] },
      },
    },
    execute: async ({ repoPath = '.', limit = 10, format = 'short' }) => {
      try {
        const formatStr = format === 'oneline' ? '%h %s' : format === 'full' ? '%H%n%an%n%ae%n%ad%n%s%n%b' : '%h%n%an%n%ad%n%s';
        const { stdout } = await execAsync(`git log --format="${formatStr}" -n ${limit}`, { cwd: repoPath });
        const lines = stdout.trim().split('\n');
        const commits = [];

        if (format === 'oneline') {
          for (const line of lines) {
            const [hash, ...msg] = line.split(' ');
            commits.push({ hash, message: msg.join(' ') });
          }
        } else {
          for (let i = 0; i < lines.length; i += format === 'full' ? 6 : 4) {
            const chunk = lines.slice(i, i + (format === 'full' ? 6 : 4));
            if (chunk.length >= 4) {
              commits.push({
                hash: chunk[0],
                author: chunk[1],
                email: format === 'full' ? chunk[2] : undefined,
                date: format === 'full' ? chunk[3] : chunk[2],
                message: format === 'full' ? chunk[4] : chunk[3],
              });
            }
          }
        }

        return { success: true, repoPath, commits };
      } catch (err: any) {
        return { success: false, error: err.stderr || err.message };
      }
    },
  });

  toolsRegistry.set('git_branch', {
    name: 'git_branch',
    description: '列出、创建或删除 Git 分支',
    parameters: {
      type: 'object',
      properties: {
        repoPath: { type: 'string', description: 'Git 仓库路径' },
        action: { type: 'string', description: '操作', enum: ['list', 'create', 'delete', 'current'] },
        branchName: { type: 'string', description: '分支名称（create/delete时需要）' },
      },
      required: ['action'],
    },
    execute: async ({ repoPath = '.', action, branchName }) => {
      try {
        if (action === 'list') {
          const { stdout } = await execAsync('git branch -a', { cwd: repoPath });
          const branches = stdout.split('\n').map(b => b.trim()).filter(Boolean);
          const current = branches.find(b => b.startsWith('*'))?.replace('* ', '');
          return { success: true, branches, current };
        }

        if (action === 'current') {
          const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: repoPath });
          return { success: true, current: stdout.trim() };
        }

        if (action === 'create') {
          if (!branchName) return { success: false, error: '需要指定分支名称' };
          await execAsync(`git checkout -b ${branchName}`, { cwd: repoPath });
          return { success: true, message: `已创建并切换到分支 ${branchName}` };
        }

        if (action === 'delete') {
          if (!branchName) return { success: false, error: '需要指定分支名称' };
          await execAsync(`git branch -d ${branchName}`, { cwd: repoPath });
          return { success: true, message: `已删除分支 ${branchName}` };
        }

        return { success: false, error: `未知操作: ${action}。支持的操作: list, current, create, delete` };
      } catch (err: any) {
        return { success: false, error: err.stderr || err.message };
      }
    },
  });

  toolsRegistry.set('git_diff', {
    name: 'git_diff',
    description: '查看文件或提交的差异',
    parameters: {
      type: 'object',
      properties: {
        repoPath: { type: 'string', description: 'Git 仓库路径' },
        target: { type: 'string', description: '比较目标（文件名、commit hash、或 HEAD~n）' },
        staged: { type: 'boolean', description: '是否比较暂存区' },
      },
    },
    execute: async ({ repoPath = '.', target, staged = false }) => {
      try {
        let cmd = 'git diff';
        if (staged) cmd += ' --cached';
        if (target) cmd += ` ${target}`;
        const { stdout } = await execAsync(cmd, { cwd: repoPath });
        return {
          success: true,
          repoPath,
          hasDiff: stdout.trim().length > 0,
          diff: stdout || '无差异',
        };
      } catch (err: any) {
        return { success: false, error: err.stderr || err.message };
      }
    },
  });

  toolsRegistry.set('git_add', {
    name: 'git_add',
    description: '将文件添加到 Git 暂存区',
    parameters: {
      type: 'object',
      properties: {
        repoPath: { type: 'string', description: 'Git 仓库路径' },
        files: { type: 'string', description: '要添加的文件（用空格分隔，* 表示所有）' },
      },
      required: ['files'],
    },
    execute: async ({ repoPath = '.', files }) => {
      try {
        await execAsync(`git add ${files}`, { cwd: repoPath });
        return { success: true, message: `已添加 ${files} 到暂存区` };
      } catch (err: any) {
        return { success: false, error: err.stderr || err.message };
      }
    },
  });

  toolsRegistry.set('git_commit', {
    name: 'git_commit',
    description: '提交暂存区的更改',
    parameters: {
      type: 'object',
      properties: {
        repoPath: { type: 'string', description: 'Git 仓库路径' },
        message: { type: 'string', description: '提交信息' },
        amend: { type: 'boolean', description: '是否修改上一次提交（不改变提交信息）' },
      },
      required: ['message'],
    },
    execute: async ({ repoPath = '.', message, amend = false }) => {
      try {
        let cmd = amend ? `git commit --amend --no-edit` : `git commit -m "${message}"`;
        await execAsync(cmd, { cwd: repoPath });
        return { success: true, message: amend ? '已修改上一次提交' : `已提交: ${message}` };
      } catch (err: any) {
        return { success: false, error: err.stderr || err.message };
      }
    },
  });

  toolsRegistry.set('git_push', {
    name: 'git_push',
    description: '推送提交到远程仓库',
    parameters: {
      type: 'object',
      properties: {
        repoPath: { type: 'string', description: 'Git 仓库路径' },
        remote: { type: 'string', description: '远程仓库名称（默认 origin）' },
        branch: { type: 'string', description: '分支名称（默认当前分支）' },
        force: { type: 'boolean', description: '是否强制推送' },
      },
    },
    execute: async ({ repoPath = '.', remote = 'origin', branch, force = false }) => {
      try {
        let cmd = `git push ${remote}`;
        if (branch) cmd += ` ${branch}`;
        if (force) cmd += ' --force';
        await execAsync(cmd, { cwd: repoPath });
        return { success: true, message: `已推送到 ${remote}${branch ? '/' + branch : ''}` };
      } catch (err: any) {
        return { success: false, error: err.stderr || err.message };
      }
    },
  });

  toolsRegistry.set('git_pull', {
    name: 'git_pull',
    description: '从远程仓库拉取更新',
    parameters: {
      type: 'object',
      properties: {
        repoPath: { type: 'string', description: 'Git 仓库路径' },
        remote: { type: 'string', description: '远程仓库名称（默认 origin）' },
        branch: { type: 'string', description: '分支名称（默认当前分支）' },
        rebase: { type: 'boolean', description: '是否使用 rebase 模式' },
      },
    },
    execute: async ({ repoPath = '.', remote = 'origin', branch, rebase = false }) => {
      try {
        let cmd = `git pull ${remote}`;
        if (branch) cmd += ` ${branch}`;
        if (rebase) cmd += ' --rebase';
        const { stdout } = await execAsync(cmd, { cwd: repoPath });
        return { success: true, output: stdout };
      } catch (err: any) {
        return { success: false, error: err.stderr || err.message };
      }
    },
  });

  toolsRegistry.set('git_checkout', {
    name: 'git_checkout',
    description: '切换分支或恢复文件',
    parameters: {
      type: 'object',
      properties: {
        repoPath: { type: 'string', description: 'Git 仓库路径' },
        target: { type: 'string', description: '目标分支或文件' },
        createBranch: { type: 'boolean', description: '是否创建新分支' },
      },
      required: ['target'],
    },
    execute: async ({ repoPath = '.', target, createBranch = false }) => {
      try {
        let cmd = createBranch ? `git checkout -b ${target}` : `git checkout ${target}`;
        await execAsync(cmd, { cwd: repoPath });
        return { success: true, message: `已切换到 ${target}` };
      } catch (err: any) {
        return { success: false, error: err.stderr || err.message };
      }
    },
  });

  toolsRegistry.set('git_clone', {
    name: 'git_clone',
    description: '克隆远程仓库到本地',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '仓库 URL' },
        path: { type: 'string', description: '目标路径' },
        branch: { type: 'string', description: '指定分支（可选）' },
        depth: { type: 'number', description: '克隆深度（可选）' },
      },
      required: ['url', 'path'],
    },
    execute: async ({ url, path, branch, depth }) => {
      try {
        let cmd = `git clone ${url} "${path}"`;
        if (branch) cmd += ` --branch ${branch}`;
        if (depth) cmd += ` --depth ${depth}`;
        await execAsync(cmd);
        return { success: true, message: `已克隆到 ${path}`, path };
      } catch (err: any) {
        return { success: false, error: err.stderr || err.message };
      }
    },
  });
}

// ============ 命令行工具 ============

function registerShellTools() {
  toolsRegistry.set('shell_exec', {
    name: 'shell_exec',
    description: '执行命令行命令',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '要执行的命令' },
        cwd: { type: 'string', description: '工作目录（可选）' },
        timeout: { type: 'number', description: '超时时间（毫秒，默认30000）' },
      },
      required: ['command'],
    },
    execute: async ({ command, cwd, timeout = 30000 }) => {
      try {
        const { stdout, stderr } = await execAsync(command, {
          cwd,
          timeout,
          maxBuffer: 1024 * 1024 * 10,
        });
        return {
          success: true,
          command,
          stdout,
          stderr,
          exitCode: 0,
        };
      } catch (err: any) {
        return {
          success: false,
          command,
          stdout: err.stdout || '',
          stderr: err.stderr || err.message,
          exitCode: err.code || 1,
        };
      }
    },
  });
}

// ============ API 测试工具 ============

function registerApiTools() {
  toolsRegistry.set('http_request', {
    name: 'http_request',
    description: '发送 HTTP 请求（支持 GET/POST/PUT/DELETE/PATCH）',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '请求 URL' },
        method: { type: 'string', description: 'HTTP 方法', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] },
        headers: { type: 'string', description: '请求头（JSON 格式）' },
        body: { type: 'string', description: '请求体（JSON 格式字符串）' },
        timeout: { type: 'number', description: '超时时间（毫秒，默认30000）' },
      },
      required: ['url'],
    },
    execute: async ({ url, method = 'GET', headers: reqHeaders, body, timeout = 30000 }) => {
      try {
        const options: RequestInit = {
          method,
          headers: reqHeaders ? JSON.parse(reqHeaders) : {},
          signal: AbortSignal.timeout(timeout),
        };

        if (body && !['GET', 'HEAD'].includes(method)) {
          options.body = body;
          if (!options.headers) options.headers = {};
          if (typeof options.headers === 'object' && !('Content-Type' in options.headers)) {
            (options.headers as Record<string, string>)['Content-Type'] = 'application/json';
          }
        }

        const start = Date.now();
        const response = await fetch(url, options);
        const elapsed = Date.now() - start;

        let responseBody: string;
        const contentType = response.headers.get('content-type') || '';
        const respHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          respHeaders[key] = value;
        });

        if (contentType.includes('application/json')) {
          responseBody = JSON.stringify(await response.json(), null, 2);
        } else {
          responseBody = await response.text();
          if (responseBody.length > 5000) {
            responseBody = responseBody.slice(0, 5000) + '\n... (内容过长已截断)';
          }
        }

        return {
          success: true,
          status: response.status,
          statusText: response.statusText,
          headers: respHeaders,
          body: responseBody,
          elapsed,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  toolsRegistry.set('api_test', {
    name: 'api_test',
    description: '测试 API 接口并验证响应',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'API URL' },
        method: { type: 'string', description: 'HTTP 方法', enum: ['GET', 'POST', 'PUT', 'DELETE'] },
        expectedStatus: { type: 'number', description: '期望的响应状态码' },
        expectedContains: { type: 'string', description: '期望响应包含的字符串' },
        headers: { type: 'string', description: '请求头（JSON 格式）' },
        body: { type: 'string', description: '请求体' },
      },
      required: ['url'],
    },
    execute: async ({ url, method = 'GET', expectedStatus, expectedContains, headers, body }) => {
      try {
        const options: RequestInit = {
          method,
          headers: headers ? JSON.parse(headers) : {},
        };
        if (body) options.body = body;

        const response = await fetch(url, options);
        const responseBody = await response.text();

        const results = {
          url,
          method,
          actualStatus: response.status,
          statusMatch: expectedStatus ? response.status === expectedStatus : null,
          containsExpected: expectedContains ? responseBody.includes(expectedContains) : null,
          response: responseBody.slice(0, 1000),
        };

        return {
          success: true,
          testPassed: (!expectedStatus || results.statusMatch) && (!expectedContains || results.containsExpected),
          results,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });
}

// ============ 数据库工具 ============

function registerDbTools() {
  toolsRegistry.set('db_query', {
    name: 'db_query',
    description: '执行只读数据库查询',
    parameters: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'SQL 查询语句（仅支持 SELECT）' },
        limit: { type: 'number', description: '结果条数限制（默认100）' },
      },
      required: ['sql'],
    },
    execute: async ({ sql, limit = 100 }) => {
      try {
        const trimmed = sql.trim().toLowerCase();
        if (!trimmed.startsWith('select')) {
          return { success: false, error: '仅支持 SELECT 查询' };
        }

        let finalSql = sql;
        if (!sql.toLowerCase().includes('limit')) {
          finalSql = `${sql} LIMIT ${limit}`;
        }

        const result = await (prisma as any).$queryRawUnsafe(finalSql);
        return {
          success: true,
          sql: finalSql,
          rows: Array.isArray(result) ? result : [],
          count: Array.isArray(result) ? result.length : 0,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  toolsRegistry.set('db_tables', {
    name: 'db_tables',
    description: '列出数据库中的所有表',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async () => {
      try {
        const result = await (prisma as any).$queryRawUnsafe(
          'SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()'
        );
        const tables = Array.isArray(result) ? result : [];
        return { success: true, tables: tables.map((t: any) => t.name) };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  toolsRegistry.set('db_schema', {
    name: 'db_schema',
    description: '查看表的结构定义',
    parameters: {
      type: 'object',
      properties: {
        tableName: { type: 'string', description: '表名称' },
      },
      required: ['tableName'],
    },
    execute: async ({ tableName }) => {
      try {
        const result = await (prisma as any).$queryRawUnsafe(
          `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY
           FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${String(tableName).replace(/'/g, "''")}'
           ORDER BY ORDINAL_POSITION`
        );
        const columns = Array.isArray(result) ? result : [];
        return {
          success: true,
          table: tableName,
          columns: columns.map((c: any) => ({
            name: c.COLUMN_NAME,
            type: c.DATA_TYPE,
            nullable: c.IS_NULLABLE === 'YES',
            default: c.COLUMN_DEFAULT,
            primaryKey: c.COLUMN_KEY === 'PRI',
          })),
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });
}

// ============ 代码分析工具 ============

function registerCodeTools() {
  toolsRegistry.set('code_search', {
    name: 'code_search',
    description: '在项目中搜索代码内容',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: '搜索模式（支持正则）' },
        path: { type: 'string', description: '搜索路径（默认当前目录）' },
        filePattern: { type: 'string', description: '文件匹配模式（如 *.ts, *.js）' },
        caseSensitive: { type: 'boolean', description: '是否区分大小写' },
        maxResults: { type: 'number', description: '最大结果数（默认50）' },
      },
      required: ['pattern'],
    },
    execute: async ({ pattern, path = '.', filePattern, caseSensitive = false, maxResults = 50 }) => {
      try {
        let cmd: string;
        if (process.platform === 'win32') {
          // Windows: 使用 PowerShell Select-String
          const includeFilter = filePattern ? ` | Where-Object { $_.Path -like "*${filePattern.replace(/\*/g, '*')}" }` : '';
          cmd = `powershell -ExecutionPolicy Bypass -Command "Select-String -Path '${path}/*' -Pattern '${pattern.replace(/'/g, "''")}' ${caseSensitive ? '' : '-CaseSensitive:$false'} ${includeFilter} | Select-Object -First ${maxResults} | ForEach-Object { Write-Output (\$_.Path + ':' + \$_.LineNumber + ':' + \$_.Line) }"`;
        } else {
          cmd = `grep -rn${caseSensitive ? '' : 'i'} "${pattern}" "${path}"`;
          if (filePattern) cmd += ` --include="${filePattern}"`;
          cmd += ` | head -n ${maxResults}`;
        }

        const { stdout } = await execAsync(cmd, { timeout: 30000 });
        const lines = stdout.trim().split('\n').filter(Boolean);

        const results = lines.map(line => {
          const firstColon = line.indexOf(':');
          const secondColon = line.indexOf(':', firstColon + 1);
          if (firstColon === -1 || secondColon === -1) return null;
          const filePath = line.slice(0, firstColon);
          const lineNum = line.slice(firstColon + 1, secondColon);
          const content = line.slice(secondColon + 1);
          return {
            file: filePath,
            line: parseInt(lineNum) || 0,
            content: content.trim(),
          };
        }).filter(Boolean);

        return { success: true, pattern, total: results.length, results };
      } catch (err: any) {
        if (err.message && (err.message.includes('did not match') || err.message.includes('No matches') || err.message.includes('找不到') || err.message.includes('no matches'))) {
          return { success: true, pattern, total: 0, results: [] };
        }
        if (err.code === 1 && !err.stderr) {
          return { success: true, pattern, total: 0, results: [] };
        }
        return { success: false, error: err.message };
      }
    },
  });

  toolsRegistry.set('code_parse', {
    name: 'code_parse',
    description: '解析代码文件，提取函数、类、变量等定义',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '代码文件路径' },
      },
      required: ['path'],
    },
    execute: async ({ path }) => {
      try {
        const content = await readFile(path, 'utf-8');
        const ext = extname(path).toLowerCase();
        const definitions: any[] = [];

        const patterns: Record<string, RegExp[]> = {
          '.ts': [
            /^(export\s+)?(function|const|let|var|class|interface|type|enum)\s+(\w+)/gm,
            /^(export\s+)?async\s+function\s+(\w+)/gm,
            /class\s+(\w+)(?:\s+extends\s+\w+)?(?:\s+implements\s+[\w,\s]+)?\s*\{/g,
          ],
          '.tsx': [
            /^(export\s+)?(function|const|let|var|class|interface|type|enum)\s+(\w+)/gm,
            /export\s+default\s+(function|class)\s+(\w+)/gm,
            /^(export\s+)?const\s+(\w+)\s*=/gm,
          ],
          '.js': [
            /^(export\s+)?(function|const|let|var|class)\s+(\w+)/gm,
            /module\.exports\s*=\s*\{/g,
          ],
          '.py': [
            /^(def|class|async\s+def)\s+(\w+)/gm,
            /^(import|from)\s+[\w.]+/gm,
          ],
          '.go': [
            /^func\s+(\w+)/gm,
            /^type\s+(\w+)\s+struct/gm,
            /^type\s+(\w+)\s+interface/gm,
          ],
        };

        const langPatterns = patterns[ext] || patterns['.ts'];

        for (const pattern of langPatterns) {
          let match;
          while ((match = pattern.exec(content)) !== null) {
            definitions.push({
              type: match[2] || match[1],
              name: match[3] || match[1],
              line: content.slice(0, match.index).split('\n').length,
            });
          }
        }

        return {
          success: true,
          path,
          extension: ext,
          totalDefinitions: definitions.length,
          definitions: definitions.slice(0, 100),
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });
}

// ============ 系统信息工具 ============

function registerSystemTools() {
  toolsRegistry.set('system_info', {
    name: 'system_info',
    description: '获取系统信息',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', description: '信息类型', enum: ['os', 'memory', 'cpu', 'time', 'disk', 'disk_usage', 'all'] },
      },
      required: ['type'],
    },
    execute: async ({ type = 'all' }) => {
      if (type === 'all') {
        return {
          success: true,
          os: { platform: os.platform(), release: os.release(), arch: os.arch() },
          memory: { total: os.totalmem(), free: os.freemem(), used: os.totalmem() - os.freemem() },
          cpu: { cores: os.cpus().length, model: os.cpus()[0]?.model, speed: os.cpus()[0]?.speed },
          uptime: os.uptime(),
          time: new Date().toISOString(),
        };
      }

      switch (type) {
        case 'os': return { success: true, platform: os.platform(), release: os.release(), arch: os.arch() };
        case 'memory': return { success: true, total: os.totalmem(), free: os.freemem(), used: os.totalmem() - os.freemem() };
        case 'cpu': return { success: true, cores: os.cpus().length, load: os.loadavg(), cpus: os.cpus() };
        case 'time': return { success: true, now: new Date().toISOString(), uptime: os.uptime() };
        case 'disk':
        case 'disk_usage': {
          const disks = [];
          try {
            if (process.platform === 'win32') {
              const { execSync } = require('child_process');
              const ps = `Get-PSDrive -PSProvider FileSystem | Where-Object {$_.Free -ne $null} | ForEach-Object {[PSCustomObject]@{Name=$_.Name;FreeGB=[math]::Round($_.Free/1GB,2);UsedGB=[math]::Round($_.Used/1GB,2);TotalGB=[math]::Round(($_.Free+$_.Used)/1GB,2)}} | ConvertTo-Json -Compress`;
              const result = execSync(`powershell -ExecutionPolicy Bypass -Command "${ps}"`, { encoding: 'utf8', timeout: 5000 });
              const diskData = JSON.parse(result);
              const diskArray = Array.isArray(diskData) ? diskData : [diskData];
              for (const disk of diskArray) {
                disks.push({
                  drive: disk.Name + ':',
                  total: disk.TotalGB + ' GB',
                  free: disk.FreeGB + ' GB',
                  used: disk.UsedGB + ' GB',
                });
              }
            } else {
              const { execSync } = require('child_process');
              const result = execSync(`df -h`, { encoding: 'utf8', timeout: 3000 });
              const lines = result.trim().split('\n').slice(1);
              for (const line of lines) {
                const parts = line.split(/\s+/);
                if (parts.length >= 6) {
                  disks.push({
                    drive: parts[0],
                    total: parts[1],
                    used: parts[2],
                    free: parts[3],
                    usePercent: parts[4],
                  });
                }
              }
            }
          } catch (e: any) {
            return { success: false, error: `获取磁盘信息失败: ${e?.message || String(e)}` };
          }
          return { success: true, disks };
        }
        default: return { success: false, error: `未知类型: ${type}` };
      }
    },
  });
}

// ============ 浏览器操作工具 ============

// 使用 Map 持久化存储浏览器会话（类似 ruflo 项目的实现）
const browserSessions = new Map<string, string>();

function getAIBrowserSession(_browser: any, sessionKey: string = 'default'): string | null {
  const sessionId = browserSessions.get(sessionKey);
  // 直接返回 sessionId，由调用方验证会话有效性
  return sessionId || null;
}

async function registerBrowserTools() {
  const browser = await import('./browser.js');

  toolsRegistry.set('browser_create_session', {
    name: 'browser_create_session',
    description: '创建浏览器会话并自动导航到指定URL（在右侧Playwright面板中显示，无头模式不弹窗）',
    parameters: {
      type: 'object',
      properties: {
        headless: { type: 'boolean', description: '是否无头模式（默认true，不弹出窗口）' },
        url: { type: 'string', description: '要导航的URL（可选，默认about:blank）' },
        sessionKey: { type: 'string', description: '会话标识键（默认default）' },
      },
    },
    execute: async ({ headless = true, url, sessionKey = 'default' }) => {
      try {
        const result = await browser.createBrowserSession(headless);
        browserSessions.set(sessionKey, result.id);

        // 如果提供了URL，自动导航
        if (url) {
          await browser.navigateTo(result.id, url);
          return {
            success: true,
            sessionId: result.id,
            url: url,
            message: `浏览器会话已创建，并导航到 ${url}，请在右侧面板查看`,
          };
        }

        return {
          success: true,
          sessionId: result.id,
          url: result.url,
          message: '浏览器会话已创建，请在右侧面板查看',
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  toolsRegistry.set('browser_close_session', {
    name: 'browser_close_session',
    description: '关闭浏览器会话',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '浏览器会话ID' },
        sessionKey: { type: 'string', description: '会话标识键（默认default）' },
      },
    },
    execute: async ({ sessionId, sessionKey = 'default' }) => {
      try {
        const id = sessionId || browserSessions.get(sessionKey);
        if (id) {
          await browser.closeSession(id);
          browserSessions.delete(sessionKey);
        }
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  toolsRegistry.set('browser_navigate', {
    name: 'browser_navigate',
    description: '打开网页或导航到新地址（使用内置浏览器面板，不弹窗）',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '目标网址' },
        sessionId: { type: 'string', description: '浏览器会话ID（留空则使用AI共享会话）' },
        sessionKey: { type: 'string', description: '会话标识键（默认default）' },
      },
      required: ['url'],
    },
    execute: async ({ url, sessionId, sessionKey = 'default' }) => {
      try {
        let browserSessionId = sessionId || getAIBrowserSession(browser, sessionKey);
        if (!browserSessionId) {
          const result = await browser.createBrowserSession(true);
          browserSessions.set(sessionKey, result.id);
          browserSessionId = result.id;
        }

        const result = await browser.navigateTo(browserSessionId, url);

        // 截图展示当前页面
        let screenshotBase64 = '';
        try {
          screenshotBase64 = await browser.screenshot(browserSessionId, false);
        } catch {
          // 截图失败不影响导航结果
        }

        return {
          success: true,
          sessionId: browserSessionId,
          ...result,
          screenshot: screenshotBase64 ? `data:image/png;base64,${screenshotBase64}` : undefined,
          message: `已导航到 ${url}，请在右侧面板查看浏览器`,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  toolsRegistry.set('browser_screenshot', {
    name: 'browser_screenshot',
    description: '对当前页面截图（使用AI共享会话）',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '浏览器会话ID（留空则使用AI共享会话）' },
        sessionKey: { type: 'string', description: '会话标识键（默认default）' },
        fullPage: { type: 'boolean', description: '是否截取整页' },
      },
    },
    execute: async ({ sessionId, sessionKey = 'default', fullPage = false }) => {
      try {
        let browserSessionId = sessionId || getAIBrowserSession(browser, sessionKey);
        if (!browserSessionId) {
          return { success: false, error: '没有活动的浏览器会话，请先创建会话或导航到页面' };
        }
        const base64 = await browser.screenshot(browserSessionId, fullPage);
        return {
          success: true,
          sessionId: browserSessionId,
          screenshot: base64,
          size: base64.length,
          fullPage,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  toolsRegistry.set('browser_click', {
    name: 'browser_click',
    description: '点击页面元素（使用AI共享会话）',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '浏览器会话ID（留空则使用AI共享会话）' },
        sessionKey: { type: 'string', description: '会话标识键（默认default）' },
        selector: { type: 'string', description: 'CSS 选择器或 XPath' },
      },
      required: ['selector'],
    },
    execute: async ({ sessionId, sessionKey = 'default', selector }) => {
      try {
        let browserSessionId = sessionId || getAIBrowserSession(browser, sessionKey);
        if (!browserSessionId) {
          return { success: false, error: '没有活动的浏览器会话，请先创建会话或导航到页面' };
        }
        await browser.click(browserSessionId, selector);
        return { success: true, sessionId: browserSessionId, selector, action: 'click' };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  toolsRegistry.set('browser_fill', {
    name: 'browser_fill',
    description: '填写表单输入框（使用AI共享会话）',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '浏览器会话ID（留空则使用AI共享会话）' },
        sessionKey: { type: 'string', description: '会话标识键（默认default）' },
        selector: { type: 'string', description: '输入框 CSS 选择器' },
        value: { type: 'string', description: '要填写的值' },
      },
      required: ['selector', 'value'],
    },
    execute: async ({ sessionId, sessionKey = 'default', selector, value }) => {
      try {
        let browserSessionId = sessionId || getAIBrowserSession(browser, sessionKey);
        if (!browserSessionId) {
          return { success: false, error: '没有活动的浏览器会话，请先创建会话或导航到页面' };
        }
        await browser.fill(browserSessionId, selector, value);
        return { success: true, sessionId: browserSessionId, selector, value, action: 'fill' };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  toolsRegistry.set('browser_evaluate', {
    name: 'browser_evaluate',
    description: '在页面中执行 JavaScript 代码',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '浏览器会话ID' },
        code: { type: 'string', description: '要执行的 JavaScript 代码' },
      },
      required: ['sessionId', 'code'],
    },
    execute: async ({ sessionId, code }) => {
      try {
        const result = await browser.executeScript(sessionId, code);
        return { success: true, sessionId, result };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  toolsRegistry.set('browser_get_content', {
    name: 'browser_get_content',
    description: '获取页面文本内容或 HTML',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '浏览器会话ID' },
        type: { type: 'string', description: '内容类型', enum: ['text', 'html', 'url', 'title'] },
      },
      required: ['sessionId'],
    },
    execute: async ({ sessionId, type = 'text' }) => {
      try {
        let result: string;
        switch (type) {
          case 'text': result = await browser.getText(sessionId); break;
          case 'html': result = await browser.getHtml(sessionId); break;
          case 'url':
          case 'title': {
            const info = await browser.getPageInfo(sessionId);
            result = type === 'url' ? info.url : info.title;
            break;
          }
          default: throw new Error('未知类型');
        }
        return { success: true, sessionId, type, content: result };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  // 新增：页面快照（带元素引用 @e1, @e2）
  toolsRegistry.set('browser_snapshot', {
    name: 'browser_snapshot',
    description: '获取页面快照，返回可交互元素列表（带@e1, @e2引用），用于后续操作',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '浏览器会话ID（留空则使用AI共享会话）' },
        sessionKey: { type: 'string', description: '会话标识键（默认default）' },
        interactive: { type: 'boolean', description: '仅显示可交互元素（默认true）' },
      },
    },
    execute: async ({ sessionId, sessionKey = 'default', interactive = true }) => {
      try {
        let browserSessionId = sessionId || getAIBrowserSession(browser, sessionKey);
        if (!browserSessionId) {
          return { success: false, error: '没有活动的浏览器会话，请先创建会话或导航到页面' };
        }
        const snapshot = await browser.getSnapshot(browserSessionId, { interactive, compact: true });
        return {
          success: true,
          sessionId: browserSessionId,
          title: snapshot.title,
          url: snapshot.url,
          elements: snapshot.elements,
          text: snapshot.text.slice(0, 500),
          message: `页面快照已获取，共 ${snapshot.elements.length} 个元素。使用 @e1, @e2 等引用操作元素。`,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  // 新增：按键操作
  toolsRegistry.set('browser_press', {
    name: 'browser_press',
    description: '按键操作（Enter, Tab, Escape, Control+a 等）',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '浏览器会话ID（留空则使用AI共享会话）' },
        sessionKey: { type: 'string', description: '会话标识键（默认default）' },
        key: { type: 'string', description: '按键名称' },
      },
      required: ['key'],
    },
    execute: async ({ sessionId, sessionKey = 'default', key }) => {
      try {
        let browserSessionId = sessionId || getAIBrowserSession(browser, sessionKey);
        if (!browserSessionId) {
          return { success: false, error: '没有活动的浏览器会话' };
        }
        await browser.pressKey(browserSessionId, key);
        return { success: true, sessionId: browserSessionId, key, action: 'press' };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  // 新增：等待元素
  toolsRegistry.set('browser_wait', {
    name: 'browser_wait',
    description: '等待元素出现或等待指定时间',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '浏览器会话ID（留空则使用AI共享会话）' },
        sessionKey: { type: 'string', description: '会话标识键（默认default）' },
        selector: { type: 'string', description: 'CSS选择器（留空则按时间等待）' },
        timeout: { type: 'number', description: '超时时间（毫秒，默认10000）' },
      },
    },
    execute: async ({ sessionId, sessionKey = 'default', selector, timeout = 10000 }) => {
      try {
        let browserSessionId = sessionId || getAIBrowserSession(browser, sessionKey);
        if (!browserSessionId) {
          return { success: false, error: '没有活动的浏览器会话' };
        }
        if (selector) {
          await browser.waitForSelector(browserSessionId, selector, timeout);
          return { success: true, sessionId: browserSessionId, selector, action: 'wait_for_selector' };
        } else {
          await browser.waitForTimeout(browserSessionId, timeout);
          return { success: true, sessionId: browserSessionId, ms: timeout, action: 'wait' };
        }
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  // 新增：高亮元素
  toolsRegistry.set('browser_highlight', {
    name: 'browser_highlight',
    description: '高亮页面元素（用于视觉调试）',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '浏览器会话ID（留空则使用AI共享会话）' },
        sessionKey: { type: 'string', description: '会话标识键（默认default）' },
        selector: { type: 'string', description: 'CSS选择器或@e引用' },
      },
      required: ['selector'],
    },
    execute: async ({ sessionId, sessionKey = 'default', selector }) => {
      try {
        let browserSessionId = sessionId || getAIBrowserSession(browser, sessionKey);
        if (!browserSessionId) {
          return { success: false, error: '没有活动的浏览器会话' };
        }
        await browser.highlightElement(browserSessionId, selector);
        return { success: true, sessionId: browserSessionId, selector, action: 'highlight' };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  // 新增：返回/前进/刷新
  toolsRegistry.set('browser_go_back', {
    name: 'browser_go_back',
    description: '浏览器返回上一页',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '浏览器会话ID（留空则使用AI共享会话）' },
        sessionKey: { type: 'string', description: '会话标识键（默认default）' },
      },
    },
    execute: async ({ sessionId, sessionKey = 'default' }) => {
      try {
        let browserSessionId = sessionId || getAIBrowserSession(browser, sessionKey);
        if (!browserSessionId) {
          return { success: false, error: '没有活动的浏览器会话' };
        }
        const result = await browser.goBack(browserSessionId);
        return { success: true, sessionId: browserSessionId, ...result, action: 'go_back' };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  toolsRegistry.set('browser_reload', {
    name: 'browser_reload',
    description: '刷新当前页面',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '浏览器会话ID（留空则使用AI共享会话）' },
        sessionKey: { type: 'string', description: '会话标识键（默认default）' },
      },
    },
    execute: async ({ sessionId, sessionKey = 'default' }) => {
      try {
        let browserSessionId = sessionId || getAIBrowserSession(browser, sessionKey);
        if (!browserSessionId) {
          return { success: false, error: '没有活动的浏览器会话' };
        }
        const result = await browser.reload(browserSessionId);
        return { success: true, sessionId: browserSessionId, ...result, action: 'reload' };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  // 新增：滚动
  toolsRegistry.set('browser_scroll', {
    name: 'browser_scroll',
    description: '滚动页面',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '浏览器会话ID（留空则使用AI共享会话）' },
        sessionKey: { type: 'string', description: '会话标识键（默认default）' },
        direction: { type: 'string', description: '滚动方向', enum: ['up', 'down', 'left', 'right'] },
        pixels: { type: 'number', description: '滚动像素（默认500）' },
      },
      required: ['direction'],
    },
    execute: async ({ sessionId, sessionKey = 'default', direction, pixels = 500 }) => {
      try {
        let browserSessionId = sessionId || getAIBrowserSession(browser, sessionKey);
        if (!browserSessionId) {
          return { success: false, error: '没有活动的浏览器会话' };
        }
        await browser.scroll(browserSessionId, direction, pixels);
        return { success: true, sessionId: browserSessionId, direction, pixels, action: 'scroll' };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });
}

// 初始化所有工具
export async function initMCPTools() {
  registerFileTools();
  registerGitTools();
  registerShellTools();
  registerApiTools();
  registerDbTools();
  registerCodeTools();
  registerSystemTools();
  registerAdvancedFileTools();
  registerWebSearchTool();
  registerTodoTools();
  registerGlobTool();
  registerTaskTools();
  registerAgentTools();
  registerPlanTools();
  registerAskUserTool();
  await registerBrowserTools();

  registerLSPTools();
  registerNotebookTools();
  registerCronTools();
  registerMonitorTools();
  registerCrewTools();
  registerCodeSemanticSearchTools(toolsRegistry);
  registerAuditTools();
  registerSensitiveWordTools();

  console.log(`[MCP] 已注册 ${toolsRegistry.size} 个工具`);
}

export function getMCPTool(name: string): MCPTool | undefined {
  return toolsRegistry.get(name);
}

export function listMCPTools(): Array<{ name: string; description: string; parameters: any }> {
  return Array.from(toolsRegistry.values()).map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}

export function executeMCPTool(name: string, args: Record<string, any>): Promise<any> {
  const tool = toolsRegistry.get(name);
  if (!tool) {
    return Promise.resolve({ success: false, error: `工具不存在: ${name}` });
  }
  return tool.execute(args);
}

// ============ 高级文件工具（FileEditTool / GlobTool） ============

function registerAdvancedFileTools() {
  // FileEditTool: 精准的Search/Replace文件编辑（参考claude-code）
  toolsRegistry.set('file_edit', {
    name: 'file_edit',
    description: '精准编辑文件内容，使用Search/Replace方式，只修改匹配的部分，保留文件其余内容不变。支持多行匹配和模糊匹配。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径（绝对路径或相对于工作目录）' },
        old_string: { type: 'string', description: '要替换的旧内容（必须精确匹配文件中的内容）' },
        new_string: { type: 'string', description: '替换后的新内容' },
        expected_replacements: { type: 'number', description: '预期替换次数（默认1，设为0表示替换所有）' },
      },
      required: ['path', 'old_string', 'new_string'],
    },
    execute: async ({ path, old_string, new_string, expected_replacements = 1 }) => {
      try {
        const content = await readFile(path, 'utf-8');
        const occurrences = content.split(old_string).length - 1;

        if (occurrences === 0) {
          // 尝试模糊匹配（忽略首尾空白差异）
          const trimmedOld = old_string.trim();
          const fuzzyOccurrences = content.split(trimmedOld).length - 1;
          if (fuzzyOccurrences > 0) {
            return {
              success: false,
              error: `未找到精确匹配内容。找到 ${fuzzyOccurrences} 个模糊匹配（忽略空白差异）。请提供更精确的 old_string。`,
              hint: 'old_string必须与文件中的内容完全一致，包括缩进和换行',
            };
          }
          return {
            success: false,
            error: '未找到匹配内容',
            hint: '请确保old_string与文件中的内容完全一致',
          };
        }

        if (expected_replacements > 0 && occurrences !== expected_replacements) {
          return {
            success: false,
            error: `预期替换${expected_replacements}次，但找到${occurrences}次匹配`,
            hint: `请调整old_string使其唯一，或设置expected_replacements为${occurrences}`,
          };
        }

        let newContent: string;
        if (expected_replacements === 0) {
          newContent = content.split(old_string).join(new_string);
        } else {
          newContent = content.replace(old_string, new_string);
        }

        await writeFile(path, newContent, 'utf-8');

        // 生成diff信息
        const oldLines = content.split('\n');
        const newLines = newContent.split('\n');
        const lineChanges = newLines.length - oldLines.length;

        return {
          success: true,
          path,
          replacements: expected_replacements === 0 ? occurrences : 1,
          lineChanges,
          oldSize: content.length,
          newSize: newContent.length,
          message: `成功替换${expected_replacements === 0 ? occurrences : 1}处内容，行数变化: ${lineChanges > 0 ? '+' : ''}${lineChanges}`,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  // FileInsertTool: 在指定位置插入内容
  toolsRegistry.set('file_insert', {
    name: 'file_insert',
    description: '在文件中指定位置插入内容（在某行之后或文件开头/结尾）',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径' },
        content: { type: 'string', description: '要插入的内容' },
        after: { type: 'string', description: '在此内容之后插入（与position二选一）' },
        position: { type: 'string', description: '插入位置: start(开头), end(结尾)', enum: ['start', 'end'] },
      },
      required: ['path', 'content'],
    },
    execute: async ({ path, content, after, position }) => {
      try {
        const fileContent = await readFile(path, 'utf-8');
        let newContent: string;

        if (after) {
          if (!fileContent.includes(after)) {
            return { success: false, error: `未找到插入锚点: ${after.slice(0, 50)}...` };
          }
          newContent = fileContent.replace(after, after + content);
        } else if (position === 'start') {
          newContent = content + fileContent;
        } else {
          newContent = fileContent + content;
        }

        await writeFile(path, newContent, 'utf-8');
        return {
          success: true,
          path,
          insertedLength: content.length,
          message: `成功插入${content.length}个字符`,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });
}

// ============ GlobTool: 文件模式匹配 ============

function registerGlobTool() {
  toolsRegistry.set('glob', {
    name: 'glob',
    description: '使用glob模式匹配查找文件（如 **/*.ts, src/**/*.tsx）',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'glob匹配模式，如 "**/*.ts" "src/**/*.tsx"' },
        path: { type: 'string', description: '搜索目录（默认当前工作目录）' },
        ignore: { type: 'string', description: '忽略模式，逗号分隔（如 "node_modules,dist"）' },
      },
      required: ['pattern'],
    },
    execute: async ({ pattern, path: searchPath = '.', ignore = 'node_modules,dist,.git' }) => {
      try {
        const ignoreList = ignore.split(',').map((s: string) => s.trim()).filter(Boolean);
        const files: string[] = await new Promise((resolve, reject) => {
          glob(pattern, {
            cwd: searchPath,
            ignore: ignoreList,
            absolute: false,
            nodir: true,
          }, (err: any, matches: string[]) => {
            if (err) reject(err);
            else resolve(matches);
          });
        });

        return {
          success: true,
          pattern,
          path: searchPath,
          count: files.length,
          files: files.slice(0, 100),
          truncated: files.length > 100,
          message: `找到${files.length}个文件${files.length > 100 ? '（已截断显示前100个）' : ''}`,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });
}

// ============ WebSearchTool: 网络搜索 ============

function registerWebSearchTool() {
  toolsRegistry.set('web_search', {
    name: 'web_search',
    description: '使用搜索引擎搜索网络内容，获取实时信息（新闻、文档、技术资料等）',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
        max_results: { type: 'number', description: '最大结果数（默认5）' },
        allowed_domains: { type: 'string', description: '允许的域名，逗号分隔（可选）' },
        blocked_domains: { type: 'string', description: '屏蔽的域名，逗号分隔（可选）' },
      },
      required: ['query'],
    },
    execute: async ({ query, max_results = 5, allowed_domains, blocked_domains }) => {
      try {
        // 使用 SerpAPI 进行搜索（需要 API Key）
        const apiKey = process.env.SERPAPI_KEY;
        if (apiKey) {
          const serpUrl = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&engine=google&api_key=${apiKey}&num=${max_results}`;
          const response = await fetch(serpUrl, { signal: AbortSignal.timeout(15000) });
          if (response.ok) {
            const data = await response.json();
            const organic = data.organic_results || [];
            const results = organic.slice(0, max_results).map((r: any) => ({
              title: r.title || '',
              url: r.link || '',
              snippet: r.snippet || '',
            }));
            return {
              success: true,
              query,
              resultCount: results.length,
              results,
              source: 'serpapi',
              message: `搜索"${query}"找到${results.length}个结果`,
            };
          }
        }

        // 回退: 使用 Bing 搜索（无需API Key，中国大陆可用）
        const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
        const response = await fetch(searchUrl, {
          signal: AbortSignal.timeout(10000),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          },
        });

        if (!response.ok) {
          return { success: false, error: `搜索请求失败: ${response.status}` };
        }

        const html = await response.text();

        // 解析 Bing 搜索结果 (class="b_algo")
        const results: Array<{ title: string; url: string; snippet: string }> = [];
        const algoRegex = /<li class="b_algo"[^>]*>(.*?)<\/li>/gs;
        let match;

        while ((match = algoRegex.exec(html)) !== null && results.length < max_results) {
          const block = match[1];
          const titleMatch = block.match(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/s);
          const snippetMatch = block.match(/<p[^>]*>(.*?)<\/p>/s) || block.match(/<span[^>]*>(.*?)<\/span>/s);

          if (!titleMatch) continue;

          const rawUrl = titleMatch[1];
          const title = titleMatch[2].replace(/<[^>]*>/g, '').trim();
          const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]*>/g, '').trim() : '';

          // 域名过滤
          try {
            const domain = new URL(rawUrl).hostname;
            if (blocked_domains) {
              const blocked = blocked_domains.split(',').map((d: string) => d.trim());
              if (blocked.some((b: string) => domain.includes(b))) continue;
            }
            if (allowed_domains) {
              const allowed = allowed_domains.split(',').map((d: string) => d.trim());
              if (!allowed.some((a: string) => domain.includes(a))) continue;
            }
          } catch {
            // URL解析失败，跳过过滤
          }

          results.push({ title, url: rawUrl, snippet });
        }

        return {
          success: true,
          query,
          resultCount: results.length,
          results,
          source: 'bing',
          message: `搜索"${query}"找到${results.length}个结果`,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  // WebFetchTool: 获取网页内容
  toolsRegistry.set('web_fetch', {
    name: 'web_fetch',
    description: '获取指定URL的网页内容，支持提取正文和标题',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '目标URL' },
        extract_text: { type: 'boolean', description: '是否提取纯文本（默认true）' },
        max_length: { type: 'number', description: '最大内容长度（默认5000）' },
      },
      required: ['url'],
    },
    execute: async ({ url, extract_text = true, max_length = 5000 }) => {
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });

        if (!response.ok) {
          return { success: false, error: `请求失败: ${response.status}` };
        }

        const html = await response.text();
        const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : '';

        let content: string;
        if (extract_text) {
          // 移除script和style标签
          let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
          text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
          // 移除所有HTML标签
          text = text.replace(/<[^>]*>/g, ' ');
          // 清理空白
          text = text.replace(/\s+/g, ' ').trim();
          content = text.slice(0, max_length);
        } else {
          content = html.slice(0, max_length);
        }

        return {
          success: true,
          url,
          title,
          content,
          contentLength: content.length,
          truncated: html.length > max_length,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });
}

// ============ TodoWriteTool: 任务追踪 ============

interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'high' | 'medium' | 'low';
  createdAt: string;
  completedAt?: string;
  dependsOn?: string[];
}

const todoStore = new Map<string, TodoItem[]>();

function registerTodoTools() {
  toolsRegistry.set('todo_write', {
    name: 'todo_write',
    description: '创建或更新待办事项列表。用于追踪多步骤任务的进度。每个任务有id、内容、状态和优先级。',
    parameters: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          description: '待办事项列表',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: '任务唯一标识' },
              content: { type: 'string', description: '任务内容' },
              status: { type: 'string', description: '状态', enum: ['pending', 'in_progress', 'completed'] },
              priority: { type: 'string', description: '优先级', enum: ['high', 'medium', 'low'] },
              dependsOn: { type: 'array', description: '依赖的任务ID列表', items: { type: 'string' } },
            },
            required: ['id', 'content', 'status'],
          },
        },
        sessionKey: { type: 'string', description: '会话标识（默认default）' },
      },
      required: ['todos'],
    },
    execute: async ({ todos, sessionKey = 'default' }) => {
      try {
        const oldTodos = todoStore.get(sessionKey) || [];
        const newTodos: TodoItem[] = todos.map((t: any) => ({
          id: t.id,
          content: t.content,
          status: t.status,
          priority: t.priority || 'medium',
          createdAt: oldTodos.find((o: TodoItem) => o.id === t.id)?.createdAt || new Date().toISOString(),
          completedAt: t.status === 'completed' ? new Date().toISOString() : undefined,
          dependsOn: t.dependsOn || [],
        }));

        todoStore.set(sessionKey, newTodos);

        const completed = newTodos.filter((t: TodoItem) => t.status === 'completed').length;
        const total = newTodos.length;
        const allDone = completed === total && total > 0;

        return {
          success: true,
          sessionKey,
          total,
          completed,
          pending: total - completed,
          allDone,
          todos: newTodos,
          message: allDone ? '所有任务已完成！' : `任务进度: ${completed}/${total}`,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  toolsRegistry.set('todo_read', {
    name: 'todo_read',
    description: '读取当前待办事项列表',
    parameters: {
      type: 'object',
      properties: {
        sessionKey: { type: 'string', description: '会话标识（默认default）' },
      },
    },
    execute: async ({ sessionKey = 'default' }) => {
      const todos = todoStore.get(sessionKey) || [];
      return {
        success: true,
        sessionKey,
        total: todos.length,
        completed: todos.filter((t: TodoItem) => t.status === 'completed').length,
        todos,
      };
    },
  });
}

// ============ Task管理工具 ============

interface TaskItem {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  result?: string;
  parentId?: string;
}

const taskStore = new Map<string, TaskItem[]>();

function registerTaskTools() {
  toolsRegistry.set('task_create', {
    name: 'task_create',
    description: '创建新任务，用于分解复杂工作为子任务。支持父子任务关系。',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '任务标题' },
        description: { type: 'string', description: '任务描述' },
        parentId: { type: 'string', description: '父任务ID（可选）' },
        sessionKey: { type: 'string', description: '会话标识' },
      },
      required: ['title'],
    },
    execute: async ({ title, description, parentId, sessionKey = 'default' }) => {
      try {
        const tasks = taskStore.get(sessionKey) || [];
        const task: TaskItem = {
          id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          title,
          description,
          status: 'pending',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          parentId,
        };
        tasks.push(task);
        taskStore.set(sessionKey, tasks);
        return { success: true, task, message: `任务已创建: ${title}` };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  toolsRegistry.set('task_list', {
    name: 'task_list',
    description: '列出所有任务及其状态',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', description: '过滤状态', enum: ['pending', 'running', 'completed', 'failed'] },
        sessionKey: { type: 'string', description: '会话标识' },
      },
    },
    execute: async ({ status, sessionKey = 'default' }) => {
      let tasks = taskStore.get(sessionKey) || [];
      if (status) {
        tasks = tasks.filter((t: TaskItem) => t.status === status);
      }
      return {
        success: true,
        count: tasks.length,
        tasks: tasks.map((t: TaskItem) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          createdAt: t.createdAt,
          completedAt: t.completedAt,
          parentId: t.parentId,
        })),
      };
    },
  });

  toolsRegistry.set('task_update', {
    name: 'task_update',
    description: '更新任务状态或结果',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: '任务ID' },
        status: { type: 'string', description: '新状态', enum: ['pending', 'running', 'completed', 'failed'] },
        result: { type: 'string', description: '任务结果' },
        sessionKey: { type: 'string', description: '会话标识' },
      },
      required: ['taskId'],
    },
    execute: async ({ taskId, status, result, sessionKey = 'default' }) => {
      const tasks = taskStore.get(sessionKey) || [];
      const task = tasks.find((t: TaskItem) => t.id === taskId);
      if (!task) {
        return { success: false, error: `任务不存在: ${taskId}` };
      }
      if (status) task.status = status;
      if (result) task.result = result;
      task.updatedAt = new Date().toISOString();
      if (status === 'completed' || status === 'failed') {
        task.completedAt = new Date().toISOString();
      }
      taskStore.set(sessionKey, tasks);
      return { success: true, task, message: `任务已更新: ${task.title} -> ${status || '未变更'}` };
    },
  });

  toolsRegistry.set('task_get', {
    name: 'task_get',
    description: '获取单个任务的详细信息',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: '任务ID' },
        sessionKey: { type: 'string', description: '会话标识' },
      },
      required: ['taskId'],
    },
    execute: async ({ taskId, sessionKey = 'default' }) => {
      const tasks = taskStore.get(sessionKey) || [];
      const task = tasks.find((t: TaskItem) => t.id === taskId);
      if (!task) {
        return { success: false, error: `任务不存在: ${taskId}` };
      }
      // 获取子任务
      const subtasks = tasks.filter((t: TaskItem) => t.parentId === taskId);
      return { success: true, task, subtasks };
    },
  });
}

// ============ AgentTool: 子Agent委派（接入百炼LLM） ============

interface AgentSession {
  id: string;
  type: string;
  description: string;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  result?: string;
  createdAt: string;
  completedAt?: string;
  parentSession?: string;
  messages?: Array<AgentMessage>;
  stopSignal?: boolean;
}

interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

const agentStore = new Map<string, AgentSession[]>();

// Agent执行循环 - ReAct模式：思考→行动→观察→循环
async function runAgentLoop(agentId: string) {
  const agents = agentStore.get('default') || [];
  const agent = agents.find((a: AgentSession) => a.id === agentId);
  if (!agent) return;

  const MAX_STEPS = 10;
  let step = 0;

  try {
    // 构建可用工具定义（供LLM选择）
    const availableTools = Array.from(toolsRegistry.entries())
      .filter(([toolName]) => !['agent_run', 'agent_status', 'agent_list', 'agent_stop'].includes(toolName))
      .slice(0, 20)
      .map(([_name, tool]) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }));

    while (step < MAX_STEPS) {
      step++;

      // 检查停止信号
      if (agent.stopSignal) {
        agent.status = 'stopped';
        agent.result = 'Agent被用户停止';
        agent.completedAt = new Date().toISOString();
        return;
      }

      // 调用LLM
      const data = await callAgentLLMRaw(agent.messages!, availableTools);
      const message = data.choices?.[0]?.message;

      if (!message) {
        agent.result = 'LLM返回空消息';
        agent.status = 'failed';
        break;
      }

      // 添加assistant消息（包含tool_calls，如果有）
      const assistantMsg: AgentMessage = {
        role: 'assistant',
        content: message.content || '',
      };
      if (message.tool_calls && message.tool_calls.length > 0) {
        assistantMsg.tool_calls = message.tool_calls.map((tc: any) => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.function?.name || '',
            arguments: tc.function?.arguments || '{}',
          },
        }));
      }
      agent.messages!.push(assistantMsg);

      // 检查是否有工具调用
      const toolCalls = message.tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        // 没有工具调用，任务完成
        agent.result = message.content || '';
        agent.status = 'completed';
        break;
      }

      // 执行工具调用
      for (const tc of toolCalls) {
        const toolCallId = tc.id;
        const toolName = tc.function?.name;
        let toolArgs: any = {};
        try {
          toolArgs = JSON.parse(tc.function?.arguments || '{}');
        } catch {
          toolArgs = {};
        }

        let toolResult: any;
        let toolSuccess = true;
        try {
          const tool = toolsRegistry.get(toolName);
          if (tool) {
            toolResult = await tool.execute(toolArgs);
          } else {
            toolResult = { error: `工具不存在: ${toolName}` };
            toolSuccess = false;
          }
        } catch (err: any) {
          toolResult = { error: err.message };
          toolSuccess = false;
        }

        // 构建工具结果内容（包含成功/失败状态）
        const resultContent = typeof toolResult === 'string'
          ? toolResult
          : JSON.stringify({ success: toolSuccess, ...toolResult }).slice(0, 4000);

        // 添加工具结果到消息历史（必须包含tool_call_id）
        agent.messages!.push({
          role: 'tool',
          content: resultContent,
          tool_call_id: toolCallId,
        });
      }
    }

    if (step >= MAX_STEPS) {
      agent.result = agent.messages!.filter(m => m.role === 'assistant').pop()?.content || '达到最大步数限制';
      agent.status = 'completed';
    }

    agent.completedAt = new Date().toISOString();
  } catch (err: any) {
    agent.status = 'failed';
    agent.result = `执行失败: ${err.message}`;
    agent.completedAt = new Date().toISOString();
  }
}

// 同步Agent消息到记忆系统
function syncAgentMessagesToMemory(agent: AgentSession): void {
  const memory = getAgentMemory(agent.id);
  if (!agent.messages) return;

  for (const msg of agent.messages) {
    // 简单去重：检查内容是否已存在
    const isDuplicate = memory.getAll().some(
      m => m.role === msg.role && m.content === msg.content
    );
    if (!isDuplicate) {
      memory.add({
        role: msg.role,
        content: msg.content,
        causeBy: msg.role === 'tool' ? 'tool_execution' : 'llm_response',
      });
    }
  }
}

// 调用LLM - 返回完整响应（含tool_calls）
async function callAgentLLMRaw(messages: Array<{ role: string; content: string }>, tools?: any[]): Promise<any> {
  const provider = getDefaultProvider();
  if (!provider) {
    throw new Error('没有可用的AI Provider，请先配置百炼或其他LLM');
  }

  // 隐私保护：脱敏敏感信息
  const sanitizedMessages = defaultPrivacyGuard.sanitizeMessages(messages);

  const body: any = {
    model: provider.model,
    messages: sanitizedMessages,
    temperature: provider.temperature ?? 0.7,
    max_tokens: provider.maxTokens ?? 4096,
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  const resp = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(provider.timeout ?? 60000),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => `HTTP ${resp.status}`);
    throw new Error(`LLM调用失败: ${errText}`);
  }

  return await resp.json() as any;
}

function registerAgentTools() {
  toolsRegistry.set('agent_run', {
    name: 'agent_run',
    description: '委派子Agent执行特定任务。使用配置的百炼/通义千问等大模型进行真实推理。子Agent可以调用其他MCP工具完成任务。支持同步等待模式（sync=true时阻塞直到完成）。',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Agent类型（如: Explore, Verify, CodeReview, Test）' },
        description: { type: 'string', description: '任务描述' },
        instructions: { type: 'string', description: '详细指令' },
        parentSession: { type: 'string', description: '父会话ID（可选）' },
        sessionKey: { type: 'string', description: '会话标识' },
        sync: { type: 'boolean', description: '是否同步等待结果（默认false，异步返回）' },
        timeout: { type: 'number', description: '同步等待超时毫秒（默认60000）' },
      },
      required: ['type', 'description'],
    },
    execute: async ({ type, description, instructions, parentSession, sessionKey = 'default', sync = false }) => {
      try {
        const agents = agentStore.get(sessionKey) || [];
        const agentId = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

        // 创建Agent记忆系统
        const memory = getAgentMemory(agentId);
        memory.add({
          role: 'system',
          content: `你是一个${type}类型的AI Agent。${instructions || '请根据任务描述，分析需求并给出详细的执行方案。'}\n\n你可以使用以下工具来完成任务:\n${Array.from(toolsRegistry.keys()).filter(k => !['agent_run', 'agent_status', 'agent_list', 'agent_stop'].includes(k)).slice(0, 15).join(', ')}`,
          causeBy: 'agent_init',
        });
        memory.add({
          role: 'user',
          content: description,
          causeBy: 'user_input',
        });

        const agent: AgentSession = {
          id: agentId,
          type,
          description,
          status: 'running',
          createdAt: new Date().toISOString(),
          parentSession,
          messages: memory.toLLMMessages() as AgentMessage[],
        };
        agents.push(agent);
        agentStore.set(sessionKey, agents);

        if (sync) {
          // 同步模式：等待Agent执行完成
          await runAgentLoop(agent.id);
          // 同步完成后，将最终消息同步回记忆系统
          syncAgentMessagesToMemory(agent);
          return {
            success: true,
            agentId: agent.id,
            type,
            description,
            status: agent.status,
            result: agent.result,
            memorySummary: memory.generateSummary(),
            message: `子Agent已完成: ${type} - ${description}`,
          };
        }

        // 异步模式：启动后台执行，立即返回
        runAgentLoop(agent.id).catch(err => {
          console.error(`[Agent ${agent.id}] 执行失败:`, err.message);
        });

        return {
          success: true,
          agentId: agent.id,
          type,
          description,
          status: 'running',
          memorySummary: memory.generateSummary(),
          message: `子Agent已启动: ${type} - ${description}（正在调用百炼LLM）`,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  toolsRegistry.set('agent_status', {
    name: 'agent_status',
    description: '获取子Agent的执行状态',
    parameters: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent ID' },
        sessionKey: { type: 'string', description: '会话标识' },
      },
      required: ['agentId'],
    },
    execute: async ({ agentId, sessionKey = 'default' }) => {
      const agents = agentStore.get(sessionKey) || [];
      const agent = agents.find((a: AgentSession) => a.id === agentId);
      if (!agent) {
        return { success: false, error: `Agent不存在: ${agentId}` };
      }
      return {
        success: true,
        agent: {
          id: agent.id,
          type: agent.type,
          description: agent.description,
          status: agent.status,
          createdAt: agent.createdAt,
          completedAt: agent.completedAt,
          result: agent.result,
        },
      };
    },
  });

  toolsRegistry.set('agent_stop', {
    name: 'agent_stop',
    description: '停止正在运行的子Agent',
    parameters: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent ID' },
        sessionKey: { type: 'string', description: '会话标识' },
      },
      required: ['agentId'],
    },
    execute: async ({ agentId, sessionKey = 'default' }) => {
      const agents = agentStore.get(sessionKey) || [];
      const agent = agents.find((a: AgentSession) => a.id === agentId);
      if (!agent) {
        return { success: false, error: `Agent不存在: ${agentId}` };
      }
      if (agent.status !== 'running') {
        return { success: false, error: `Agent当前状态为${agent.status}，无法停止` };
      }
      agent.stopSignal = true;
      return {
        success: true,
        agentId,
        message: `已发送停止信号给Agent ${agentId}，将在下一步循环中终止`,
      };
    },
  });

  toolsRegistry.set('agent_list', {
    name: 'agent_list',
    description: '列出所有子Agent',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', description: '过滤状态', enum: ['running', 'completed', 'failed', 'stopped'] },
        sessionKey: { type: 'string', description: '会话标识' },
      },
    },
    execute: async ({ status, sessionKey = 'default' }) => {
      let agents = agentStore.get(sessionKey) || [];
      if (status) {
        agents = agents.filter((a: AgentSession) => a.status === status);
      }
      return {
        success: true,
        count: agents.length,
        agents: agents.map((a: AgentSession) => ({
          id: a.id,
          type: a.type,
          description: a.description,
          status: a.status,
          createdAt: a.createdAt,
          result: a.result ? a.result.slice(0, 200) + '...' : undefined,
        })),
      };
    },
  });

  toolsRegistry.set('agent_memory', {
    name: 'agent_memory',
    description: '获取Agent的记忆摘要、工作记忆或搜索记忆内容',
    parameters: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent ID' },
        action: { type: 'string', description: '操作类型', enum: ['summary', 'working', 'search', 'all'] },
        keyword: { type: 'string', description: '搜索关键词（action=search时必填）' },
        k: { type: 'number', description: '返回最近K条记忆（默认20）' },
      },
      required: ['agentId', 'action'],
    },
    execute: async ({ agentId, action, keyword, k = 20 }) => {
      const memory = getAgentMemory(agentId);

      switch (action) {
        case 'summary':
          return {
            success: true,
            agentId,
            summary: memory.generateSummary(),
            totalMessages: memory.count(),
          };
        case 'working':
          return {
            success: true,
            agentId,
            messages: memory.getWorkingMemory(k),
            count: memory.count(),
          };
        case 'search':
          if (!keyword) {
            return { success: false, error: '搜索操作需要提供keyword参数' };
          }
          return {
            success: true,
            agentId,
            keyword,
            results: memory.searchByKeyword(keyword),
          };
        case 'all':
          return {
            success: true,
            agentId,
            messages: memory.getAll(),
            count: memory.count(),
          };
        default:
          return { success: false, error: `未知操作: ${action}` };
      }
    },
  });
}

// ============ PlanMode: 计划模式 ============

interface PlanStep {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  dependencies: string[];
  result?: string;
}

interface Plan {
  id: string;
  title: string;
  description: string;
  steps: PlanStep[];
  status: 'draft' | 'active' | 'completed' | 'cancelled';
  createdAt: string;
}

const planStore = new Map<string, Plan[]>();

function registerPlanTools() {
  toolsRegistry.set('plan_create', {
    name: 'plan_create',
    description: '创建执行计划。将复杂任务分解为多个步骤，每个步骤可以指定依赖关系。进入计划模式后按步骤执行。',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '计划标题' },
        description: { type: 'string', description: '计划描述' },
        steps: {
          type: 'array',
          description: '步骤列表',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: '步骤ID' },
              description: { type: 'string', description: '步骤描述' },
              dependencies: { type: 'array', description: '依赖的步骤ID', items: { type: 'string' } },
            },
            required: ['id', 'description'],
          },
        },
        sessionKey: { type: 'string', description: '会话标识' },
      },
      required: ['title', 'steps'],
    },
    execute: async ({ title, description, steps, sessionKey = 'default' }) => {
      try {
        const plans = planStore.get(sessionKey) || [];
        const plan: Plan = {
          id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          title,
          description: description || title,
          steps: steps.map((s: any) => ({
            id: s.id,
            description: s.description,
            status: 'pending',
            dependencies: s.dependencies || [],
          })),
          status: 'draft',
          createdAt: new Date().toISOString(),
        };
        plans.push(plan);
        planStore.set(sessionKey, plans);

        return {
          success: true,
          planId: plan.id,
          title,
          stepCount: plan.steps.length,
          steps: plan.steps,
          message: `计划已创建: ${title}，共${plan.steps.length}个步骤`,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  toolsRegistry.set('plan_execute', {
    name: 'plan_execute',
    description: '执行计划中的下一个可用步骤（依赖已完成的步骤）',
    parameters: {
      type: 'object',
      properties: {
        planId: { type: 'string', description: '计划ID' },
        stepId: { type: 'string', description: '指定步骤ID（可选，默认执行下一个可用步骤）' },
        result: { type: 'string', description: '步骤执行结果' },
        sessionKey: { type: 'string', description: '会话标识' },
      },
      required: ['planId'],
    },
    execute: async ({ planId, stepId, result, sessionKey = 'default' }) => {
      const plans = planStore.get(sessionKey) || [];
      const plan = plans.find((p: Plan) => p.id === planId);
      if (!plan) {
        return { success: false, error: `计划不存在: ${planId}` };
      }

      if (stepId) {
        const step = plan.steps.find((s: PlanStep) => s.id === stepId);
        if (!step) {
          return { success: false, error: `步骤不存在: ${stepId}` };
        }
        step.status = result ? 'completed' : 'in_progress';
        if (result) step.result = result;
      } else {
        // 找到下一个可执行的步骤（依赖已完成）
        const nextStep = plan.steps.find((s: PlanStep) => {
          if (s.status !== 'pending') return false;
          return s.dependencies.every((dep: string) => {
            const depStep = plan.steps.find((ds: PlanStep) => ds.id === dep);
            return depStep && depStep.status === 'completed';
          });
        });

        if (nextStep) {
          nextStep.status = 'in_progress';
          return {
            success: true,
            planId,
            currentStep: nextStep,
            message: `开始执行步骤: ${nextStep.description}`,
          };
        }
      }

      // 检查是否全部完成
      const allCompleted = plan.steps.every((s: PlanStep) => s.status === 'completed' || s.status === 'skipped');
      if (allCompleted) {
        plan.status = 'completed';
        return { success: true, planId, status: 'completed', message: '计划已全部完成！' };
      }

      return { success: true, planId, steps: plan.steps };
    },
  });

  toolsRegistry.set('plan_status', {
    name: 'plan_status',
    description: '获取计划的当前状态',
    parameters: {
      type: 'object',
      properties: {
        planId: { type: 'string', description: '计划ID' },
        sessionKey: { type: 'string', description: '会话标识' },
      },
      required: ['planId'],
    },
    execute: async ({ planId, sessionKey = 'default' }) => {
      const plans = planStore.get(sessionKey) || [];
      const plan = plans.find((p: Plan) => p.id === planId);
      if (!plan) {
        return { success: false, error: `计划不存在: ${planId}` };
      }
      const completed = plan.steps.filter((s: PlanStep) => s.status === 'completed').length;
      return {
        success: true,
        planId,
        title: plan.title,
        status: plan.status,
        progress: `${completed}/${plan.steps.length}`,
        steps: plan.steps,
      };
    },
  });
}

// ============ AskUserQuestionTool: 询问用户 ============

function registerAskUserTool() {
  toolsRegistry.set('ask_user', {
    name: 'ask_user',
    description: '向用户提出问题并等待回答。用于在需要澄清、确认或补充信息时使用。AI会在聊天界面显示问题并暂停等待用户回复。',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: '要问用户的问题' },
        options: { type: 'array', description: '选项列表（可选，提供后用户可选择）', items: { type: 'string' } },
        context: { type: 'string', description: '问题上下文/背景说明' },
        sessionKey: { type: 'string', description: '会话标识' },
      },
      required: ['question'],
    },
    execute: async ({ question, options, context, sessionKey = 'default' }) => {
      return {
        success: true,
        type: 'user_question',
        sessionKey,
        question,
        options: options || [],
        context: context || '',
        message: `[需要用户回答] ${question}`,
        hint: '请在聊天中回复此问题，AI将根据您的回答继续',
      };
    },
  });
}

// ============ LSP/LSPTool: 代码智能提示 ============

interface SymbolInfo {
  name: string;
  kind: string;
  line: number;
  column: number;
  signature?: string;
  documentation?: string;
  container?: string;
}

function getLanguageFromExt(ext: string): string {
  const map: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.py': 'python',
    '.go': 'go',
  };
  return map[ext.toLowerCase()] || 'typescript';
}

function lspSymbolKindToString(kind: number): string {
  const kinds: Record<number, string> = {
    1: 'file', 2: 'module', 3: 'namespace', 4: 'package',
    5: 'class', 6: 'method', 7: 'property', 8: 'field',
    9: 'constructor', 10: 'enum', 11: 'interface', 12: 'function',
    13: 'variable', 14: 'constant', 15: 'string', 16: 'number',
    17: 'boolean', 18: 'array', 19: 'object', 20: 'key',
    21: 'null', 22: 'enumMember', 23: 'struct', 24: 'event',
    25: 'operator', 26: 'typeParameter',
  };
  return kinds[kind] || 'unknown';
}

function lspSeverityToString(severity: number): string {
  const map: Record<number, string> = { 1: 'error', 2: 'warning', 3: 'information', 4: 'hint' };
  return map[severity] || 'unknown';
}

async function findProjectRoot(startPath: string): Promise<string> {
  let rootPath = startPath;
  const { existsSync } = await import('fs');
  while (rootPath !== dirname(rootPath)) {
    if (existsSync(join(rootPath, 'tsconfig.json')) || existsSync(join(rootPath, 'package.json'))) {
      break;
    }
    rootPath = dirname(rootPath);
  }
  return rootPath;
}

function registerLSPTools() {
  toolsRegistry.set('lsp_symbols', {
    name: 'lsp_symbols',
    description: '获取文件中的符号列表（函数、类、变量、接口等）。通过真实的Language Server Protocol获取，支持 TypeScript/JavaScript。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '代码文件路径' },
        kind: { type: 'string', description: '符号类型过滤', enum: ['function', 'class', 'interface', 'variable', 'type', 'enum', 'all'] },
      },
      required: ['path'],
    },
    execute: async ({ path, kind = 'all' }) => {
      try {
        const ext = extname(path).toLowerCase();
        const language = getLanguageFromExt(ext);

        // 尝试使用真实LSP
        if (language === 'typescript' || language === 'javascript') {
          try {
            const content = await readFile(path, 'utf-8');
            const rootPath = await findProjectRoot(dirname(path));
            const client = await getLSPClient(language, rootPath);
            const uri = `file://${path}`;
            await client.openDocument(uri, language, content);
            const result = await client.getDocumentSymbols(uri);

            if (result && Array.isArray(result)) {
              const symbols: SymbolInfo[] = [];
              function flatten(items: any[], parentName = '') {
                for (const item of items) {
                  const range = item.location?.range || item.range;
                  const symbolKind = lspSymbolKindToString(item.kind);
                  if (kind === 'all' || symbolKind === kind) {
                    symbols.push({
                      name: item.name,
                      kind: symbolKind,
                      line: (range?.start?.line ?? 0) + 1,
                      column: (range?.start?.character ?? 0) + 1,
                      signature: item.detail || `${symbolKind} ${item.name}`,
                      container: parentName,
                    });
                  }
                  if (item.children) flatten(item.children, item.name);
                }
              }
              flatten(result);
              symbols.sort((a, b) => a.line - b.line);

              return {
                success: true,
                path,
                language: ext,
                source: 'lsp',
                total: symbols.length,
                symbols: symbols.slice(0, 200),
                truncated: symbols.length > 200,
              };
            }
          } catch (lspErr: any) {
            // LSP回退日志（生产环境可关闭）
          }
        }

        // 回退到正则匹配
        return fallbackSymbols(path, kind);
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  toolsRegistry.set('lsp_hover', {
    name: 'lsp_hover',
    description: '获取光标位置符号的文档和类型信息（Hover信息）。通过真实的Language Server Protocol获取。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '代码文件路径' },
        line: { type: 'number', description: '行号（从1开始）' },
        column: { type: 'number', description: '列号（从1开始）' },
      },
      required: ['path', 'line', 'column'],
    },
    execute: async ({ path, line, column }) => {
      try {
        const ext = extname(path).toLowerCase();
        const language = getLanguageFromExt(ext);

        // 尝试使用真实LSP
        if (language === 'typescript' || language === 'javascript') {
          try {
            const content = await readFile(path, 'utf-8');
            const rootPath = await findProjectRoot(dirname(path));
            const client = await getLSPClient(language, rootPath);
            const uri = `file://${path}`;
            await client.openDocument(uri, language, content);
            const result = await client.getHover(uri, line - 1, column - 1);

            if (result && result.contents) {
              const contents = Array.isArray(result.contents)
                ? result.contents.map((c: any) => typeof c === 'string' ? c : c.value).join('\n')
                : typeof result.contents === 'string'
                  ? result.contents
                  : result.contents.value || '';

              return {
                success: true,
                path,
                line,
                column,
                source: 'lsp',
                contents,
                raw: result,
              };
            }
          } catch (lspErr: any) {
            // LSP回退日志（生产环境可关闭）
          }
        }

        // 回退到正则匹配
        return fallbackHover(path, line, column);
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  toolsRegistry.set('lsp_diagnostics', {
    name: 'lsp_diagnostics',
    description: '对代码文件进行语法和类型检查，返回诊断信息。通过真实的Language Server Protocol获取。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '代码文件路径' },
      },
      required: ['path'],
    },
    execute: async ({ path }) => {
      try {
        const ext = extname(path).toLowerCase();
        const language = getLanguageFromExt(ext);

        // 尝试使用真实LSP
        if (language === 'typescript' || language === 'javascript') {
          try {
            const content = await readFile(path, 'utf-8');
            const rootPath = await findProjectRoot(dirname(path));
            const client = await getLSPClient(language, rootPath);
            const uri = `file://${path}`;
            await client.openDocument(uri, language, content);
            const diagnostics = await client.getDiagnostics(uri);

            if (diagnostics && Array.isArray(diagnostics)) {
              return {
                success: true,
                path,
                language: ext,
                source: 'lsp',
                total: diagnostics.length,
                diagnostics: diagnostics.map((d: any) => ({
                  line: (d.range?.start?.line ?? 0) + 1,
                  column: (d.range?.start?.character ?? 0) + 1,
                  message: d.message,
                  severity: lspSeverityToString(d.severity),
                  code: d.code,
                  source: d.source,
                })),
                summary: diagnostics.length === 0 ? '未发现问题' : `发现${diagnostics.length}个问题`,
              };
            }
          } catch (lspErr: any) {
            // LSP回退日志（生产环境可关闭）
          }
        }

        // 回退到基础检查
        return fallbackDiagnostics(path);
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  toolsRegistry.set('lsp_references', {
    name: 'lsp_references',
    description: '查找符号在文件中的所有引用位置。通过真实的Language Server Protocol获取。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '代码文件路径' },
        symbol: { type: 'string', description: '要查找的符号名称' },
        line: { type: 'number', description: '符号所在行号（从1开始，用于LSP定位）' },
        column: { type: 'number', description: '符号所在列号（从1开始，用于LSP定位）' },
      },
      required: ['path', 'symbol'],
    },
    execute: async ({ path, symbol, line, column }) => {
      try {
        const ext = extname(path).toLowerCase();
        const language = getLanguageFromExt(ext);

        // 尝试使用真实LSP
        if ((language === 'typescript' || language === 'javascript') && line && column) {
          try {
            const content = await readFile(path, 'utf-8');
            const rootPath = await findProjectRoot(dirname(path));
            const client = await getLSPClient(language, rootPath);
            const uri = `file://${path}`;
            await client.openDocument(uri, language, content);
            const result = await client.getReferences(uri, line - 1, column - 1);

            if (result && Array.isArray(result)) {
              return {
                success: true,
                path,
                symbol,
                source: 'lsp',
                total: result.length,
                references: result.map((r: any) => ({
                  line: (r.range?.start?.line ?? 0) + 1,
                  column: (r.range?.start?.character ?? 0) + 1,
                  text: r.uri ? r.uri.replace('file://', '') : path,
                  uri: r.uri,
                })),
                truncated: result.length > 100,
              };
            }
          } catch (lspErr: any) {
            // LSP回退日志（生产环境可关闭）
          }
        }

        // 回退到正则匹配
        return fallbackReferences(path, symbol);
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  toolsRegistry.set('lsp_health', {
    name: 'lsp_health',
    description: '获取所有 LSP 客户端的健康状态，包括运行状态、重启次数、上次健康检查时间等。',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: '可选：指定客户端 key (格式: language:rootPath)，不指定则返回所有' },
      },
      required: [],
    },
    execute: async ({ key }) => {
      try {
        if (key) {
          const { getLSPClientByKey } = await import('./lspClient.js');
          const client = getLSPClientByKey(key);
          if (!client) {
            return { success: false, error: `未找到 LSP client: ${key}` };
          }
          return {
            success: true,
            total: 1,
            clients: [client.getHealthStatus()],
          };
        }

        const clients = getAllLSPClients();
        const statuses = clients.map((c) => c.getHealthStatus());
        const healthy = statuses.filter((s) => s.status === 'healthy').length;
        const unhealthy = statuses.filter((s) => s.status === 'unhealthy').length;
        const dead = statuses.filter((s) => s.status === 'dead').length;

        return {
          success: true,
          total: statuses.length,
          summary: { healthy, unhealthy, dead },
          clients: statuses,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  toolsRegistry.set('lsp_restart', {
    name: 'lsp_restart',
    description: '手动重启指定的 LSP 客户端。支持通过 key 或 language + rootPath 指定。',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: '客户端 key (格式: language:rootPath，如 typescript:/path/to/project)' },
        language: { type: 'string', description: '语言类型（如 typescript, python, go）' },
        rootPath: { type: 'string', description: '项目根目录路径' },
      },
      required: [],
    },
    execute: async ({ key, language, rootPath }) => {
      try {
        let targetKey = key;
        if (!targetKey && language && rootPath) {
          targetKey = `${language}:${rootPath}`;
        }
        if (!targetKey) {
          return { success: false, error: '必须提供 key 或 language + rootPath 参数' };
        }

        const result = await restartLSPClient(targetKey);
        return {
          success: result.success,
          message: result.message,
          key: targetKey,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });
}

// ============ LSP回退实现（正则匹配） ============

async function fallbackSymbols(path: string, kind: string): Promise<any> {
  const content = await readFile(path, 'utf-8');
  const ext = extname(path).toLowerCase();
  const symbols: SymbolInfo[] = [];

  const patterns: Record<string, Array<{ regex: RegExp; kind: string }>> = {
    '.ts': [
      { regex: /^(export\s+)?(async\s+)?function\s+(\w+)\s*\(/gm, kind: 'function' },
      { regex: /^(export\s+)?class\s+(\w+)/gm, kind: 'class' },
      { regex: /^(export\s+)?interface\s+(\w+)/gm, kind: 'interface' },
      { regex: /^(export\s+)?type\s+(\w+)\s*=/gm, kind: 'type' },
      { regex: /^(export\s+)?enum\s+(\w+)/gm, kind: 'enum' },
      { regex: /^(export\s+)?const\s+(\w+)\s*[:=]/gm, kind: 'variable' },
      { regex: /^(export\s+)?let\s+(\w+)\s*[:=]/gm, kind: 'variable' },
      { regex: /^(export\s+)?var\s+(\w+)\s*[:=]/gm, kind: 'variable' },
    ],
    '.tsx': [
      { regex: /^(export\s+)?(async\s+)?function\s+(\w+)\s*\(/gm, kind: 'function' },
      { regex: /^(export\s+)?class\s+(\w+)/gm, kind: 'class' },
      { regex: /^(export\s+)?interface\s+(\w+)/gm, kind: 'interface' },
      { regex: /^(export\s+)?const\s+(\w+)\s*[:=]/gm, kind: 'variable' },
    ],
    '.js': [
      { regex: /^(export\s+)?(async\s+)?function\s+(\w+)\s*\(/gm, kind: 'function' },
      { regex: /^(export\s+)?class\s+(\w+)/gm, kind: 'class' },
      { regex: /^(export\s+)?const\s+(\w+)\s*=/gm, kind: 'variable' },
    ],
    '.py': [
      { regex: /^(async\s+)?def\s+(\w+)\s*\(/gm, kind: 'function' },
      { regex: /^class\s+(\w+)/gm, kind: 'class' },
      { regex: /^(\w+)\s*=/gm, kind: 'variable' },
    ],
    '.go': [
      { regex: /^func\s+(?:\([^)]+\)\s+)?(\w+)\s*\(/gm, kind: 'function' },
      { regex: /^type\s+(\w+)\s+struct/gm, kind: 'class' },
      { regex: /^type\s+(\w+)\s+interface/gm, kind: 'interface' },
      { regex: /^var\s+(\w+)/gm, kind: 'variable' },
      { regex: /^const\s+(\w+)/gm, kind: 'variable' },
    ],
  };

  const langPatterns = patterns[ext] || patterns['.ts'];

  for (const { regex, kind: symbolKind } of langPatterns) {
    if (kind !== 'all' && symbolKind !== kind) continue;
    let match;
    while ((match = regex.exec(content)) !== null) {
      const line = content.slice(0, match.index).split('\n').length;
      const lineText = content.split('\n')[line - 1];
      symbols.push({
        name: match[match.length - 1] || match[1],
        kind: symbolKind,
        line,
        column: lineText.indexOf(match[match.length - 1] || match[1]) + 1,
        signature: lineText.trim().slice(0, 120),
      });
    }
  }

  symbols.sort((a, b) => a.line - b.line);

  return {
    success: true,
    path,
    language: ext,
    source: 'fallback',
    total: symbols.length,
    symbols: symbols.slice(0, 200),
    truncated: symbols.length > 200,
  };
}

async function fallbackHover(path: string, line: number, column: number): Promise<any> {
  const content = await readFile(path, 'utf-8');
  const lines = content.split('\n');
  const targetLine = lines[line - 1] || '';

  const contextStart = Math.max(0, line - 3);
  const contextEnd = Math.min(lines.length, line + 2);
  const context = lines.slice(contextStart, contextEnd).map((l: string, i: number) => `${contextStart + i + 1}: ${l}`).join('\n');

  const beforeCursor = targetLine.slice(0, column - 1);
  const afterCursor = targetLine.slice(column - 1);
  const wordMatch = beforeCursor.match(/(\w+)$/) || afterCursor.match(/^(\w+)/);
  const symbol = wordMatch ? wordMatch[1] : '';

  let definition: SymbolInfo | null = null;
  const allSymbols = (await executeMCPTool('lsp_symbols', { path, kind: 'all' })) as any;
  if (allSymbols.success) {
    definition = allSymbols.symbols.find((s: SymbolInfo) => s.name === symbol) || null;
  }

  return {
    success: true,
    path,
    line,
    column,
    source: 'fallback',
    symbol,
    context,
    definition,
    lineText: targetLine.trim(),
  };
}

async function fallbackDiagnostics(path: string): Promise<any> {
  const content = await readFile(path, 'utf-8');
  const ext = extname(path).toLowerCase();
  const diagnostics: Array<{ line: number; message: string; severity: string }> = [];

  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.endsWith(' ')) {
      diagnostics.push({ line: i + 1, message: '行尾有尾随空格', severity: 'hint' });
    }
    if (line.length > 120) {
      diagnostics.push({ line: i + 1, message: `行长度${line.length}超过120字符`, severity: 'warning' });
    }
    if (/console\.log\(/.test(line) && !line.trim().startsWith('//')) {
      diagnostics.push({ line: i + 1, message: '发现 console.log，生产环境建议移除', severity: 'warning' });
    }
  }

  if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
    const importRegex = /import\s+\{?\s*([^}]+)\}?\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const imports = match[1].split(',').map((s: string) => s.trim().split(' ')[0]);
      for (const imp of imports) {
        const cleanImp = imp.replace(/\s+as\s+\w+/, '').trim();
        if (cleanImp && !content.includes(cleanImp + '(') && !content.includes(cleanImp + '.')) {
          const line = content.slice(0, match.index).split('\n').length;
          diagnostics.push({ line, message: `可能未使用的导入: ${cleanImp}`, severity: 'hint' });
        }
      }
    }
  }

  return {
    success: true,
    path,
    language: ext,
    source: 'fallback',
    total: diagnostics.length,
    diagnostics: diagnostics.slice(0, 50),
    summary: diagnostics.length === 0 ? '未发现问题' : `发现${diagnostics.length}个问题`,
  };
}

async function fallbackReferences(path: string, symbol: string): Promise<any> {
  const content = await readFile(path, 'utf-8');
  const lines = content.split('\n');
  const references: Array<{ line: number; column: number; text: string }> = [];

  const regex = new RegExp(`\\b${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');

  for (let i = 0; i < lines.length; i++) {
    let match;
    while ((match = regex.exec(lines[i])) !== null) {
      references.push({
        line: i + 1,
        column: match.index + 1,
        text: lines[i].trim(),
      });
    }
  }

  return {
    success: true,
    path,
    symbol,
    source: 'fallback',
    total: references.length,
    references: references.slice(0, 100),
    truncated: references.length > 100,
  };
}

// ============ NotebookEditTool: Jupyter Notebook支持 ============

interface NotebookCell {
  cell_type: 'code' | 'markdown' | 'raw';
  source: string | string[];
  outputs?: any[];
  execution_count?: number | null;
  metadata?: Record<string, any>;
}

interface Notebook {
  cells: NotebookCell[];
  metadata: Record<string, any>;
  nbformat: number;
  nbformat_minor: number;
}

const notebookStore = new Map<string, Notebook>();

function registerNotebookTools() {
  toolsRegistry.set('notebook_create', {
    name: 'notebook_create',
    description: '创建新的 Jupyter Notebook 文件。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Notebook 文件路径（.ipynb）' },
        title: { type: 'string', description: 'Notebook 标题' },
      },
      required: ['path'],
    },
    execute: async ({ path, title }) => {
      try {
        const notebook: Notebook = {
          cells: title ? [{ cell_type: 'markdown', source: [`# ${title}`], metadata: {} }] : [],
          metadata: {
            kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' },
            language_info: { name: 'python', version: '3.10.0' },
          },
          nbformat: 4,
          nbformat_minor: 5,
        };

        await writeFile(path, JSON.stringify(notebook, null, 2), 'utf-8');
        notebookStore.set(path, notebook);

        return {
          success: true,
          path,
          title,
          cellCount: notebook.cells.length,
          message: `Notebook 已创建: ${path}`,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  toolsRegistry.set('notebook_read', {
    name: 'notebook_read',
    description: '读取 Jupyter Notebook 文件内容，返回所有单元格。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Notebook 文件路径' },
      },
      required: ['path'],
    },
    execute: async ({ path }) => {
      try {
        let notebook: Notebook;
        const stored = notebookStore.get(path);
        if (stored) {
          notebook = stored;
        } else {
          const content = await readFile(path, 'utf-8');
          notebook = JSON.parse(content);
          notebookStore.set(path, notebook);
        }

        const cells = notebook.cells.map((cell, index) => ({
          index,
          type: cell.cell_type,
          source: Array.isArray(cell.source) ? cell.source.join('') : cell.source,
          execution_count: cell.execution_count,
          output_count: cell.outputs?.length || 0,
        }));

        return {
          success: true,
          path,
          title: notebook.metadata?.title || '',
          cellCount: cells.length,
          cells: cells.slice(0, 50),
          metadata: notebook.metadata,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  toolsRegistry.set('notebook_edit_cell', {
    name: 'notebook_edit_cell',
    description: '编辑 Notebook 中的指定单元格。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Notebook 文件路径' },
        index: { type: 'number', description: '单元格索引（从0开始）' },
        source: { type: 'string', description: '新的单元格内容' },
        cell_type: { type: 'string', description: '单元格类型', enum: ['code', 'markdown', 'raw'] },
      },
      required: ['path', 'index'],
    },
    execute: async ({ path, index, source, cell_type }) => {
      try {
        let notebook: Notebook;
        const stored = notebookStore.get(path);
        if (stored) {
          notebook = stored;
        } else {
          const content = await readFile(path, 'utf-8');
          notebook = JSON.parse(content);
        }

        if (index < 0 || index >= notebook.cells.length) {
          return { success: false, error: `单元格索引 ${index} 超出范围 (0-${notebook.cells.length - 1})` };
        }

        if (source !== undefined) {
          notebook.cells[index].source = source.split('\n');
        }
        if (cell_type) {
          notebook.cells[index].cell_type = cell_type as 'code' | 'markdown' | 'raw';
        }

        await writeFile(path, JSON.stringify(notebook, null, 2), 'utf-8');
        notebookStore.set(path, notebook);

        return {
          success: true,
          path,
          index,
          message: `单元格 ${index} 已更新`,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  toolsRegistry.set('notebook_add_cell', {
    name: 'notebook_add_cell',
    description: '在 Notebook 中添加新单元格。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Notebook 文件路径' },
        source: { type: 'string', description: '单元格内容' },
        cell_type: { type: 'string', description: '单元格类型', enum: ['code', 'markdown', 'raw'] },
        position: { type: 'number', description: '插入位置（默认末尾）' },
      },
      required: ['path', 'source'],
    },
    execute: async ({ path, source, cell_type = 'code', position }) => {
      try {
        let notebook: Notebook;
        const stored = notebookStore.get(path);
        if (stored) {
          notebook = stored;
        } else {
          const content = await readFile(path, 'utf-8');
          notebook = JSON.parse(content);
        }

        const newCell: NotebookCell = {
          cell_type: cell_type as 'code' | 'markdown' | 'raw',
          source: source.split('\n'),
          metadata: {},
          execution_count: null,
          outputs: [],
        };

        const insertPos = position !== undefined ? position : notebook.cells.length;
        notebook.cells.splice(insertPos, 0, newCell);

        await writeFile(path, JSON.stringify(notebook, null, 2), 'utf-8');
        notebookStore.set(path, notebook);

        return {
          success: true,
          path,
          position: insertPos,
          cellCount: notebook.cells.length,
          message: `已在位置 ${insertPos} 添加 ${cell_type} 单元格`,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  toolsRegistry.set('notebook_delete_cell', {
    name: 'notebook_delete_cell',
    description: '删除 Notebook 中的指定单元格。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Notebook 文件路径' },
        index: { type: 'number', description: '单元格索引（从0开始）' },
      },
      required: ['path', 'index'],
    },
    execute: async ({ path, index }) => {
      try {
        let notebook: Notebook;
        const stored = notebookStore.get(path);
        if (stored) {
          notebook = stored;
        } else {
          const content = await readFile(path, 'utf-8');
          notebook = JSON.parse(content);
        }

        if (index < 0 || index >= notebook.cells.length) {
          return { success: false, error: `单元格索引 ${index} 超出范围` };
        }

        notebook.cells.splice(index, 1);

        await writeFile(path, JSON.stringify(notebook, null, 2), 'utf-8');
        notebookStore.set(path, notebook);

        return {
          success: true,
          path,
          index,
          cellCount: notebook.cells.length,
          message: `单元格 ${index} 已删除`,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });
}

// ============ Cron工具: 定时任务 ============

interface CronJob {
  id: string;
  name: string;
  schedule: string;
  command: string;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  runCount: number;
  createdAt: string;
}

const cronStore = new Map<string, CronJob[]>();
const cronTimers = new Map<string, NodeJS.Timeout>();

function parseCronExpression(schedule: string): number {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return 0;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  if (minute === '*' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return 60 * 1000;
  }
  if (minute === '0' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return 60 * 60 * 1000;
  }
  if (minute === '0' && hour === '0' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return 24 * 60 * 60 * 1000;
  }

  return 60 * 1000;
}

function getNextRunTime(schedule: string): string {
  const interval = parseCronExpression(schedule);
  if (interval <= 0) return '未知';
  return new Date(Date.now() + interval).toISOString();
}

function registerCronTools() {
  toolsRegistry.set('cron_create', {
    name: 'cron_create',
    description: '创建定时任务。支持标准 cron 表达式（分 时 日 月 周）。常用: * * * * *(每分钟), 0 * * * *(每小时), 0 0 * * *(每天)。',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '任务名称' },
        schedule: { type: 'string', description: 'Cron 表达式，如 "0 9 * * *" 表示每天9点' },
        command: { type: 'string', description: '要执行的命令或脚本' },
        enabled: { type: 'boolean', description: '是否立即启用（默认true）' },
        sessionKey: { type: 'string', description: '会话标识' },
      },
      required: ['name', 'schedule', 'command'],
    },
    execute: async ({ name, schedule, command, enabled = true, sessionKey = 'default' }) => {
      try {
        const jobs = cronStore.get(sessionKey) || [];
        const job: CronJob = {
          id: `cron-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name,
          schedule,
          command,
          enabled,
          nextRun: enabled ? getNextRunTime(schedule) : undefined,
          runCount: 0,
          createdAt: new Date().toISOString(),
        };

        jobs.push(job);
        cronStore.set(sessionKey, jobs);

        if (enabled) {
          const interval = parseCronExpression(schedule);
          if (interval > 0) {
            const timer = setInterval(async () => {
              try {
                await execAsync(command, { timeout: 30000 });
                job.lastRun = new Date().toISOString();
                job.runCount++;
                job.nextRun = getNextRunTime(schedule);
              } catch {
                // 静默处理执行错误
              }
            }, interval);
            cronTimers.set(job.id, timer);
          }
        }

        return {
          success: true,
          jobId: job.id,
          name,
          schedule,
          command,
          enabled,
          nextRun: job.nextRun,
          message: `定时任务已创建: ${name} (${schedule})`,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  toolsRegistry.set('cron_list', {
    name: 'cron_list',
    description: '列出所有定时任务及其状态。',
    parameters: {
      type: 'object',
      properties: {
        sessionKey: { type: 'string', description: '会话标识' },
      },
    },
    execute: async ({ sessionKey = 'default' }) => {
      const jobs = cronStore.get(sessionKey) || [];
      return {
        success: true,
        count: jobs.length,
        jobs: jobs.map(j => ({
          id: j.id,
          name: j.name,
          schedule: j.schedule,
          command: j.command.slice(0, 100),
          enabled: j.enabled,
          lastRun: j.lastRun,
          nextRun: j.nextRun,
          runCount: j.runCount,
          createdAt: j.createdAt,
        })),
      };
    },
  });

  toolsRegistry.set('cron_update', {
    name: 'cron_update',
    description: '更新定时任务（启用/禁用/修改）。',
    parameters: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: '任务ID' },
        enabled: { type: 'boolean', description: '是否启用' },
        schedule: { type: 'string', description: '新的Cron表达式' },
        command: { type: 'string', description: '新的命令' },
        sessionKey: { type: 'string', description: '会话标识' },
      },
      required: ['jobId'],
    },
    execute: async ({ jobId, enabled, schedule, command, sessionKey = 'default' }) => {
      const jobs = cronStore.get(sessionKey) || [];
      const job = jobs.find(j => j.id === jobId);
      if (!job) {
        return { success: false, error: `任务不存在: ${jobId}` };
      }

      const oldTimer = cronTimers.get(jobId);
      if (oldTimer) {
        clearInterval(oldTimer);
        cronTimers.delete(jobId);
      }

      if (schedule !== undefined) job.schedule = schedule;
      if (command !== undefined) job.command = command;
      if (enabled !== undefined) job.enabled = enabled;

      if (job.enabled) {
        const interval = parseCronExpression(job.schedule);
        if (interval > 0) {
          const timer = setInterval(async () => {
            try {
              await execAsync(job.command, { timeout: 30000 });
              job.lastRun = new Date().toISOString();
              job.runCount++;
              job.nextRun = getNextRunTime(job.schedule);
            } catch {
              // 静默处理
            }
          }, interval);
          cronTimers.set(jobId, timer);
        }
        job.nextRun = getNextRunTime(job.schedule);
      } else {
        job.nextRun = undefined;
      }

      return {
        success: true,
        jobId,
        name: job.name,
        enabled: job.enabled,
        schedule: job.schedule,
        message: `任务已更新: ${job.name}`,
      };
    },
  });

  toolsRegistry.set('cron_delete', {
    name: 'cron_delete',
    description: '删除定时任务。',
    parameters: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: '任务ID' },
        sessionKey: { type: 'string', description: '会话标识' },
      },
      required: ['jobId'],
    },
    execute: async ({ jobId, sessionKey = 'default' }) => {
      const jobs = cronStore.get(sessionKey) || [];
      const index = jobs.findIndex(j => j.id === jobId);
      if (index === -1) {
        return { success: false, error: `任务不存在: ${jobId}` };
      }

      const oldTimer = cronTimers.get(jobId);
      if (oldTimer) {
        clearInterval(oldTimer);
        cronTimers.delete(jobId);
      }

      const job = jobs[index];
      jobs.splice(index, 1);
      cronStore.set(sessionKey, jobs);

      return {
        success: true,
        jobId,
        name: job.name,
        message: `任务已删除: ${job.name}`,
      };
    },
  });
}

// ============ MonitorTool: 系统监控 ============

interface MonitorMetric {
  timestamp: string;
  cpuUsage: number;
  memoryUsage: number;
  memoryTotal: number;
  memoryFree: number;
  loadAvg: number[];
  uptime: number;
}

const monitorHistory = new Map<string, MonitorMetric[]>();
const monitorTimers = new Map<string, NodeJS.Timeout>();

function registerMonitorTools() {
  toolsRegistry.set('monitor_start', {
    name: 'monitor_start',
    description: '启动系统资源监控，定期采集 CPU、内存、负载等指标。',
    parameters: {
      type: 'object',
      properties: {
        interval: { type: 'number', description: '采集间隔（秒，默认10）' },
        maxHistory: { type: 'number', description: '最大历史记录数（默认100）' },
        sessionKey: { type: 'string', description: '会话标识' },
      },
    },
    execute: async ({ interval = 10, maxHistory = 100, sessionKey = 'default' }) => {
      try {
        const oldTimer = monitorTimers.get(sessionKey);
        if (oldTimer) {
          clearInterval(oldTimer);
          monitorTimers.delete(sessionKey);
        }

        const history: MonitorMetric[] = [];
        monitorHistory.set(sessionKey, history);

        const timer = setInterval(() => {
          try {
            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            const usedMem = totalMem - freeMem;

            const metric: MonitorMetric = {
              timestamp: new Date().toISOString(),
              cpuUsage: Math.round((1 - os.freemem() / os.totalmem()) * 100 * 100) / 100,
              memoryUsage: Math.round((usedMem / totalMem) * 100 * 100) / 100,
              memoryTotal: Math.round(totalMem / 1024 / 1024 / 1024 * 100) / 100,
              memoryFree: Math.round(freeMem / 1024 / 1024 / 1024 * 100) / 100,
              loadAvg: os.loadavg(),
              uptime: os.uptime(),
            };

            history.push(metric);
            if (history.length > maxHistory) {
              history.shift();
            }
          } catch {
            // 静默处理
          }
        }, interval * 1000);

        monitorTimers.set(sessionKey, timer);

        return {
          success: true,
          sessionKey,
          interval,
          maxHistory,
          message: `监控已启动，每 ${interval} 秒采集一次`,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  toolsRegistry.set('monitor_stop', {
    name: 'monitor_stop',
    description: '停止系统资源监控。',
    parameters: {
      type: 'object',
      properties: {
        sessionKey: { type: 'string', description: '会话标识' },
      },
    },
    execute: async ({ sessionKey = 'default' }) => {
      const timer = monitorTimers.get(sessionKey);
      if (timer) {
        clearInterval(timer);
        monitorTimers.delete(sessionKey);
      }
      return {
        success: true,
        sessionKey,
        message: '监控已停止',
      };
    },
  });

  toolsRegistry.set('monitor_status', {
    name: 'monitor_status',
    description: '获取当前系统监控状态和最新指标。',
    parameters: {
      type: 'object',
      properties: {
        sessionKey: { type: 'string', description: '会话标识' },
      },
    },
    execute: async ({ sessionKey = 'default' }) => {
      const history = monitorHistory.get(sessionKey) || [];
      const isRunning = monitorTimers.has(sessionKey);
      const latest = history.length > 0 ? history[history.length - 1] : null;

      const avgCpu = history.length > 0
        ? Math.round(history.reduce((sum, m) => sum + m.cpuUsage, 0) / history.length * 100) / 100
        : 0;
      const avgMem = history.length > 0
        ? Math.round(history.reduce((sum, m) => sum + m.memoryUsage, 0) / history.length * 100) / 100
        : 0;

      return {
        success: true,
        sessionKey,
        isRunning,
        recordCount: history.length,
        latest,
        averages: {
          cpuUsage: avgCpu,
          memoryUsage: avgMem,
        },
        history: history.slice(-20),
      };
    },
  });

  toolsRegistry.set('monitor_processes', {
    name: 'monitor_processes',
    description: '获取系统进程列表和资源占用情况。',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: '最大返回进程数（默认20）' },
        sortBy: { type: 'string', description: '排序字段', enum: ['cpu', 'memory', 'pid', 'name'] },
      },
    },
    execute: async ({ limit = 20, sortBy = 'cpu' }) => {
      try {
        let cmd: string;
        if (process.platform === 'win32') {
          cmd = `powershell -ExecutionPolicy Bypass -Command "Get-Process | Select-Object Id, ProcessName, CPU, WorkingSet | Sort-Object ${sortBy === 'memory' ? 'WorkingSet' : sortBy === 'pid' ? 'Id' : sortBy === 'name' ? 'ProcessName' : 'CPU'} -Descending | Select-Object -First ${limit} | ConvertTo-Json -Compress"`;
        } else {
          cmd = `ps aux --sort=-${sortBy === 'memory' ? '%mem' : sortBy === 'cpu' ? '%cpu' : sortBy === 'pid' ? 'pid' : 'comm'} | head -n ${limit + 1} | tail -n ${limit}`;
        }

        const { stdout } = await execAsync(cmd, { timeout: 10000 });
        let processes: any[] = [];

        if (process.platform === 'win32') {
          const data = JSON.parse(stdout);
          const procArray = Array.isArray(data) ? data : [data];
          processes = procArray.map((p: any) => ({
            pid: p.Id,
            name: p.ProcessName,
            cpu: p.CPU ? Math.round(p.CPU * 100) / 100 : 0,
            memory: p.WorkingSet ? Math.round(p.WorkingSet / 1024 / 1024 * 100) / 100 : 0,
          }));
        } else {
          const lines = stdout.trim().split('\n');
          processes = lines.map(line => {
            const parts = line.trim().split(/\s+/);
            return {
              pid: parts[1],
              name: parts[10] || parts[0],
              cpu: parts[2],
              memory: parts[3],
            };
          });
        }

        return {
          success: true,
          count: processes.length,
          sortBy,
          processes: processes.slice(0, limit),
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  toolsRegistry.set('monitor_network', {
    name: 'monitor_network',
    description: '获取网络连接和端口监听信息。',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', description: '查询类型', enum: ['connections', 'ports', 'interfaces'] },
      },
    },
    execute: async ({ type = 'connections' }) => {
      try {
        let cmd: string;
        if (process.platform === 'win32') {
          if (type === 'ports') {
            cmd = 'netstat -an | findstr LISTENING';
          } else if (type === 'interfaces') {
            cmd = 'powershell -ExecutionPolicy Bypass -Command "Get-NetAdapter | Select-Object Name, Status, LinkSpeed | ConvertTo-Json -Compress"';
          } else {
            cmd = 'netstat -an';
          }
        } else {
          if (type === 'ports') {
            cmd = 'netstat -tlnp';
          } else if (type === 'interfaces') {
            cmd = 'ip addr';
          } else {
            cmd = 'netstat -an';
          }
        }

        const { stdout } = await execAsync(cmd, { timeout: 10000 });

        let result: any;
        if (type === 'interfaces' && process.platform === 'win32') {
          const data = JSON.parse(stdout);
          result = Array.isArray(data) ? data : [data];
        } else {
          result = stdout.trim().split('\n').slice(0, 50);
        }

        return {
          success: true,
          type,
          platform: process.platform,
          result,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });
}

// ============ Multi-Agent Collaboration Tools: 多Agent协作 ============

interface CrewTask {
  id: string;
  agentType: string;
  description: string;
  instructions?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

interface CrewExecution {
  id: string;
  name: string;
  tasks: CrewTask[];
  mode: 'sequential' | 'parallel' | 'manager_worker';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'stopped';
  createdAt: string;
  completedAt?: string;
  managerTask?: string;
  workerResults: Map<string, string>;
}

const crewStore = new Map<string, CrewExecution>();

function registerCrewTools() {
  toolsRegistry.set('crew_execute', {
    name: 'crew_execute',
    description: '多Agent顺序协作执行模式（by_order）。按顺序执行多个Agent任务，每个Agent完成后将结果传递给下一个Agent作为上下文。支持同步等待模式。',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Crew任务名称' },
        tasks: {
          type: 'array',
          description: '任务列表（按执行顺序）',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: '任务ID（唯一标识）' },
              agentType: { type: 'string', description: 'Agent类型（如: Explore, Code, Verify, Test）' },
              description: { type: 'string', description: '任务描述' },
              instructions: { type: 'string', description: '详细指令（可选）' },
            },
            required: ['id', 'agentType', 'description'],
          },
        },
        sessionKey: { type: 'string', description: '会话标识（默认default）' },
        sync: { type: 'boolean', description: '是否同步等待（默认true）' },
        timeout: { type: 'number', description: '单个任务超时（毫秒，默认120000）' },
      },
      required: ['name', 'tasks'],
    },
    execute: async ({ name, tasks, sessionKey = 'default', sync = true, timeout = 120000 }) => {
      if (!Array.isArray(tasks)) {
        return { success: false, error: 'tasks 必须是数组' };
      }
      const crewId = `crew-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      const crew: CrewExecution = {
        id: crewId,
        name,
        tasks: tasks.map((t: any) => ({
          id: t.id,
          agentType: t.agentType,
          description: t.description,
          instructions: t.instructions,
          status: 'pending',
        })),
        mode: 'sequential',
        status: 'pending',
        createdAt: new Date().toISOString(),
        workerResults: new Map(),
      };
      crewStore.set(sessionKey, crew);

      if (!sync) {
        crew.status = 'running';
        runCrewSequential(crew, sessionKey).catch(err => {
          crew.status = 'failed';
          console.error(`[Crew ${crewId}] 执行失败:`, err.message);
        });
        return {
          success: true,
          crewId,
          name,
          mode: 'sequential',
          status: 'running',
          taskCount: tasks.length,
          message: `Crew任务已启动: ${name}（${tasks.length}个任务）`,
        };
      }

      crew.status = 'running';
      let context = '';
      const results: Array<{ taskId: string; result: string; status: string }> = [];

      for (const task of crew.tasks) {
        task.status = 'running';
        task.startedAt = new Date().toISOString();

        try {
          const agentResult = await Promise.race([
            executeSingleAgent(task.agentType, task.description, task.instructions || '', context),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`任务 ${task.id} 超时`)), timeout)),
          ]);

          task.result = agentResult.result;
          task.status = 'completed';
          task.completedAt = new Date().toISOString();
          context = `${task.agentType}: ${agentResult.result}`;
          results.push({ taskId: task.id, result: agentResult.result, status: 'completed' });
        } catch (err: any) {
          task.status = 'failed';
          task.error = err.message;
          task.completedAt = new Date().toISOString();
          crew.status = 'failed';
          crew.completedAt = new Date().toISOString();
          return {
            success: false,
            crewId,
            name,
            failedTask: task.id,
            error: err.message,
            completedTasks: results.length,
            totalTasks: tasks.length,
          };
        }
      }

      crew.status = 'completed';
      crew.completedAt = new Date().toISOString();

      return {
        success: true,
        crewId,
        name,
        mode: 'sequential',
        status: 'completed',
        taskCount: tasks.length,
        results,
        message: `Crew任务完成: ${name}（${tasks.length}个任务全部完成）`,
      };
    },
  });

  toolsRegistry.set('crew_parallel', {
    name: 'crew_parallel',
    description: '多Agent并行协作执行模式。同时执行多个Agent任务，最后聚合所有结果。适用于相互独立的任务。',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Crew任务名称' },
        tasks: {
          type: 'array',
          description: '任务列表（并行执行）',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: '任务ID' },
              agentType: { type: 'string', description: 'Agent类型' },
              description: { type: 'string', description: '任务描述' },
              instructions: { type: 'string', description: '详细指令（可选）' },
            },
            required: ['id', 'agentType', 'description'],
          },
        },
        sessionKey: { type: 'string', description: '会话标识' },
        sync: { type: 'boolean', description: '是否同步等待（默认true）' },
        timeout: { type: 'number', description: '超时（毫秒，默认120000）' },
      },
      required: ['name', 'tasks'],
    },
    execute: async ({ name, tasks, sessionKey = 'default', sync = true, timeout = 120000 }) => {
      const crewId = `crew-parallel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      
      const crew: CrewExecution = {
        id: crewId,
        name,
        tasks: (tasks as any[]).map((t: any) => ({
          id: t.id,
          agentType: t.agentType,
          description: t.description,
          instructions: t.instructions,
          status: 'pending',
        })),
        mode: 'parallel',
        status: 'pending',
        createdAt: new Date().toISOString(),
        workerResults: new Map(),
      };
      crewStore.set(sessionKey, crew);

      if (!sync) {
        crew.status = 'running';
        runCrewParallel(crew, sessionKey).catch(err => {
          crew.status = 'failed';
          console.error(`[Crew ${crewId}] 执行失败:`, err.message);
        });
        return {
          success: true,
          crewId,
          name,
          mode: 'parallel',
          status: 'running',
          taskCount: tasks.length,
          message: `并行Crew任务已启动: ${name}（${tasks.length}个任务并行执行）`,
        };
      }

      crew.status = 'running';
      const startTime = Date.now();

      try {
        const agentPromises = crew.tasks.map(async (task) => {
          task.status = 'running';
          task.startedAt = new Date().toISOString();

          const result = await Promise.race([
            executeSingleAgent(task.agentType, task.description, task.instructions || '', ''),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`任务 ${task.id} 超时`)), timeout)),
          ]);

          task.result = result.result;
          task.status = 'completed';
          task.completedAt = new Date().toISOString();
          crew.workerResults.set(task.id, result.result);

          return { taskId: task.id, result: result.result, status: 'completed' };
        });

        const results = await Promise.all(agentPromises);
        crew.status = 'completed';
        crew.completedAt = new Date().toISOString();

        return {
          success: true,
          crewId,
          name,
          mode: 'parallel',
          status: 'completed',
          taskCount: tasks.length,
          results,
          duration: Date.now() - startTime,
          message: `并行Crew任务完成: ${name}（${tasks.length}个任务并行完成）`,
        };
      } catch (err: any) {
        crew.status = 'failed';
        crew.completedAt = new Date().toISOString();
        return {
          success: false,
          crewId,
          name,
          error: err.message,
          message: `并行Crew任务失败: ${err.message}`,
        };
      }
    },
  });

  toolsRegistry.set('crew_hierarchical', {
    name: 'crew_hierarchical',
    description: '分层Manager→Workers调度执行模式。Manager Agent分析复杂任务并分解为子任务，分派给多个Worker并行执行，最后由Manager综合结果输出最终答案。',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Crew任务名称' },
        task: { type: 'string', description: '复杂任务描述' },
        workerTypes: {
          type: 'array',
          description: 'Worker Agent类型列表（如：["Researcher", "Coder", "Tester"]）',
          items: { type: 'string' },
        },
        instructions: { type: 'string', description: '详细指令（可选）' },
        sessionKey: { type: 'string', description: '会话标识（默认default）' },
        sync: { type: 'boolean', description: '是否同步等待（默认true）' },
        timeout: { type: 'number', description: '单个任务超时（毫秒，默认120000）' },
      },
      required: ['name', 'task', 'workerTypes'],
    },
    execute: async ({ name, task, workerTypes, instructions = '', sessionKey = 'default', sync = true, timeout = 120000 }) => {
      if (!Array.isArray(workerTypes)) {
        return { success: false, error: 'workerTypes 必须是数组' };
      }
      const crewId = `crew-hierarchical-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      const crew: CrewExecution = {
        id: crewId,
        name,
        tasks: [],
        mode: 'manager_worker',
        status: 'pending',
        createdAt: new Date().toISOString(),
        workerResults: new Map(),
      };
      crewStore.set(sessionKey, crew);

      if (!sync) {
        crew.status = 'running';
        runCrewHierarchical(crew, sessionKey, task, workerTypes, instructions, timeout).catch(err => {
          crew.status = 'failed';
          console.error(`[Crew ${crewId}] 分层执行失败:`, err.message);
        });
        return {
          success: true,
          crewId,
          name,
          mode: 'manager_worker',
          status: 'running',
          workerCount: workerTypes.length,
          message: `分层Crew任务已启动: ${name}（Manager + ${workerTypes.length}个Workers）`,
        };
      }

      crew.status = 'running';
      const startTime = Date.now();

      try {
        const step1Result = await Promise.race([
          executeManagerPlan(task, workerTypes, instructions),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Manager任务分解超时')), timeout)),
        ]);

        const subtasks = step1Result.subtasks;
        if (!subtasks || subtasks.length === 0) {
          throw new Error('Manager未能生成有效的子任务列表');
        }

        crew.tasks = subtasks.map((st: any, idx: number) => ({
          id: st.id || `worker-${idx}`,
          agentType: st.agentType || workerTypes[idx % workerTypes.length],
          description: st.description || st.task || '',
          instructions: st.instructions || '',
          status: 'pending' as const,
        }));

        const step2Promises = crew.tasks.map(async (t) => {
          t.status = 'running';
          t.startedAt = new Date().toISOString();

          const result = await Promise.race([
            executeSingleAgent(t.agentType, t.description, t.instructions || '', `原始任务: ${task}\n\nManager分解说明: ${step1Result.plan || ''}`),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Worker任务 ${t.id} 超时`)), timeout)),
          ]);

          t.result = result.result;
          t.status = 'completed';
          t.completedAt = new Date().toISOString();
          crew.workerResults.set(t.id, result.result);

          return { taskId: t.id, agentType: t.agentType, result: result.result, status: 'completed' };
        });

        const workerResults = await Promise.all(step2Promises);

        const step3Result = await Promise.race([
          executeManagerSynthesize(task, step1Result.plan || '', workerResults, instructions),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Manager结果综合超时')), timeout)),
        ]);

        crew.status = 'completed';
        crew.completedAt = new Date().toISOString();

        return {
          success: true,
          crewId,
          name,
          mode: 'manager_worker',
          status: 'completed',
          workerCount: workerTypes.length,
          plan: step1Result.plan,
          workerResults,
          finalResult: step3Result.result,
          duration: Date.now() - startTime,
          message: `分层Crew任务完成: ${name}（Manager分解 → ${workerTypes.length}个Workers并行执行 → Manager综合）`,
        };
      } catch (err: any) {
        crew.status = 'failed';
        crew.completedAt = new Date().toISOString();
        return {
          success: false,
          crewId,
          name,
          error: err.message,
          message: `分层Crew任务失败: ${err.message}`,
        };
      }
    },
  });

  toolsRegistry.set('crew_status', {
    name: 'crew_status',
    description: '获取Crew执行状态和结果',
    parameters: {
      type: 'object',
      properties: {
        crewId: { type: 'string', description: 'Crew ID' },
        sessionKey: { type: 'string', description: '会话标识' },
      },
      required: ['crewId'],
    },
    execute: async ({ crewId, sessionKey = 'default' }) => {
      const crew = crewStore.get(sessionKey);
      if (!crew || crew.id !== crewId) {
        return { success: false, error: `Crew不存在: ${crewId}` };
      }

      return {
        success: true,
        crew: {
          id: crew.id,
          name: crew.name,
          mode: crew.mode,
          status: crew.status,
          createdAt: crew.createdAt,
          completedAt: crew.completedAt,
          tasks: crew.tasks.map(t => ({
            id: t.id,
            agentType: t.agentType,
            description: t.description,
            status: t.status,
            result: t.result?.slice(0, 500),
            error: t.error,
            startedAt: t.startedAt,
            completedAt: t.completedAt,
          })),
        },
      };
    },
  });

  toolsRegistry.set('crew_list', {
    name: 'crew_list',
    description: '列出所有Crew及其状态',
    parameters: {
      type: 'object',
      properties: {
        sessionKey: { type: 'string', description: '会话标识' },
        status: { type: 'string', description: '过滤状态', enum: ['pending', 'running', 'completed', 'failed', 'stopped'] },
      },
    },
    execute: async ({ sessionKey = 'default', status }) => {
      const crew = crewStore.get(sessionKey);
      if (!crew) {
        return { success: true, crews: [], message: '没有活动的Crew' };
      }

      let crews = [crew];
      if (status) {
        crews = crews.filter(c => c.status === status);
      }

      return {
        success: true,
        count: crews.length,
        crews: crews.map(c => ({
          id: c.id,
          name: c.name,
          mode: c.mode,
          status: c.status,
          taskCount: c.tasks.length,
          completedTasks: c.tasks.filter(t => t.status === 'completed').length,
          createdAt: c.createdAt,
          completedAt: c.completedAt,
        })),
      };
    },
  });

  toolsRegistry.set('crew_stop', {
    name: 'crew_stop',
    description: '停止正在运行的Crew',
    parameters: {
      type: 'object',
      properties: {
        crewId: { type: 'string', description: 'Crew ID' },
        sessionKey: { type: 'string', description: '会话标识' },
      },
      required: ['crewId'],
    },
    execute: async ({ crewId, sessionKey = 'default' }) => {
      const crew = crewStore.get(sessionKey);
      if (!crew || crew.id !== crewId) {
        return { success: false, error: `Crew不存在: ${crewId}` };
      }

      if (crew.status !== 'running') {
        return { success: false, error: `Crew当前状态为${crew.status}，无法停止` };
      }

      crew.status = 'stopped';
      crew.completedAt = new Date().toISOString();

      for (const task of crew.tasks) {
        if (task.status === 'pending' || task.status === 'running') {
          task.status = 'skipped';
        }
      }

      return {
        success: true,
        crewId,
        message: `Crew ${crew.name} 已停止`,
      };
    },
  });

  toolsRegistry.set('crew_message', {
    name: 'crew_message',
    description: '在Agent之间传递消息（publish/put_message模式）。支持直接消息传递和发布-订阅两种模式。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: '操作类型', enum: ['send', 'publish', 'receive', 'inbox'] },
        to: { type: 'string', description: '接收者Agent ID（send模式必填）' },
        from: { type: 'string', description: '发送者Agent ID（可选）' },
        subject: { type: 'string', description: '消息主题（publish模式）' },
        content: { type: 'string', description: '消息内容' },
        channel: { type: 'string', description: '频道名称（publish模式）' },
        sessionKey: { type: 'string', description: '会话标识' },
      },
      required: ['action', 'content'],
    },
    execute: async ({ action, to, from, subject, content, channel = 'default', sessionKey = 'default' }) => {
      const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const now = new Date().toISOString();

      if (action === 'send') {
        if (!to) {
          return { success: false, error: 'send模式需要指定接收者(to)' };
        }
        const message: any = {
          id: messageId,
          from,
          to,
          content,
          timestamp: now,
          status: 'sent',
        };

        const inbox = agentInbox.get(sessionKey) || new Map();
        const recipientMessages = inbox.get(to) || [];
        recipientMessages.push(message);
        inbox.set(to, recipientMessages);
        agentInbox.set(sessionKey, inbox);

        return {
          success: true,
          messageId,
          to,
          status: 'sent',
          message: `消息已发送给 ${to}`,
        };
      }

      if (action === 'publish') {
        if (!channel) {
          return { success: false, error: 'publish模式需要指定频道(channel)' };
        }
        const message: any = {
          id: messageId,
          from,
          subject,
          content,
          channel,
          timestamp: now,
        };

        const pubsub = agentPubSub.get(sessionKey) || new Map();
        const subscribers = pubsub.get(channel) || [];
        if (subscribers.length === 0) {
          return {
            success: true,
            messageId,
            channel,
            subscribers: 0,
            message: `消息已发布到频道 ${channel}，但没有订阅者`,
          };
        }

        for (const subscriberId of subscribers) {
          const inbox = agentInbox.get(sessionKey) || new Map();
          const subscriberMessages = inbox.get(subscriberId) || [];
          subscriberMessages.push(message);
          inbox.set(subscriberId, subscriberMessages);
          agentInbox.set(sessionKey, inbox);
        }

        return {
          success: true,
          messageId,
          channel,
          subscribers: subscribers.length,
          message: `消息已发布到频道 ${channel}，${subscribers.length}个订阅者已接收`,
        };
      }

      if (action === 'receive') {
        if (!to) {
          return { success: false, error: 'receive模式需要指定接收者(to)' };
        }
        const inbox = agentInbox.get(sessionKey) || new Map();
        const messages = inbox.get(to) || [];

        if (messages.length === 0) {
          return { success: true, agentId: to, messages: [], count: 0 };
        }

        const received = messages.slice(0, 10);
        inbox.set(to, messages.slice(10));
        agentInbox.set(sessionKey, inbox);

        return {
          success: true,
          agentId: to,
          count: received.length,
          messages: received,
        };
      }

      if (action === 'inbox') {
        const inbox = agentInbox.get(sessionKey) || new Map();
        const allMessages: any[] = [];

        for (const [agentId, messages] of inbox.entries()) {
          for (const msg of messages) {
            allMessages.push({ ...msg, recipientId: agentId });
          }
        }

        allMessages.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        return {
          success: true,
          total: allMessages.length,
          messages: allMessages.slice(0, 50),
        };
      }

      return { success: false, error: `未知操作: ${action}` };
    },
  });

  toolsRegistry.set('crew_subscribe', {
    name: 'crew_subscribe',
    description: '订阅频道以接收发布的消息',
    parameters: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent ID' },
        channel: { type: 'string', description: '频道名称' },
        sessionKey: { type: 'string', description: '会话标识' },
      },
      required: ['agentId', 'channel'],
    },
    execute: async ({ agentId, channel, sessionKey = 'default' }) => {
      const pubsub = agentPubSub.get(sessionKey) || new Map();
      const subscribers = pubsub.get(channel) || [];
      
      if (!subscribers.includes(agentId)) {
        subscribers.push(agentId);
        pubsub.set(channel, subscribers);
        agentPubSub.set(sessionKey, pubsub);
      }

      return {
        success: true,
        agentId,
        channel,
        subscribers: subscribers.length,
        message: `Agent ${agentId} 已订阅频道 ${channel}`,
      };
    },
  });

  toolsRegistry.set('crew_unsubscribe', {
    name: 'crew_unsubscribe',
    description: '取消订阅频道',
    parameters: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent ID' },
        channel: { type: 'string', description: '频道名称' },
        sessionKey: { type: 'string', description: '会话标识' },
      },
      required: ['agentId', 'channel'],
    },
    execute: async ({ agentId, channel, sessionKey = 'default' }) => {
      const pubsub = agentPubSub.get(sessionKey) || new Map();
      const subscribers = pubsub.get(channel) || [];
      const index = subscribers.indexOf(agentId);

      if (index !== -1) {
        subscribers.splice(index, 1);
        pubsub.set(channel, subscribers);
        agentPubSub.set(sessionKey, pubsub);
      }

      return {
        success: true,
        agentId,
        channel,
        subscribers: subscribers.length,
        message: `Agent ${agentId} 已取消订阅频道 ${channel}`,
      };
    },
  });
}

const agentInbox = new Map<string, Map<string, any[]>>();
const agentPubSub = new Map<string, Map<string, string[]>>();

async function executeSingleAgent(agentType: string, description: string, instructions: string, context: string): Promise<{ result: string }> {
  const agentId = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const memory = getAgentMemory(agentId);

  memory.add({
    role: 'system',
    content: `你是一个${agentType}类型的AI Agent。${instructions || '请根据任务描述完成工作。'}\n\n你可以使用以下工具来完成任务:\n${Array.from(toolsRegistry.keys()).filter(k => !['crew_execute', 'crew_parallel', 'crew_hierarchical', 'crew_status', 'crew_list', 'crew_stop', 'crew_message', 'crew_subscribe', 'crew_unsubscribe'].includes(k)).slice(0, 15).join(', ')}`,
    causeBy: 'agent_init',
  });

  if (context) {
    memory.add({
      role: 'user',
      content: `上下文信息:\n${context}\n\n当前任务: ${description}`,
      causeBy: 'context',
    });
  } else {
    memory.add({
      role: 'user',
      content: `任务: ${description}`,
      causeBy: 'user_input',
    });
  }

  const provider = getDefaultProvider();
  if (!provider) {
    throw new Error('没有可用的AI Provider');
  }

  const availableTools = Array.from(toolsRegistry.entries())
    .filter(([toolName]) => !['crew_execute', 'crew_parallel', 'crew_hierarchical', 'crew_status', 'crew_list', 'crew_stop', 'crew_message', 'crew_subscribe', 'crew_unsubscribe'].includes(toolName))
    .slice(0, 15)
    .map(([_name, tool]) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));

  const messages = memory.toLLMMessages() as Array<{ role: string; content: string }>;
  const MAX_STEPS = 10;
  let step = 0;

  while (step < MAX_STEPS) {
    step++;

    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        messages,
        temperature: provider.temperature ?? 0.7,
        max_tokens: provider.maxTokens ?? 4096,
        tools: availableTools,
        tool_choice: 'auto',
      }),
      signal: AbortSignal.timeout(provider.timeout ?? 60000),
    });

    if (!response.ok) {
      throw new Error(`LLM调用失败: HTTP ${response.status}`);
    }

    const data = await response.json() as any;
    const message = data.choices?.[0]?.message;

    if (!message) {
      throw new Error('LLM返回空消息');
    }

    messages.push({ role: 'assistant', content: message.content || '' });

    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const tc of message.tool_calls) {
        let toolArgs = {};
        try {
          toolArgs = JSON.parse(tc.function?.arguments || '{}');
        } catch {}

        let toolResult: any;
        const tool = toolsRegistry.get(tc.function?.name);
        if (tool) {
          toolResult = await tool.execute(toolArgs);
        } else {
          toolResult = { error: `工具不存在: ${tc.function?.name}` };
        }

        const resultContent = typeof toolResult === 'string'
          ? toolResult
          : JSON.stringify(toolResult).slice(0, 4000);

        messages.push({ role: 'tool', content: resultContent });
      }
    } else {
      memory.add({ role: 'assistant', content: message.content || '', causeBy: 'llm_response' });
      return { result: message.content || '' };
    }
  }

  const finalMsg = messages[messages.length - 1];
  return { result: finalMsg.content || '达到最大步数限制' };
}

async function runCrewSequential(crew: CrewExecution, _sessionKey: string): Promise<void> {
  (crew as any).status = 'running';
  let context = '';

  for (const task of crew.tasks) {
    if ((crew as any).status === 'stopped') break;

    task.status = 'running';
    task.startedAt = new Date().toISOString();

    try {
      const result = await executeSingleAgent(task.agentType, task.description, task.instructions || '', context);
      task.result = result.result;
      task.status = 'completed';
      task.completedAt = new Date().toISOString();
      context = `${task.agentType}: ${result.result}`;
    } catch (err: any) {
      task.status = 'failed';
      task.error = err.message;
      task.completedAt = new Date().toISOString();
      (crew as any).status = 'failed';
      crew.completedAt = new Date().toISOString();
      return;
    }
  }

  if ((crew as any).status !== 'stopped') {
    crew.status = 'completed';
    crew.completedAt = new Date().toISOString();
  }
}

async function runCrewParallel(crew: CrewExecution, _sessionKey: string): Promise<void> {
  (crew as any).status = 'running';

  const agentPromises = crew.tasks.map(async (task) => {
    if ((crew as any).status === 'stopped') {
      task.status = 'skipped';
      return;
    }

    task.status = 'running';
    task.startedAt = new Date().toISOString();

    try {
      const result = await executeSingleAgent(task.agentType, task.description, task.instructions || '', '');
      task.result = result.result;
      task.status = 'completed';
      task.completedAt = new Date().toISOString();
      crew.workerResults.set(task.id, result.result);
    } catch (err: any) {
      task.status = 'failed';
      task.error = err.message;
      task.completedAt = new Date().toISOString();
    }
  });

  await Promise.all(agentPromises);

  if (crew.tasks.some(t => t.status === 'failed')) {
    (crew as any).status = 'failed';
  } else if ((crew as any).status !== 'stopped') {
    crew.status = 'completed';
  }
  crew.completedAt = new Date().toISOString();
}

async function executeManagerPlan(task: string, workerTypes: string[], instructions: string): Promise<{ plan: string; subtasks: Array<{ id: string; agentType: string; description: string; instructions?: string }> }> {
  const managerAgentId = `manager-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const memory = getAgentMemory(managerAgentId);

  const planPrompt = `你是一个任务分解专家（Manager Agent）。你的职责是分析复杂任务，将其分解为适合不同专业Worker执行的子任务。

可用Worker类型: ${workerTypes.join(', ')}

请按以下JSON格式输出分解结果（不要包含任何其他解释文字，只输出JSON）：
{
  "plan": "任务分解的整体思路和策略概述",
  "subtasks": [
    {
      "id": "worker-1",
      "agentType": "Worker类型（必须从可用Worker类型中选择）",
      "description": "子任务的具体描述",
      "instructions": "可选的详细执行指令"
    }
  ]
}

要求：
1. 每个子任务必须对应一个可用的Worker类型
2. 子任务之间应尽量独立，可并行执行
3. 子任务描述要清晰具体，包含完成任务所需的关键信息
4. 如果原始任务有特定要求，请在instructions中说明
${instructions ? `\n额外指令: ${instructions}` : ''}`;

  memory.add({
    role: 'system',
    content: planPrompt,
    causeBy: 'manager_init',
  });

  memory.add({
    role: 'user',
    content: `请分解以下复杂任务:\n\n${task}`,
    causeBy: 'user_input',
  });

  const provider = getDefaultProvider();
  if (!provider) {
    throw new Error('没有可用的AI Provider');
  }

  const messages = memory.toLLMMessages() as Array<{ role: string; content: string }>;

  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: provider.model,
      messages,
      temperature: 0.5,
      max_tokens: provider.maxTokens ?? 4096,
    }),
    signal: AbortSignal.timeout(provider.timeout ?? 60000),
  });

  if (!response.ok) {
    throw new Error(`Manager计划调用失败: HTTP ${response.status}`);
  }

  const data = await response.json() as any;
  const content = data.choices?.[0]?.message?.content || '';

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Manager返回的结果不是有效的JSON格式');
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.subtasks || !Array.isArray(parsed.subtasks) || parsed.subtasks.length === 0) {
      throw new Error('Manager返回的JSON中缺少有效的subtasks数组');
    }
    return { plan: parsed.plan || '', subtasks: parsed.subtasks };
  } catch (err: any) {
    throw new Error(`解析Manager计划失败: ${err.message}`);
  }
}

async function executeManagerSynthesize(originalTask: string, plan: string, workerResults: Array<{ taskId: string; agentType: string; result: string; status: string }>, instructions: string): Promise<{ result: string }> {
  const managerAgentId = `manager-synth-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const memory = getAgentMemory(managerAgentId);

  const synthesizePrompt = `你是一个结果综合专家（Manager Agent）。你的职责是审阅多个Worker的执行结果，综合成一份完整、连贯的最终答案。

要求：
1. 综合所有Worker的结果，消除冲突和重复
2. 保持逻辑清晰，结构完整
3. 如果Worker结果之间有依赖关系，请正确整合
4. 输出应该是对原始任务的完整回答
${instructions ? `\n额外指令: ${instructions}` : ''}`;

  memory.add({
    role: 'system',
    content: synthesizePrompt,
    causeBy: 'manager_init',
  });

  const workerResultsText = workerResults.map(wr =>
    `--- Worker: ${wr.agentType} (任务ID: ${wr.taskId}) ---\n${wr.result}`
  ).join('\n\n');

  memory.add({
    role: 'user',
    content: `原始任务: ${originalTask}\n\n任务分解计划: ${plan}\n\nWorker执行结果:\n\n${workerResultsText}\n\n请综合以上结果，输出最终答案。`,
    causeBy: 'user_input',
  });

  const provider = getDefaultProvider();
  if (!provider) {
    throw new Error('没有可用的AI Provider');
  }

  const messages = memory.toLLMMessages() as Array<{ role: string; content: string }>;

  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: provider.model,
      messages,
      temperature: provider.temperature ?? 0.7,
      max_tokens: provider.maxTokens ?? 4096,
    }),
    signal: AbortSignal.timeout(provider.timeout ?? 60000),
  });

  if (!response.ok) {
    throw new Error(`Manager综合调用失败: HTTP ${response.status}`);
  }

  const data = await response.json() as any;
  const result = data.choices?.[0]?.message?.content || '';

  return { result };
}

async function runCrewHierarchical(crew: CrewExecution, _sessionKey: string, task: string, workerTypes: string[], instructions: string, timeout: number): Promise<void> {
  (crew as any).status = 'running';

  try {
    const step1Result = await Promise.race([
      executeManagerPlan(task, workerTypes, instructions),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Manager任务分解超时')), timeout)),
    ]);

    const subtasks = step1Result.subtasks;
    if (!subtasks || subtasks.length === 0) {
      throw new Error('Manager未能生成有效的子任务列表');
    }

    crew.tasks = subtasks.map((st: any, idx: number) => ({
      id: st.id || `worker-${idx}`,
      agentType: st.agentType || workerTypes[idx % workerTypes.length],
      description: st.description || st.task || '',
      instructions: st.instructions || '',
      status: 'pending' as const,
    }));

    const agentPromises = crew.tasks.map(async (t) => {
      if ((crew as any).status === 'stopped') {
        t.status = 'skipped';
        return;
      }

      t.status = 'running';
      t.startedAt = new Date().toISOString();

      try {
        const result = await Promise.race([
          executeSingleAgent(t.agentType, t.description, t.instructions || '', `原始任务: ${task}\n\nManager分解说明: ${step1Result.plan || ''}`),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Worker任务 ${t.id} 超时`)), timeout)),
        ]);

        t.result = result.result;
        t.status = 'completed';
        t.completedAt = new Date().toISOString();
        crew.workerResults.set(t.id, result.result);
      } catch (err: any) {
        t.status = 'failed';
        t.error = err.message;
        t.completedAt = new Date().toISOString();
      }
    });

    await Promise.all(agentPromises);

    if (crew.tasks.some(t => t.status === 'failed')) {
      (crew as any).status = 'failed';
      crew.completedAt = new Date().toISOString();
      return;
    }

    const workerResults = crew.tasks.map(t => ({
      taskId: t.id,
      agentType: t.agentType,
      result: t.result || '',
      status: t.status,
    }));

    const step3Result = await Promise.race([
      executeManagerSynthesize(task, step1Result.plan || '', workerResults, instructions),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Manager结果综合超时')), timeout)),
    ]);

    crew.managerTask = step3Result.result;

    if ((crew as any).status !== 'stopped') {
      crew.status = 'completed';
    }
    crew.completedAt = new Date().toISOString();
  } catch (err: any) {
    crew.status = 'failed';
    crew.completedAt = new Date().toISOString();
    console.error(`[Crew ${crew.id}] 分层执行失败:`, err.message);
  }
}

// ============ 审计日志工具 ============

function registerAuditTools() {
  toolsRegistry.set('audit_query', {
    name: 'audit_query',
    description: '查询审计日志（仅管理员可用）。支持按用户、操作类型、资源、状态、时间范围筛选。',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'number', description: '用户ID（可选）' },
        action: { type: 'string', description: '操作类型（可选）', enum: Object.values(AuditAction) },
        resource: { type: 'string', description: '资源类型（可选）' },
        status: { type: 'string', description: '状态（可选）', enum: ['success', 'failure', 'warning'] },
        startTime: { type: 'string', description: '开始时间（ISO格式，可选）' },
        endTime: { type: 'string', description: '结束时间（ISO格式，可选）' },
        page: { type: 'number', description: '页码（默认1）' },
        pageSize: { type: 'number', description: '每页条数（默认50，最大200）' },
      },
    },
    execute: async ({ userId, action, resource, status, startTime, endTime, page = 1, pageSize = 50 }) => {
      try {
        const options = {
          userId,
          action,
          resource,
          status,
          startTime,
          endTime,
          page: Math.max(1, page),
          pageSize: Math.min(200, Math.max(1, pageSize)),
        };
        const result = queryAuditLogs(options);
        return {
          success: true,
          total: result.total,
          page: options.page,
          pageSize: options.pageSize,
          logs: result.logs.map(log => ({
            id: log.id,
            timestamp: log.timestamp,
            userId: log.userId,
            username: log.username,
            action: log.action,
            resource: log.resource,
            status: log.status,
            durationMs: log.durationMs,
            ipAddress: log.ipAddress,
            details: log.details ? JSON.parse(log.details) : null,
          })),
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  toolsRegistry.set('audit_stats', {
    name: 'audit_stats',
    description: '获取审计统计信息（仅管理员可用）。返回指定时间范围内的操作统计、按天统计、按状态统计等。',
    parameters: {
      type: 'object',
      properties: {
        days: { type: 'number', description: '统计天数（默认7天，最大90）' },
      },
    },
    execute: async ({ days = 7 }) => {
      try {
        const stats = getAuditStats(Math.min(90, Math.max(1, days)));
        return {
          success: true,
          stats,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });
}

// ============ 敏感词工具 ============

function registerSensitiveWordTools() {
  const filter = getSensitiveWordFilter();

  toolsRegistry.set('sensitive_check', {
    name: 'sensitive_check',
    description: '检查文本是否包含敏感词。返回是否包含敏感词以及匹配到的敏感词列表。',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '要检查的文本' },
      },
      required: ['text'],
    },
    execute: async ({ text }) => {
      try {
        const result = filter.check(text);
        return {
          success: true,
          hasSensitive: result.hasSensitive,
          matchedWords: result.matchedWords,
          wordCount: result.matchedWords.length,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  toolsRegistry.set('sensitive_add', {
    name: 'sensitive_add',
    description: '添加新的敏感词（仅管理员可用）。支持指定分类和等级。',
    parameters: {
      type: 'object',
      properties: {
        word: { type: 'string', description: '敏感词' },
        category: { type: 'string', description: '分类（默认custom）' },
        level: { type: 'number', description: '等级 1-3（默认1）' },
      },
      required: ['word'],
    },
    execute: async ({ word, category = 'custom', level = 1 }) => {
      try {
        const success = filter.addWord(word, category, level);
        if (success) {
          return {
            success: true,
            word,
            category,
            level,
            message: `敏感词 "${word}" 已添加`,
          };
        }
        return { success: false, error: '添加失败' };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  toolsRegistry.set('sensitive_remove', {
    name: 'sensitive_remove',
    description: '删除敏感词（仅管理员可用）。',
    parameters: {
      type: 'object',
      properties: {
        word: { type: 'string', description: '要删除的敏感词' },
      },
      required: ['word'],
    },
    execute: async ({ word }) => {
      try {
        const success = filter.removeWord(word);
        if (success) {
          return {
            success: true,
            word,
            message: `敏感词 "${word}" 已删除`,
          };
        }
        return { success: false, error: '敏感词不存在或删除失败' };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  toolsRegistry.set('sensitive_list', {
    name: 'sensitive_list',
    description: '列出所有敏感词及其分类（仅管理员可用）。支持按分类筛选。',
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', description: '分类筛选（可选）' },
      },
    },
    execute: async ({ category }) => {
      try {
        const words = filter.listWords(category);
        const categories = filter.getCategories();
        return {
          success: true,
          total: words.length,
          categories,
          words: words.map(w => ({
            word: w.word,
            category: w.category,
            level: w.level,
            enabled: w.enabled,
          })),
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  toolsRegistry.set('sensitive_filter', {
    name: 'sensitive_filter',
    description: '过滤文本中的敏感词。支持替换、拦截、警告三种模式。',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '要过滤的文本' },
        mode: { type: 'string', description: '过滤模式', enum: ['replace', 'block', 'warn'] },
      },
      required: ['text'],
    },
    execute: async ({ text, mode = 'replace' }) => {
      try {
        const result = filter.filter(text, mode as ReplacementMode);
        return {
          success: true,
          hasSensitive: result.hasSensitive,
          filtered: result.filtered,
          matchedWords: result.matchedWords,
          mode: result.replacementMode,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });
}
