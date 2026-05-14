import { createLLMProvider, type LLMProviderConfig } from './llmProvider.js';
import { listMCPTools, executeMCPTool } from './mcpTools.js';
import { getDefaultProvider } from '../models/aiProvider.js';

// MCP (Model Context Protocol) 工具协议实现
// 参考: https://modelcontextprotocol.io/

export interface MCPTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required?: string[];
  };
  execute: (args: Record<string, any>) => Promise<any>;
}

export interface MCPResource {
  uri: string;
  name: string;
  description: string;
  mimeType?: string;
  read: () => Promise<string>;
}

export interface MCPPrompt {
  name: string;
  description: string;
  arguments?: Array<{
    name: string;
    description: string;
    required?: boolean;
  }>;
  render: (args: Record<string, string>) => string;
}

// MCP服务 - 统一工具管理入口
// 所有工具注册在 mcpTools.ts 中，此处只提供统一访问接口
export const mcpService = {
  // 获取所有可用工具（从 mcpTools.ts 获取）
  listTools(): Array<{ name: string; description: string; parameters: any }> {
    return listMCPTools();
  },

  // 执行工具（统一委托给 mcpTools.ts）
  async executeTool(name: string, args: Record<string, any>): Promise<any> {
    return await executeMCPTool(name, args);
  },

  // 获取单个工具信息
  getTool(name: string): any {
    const tools = listMCPTools();
    return tools.find(t => t.name === name);
  },

  // 获取工具提示（用于LLM系统提示）
  getToolsPrompt(): string {
    const tools = listMCPTools();
    if (tools.length === 0) return '';

    // 只列出关键工具，避免提示词过长
    const keyTools = tools.filter(t =>
      t.name.startsWith('browser_') ||
      t.name === 'system_info' ||
      t.name === 'shell_exec' ||
      t.name === 'http_request'
    );

    const lines = keyTools.map(t => {
      const params = Object.entries(t.parameters.properties)
        .map(([k, v]) => `${k}(${(v as any).type})`)
        .join(', ');
      return `- ${t.name}: ${t.description} 参数: ${params}`;
    });

    return `你可以使用以下工具帮助用户:\n${lines.join('\n')}\n\n使用工具时，严格按以下格式:\n工具调用: <tool_name>\n参数: <JSON>\n\n示例:\n工具调用: system_info\n参数: {"type":"disk"}\n\n工具调用: browser_navigate\n参数: {"url":"https://www.baidu.com"}`;
  },

  // 解析LLM响应中的工具调用
  parseToolCall(content: string): { name: string; args: Record<string, any> } | null {
    const toolMatch = content.match(/工具调用:\s*(\w+)\s*\n参数:\s*(\{[\s\S]*?\})/);
    if (toolMatch) {
      try {
        return {
          name: toolMatch[1],
          args: JSON.parse(toolMatch[2]),
        };
      } catch {
        return null;
      }
    }
    return null;
  },

  // 自动工具调用循环（类似Function Calling）
  async autoToolLoop(
    messages: Array<{ role: string; content: string }>,
    maxIterations = 3
  ): Promise<{ content: string; toolCalls: Array<{ name: string; args: any; result: any }> }> {
    const provider = await getDefaultLLMProvider();
    const toolCalls: Array<{ name: string; args: any; result: any }> = [];

    // 获取用户最新消息
    const userMessage = messages.filter(m => m.role === 'user').pop();
    const userContent = userMessage?.content || '';

    // 基于关键词直接检测工具调用（不依赖AI解析）
    const directToolCall = this.detectToolCall(userContent);
    if (directToolCall) {
      try {
        const timeoutMs = directToolCall.name.startsWith('browser_') ? 45000 : 15000;
        const result = await Promise.race([
          this.executeTool(directToolCall.name, directToolCall.args),
          new Promise((_, reject) => setTimeout(() => reject(new Error('工具执行超时')), timeoutMs))
        ]);
        toolCalls.push({ name: directToolCall.name, args: directToolCall.args, result });

        // 将工具结果发送给AI生成自然语言回复
        const resultStr = JSON.stringify(result, null, 2);
        const truncatedResult = resultStr.length > 2000 ? resultStr.slice(0, 2000) + '...' : resultStr;

        messages.push({
          role: 'assistant' as const,
          content: `我已经执行了工具 "${directToolCall.name}"，结果如下：\n${truncatedResult}\n\n请基于以上结果直接回答用户问题。`,
        });

        // 让AI生成最终回复
        const finalResponse = await provider.chat({ messages: messages as any, maxTokens: 1024 });
        return { content: finalResponse.content, toolCalls };
      } catch (err: any) {
        return { content: `工具执行失败: ${err.message}`, toolCalls };
      }
    }

    // 如果没有直接检测到工具调用，使用传统方式让AI决定
    // 添加工具提示到系统消息
    const toolsPrompt = this.getToolsPrompt();
    const systemMsg = messages.find(m => m.role === 'system');
    if (systemMsg && toolsPrompt) {
      systemMsg.content += '\n\n' + toolsPrompt;
    }

    for (let i = 0; i < maxIterations; i++) {
      // 单次LLM调用，减少token和延迟
      const response = await provider.chat({ messages: messages as any, maxTokens: 1024 });
      const content = response.content;

      // 检查是否有工具调用
      const toolCall = this.parseToolCall(content);
      if (!toolCall) {
        // 没有工具调用，返回最终结果
        return { content, toolCalls };
      }

      // 执行工具（带超时，浏览器工具给更长时间）
      try {
        const timeoutMs = toolCall.name.startsWith('browser_') ? 45000 : 15000;
        const result = await Promise.race([
          this.executeTool(toolCall.name, toolCall.args),
          new Promise((_, reject) => setTimeout(() => reject(new Error('工具执行超时')), timeoutMs))
        ]);
        toolCalls.push({ name: toolCall.name, args: toolCall.args, result });

        // 将工具结果添加到对话历史（精简结果，减少token）
        const resultStr = JSON.stringify(result, null, 2);
        const truncatedResult = resultStr.length > 2000 ? resultStr.slice(0, 2000) + '...' : resultStr;

        messages.push({ role: 'assistant' as const, content });
        messages.push({
          role: 'user' as const,
          content: `工具 "${toolCall.name}" 执行结果: ${truncatedResult}\n\n请基于以上结果直接回答用户问题，不要再调用工具。`,
        });
      } catch (err: any) {
        messages.push({ role: 'assistant' as const, content });
        messages.push({
          role: 'user' as const,
          content: `工具 "${toolCall.name}" 执行失败: ${err.message}\n\n请直接回答用户问题。`,
        });
      }
    }

    // 达到最大迭代次数，直接返回
    return { content: '工具调用次数过多，请稍后重试。', toolCalls };
  },

  // 基于关键词检测工具调用（不依赖AI解析）
  detectToolCall(content: string): { name: string; args: any } | null {
    const lowerContent = content.toLowerCase();

    // 检测磁盘/容量查询
    if (/d盘|d盘容量|磁盘容量|硬盘容量|查看.*盘|容量多大|空间多大|剩余空间/.test(lowerContent)) {
      return { name: 'system_info', args: { type: 'disk' } };
    }

    // 检测内存查询
    if (/内存|ram|memory/.test(lowerContent)) {
      return { name: 'system_info', args: { type: 'memory' } };
    }

    // 检测CPU查询
    if (/cpu|处理器|cpu使用率/.test(lowerContent)) {
      return { name: 'system_info', args: { type: 'cpu' } };
    }

    // 检测系统时间
    if (/时间|几点|日期/.test(lowerContent)) {
      return { name: 'system_info', args: { type: 'time' } };
    }

    // 检测浏览器导航操作（包含网址）
    if (/导航到|访问|打开.*(https?:\/\/|www\.)|前往/.test(lowerContent)) {
      const urlMatch = content.match(/(https?:\/\/[^\s]+|www\.[^\s]+)/);
      if (urlMatch) {
        let url = urlMatch[1];
        if (url.startsWith('www.')) url = 'https://' + url;
        return { name: 'browser_navigate', args: { url } };
      }
    }

    // 检测浏览器操作（创建会话并导航）
    if (/打开浏览器|启动浏览器|创建浏览器/.test(lowerContent)) {
      if (/百度/.test(lowerContent)) {
        return { name: 'browser_create_session', args: { url: 'https://www.baidu.com' } };
      }
      return { name: 'browser_create_session', args: {} };
    }

    // 检测百度搜索或访问百度
    if (/百度.*搜索|搜索.*百度|在百度|访问百度|打开百度/.test(lowerContent)) {
      return { name: 'browser_navigate', args: { url: 'https://www.baidu.com' } };
    }

    // 检测浏览器截图
    if (/截图|screenshot|截屏/.test(lowerContent)) {
      return { name: 'browser_screenshot', args: {} };
    }

    // 检测页面快照
    if (/快照|snapshot|查看元素|分析页面|获取页面/.test(lowerContent)) {
      return { name: 'browser_snapshot', args: {} };
    }

    // 检测浏览器点击（登录按钮）
    if (/点击.*登录|登录.*按钮|click.*login|submit/.test(lowerContent)) {
      return { name: 'browser_click', args: { selector: 'button[type="submit"], button:has-text("登录"), input[type="submit"]' } };
    }

    // 检测浏览器点击（通用）
    if (/点击|click|按下/.test(lowerContent)) {
      return { name: 'browser_click', args: { selector: 'button, input[type="submit"], a' } };
    }

    // 检测表单填写（用户名）
    if (/输入.*用户名|填写.*用户名|用户名.*输入|用户名.*填写/.test(lowerContent)) {
      const valueMatch = content.match(/(?:用户名|账号)\s*(?:为|是|:)?\s*(\S+)/);
      const value = valueMatch ? valueMatch[1] : 'admin';
      return { name: 'browser_fill', args: { selector: 'input[type="text"], input[name="username"], input[placeholder*="用户名"]', value } };
    }

    // 检测表单填写（密码）
    if (/输入.*密码|填写.*密码|密码.*输入|密码.*填写/.test(lowerContent)) {
      const valueMatch = content.match(/(?:密码)\s*(?:为|是|:)?\s*(\S+)/);
      const value = valueMatch ? valueMatch[1] : 'admin123';
      return { name: 'browser_fill', args: { selector: 'input[type="password"], input[name="password"], input[placeholder*="密码"]', value } };
    }

    // 检测按键操作（Enter）
    if (/按.*回车|按.*enter|按下回车|按下enter/.test(lowerContent)) {
      return { name: 'browser_press', args: { key: 'Enter' } };
    }

    // 检测按键操作（Tab）
    if (/按.*tab|按下tab/.test(lowerContent)) {
      return { name: 'browser_press', args: { key: 'Tab' } };
    }

    // 检测等待
    if (/等待|wait/.test(lowerContent)) {
      return { name: 'browser_wait', args: { timeout: 3000 } };
    }

    // 检测返回
    if (/返回.*上一页|后退|go.back/.test(lowerContent)) {
      return { name: 'browser_go_back', args: {} };
    }

    // 检测刷新
    if (/刷新|reload|重新加载/.test(lowerContent)) {
      return { name: 'browser_reload', args: {} };
    }

    // 检测滚动
    if (/向下滚动|scroll.*down|往下滚/.test(lowerContent)) {
      return { name: 'browser_scroll', args: { direction: 'down' } };
    }
    if (/向上滚动|scroll.*up|往上滚/.test(lowerContent)) {
      return { name: 'browser_scroll', args: { direction: 'up' } };
    }

    // 检测通用表单填写
    if (/填写|输入|fill|type/.test(lowerContent)) {
      return { name: 'browser_fill', args: { selector: 'input', value: '' } };
    }

    // 检测IP查询
    if (/ip地址|我的ip|查看ip/.test(lowerContent)) {
      return { name: 'get_ip_info', args: {} };
    }

    // 检测网络搜索
    if (/搜索|search|查一下|查询|google|百度一下/.test(lowerContent)) {
      const queryMatch = content.match(/(?:搜索|search|查一下|查询)["']?(.+?)["']?(?:\s|$)/i);
      const query = queryMatch ? queryMatch[1].trim() : content.slice(0, 100);
      return { name: 'web_search', args: { query, max_results: 5 } };
    }

    // 检测文件编辑（Search/Replace）
    if (/编辑文件|修改文件|替换.*文件|file.edit|search.replace/.test(lowerContent)) {
      const pathMatch = content.match(/(?:文件|file)["']?\s*[:：]?\s*["']?([^\s"'"]+)["']?/);
      const path = pathMatch ? pathMatch[1] : '';
      return { name: 'file_edit', args: { path, old_string: '', new_string: '' } };
    }

    // 检测文件模式匹配
    if (/查找文件|glob|匹配文件|找.*文件/.test(lowerContent)) {
      const patternMatch = content.match(/(?:模式|pattern|glob)["']?\s*[:：]?\s*["']?([^\s"'"]+)["']?/);
      const pattern = patternMatch ? patternMatch[1] : '**/*';
      return { name: 'glob', args: { pattern } };
    }

    // 检测待办事项
    if (/待办|todo|任务列表|任务进度/.test(lowerContent)) {
      return { name: 'todo_read', args: {} };
    }

    // 检测任务创建
    if (/创建任务|新建任务|添加任务|task.create/.test(lowerContent)) {
      const titleMatch = content.match(/(?:任务|title)["']?\s*[:：]?\s*["']?(.+?)["']?(?:\s|$)/i);
      const title = titleMatch ? titleMatch[1].trim() : '新任务';
      return { name: 'task_create', args: { title } };
    }

    // 检测任务列表
    if (/列出任务|查看任务|所有任务|task.list/.test(lowerContent)) {
      return { name: 'task_list', args: {} };
    }

    // 检测子Agent委派
    if (/委派|agent|子任务|并行执行|分解任务/.test(lowerContent)) {
      const typeMatch = content.match(/(?:类型|type)["']?\s*[:：]?\s*["']?([^\s"'"]+)["']?/);
      const type = typeMatch ? typeMatch[1] : 'Explore';
      return { name: 'agent_run', args: { type, description: content.slice(0, 200) } };
    }

    // 检测计划模式
    if (/创建计划|制定计划|plan|执行计划|步骤/.test(lowerContent)) {
      return { name: 'plan_create', args: { title: content.slice(0, 50), steps: [] } };
    }

    // 检测询问用户
    if (/询问用户|问用户|确认一下|请回答|你怎么看/.test(lowerContent)) {
      return { name: 'ask_user', args: { question: content.slice(0, 200) } };
    }

    // 检测LSP符号查询
    if (/符号列表|函数列表|类列表|代码结构|lsp.*symbol/.test(lowerContent)) {
      const pathMatch = content.match(/(?:文件|path)["']?\s*[:：]?\s*["']?([^\s"'"]+)["']?/);
      const path = pathMatch ? pathMatch[1] : '';
      return { name: 'lsp_symbols', args: { path, kind: 'all' } };
    }

    // 检测LSP诊断
    if (/代码检查|语法检查|诊断|diagnostic|lint/.test(lowerContent)) {
      const pathMatch = content.match(/(?:文件|path)["']?\s*[:：]?\s*["']?([^\s"'"]+)["']?/);
      const path = pathMatch ? pathMatch[1] : '';
      return { name: 'lsp_diagnostics', args: { path } };
    }

    // 检测Notebook操作
    if (/notebook|jupyter|ipynb/.test(lowerContent)) {
      const pathMatch = content.match(/(?:文件|path)["']?\s*[:：]?\s*["']?([^\s"'"]+)["']?/);
      const path = pathMatch ? pathMatch[1] : '';
      if (/创建|新建|create/.test(lowerContent)) {
        return { name: 'notebook_create', args: { path: path || 'notebook.ipynb' } };
      }
      if (/读取|查看|read/.test(lowerContent)) {
        return { name: 'notebook_read', args: { path: path || 'notebook.ipynb' } };
      }
    }

    // 检测定时任务
    if (/定时任务|cron|定时执行|周期性/.test(lowerContent)) {
      if (/创建|新建|create/.test(lowerContent)) {
        return { name: 'cron_create', args: { name: '定时任务', schedule: '0 * * * *', command: 'echo "定时任务执行"' } };
      }
      if (/列出|查看|list/.test(lowerContent)) {
        return { name: 'cron_list', args: {} };
      }
    }

    // 检测系统监控
    if (/监控|monitor|系统监控|资源监控/.test(lowerContent)) {
      if (/启动|开始|start/.test(lowerContent)) {
        return { name: 'monitor_start', args: { interval: 10 } };
      }
      if (/停止|stop/.test(lowerContent)) {
        return { name: 'monitor_stop', args: {} };
      }
      if (/状态|status/.test(lowerContent)) {
        return { name: 'monitor_status', args: {} };
      }
      if (/进程|process/.test(lowerContent)) {
        return { name: 'monitor_processes', args: { limit: 20 } };
      }
      if (/网络|network|端口/.test(lowerContent)) {
        return { name: 'monitor_network', args: { type: 'connections' } };
      }
    }

    return null;
  },
};

// 获取默认LLM Provider
function getDefaultLLMProvider() {
  const provider = getDefaultProvider();
  if (!provider) throw new Error('没有可用的AI模型，请先配置模型');
  return createLLMProvider(provider as unknown as LLMProviderConfig);
}
