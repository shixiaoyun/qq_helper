# 安全指南和最佳实践

最后更新: 2026-05-14

## 🔐 重要安全问题修复历史

### 已修复的 P0 问题 (2026-05-14)

#### 1. 硬编码 API 密钥 ✅
**问题**: Dashscope 和 Deepseek API 密钥硬编码在源代码中
- 文件: `server/src/scripts/updateDashscopeKey.ts`, `server/src/config/database.ts`
- **已修复**: 迁移至环境变量配置

**修复验收**:
```bash
# 验证: 不应该在源代码中出现明文 API 密钥
grep -r "sk-[a-f0-9]" server/src --include="*.ts" --include="*.js"
# 结果: 无返回（表示无硬编码密钥）
```

#### 2. 加密密钥沦级 ✅
**问题**: 数据加密使用降级密钥清单 (FALLBACK_KEYS)，允许用旧密钥解密
- 文件: `server/src/services/dataEncryption.ts`
- **已修复**: 移除所有降级密钥，仅使用 `ENCRYPTION_KEY` 环境变量

**影响**: 旧密钥加密的数据需要在应用启动时自动迁移（见迁移逻辑）

#### 3. 路由权限绕过 ✅
**问题**: AIProvider 路由同时在 `/api/admin` 和 `/api` 下注册，导致权限检查绕过
- 文件: `server/src/index.ts` line 149-150
- **已修复**: 移除非受保护的 `/api` 路由注册

**验证**:
```bash
# AIProvider 端点现在仅在 /api/admin 下
curl http://localhost:1031/api/providers    # 应返回 404
curl http://localhost:1031/api/admin/providers  # 应需要认证
```

---

## 🛡️ 安全最佳实践

### 1. 环境变量管理
✅ **DO**
```bash
# 使用 .env 文件（从不提交到 Git）
DASHSCOPE_API_KEY=sk-xxx
ENCRYPTION_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# 生成强 ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

❌ **DON'T**
```typescript
// 不要硬编码 API 密钥
const API_KEY = 'sk-hardcoded-key';

// 不要在调试日志中打印密钥
console.log('API Key:', apiKey);
```

### 2. 密钥轮换
当需要更换 `ENCRYPTION_KEY` 时:
1. 设置新的 `ENCRYPTION_KEY` 环境变量
2. 应用启动时会检测密钥变更
3. 旧密钥加密的数据会自动迁移到新密钥
4. 数据库中记录 `encryption_key_fingerprint` 用于追踪

### 3. 访问控制
所有敏感操作需要通过认证和授权：
- `/api/admin/*` - 需要 admin 角色
- `/api/auth/*` - 公开端点
- `/api/chat/*` - 需要认证

### 4. SQL 注入防护
所有数据库查询使用参数化查询：
```typescript
// ✅ 正确
db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

// ❌ 错误
db.prepare(`SELECT * FROM users WHERE id = ${userId}`);
```

### 5. 密码安全
- 所有密码使用 bcryptjs 加密存储
- 密码哈希成本因子: 10
- 禁止存储明文密码

### 6. CORS 配置
生产环境必须明确指定允许的来源：
```typescript
CORS_ORIGIN=https://your-domain.com  // 不使用 *
```

### 7. 速率限制
已启用 express-rate-limit 中间件：
- 窗口周期: 60 秒
- 最大请求数: 100
- 保护所有公开端点

### 8. 日志敏感信息
在日志中永不输出：
- API 密钥
- 用户密码
- 加密材料
- 个人身份信息 (PII)

---

## 🔍 安全审计清单

定期检查清单：

- [ ] 没有硬编码密钥或敏感数据
  ```bash
  grep -r "sk-\|password.*=\|secret.*=" server/src --include="*.ts"
  ```

- [ ] 所有数据库查询使用参数化
  ```bash
  grep -r "prepare.*\${\|prepare.*+\|query(" server/src
  ```

- [ ] 环境变量在 .env.example 中有文档说明

- [ ] 所有 API 端点都有适当的认证/授权检查

- [ ] 不存在默认凭证

---

## 📋 合规性要求

### 部署前检查清单
- [ ] `ENCRYPTION_KEY` 已设置为强随机值
- [ ] 所有 AI Provider API 密钥已配置
- [ ] JWT_SECRET 已更改为强值
- [ ] 数据库已初始化并限制访问
- [ ] CORS_ORIGIN 已设置为生产域名
- [ ] Redis 连接已加密（生产环境）
- [ ] 定期备份数据库
- [ ] 启用日志审计

---

## 🚨 安全事件响应

如发现安全问题：
1. 立即更新相关环境变量
2. 重启应用
3. 检查日志中的异常活动
4. 必要时重置用户凭证
5. 通知用户（如适用）

---

## 📚 参考资源

- [OWASP Top 10](https://owasp.org/Top10/)
- [Node.js 安全最佳实践](https://nodejs.org/en/docs/guides/nodejs-security/)
- [Express 安全建议](https://expressjs.com/en/advanced/best-practice-security.html)
- [bcryptjs 文档](https://www.npmjs.com/package/bcryptjs)
