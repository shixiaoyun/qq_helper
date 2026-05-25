import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { prisma } from './config/prisma.js';
import { getRedisClient, closeRedis } from './config/redis.js';
import { initDatabase } from './config/database.js';
import { initMCPTools } from './services/mcpTools.js';
import { initMCPToolsModular } from './mcp-tools/index.js';
import { startBackgroundIndexer } from './services/codeSemanticSearch.js';
import { startNiumaAutoSyncScheduler } from './services/niumaAutoSyncScheduler.js';

import authRoutes from './routes/auth.js';
import chatRoutes from './routes/chat.js';
import adminRoutes from './routes/admin.js';
import roleRoutes from './routes/role.js';
import aiProviderRoutes from './routes/aiProviders.js';
import browserRoutes from './routes/browser.js';
import crawlerRoutes from './routes/crawler.js';
import uploadRoutes from './routes/upload.js';
import knowledgeBaseRoutes from './routes/knowledgeBase.js';
import workflowRoutes from './routes/workflow.js';
import agentRoutes from './routes/agent.js';
import mcpRoutes from './routes/mcp.js';
import systemConfigRoutes from './routes/systemConfig.js';
import mcpAdminRoutes from './routes/mcpAdmin.js';
import mcpAgentRoutes from './routes/mcpAgents.js';
import salesCrewRoutes from './routes/salesCrew.js';
import salesCrewConfigRoutes from './routes/salesCrewConfig.js';
import crmRoutes from './routes/crm.js';
import trashRoutes from './routes/trash.js';
import upgradeRoutes from './routes/upgrade.js';
import niumaIntegrationRoutes from './routes/niumaIntegration.js';
import niumaEngineMock from './routes/niumaEngineMock.js';
import uiSettingsRoutes from './routes/uiSettings.js';
import tokenLimitsRoutes from './routes/tokenLimits.js';

const app = express();

// 初始化数据库 schema 与种子数据（MySQL，幂等）
initDatabase();

prisma.$connect().then(() => {
  console.log('✅ Database connected via Prisma');
}).catch((err: Error) => {
  console.error('❌ Database connection failed:', err.message);
});

// 初始化Redis连接 (非阻�?
try {
  getRedisClient();
} catch {
  console.warn('⚠️ Redis not available, continuing without cache');
}

// 初始�?MCP 工具
initMCPTools().catch(err => {
  console.warn('⚠️ MCP tools init failed:', err.message);
});

// 初始化模块化 MCP 工具
initMCPToolsModular().catch(err => {
  console.warn('⚠️ Modular MCP tools init failed:', err.message);
});

// 启动代码语义搜索后台索引（默认关闭——sync-mysql 会阻塞事件循环数分钟）
// 需要时在 .env 设 CODE_SEARCH_AUTO_INDEX=1，或通过 API/MCP 手动触发
if (process.env.CODE_SEARCH_AUTO_INDEX === '1') {
  startBackgroundIndexer().catch(err => {
    console.warn('⚠️ Code semantic search indexer failed:', err.message);
  });
} else {
  console.log('ℹ️  CodeSearch 后台索引已禁用 (设 CODE_SEARCH_AUTO_INDEX=1 启用)');
}

// 牛马引擎自动同步调度器（按 niuma_sync_strategy 配置定时拉取并导入 CRM）
startNiumaAutoSyncScheduler();

// 安全中间件
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    // 允许无来源请求（如移动端、桌面应用）
    if (!origin) return callback(null, true);
    // 允许 localhost 和 127.0.0.1
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }
    // 允许局域网 IP (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
    if (/^http:\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(origin)) {
      return callback(null, true);
    }
    // 允许配置的特定来源（支持 http 和 https）
    if (origin === env.CORS_ORIGIN || 
        origin === env.CORS_ORIGIN.replace('https://', 'http://') ||
        origin === env.CORS_ORIGIN.replace('http://', 'https://')) {
      return callback(null, true);
    }
    // 生产环境允许配置域名的任意子域名
    const corsDomain = new URL(env.CORS_ORIGIN).hostname;
    if (origin.includes(corsDomain)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// 限流
const limiter = rateLimit({
  windowMs: parseInt(env.RATE_LIMIT_WINDOW_MS),
  max: parseInt(env.RATE_LIMIT_MAX_REQUESTS),
  message: { success: false, error: '请求过于频繁，请稍后再试' },
});
app.use('/api/', limiter);

// 日志
app.use(morgan('dev'));

// 解析请求体
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 静态文件服�?(上传文件)
app.use('/uploads', express.static(env.UPLOAD_DIR));

// 启动时检�?ENCRYPTION_KEY
if (!process.env.ENCRYPTION_KEY) {
  console.warn('⚠️ 警告: ENCRYPTION_KEY 环境变量未设置，API Key 加密功能将不可用');
  console.warn('   建议: �?.env 文件中设置强密钥，如: ENCRYPTION_KEY=your-32-char-strong-key-here');
}

// 健康检查
app.get('/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      version: 'Q1.31',
      timestamp: new Date().toISOString(),
    },
  });
});

// API路由
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin', roleRoutes);
app.use('/api/admin', aiProviderRoutes);
// 已移除重复的非受保护路由 - aiProviderRoutes 只在 /api/admin 下暴露
app.use('/api', browserRoutes);
app.use('/api', crawlerRoutes);
app.use('/api', uploadRoutes);
app.use('/api', knowledgeBaseRoutes);
app.use('/api', workflowRoutes);
app.use('/api', agentRoutes);
app.use('/api/mcp', mcpRoutes);
app.use('/api/admin/config', systemConfigRoutes);
app.use('/api/admin/mcp', mcpAdminRoutes);
app.use('/api/admin/mcp/agents', mcpAgentRoutes);
app.use('/api/sales-crew', salesCrewRoutes);
app.use('/api/sales-crew-config', salesCrewConfigRoutes);
app.use('/api', crmRoutes);
app.use('/api', trashRoutes);
app.use('/api', upgradeRoutes);
app.use('/api', niumaIntegrationRoutes);
app.use('/', niumaIntegrationRoutes);
app.use('/api', niumaEngineMock);
app.use('/', niumaEngineMock);
app.use('/api', uiSettingsRoutes);
app.use('/api', tokenLimitsRoutes);

// 404处理
app.use((_req, res) => {
  res.status(404).json({ success: false, error: '接口不存在' });
});

// 错误处理
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    error: env.NODE_ENV === 'development' ? err.message : '服务器内部错误',
  });
});

const PORT = parseInt(env.PORT);

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 OQ助手服务端已启动 (vQ1.31)`);
  console.log(`📡 端口: ${PORT}`);
  console.log(`🌍 环境: ${env.NODE_ENV}`);
  console.log(`🔗 OQ引擎: ${env.NIUMA_ENGINE_URL}`);
  console.log(`🌐 监听: 0.0.0.0:${PORT} (支持局域网访问)`);
});

// 优雅关闭
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(async () => {
    await prisma.$disconnect();
    await closeRedis();
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(async () => {
    await prisma.$disconnect();
    await closeRedis();
    console.log('Server closed');
    process.exit(0);
  });
});
