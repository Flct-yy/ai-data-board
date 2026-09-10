# AGENTS.md

> 本文件是仓库级 AI 编程规则。Claude Code / Cursor / Codex 启动自动读取。

## 1. 项目简介

- 名称: ai-data-dashboard
- 一句话定位: 上传 CSV，自然语言提问，AI 流式出分析 + 可交互图表的看板应用
- 当前阶段: 开发中

## 2. 技术栈

- 语言: TypeScript (strict)
- 框架: Next.js 14 (App Router) + React 18
- 包管理: pnpm
- 数据库: Supabase Postgres + pgvector
- AI: Vercel AI SDK (streamText + tools + maxSteps) + OpenAI gpt-4o
- 图表: Recharts
- CSV: PapaParse (Web Worker 内流式解析)
- 部署: Vercel

## 3. 常用命令

- 安装依赖: `pnpm install`
- 启动开发: `pnpm dev`
- 构建: `pnpm build`
- 测试(全部): `pnpm test`
- 测试(单个文件): `pnpm test -- src/lib/csv/schema-infer.test.ts`
- Lint: `pnpm lint`
- 类型检查: `pnpm typecheck`

## 4. 代码结构

```
ai-data-dashboard/
├── src/
│   ├── app/                    # 路由 + API
│   │   ├── page.tsx            # 首页(上传入口)
│   │   ├── analyze/[sessionId]/ # 分析对话页
│   │   ├── history/            # 历史报告库
│   │   └── api/
│   │       ├── chat/           # agent 核心: streamText + tools
│   │       └── sessions/       # 创建会话 + 存 CSV 行
│   ├── components/
│   │   ├── chart/              # 流式图表 + 可交互图表(圈选)
│   │   ├── chat/               # 对话面板 + 工具轨迹
│   │   └── upload/             # CSV 上传(Web Worker)
│   ├── lib/
│   │   ├── ai/                 # tools + schema + prompts
│   │   ├── csv/                # parser.worker + schema-infer
│   │   ├── rag/                # 查询改写 + 召回 + 重排
│   │   └── db/                 # Supabase client
│   ├── hooks/                  # use-streaming-chart
│   └── types/                  # 类型定义
└── supabase/migrations/       # 建表 SQL (含 pgvector)
```

约定:
- 新代码放哪: 按功能分目录，组件进 components/，逻辑进 lib/
- 测试放哪: 紧邻被测文件，*.test.ts
- 禁止改: .next/ 和 node_modules/

## 5. 编码约定

- 命名: 文件 kebab-case，组件 PascalCase，变量/函数 camelCase
- 类型: 禁止 any；公共函数标返回类型；用 Zod 做运行时校验
- 导入: 用 @/ 别名指向 src/
- 错误处理: 边界(用户输入/外部 API)校验；内部信任类型
- 注释: 默认不写；只在 WHY 非显然时写一行
- 依赖: 新增前确认无现成方案

## 6. 日志要求

- 暂用 console（开发期），上线接 Sentry
- 级别: console.debug/info/warn/error
- 禁止: 生产环境 console.log 敏感数据（API key、用户数据）
- LLM 调用: 记录 model/prompt 长度/latency，不记完整 prompt

## 7. 测试要求

- 框架: vitest
- 覆盖: lib/ 下纯函数必须有测试（schema-infer、mergePartialSpec、aggregate）
- 不要写: 依赖外部网络(LLM/Supabase)的测试，用 mock

## 8. Git 工作流

- 分支: 从 main 拉 feat/xxx 或 fix/xxx
- 提交: type: 动词 对象 —— 如 feat: 添加圈选续问
- 不要: push main、--force、--no-verify、commit 未跑测试的代码
- PR: 标题<70 字符；正文写 why

## 9. 安全与审批门

- 删除文件/目录: 先列出内容等确认
- 数据库: 改 migration、删表 —— 先预览 SQL
- 环境变量: .env 不提交；新增 env 先确认不泄密钥
- CSV 数据: 用户上传的 CSV 可能含敏感数据，日志不记内容

## 10. AI Agent 行为约定

- 改代码前: 先读相关文件确认上下文
- 不确定时: 问，别猜 API
- 改完: 跑 pnpm typecheck && pnpm lint 全绿才算完成
- 范围: 只改与任务直接相关的
- LLM 输出: 永远过 Zod 校验，不信原始输出
