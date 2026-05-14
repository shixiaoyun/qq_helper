# 牛马AI助手平台 (Niuma AI Platform)

一个独立的多用户AI助手系统平台，通过API接入牛马AI引擎，支持大量用户注册登录使用，各自拥有独立的对话空间。

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                        前端层 (React + Vite)                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  用户登录    │  │  AI对话界面  │  │  管理后台            │ │
│  │  注册页面    │  │  多会话管理  │  │  数据统计/用户管理    │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                      API 层 (Express + TypeScript)            │
│  /api/auth/*    /api/chat/*    /api/admin/*                  │
│  JWT认证        会话管理        管理员权限/统计               │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                      数据层 (SQLite)                          │
│  users.db (用户/角色/设置)  chat.db (会话/消息/Token使用)      │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                      外部AI服务层                             │
│              牛马AI引擎 (http://localhost:1078)               │
│         通过 /api/ai/chat 接口调用模型和工具                  │
└─────────────────────────────────────────────────────────────┘
```

## 技术栈

### 后端 (server/)
- **Node.js + Express + TypeScript** - 服务端框架
- **better-sqlite3** - SQLite数据库
- **jose** - JWT认证
- **bcryptjs** - 密码加密
- **zod** - 数据校验
- **helmet + cors + express-rate-limit** - 安全中间件

### 前端 (web/)
- **React 19 + Vite + TypeScript** - 前端框架
- **Tailwind CSS** - 样式
- **Zustand** - 状态管理
- **Axios** - HTTP请求
- **Recharts** - 数据图表
- **Lucide React** - 图标

## 核心功能

### 用户系统
- [x] 用户注册/登录/退出
- [x] JWT Token认证
- [x] 角色权限管理 (superadmin/admin/vip_user/user)
- [x] 密码修改/重置
- [x] 个人资料管理

### AI对话系统
- [x] 多会话管理（创建/切换/删除/搜索）
- [x] 消息持久化存储
- [x] 工具调用开关
- [x] 联网搜索开关
- [x] 消息复制功能
- [x] 流式输出支持（预留）

### 数据统计
- [x] 用户Token使用统计（按用户/按模型/按时间）
- [x] 每日使用量趋势图
- [x] Token输入/输出对比
- [x] 用户活跃度排名
- [x] 模型使用分布

### 后台管理
- [x] 用户列表（分页/搜索/筛选）
- [x] 用户创建/编辑/删除
- [x] 禁用/启用用户
- [x] 重置用户密码
- [x] 数据仪表盘（图表展示）

## 项目结构

```
niuma-ai-platform/
├── package.json              # 根package.json，工作区配置
├── server/                   # 后端服务
│   ├── src/
│   │   ├── config/
│   │   │   ├── database.ts   # SQLite数据库配置
│   │   │   └── env.ts        # 环境变量
│   │   ├── models/
│   │   │   ├── user.ts       # 用户模型
│   │   │   ├── conversation.ts # 会话模型
│   │   │   └── stats.ts      # 统计模型
│   │   ├── routes/
│   │   │   ├── auth.ts       # 认证路由
│   │   │   ├── chat.ts       # 对话路由
│   │   │   └── admin.ts      # 管理路由
│   │   ├── services/
│   │   │   └── niumaEngine.ts # 牛马AI引擎服务
│   │   ├── utils/
│   │   │   ├── auth.ts       # JWT工具
│   │   │   └── response.ts   # 响应工具
│   │   └── index.ts          # 入口文件
│   ├── package.json
│   └── tsconfig.json
└── web/                      # 前端应用
    ├── src/
    │   ├── components/
    │   │   └── Layout.tsx    # 布局组件
    │   ├── pages/
    │   │   ├── Login.tsx     # 登录页
    │   │   ├── Register.tsx  # 注册页
    │   │   ├── Chat.tsx      # AI对话页
    │   │   ├── Dashboard.tsx # 仪表盘页
    │   │   └── Admin.tsx     # 用户管理页
    │   ├── stores/
    │   │   └── auth.ts       # 认证状态
    │   ├── App.tsx           # 路由配置
    │   └── main.tsx          # 入口
    ├── package.json
    └── vite.config.ts
```

## 快速开始

### 1. 安装依赖

```bash
# 安装根依赖
npm install

# 安装后端依赖
cd server && npm install

# 安装前端依赖
cd web && npm install
```

### 2. 配置环境变量

```bash
cd server
cp .env.example .env
# 编辑 .env 文件，配置牛马AI引擎地址等
```

### 3. 启动开发服务器

```bash
# 同时启动前后端（在根目录）
npm run dev

# 或分别启动
# 后端
cd server && npm run dev

# 前端
cd web && npm run dev
```

### 4. 访问系统

- 前端: http://localhost:3020
- 后端API: http://localhost:102
- 默认管理员: admin / admin123

## API接口

### 认证接口
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/auth/register | 用户注册 |
| POST | /api/auth/login | 用户登录 |
| POST | /api/auth/logout | 退出登录 |
| GET | /api/auth/me | 获取当前用户 |
| PUT | /api/auth/profile | 更新资料 |
| PUT | /api/auth/password | 修改密码 |

### 对话接口
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/chat/conversations | 获取会话列表 |
| POST | /api/chat/conversations | 创建会话 |
| PUT | /api/chat/conversations/:id | 更新会话 |
| DELETE | /api/chat/conversations/:id | 删除会话 |
| GET | /api/chat/conversations/:id/messages | 获取消息 |
| DELETE | /api/chat/conversations/:id/messages | 清空消息 |
| POST | /api/chat | 发送消息 |

### 管理接口
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/admin/users | 用户列表 |
| POST | /api/admin/users | 创建用户 |
| PUT | /api/admin/users/:id | 更新用户 |
| DELETE | /api/admin/users/:id | 删除用户 |
| POST | /api/admin/users/:id/reset-password | 重置密码 |
| GET | /api/admin/stats/overview | 总览统计 |
| GET | /api/admin/stats/daily | 每日统计 |
| GET | /api/admin/stats/models | 模型统计 |
| GET | /api/admin/stats/users | 用户排名 |

## 数据库设计

### 用户表 (users)
- id, username, email, phone, password_hash, nickname, avatar
- role, status, email_verified, phone_verified
- last_login_at, last_login_ip, created_at, updated_at

### 会话表 (conversations)
- id, user_id, title, provider, model
- system_prompt, temperature, max_tokens
- status, message_count, total_tokens
- total_input_tokens, total_output_tokens
- last_message_at, created_at, updated_at

### 消息表 (messages)
- id, conversation_id, user_id, role, content
- tool_calls, tool_results
- tokens_input, tokens_output
- provider, model, latency_ms
- status, error_message, created_at

### Token使用记录 (token_usage)
- id, user_id, conversation_id, message_id
- provider, model
- tokens_input, tokens_output, total_tokens
- cost_estimate, created_at

## 配置说明

### 牛马AI引擎接入
在 `server/.env` 中配置：
```
NIUMA_ENGINE_URL=http://localhost:1078
```

系统通过 `/api/ai/chat` 接口调用牛马AI引擎，支持：
- 多模型切换（Ollama/百炼/OpenAI）
- 工具调用（企业查询、盗版分析等）
- 联网搜索

## 安全特性

- JWT Token认证
- bcrypt密码加密
- Helmet安全头
- CORS跨域控制
- 请求速率限制
- SQL注入防护（参数化查询）
- XSS防护

## 后续优化方向

1. **流式输出** - 实现SSE流式响应
2. **文件上传** - 支持图片/文档上传分析
3. **多模型管理** - 后台配置多个AI提供商
4. **计费系统** - 按Token计费、充值系统
5. **邀请码** - 注册邀请机制
6. **消息分支** - 对话分支管理
7. **导出功能** - 导出对话历史
8. **主题切换** - 深色/浅色模式
9. **移动端适配** - 响应式优化
10. **Docker部署** - 容器化部署支持

## 许可证

MIT
