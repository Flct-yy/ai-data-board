# AI 数据分析看板

上传 CSV，用自然语言提问，AI 流式出分析 + 可交互图表。

## 功能

- 上传 CSV（Web Worker 流式解析，大文件不卡 UI）
- 自然语言提问，AI 自动跑统计 + 生成图表
- 流式渐进式图表渲染（数据越多图表越完整）
- 多步工具调用（ReAct）：跑统计 → 画图 → 查历史报告
- 可交互图表：点击柱子圈选，注入上下文让 agent 续答
- 历史报告 RAG：检索过往分析做对比
- 工具调用轨迹可视化（非黑盒）

## 技术栈

- Next.js 14 (App Router) + React 18 + TypeScript
- Vercel AI SDK（streamText + tools + maxSteps）
- Supabase Postgres + pgvector（RAG 向量检索）
- Recharts（图表）+ PapaParse（CSV 解析）

## 快速开始

```bash
pnpm install
cp .env.local.example .env.local  # 填入 OpenAI + Supabase key
# 在 Supabase SQL Editor 执行 supabase/migrations/0001_init.sql
pnpm dev
```

打开 http://localhost:3000，上传 CSV 开始提问。

## 项目结构

见 [AGENTS.md](./AGENTS.md) 第 4 节。

## 技术亮点

1. **流式渐进式图表**：用 `streamObject` partial JSON streaming，前端边收边 merge 边渲染，图表逐帧长出，不卡半秒白屏。partial JSON 容错解析（补全缺失闭合括号）。
2. **多步工具调用编排**：`streamText` + `maxSteps` 跑 ReAct 循环，工具间数据自动传递；中间态用 ToolTrace 组件可视化。
3. **LLM 输出 schema 容错**：Zod 定义 ChartSpec，LLM 输出过校验，缺字段补默认、type 非法降级 bar、验证失败回退文字。
4. **RAG 查询改写 + 重排**：用户问题拆成多个检索 query，各自召回合并去重，重排后注入上下文。
5. **大 CSV Web Worker**：PapaParse 在 Worker 内流式解析，每 5000 行回传进度，主线程不卡。
6. **可交互图表引导分析**：圈选图表维度 → 自动注入提问 → agent 续答，从"看图"变"用图操控 agent"。

## 数据库

在 Supabase SQL Editor 执行 [0001_init.sql](./supabase/migrations/0001_init.sql)，会创建 sessions / messages / reports / csv_data / report_chunks 表 + pgvector 扩展 + 召回函数。

## 环境变量

见 [.env.local.example](./.env.local.example)。
