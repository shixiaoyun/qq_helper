# Controllers 目录

## 说明
此目录用于存放 Express 控制器层（MVC 架构）。

## 规划状态
⏳ **计划中** - 当前项目使用路由直接处理业务逻辑，控制器层重构规划中

## 预期结构
```
controllers/
├── auth.controller.ts          # 认证相关
├── user.controller.ts          # 用户管理  
├── chat.controller.ts          # 聊天功能
├── crawl.controller.ts         # 网页爬虫
├── workflow.controller.ts      # 工作流管理
└── ...
```

## 迁移计划
- [ ] 从路由中提取业务逻辑到控制器
- [ ] 统一错误处理
- [ ] 添加请求验证
- [ ] 集成日志记录

## 当前状态
- 所有业务逻辑当前位于 `routes/` 目录
- 推荐重构时间线：Q2 季度
