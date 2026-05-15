# Middleware 目录

## 说明
此目录用于存放 Express 中间件（如认证、错误处理、日志等）。

## 规划状态
⏳ **部分实现** - 一些中间件集成在路由中，计划统一提取到此目录

## 已有相关功能
- 认证中间件：见 `routes/auth.ts`
- 错误处理：见 `index.ts`
- 速率限制：見 `index.ts` (express-rate-limit)

## 标准中间件模板

```typescript
// middleware/auth.ts
import { Request, Response, NextFunction } from 'express';

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // 验证逻辑
  next();
};
```

## 计划迁移项
- [ ] 提取认证中间件
- [ ] 创建错误处理中间件
- [ ] 创建请求日志中间件
- [ ] 创建 CORS 中间件
- [ ] 创建请求验证中间件

## 当前状态
- 中间件逻辑分散在各路由文件中
- 推荐重构时间线：Q2 季度
