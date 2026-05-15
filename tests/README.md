# 测试目录结构

## 说明
此目录存放所有自动化测试文件。

## 目录结构

```
tests/
├── unit/                 # 单元测试
├── integration/          # 集成测试
├── stress/               # 压力/负载测试
├── workflows/            # 工作流测试
└── e2e/                  # 端到端测试
```

## 测试文件位置

### 单元测试 (`unit/`)
- TypeScript 功能单元测试
- 单一函数/模块测试

### 集成测试 (`integration/`)
- 多模块交互测试
- 位置：`server/src/__tests__/` 
- 已有测试：
  - `agentMemory.test.ts`
  - `ragService.test.ts`
  - `workflowEngine.test.ts`
  - `agent-e2e.test.ts` （实际上是集成测试）

### 压力测试 (`stress/`)
- `test-crm-stress.js` - CRM 系统压力测试
- `test_agent_tools.js` - Agent 工具压力测试

### 工作流测试 (`workflows/`)
- `test-crm-workflow.js` - CRM 工作流测试
- `test_crew_collab.js` - Crew 协作工作流测试
- `test_ai_browser.js` - AI 浏览器功能测试
- `test_oq_auto.js` - OQ 自动化测试

## 运行测试

```bash
# 运行所有单元测试
npm run test

# 运行压力测试
npm run test:stress

# 运行工作流测试
npm run test:workflows

# 运行 E2E 测试
npm run test:e2e
```

## 注意
- 根目录级别的测试脚本应该迁移到 `tests/` 子目录
- 保持 `server/src/__tests__/` 用于紧密耦合的单元测试
- 独立的测试脚本应放在 `tests/` 目录下
