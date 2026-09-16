# CSV 解析模块文档

> 本文档介绍 CSV 解析模块的设计思路、运行流程与源码逻辑，涵盖 Web Worker 流式解析与列类型推断两部分。对应文件：
>
> - `workers/parser.worker.ts`
> - `workers/schema-infer.ts`
> - `types/index.ts`（`CsvSchema` / `CsvColumn` 类型定义）

---

## 目录

- [1. 模块目标](#1-模块目标)
- [2. 文件总览](#2-文件总览)
- [3. 整体流程](#3-整体流程)
- [4. 源码逐文件解析](#4-源码逐文件解析)
  - [4.1 `parser.worker.ts`](#41-parserworkerts)
  - [4.2 `schema-infer.ts`](#42-schema-inferts)
  - [4.3 类型定义](#43-类型定义)
- [5. 关键设计决策](#5-关键设计决策)
- [6. 消息协议](#6-消息协议)
- [7. 类型推断规则详解](#7-类型推断规则详解)
- [8. 性能考量](#8-性能考量)
- [9. 已知局限与后续优化](#9-已知局限与后续优化)
- [10. 使用示例](#10-使用示例)

---

## 1. 模块目标

用户在首页上传 CSV 后，系统需要：

1. **不卡主线程**地解析文件（可能是几十 MB、几十万行）。
2. **实时反馈进度**，让用户看到"已解析 N 行"。
3. **推断每一列的数据类型**（number / string / date / boolean），供后续 AI 分析时理解数据结构。
4. **生成 schema 和预览文本**，用于：
   - 存到 Supabase `sessions.csv_schema` 字段。
   - 作为 RAG 检索的 `preview` 文本。
   - 注入 LLM prompt，让模型知道有哪些列、什么类型、样本值。

**核心原则：解析逻辑与主线程解耦，类型推断逻辑可独立测试。**

---

## 2. 文件总览

| 文件                       | 类型   | 职责                                                 |
| -------------------------- | ------ | ---------------------------------------------------- |
| `workers/parser.worker.ts` | Worker | 在 Web Worker 中流式解析 CSV，回传进度、schema、rows |
| `workers/schema-infer.ts`  | 纯函数 | 列类型推断 + `CsvSchema` 构建，无副作用，易测试      |
| `types/index.ts`           | 类型   | `CsvColumn` / `CsvSchema` / `Session` 定义           |

**分层思路：**

```
┌─────────────────────────────────────┐
│  parser.worker.ts                    │  ← 副作用层：文件 IO、postMessage
│  ┌───────────────────────────────┐  │
│  │  schema-infer.ts              │  │  ← 纯函数层：类型推断
│  │  inferColumnType()            │  │
│  │  buildCsvSchema()             │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
              │
              ▼
        types/index.ts  ← 共享类型
```

把类型推断抽成纯函数的好处：

- **可在主线程直接测试**，不需要启动 Worker。
- **可复用**：未来在 Server 端解析 CSV（如 API 直接接收文件）也能用同一套逻辑。
- **职责单一**：Worker 只管"跑"，`schema-infer` 只管"算"。

---

## 3. 整体流程

```
用户选择/拖拽 CSV
        │
        ▼
主线程：new Worker('./parser.worker.ts')
        │
        │  postMessage(file)   ← File 对象可直接结构化克隆
        ▼
┌──────────────────────────────────────┐
│  Worker 线程                          │
│                                      │
│  Papa.parse(file, {                  │
│    header: true,                     │
│    step: 每行 → rows.push()          │
│          ↓                           │
│    每 5000 行 postMessage(progress)  │
│                                      │
│    complete:                         │
│      buildCsvSchema()  ← 调纯函数    │
│      postMessage(done, schema, rows) │
│  })                                  │
└──────────────────────────────────────┘
        │
        │  postMessage 回主线程
        ▼
主线程 onmessage：
  - progress → setProgress(n)
  - done     → POST /api/sessions
  - error    → setError(msg)
```

**关键点：**

- 主线程和 Worker 之间通过 `postMessage` 通信，`File` 对象可被结构化克隆，无需手动读成 ArrayBuffer。
- Worker 内部设置 `worker: false`，因为 PapaParse 若再开一个嵌套 Worker 会报错——当前已经处于 Worker 环境。
- 进度回传是**节流**的（每 5000 行一次），避免消息风暴。

---

## 4. 源码逐文件解析

### 4.1 `parser.worker.ts`

```ts
/// <reference lib="webworker" />
import Papa from "papaparse";
import { buildCsvSchema } from "./schema-infer";
import type { CsvSchema } from "@/types";
```

**第一行 `/// <reference lib="webworker" />`：**

- TypeScript 三斜线指令，告诉编译器当前文件运行在 Web Worker 环境。
- 这样 `self`、`postMessage`、`MessageEvent` 等类型才正确。
- 没有它，TS 会把它当成普通 DOM 脚本，`self` 类型不对。

**导入说明：**

- `Papa`：CSV 解析库。
- `buildCsvSchema`：本地纯函数，构建 schema。
- `CsvSchema`：类型定义。

---

#### 4.1.1 消息协议定义

```ts
export interface ParseProgress {
  type: "progress";
  rowCount: number;
}
export interface ParseDone {
  type: "done";
  schema: CsvSchema;
  rows: Record<string, unknown>[];
}
export interface ParseError {
  type: "error";
  error: string;
}
export type WorkerMessage = ParseProgress | ParseDone | ParseError;
```

**设计要点：**

- 用 **可辨识联合（discriminated union）**，通过 `type` 字段区分消息类型。
- 主线程 `switch (msg.type)` 时 TS 能自动收窄类型，`msg.rowCount` / `msg.schema` 都能正确推断。
- 导出的 `WorkerMessage` 类型可以给主线程复用，保证两端类型一致。

| 消息类型   | 触发时机       | 携带数据               |
| ---------- | -------------- | ---------------------- |
| `progress` | 每解析 5000 行 | `rowCount`             |
| `done`     | 解析完成       | `schema` + 全量 `rows` |
| `error`    | PapaParse 报错 | `error` 字符串         |

---

#### 4.1.2 消息处理入口

```ts
self.onmessage = (e: MessageEvent<File>) => {
  const file = e.data;
  const rows: Record<string, unknown>[] = [];

  Papa.parse<Record<string, unknown>>(file, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
    worker: false,
    step: row => { ... },
    complete: () => { ... },
    error: (err: Error) => { ... },
  });
};
```

**`self.onmessage`：**

- Worker 的入口。主线程调用 `worker.postMessage(file)` 时触发。
- `e.data` 类型为 `File`——主线程传入的就是原生 `File` 对象。

**`rows` 累积数组：**

- 在闭包中声明，`step` 回调持续 push，`complete` 时使用。
- 内存中持有全量行——这是后面"已知局限"要讨论的点。

---

#### 4.1.3 PapaParse 配置项

| 配置             | 值      | 作用                                                  |
| ---------------- | ------- | ----------------------------------------------------- |
| `header`         | `true`  | 第一行作为表头，每行解析为对象 `{列名: 值}`           |
| `skipEmptyLines` | `true`  | 跳过空行，避免污染数据                                |
| `dynamicTyping`  | `true`  | 自动把 `"123"` 转成 `123`，`"true"` 转成 `true`       |
| `worker`         | `false` | **必须**，已在 Worker 内，PapaParse 不能再嵌套 Worker |
| `step`           | 回调    | 每解析一行调用一次，实现流式                          |
| `complete`       | 回调    | 全部解析完成                                          |
| `error`          | 回调    | 解析出错                                              |

**为什么用 `step` 而不是 `chunk`？**

- `step` 逐行回调，粒度最细，方便按行数计进度。
- `chunk` 按字节块回调，进度不如按行直观。
- 对于本场景（需要精确行数、最终要全量 rows），`step` 更合适。

**`dynamicTyping: true` 的注意点：**

- 会把 `"007"` 转成 `7`（丢掉前导零），对邮编、ID 类字段可能有问题。
- 但换来的是后续类型推断更简单，数值列直接是 number。
- 如果业务上需要保留字符串原样，需要设 `dynamicTyping: false` 并在推断时自行转换。

---

#### 4.1.4 step 回调：流式解析与进度回传

```ts
step: row => {
  if (row.data) rows.push(row.data as Record<string, unknown>);
  if (rows.length % 5000 === 0) {
    postMessage({ type: "progress", rowCount: rows.length } satisfies ParseProgress);
  }
},
```

**逻辑：**

1. `row.data` 是当前行的对象，push 进 `rows`。
2. 每满 5000 行，`postMessage` 一次进度。
3. 用 `satisfies ParseProgress` 做类型校验，不改变推断类型。

**为什么是 5000？**

- 太小（如每行）→ 消息风暴，主线程频繁 setState，反而卡。
- 太大（如每 10 万）→ 进度条长时间不动，体验差。
- 5000 是经验值，可根据实际文件大小调整。

**`satisfies` 而不是 `as`：**

- `as` 是强制类型断言，绕过检查。
- `satisfies` 要求对象**确实符合**该类型，否则报错，更安全。

**边界问题：**

- 如果文件正好 10000 行，会在 5000 和 10000 处各发一次进度。
- 如果文件只有 3000 行，`progress` 一次都不发，直接 `done`。这是可接受的——小文件瞬间完成，不需要进度。

---

#### 4.1.5 complete 回调：构建 schema

```ts
complete: () => {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const schema = buildCsvSchema(file.name, headers, rows);
  postMessage({ type: "done", schema, rows } satisfies ParseDone);
},
```

**逻辑：**

1. **提取 headers**：从第一行的 key 获取。因为 `header: true`，所有行的 key 一致。
   - 空文件保护：`rows.length > 0 ? ... : []`。
2. **调用 `buildCsvSchema`**：传入文件名、表头、全量行。
3. **回传 done 消息**：携带 schema 和 rows。

**为什么 headers 从 `rows[0]` 取而不是从 PapaParse 的 `meta.fields`？**

- 两种都可行。从 `rows[0]` 取更直观，且与 `buildCsvSchema` 内部对行的遍历保持一致。
- 如果依赖 `meta.fields`，需要额外处理 `complete` 回调的参数类型。

**`postMessage` 的性能：**

- `done` 消息携带全量 `rows`，会触发一次**结构化克隆**。
- 10 万行的数据，克隆开销不可忽略（约几十毫秒到几百毫秒）。
- 这是后面"性能优化"要讨论的点（可用 Transferable 或分块回传）。

---

#### 4.1.6 error 回调

```ts
error: (err: Error) => {
  postMessage({ type: "error", error: err.message } satisfies ParseError);
},
```

**逻辑：**

- 捕获 PapaParse 的错误，把 `message` 字符串传回主线程。
- 主线程据此 `setError(msg)`，UI 显示红色提示。

**注意：**

- 这里只处理 PapaParse 内部的解析错误（如格式错误）。
- 如果 `buildCsvSchema` 抛错，不会走到这里——需要额外 try/catch（见"已知局限"）。

---

### 4.2 `schema-infer.ts`

这个文件是**纯函数模块**，无副作用，不依赖 Worker 环境，可在 Node / 浏览器 / 测试中直接调用。

#### 4.2.1 列类型推断 `inferColumnType`

```ts
export function inferColumnType(values: unknown[]): CsvColumn["type"] {
  const nonNull = values.filter(v => v !== null && v !== "" && v !== undefined);
  if (nonNull.length === 0) return "string";

  const sample = nonNull.slice(0, 50);
  // ...
}
```

**第一步：过滤空值**

```ts
const nonNull = values.filter(v => v !== null && v !== "" && v !== undefined);
```

- 排除 `null`、空字符串、`undefined`。
- 为什么要过滤？空值不携带类型信息，若参与判断会让"全 number"的列因空值而失败。

**第二步：空列处理**

```ts
if (nonNull.length === 0) return "string";
```

- 整列都是空 → 默认 `string`。
- 这是合理的兜底——无信息时用最宽松的类型。

**第三步：采样**

```ts
const sample = nonNull.slice(0, 50);
```

- **只取前 50 个非空值**判断类型。
- 原因：全量扫描 10 万行 × N 列太慢，而前 50 个已经足够代表列的"主导类型"。
- 风险：如果前 50 个恰好都是数字，但后面混入字符串，会被误判。见"已知局限"。

---

#### 4.2.2 类型判断顺序

```ts
// 1. number
const allNum = sample.every(
  v => typeof v === "number" || (typeof v === "string" && v !== "" && !isNaN(Number(v)))
);
if (allNum) return "number";

// 2. date
const allDate = sample.every(v => typeof v === "string" && !isNaN(Date.parse(v)));
if (allDate) return "date";

// 3. boolean
const boolSet = new Set(["true", "false", "0", "1", "yes", "no"]);
const allBool = sample.every(v => boolSet.has(String(v).toLowerCase()));
if (allBool) return "boolean";

// 4. 兜底
return "string";
```

**顺序很重要，不能随意调换：**

| 顺序 | 类型    | 判断逻辑                                     | 说明         |
| ---- | ------- | -------------------------------------------- | ------------ |
| 1    | number  | `typeof v === "number"` 或可 `Number()` 转换 | 最严格，优先 |
| 2    | date    | `Date.parse(v)` 不返回 NaN                   | 次之         |
| 3    | boolean | 在 `true/false/0/1/yes/no` 集合内            | 最后         |
| 4    | string  | 兜底                                         | 都不匹配时   |

**为什么 number 必须在 date 前面？**

- `"1"`、`"0"` 既是数字也是 `Date.parse` 能解析的？其实不是——`Date.parse("1")` 返回 `NaN`。但 `"2024"` 会被 `Date.parse` 解析为年份。
- 更关键的是：`dynamicTyping: true` 已经把纯数字转成 `number` 类型，`typeof v === "number"` 会命中。
- 如果先判断 date，像 `"2024"` 这样的纯数字字符串（若 dynamicTyping 未开）会被误判为日期。

**为什么 boolean 在最后？**

- boolean 集合 `0/1` 也是数字，如果先判断 boolean，数字列会被误判。
- 放在最后，只有当 number / date 都不匹配时才判定。

**`String(v).toLowerCase()` 的原因：**

- 兼容 `"TRUE"`、`"True"`、`"YES"` 等大小写变体。

**date 判断的隐患：**

- `Date.parse("12")` 在某些 JS 引擎中会返回合法时间戳（视实现而定），可能误判。
- `Date.parse("hello")` 返回 `NaN`，正确排除。
- 实际使用中，如果日期格式固定（如 `2024-01-01`），问题不大。

---

#### 4.2.3 构建 Schema `buildCsvSchema`

```ts
export function buildCsvSchema(
  fileName: string,
  headers: string[],
  rows: Record<string, unknown>[]
): CsvSchema {
  const columns: CsvColumn[] = headers.map(h => {
    const colValues = rows.map(r => r[h]);
    return {
      name: h,
      type: inferColumnType(colValues),
      sample: colValues.slice(0, 5),
    };
  });

  const preview = rows
    .slice(0, 3)
    .map(r => headers.map(h => r[h]).join(","))
    .join("\n");

  return { fileName, rowCount: rows.length, columns, headers, preview };
}
```

**逐段解析：**

**A. 构建 columns**

```ts
headers.map(h => {
  const colValues = rows.map(r => r[h]); // 提取该列所有值
  return {
    name: h,
    type: inferColumnType(colValues), // 推断类型
    sample: colValues.slice(0, 5), // 前 5 个样本
  };
});
```

- 对每个表头，收集该列所有行的值。
- 调用 `inferColumnType` 推断类型。
- 取前 5 个作为 `sample`，用于展示和 prompt 注入。

**时间复杂度：** `O(列数 × 行数)`。10 列 × 10 万行 = 100 万次数组访问，可接受。

**内存：** `colValues` 是临时数组，会被 GC。但如果列很多行很多，瞬时内存峰值较高。

**B. 构建 preview**

```ts
const preview = rows
  .slice(0, 3) // 前 3 行
  .map(r => headers.map(h => r[h]).join(",")) // 每行按表头顺序拼成 CSV 行
  .join("\n"); // 换行连接
```

- 取前 3 行，还原成 CSV 格式的文本。
- 用途：存到 Supabase，作为 RAG 检索的预览文本；也可注入 prompt 让模型看到真实数据样子。

**为什么是 3 行？**

- 太多浪费 token；太少（1 行）不足以让模型理解数据分布。
- 3 行是经验值，能展示数据类型和大致格式。

**C. 返回 CsvSchema**

```ts
return { fileName, rowCount: rows.length, columns, headers, preview };
```

对应 `types/index.ts` 中的定义：

```ts
export interface CsvSchema {
  fileName: string;
  rowCount: number;
  columns: CsvColumn[];
  headers: string[];
  preview: string;
}
```

---

### 4.3 类型定义

```ts
export interface CsvColumn {
  name: string;
  type: "number" | "string" | "date" | "boolean";
  sample: unknown[];
}

export interface CsvSchema {
  fileName: string;
  rowCount: number;
  columns: CsvColumn[];
  headers: string[];
  preview: string;
}

export interface Session {
  id: string;
  title: string;
  csv_schema: CsvSchema | null;
  created_at: string;
}
```

**说明：**

- `CsvColumn.type` 用**字面量联合**而非 `string`，保证类型安全。
- `CsvSchema.rowCount` 与 `rows.length` 一致，冗余但方便读取。
- `Session.csv_schema` 可为 `null`——会话刚创建、解析未完成时的状态。

---

## 5. 关键设计决策

| 决策         | 选择           | 理由                                   |
| ------------ | -------------- | -------------------------------------- |
| 解析环境     | Web Worker     | 大文件不卡主线程 UI                    |
| 解析库       | PapaParse      | 成熟、支持流式 `step`、`dynamicTyping` |
| 类型推断位置 | 独立纯函数文件 | 可测试、可复用、职责单一               |
| 进度粒度     | 每 5000 行     | 平衡消息开销与体验                     |
| 类型采样     | 前 50 个非空值 | 性能与准确度的折中                     |
| 消息协议     | 可辨识联合     | TS 类型收窄、两端一致                  |
| 空列兜底     | `string`       | 最宽松，不丢数据                       |

---

## 6. 消息协议

### 主线程 → Worker

```ts
worker.postMessage(file); // File 对象
```

### Worker → 主线程

**进度：**

```ts
{ type: "progress", rowCount: 5000 }
```

**完成：**

```ts
{
  type: "done",
  schema: { fileName, rowCount, columns, headers, preview },
  rows: [{...}, {...}, ...]
}
```

**错误：**

```ts
{ type: "error", error: "..." }
```

### 主线程消费示例

```ts
worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;
  switch (msg.type) {
    case "progress":
      setProgress(msg.rowCount); // TS 自动收窄
      break;
    case "done":
      setProgress(msg.schema.rowCount);
      uploadToServer(msg.schema, msg.rows);
      break;
    case "error":
      setError(msg.error);
      break;
  }
};
```

**类型收窄效果：** 在 `case "progress"` 分支内，TS 知道 `msg` 是 `ParseProgress`，`msg.rowCount` 合法；在 `case "done"` 内 `msg.schema` 合法。这是可辨识联合的核心价值。

---

## 7. 类型推断规则详解

### 判定表

| 输入样本                | number | date | boolean | 最终类型             |
| ----------------------- | ------ | ---- | ------- | -------------------- |
| `[1, 2, 3]`             | ✅     | ❌   | ❌      | `number`             |
| `["1", "2"]`            | ✅     | ❌   | ❌      | `number`             |
| `[true, false]`         | ❌     | ❌   | ✅      | `boolean`            |
| `["true", "no"]`        | ❌     | ❌   | ✅      | `boolean`            |
| `["2024-01-01"]`        | ❌     | ✅   | ❌      | `date`               |
| `["hello", "world"]`    | ❌     | ❌   | ❌      | `string`             |
| `[null, "", undefined]` | —      | —    | —       | `string`（空列兜底） |
| `[1, "abc"]`            | ❌     | ❌   | ❌      | `string`（混合）     |

### 注意边界

- **`0` 和 `1`**：`dynamicTyping: true` 下是 number 类型，命中 number 分支，不会被判为 boolean。
- **`"0"` / `"1"` 字符串**：若 dynamicTyping 未生效（如引号包裹），会先命中 number（`Number("0")` 合法），也不会判为 boolean。
- **混合列**：`[1, "abc"]` → number 失败，date 失败，boolean 失败 → `string`。这是合理的保守策略。

---

## 8. 性能考量

### 8.1 为什么用 Worker

- CSV 解析是 CPU 密集操作。
- 主线程被占满会导致 UI 卡顿、动画掉帧。
- Worker 独立线程，主线程继续响应交互。

### 8.2 进度回传节流

- 每 5000 行一次 `postMessage`，而非每行。
- 避免主线程频繁 `setState` 触发重渲染。

### 8.3 结构化克隆开销

- `postMessage` 传 `rows` 会**深拷贝**整个对象数组。
- 10 万行 × 10 列，克隆可能耗时 100ms+。
- 这是当前实现的主要性能瓶颈（见下节优化）。

### 8.4 类型推断的采样

- 只取前 50 个非空值，避免全量扫描。
- `buildCsvSchema` 中 `rows.map(r => r[h])` 仍是全量提取，但只做数组访问，很快。

---

## 9. 已知局限与后续优化

### 9.1 `buildCsvSchema` 抛错未被捕获

**问题：** `complete` 回调中若 `buildCsvSchema` 抛错（如 `rows` 结构异常），Worker 不会发 `error` 消息，主线程会一直等待。

**建议：**

```ts
complete: () => {
  try {
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    const schema = buildCsvSchema(file.name, headers, rows);
    postMessage({ type: "done", schema, rows } satisfies ParseDone);
  } catch (err) {
    postMessage({
      type: "error",
      error: err instanceof Error ? err.message : String(err),
    } satisfies ParseError);
  }
},
```

### 9.2 全量 rows 驻留内存

**问题：** Worker 和主线程各持一份全量 rows，大文件可能 OOM。

**优化方向：**

- 只回传 schema + 前 N 行样本，其余行直接流式上传到服务端。
- 或分块回传（chunked postMessage），主线程分批处理。
- 或用 IndexedDB 暂存，按需读取。

### 9.3 类型推断只看前 50 个

**问题：** 前 50 个都是数字，后面混入字符串的列会被误判。

**优化方向：**

- 采样分布：前 25 + 中 25 + 后 25，覆盖更全面。
- 或随机采样固定数量。
- 或对列做全量扫描但只统计类型计数（无额外内存）。

### 9.4 `dynamicTyping` 丢失前导零

**问题：** 邮编 `"007"` 变成 `7`。

**优化方向：**

- 关闭 `dynamicTyping`，全部按字符串解析，在 `inferColumnType` 中自行判断。
- 对特定列名（如 `zip`、`id`）强制字符串。

### 9.5 无取消机制

**问题：** 用户上传大文件后想取消，无法中断 Worker。

**优化方向：**

- 提供 `worker.terminate()` 的取消按钮。
- 或在 Worker 内设置标志位，`step` 中检查后提前停止。

### 9.6 `preview` 用逗号拼接未转义

**问题：** 字段值本身含逗号（如 `"Beijing, China"`）时，preview 格式会错乱。

**优化方向：**

- 用 `JSON.stringify` 或 PapaParse 的 `unparse` 生成标准 CSV。

---

## 10. 使用示例

### 主线程调用

```ts
import type { WorkerMessage } from "@/workers/parser.worker";

function parseCsv(file: File) {
  return new Promise<{ schema: CsvSchema; rows: Record<string, unknown>[] }>((resolve, reject) => {
    const worker = new Worker(new URL("@/workers/parser.worker.ts", import.meta.url), {
      type: "module",
    });

    worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
      const msg = e.data;
      switch (msg.type) {
        case "progress":
          console.log(`已解析 ${msg.rowCount} 行`);
          break;
        case "done":
          worker.terminate();
          resolve({ schema: msg.schema, rows: msg.rows });
          break;
        case "error":
          worker.terminate();
          reject(new Error(msg.error));
          break;
      }
    };

    worker.onerror = err => {
      worker.terminate();
      reject(err);
    };

    worker.postMessage(file);
  });
}
```

### 直接测试纯函数

```ts
import { inferColumnType, buildCsvSchema } from "@/workers/schema-infer";

test("推断 number 列", () => {
  expect(inferColumnType([1, 2, 3])).toBe("number");
});

test("推断 date 列", () => {
  expect(inferColumnType(["2024-01-01", "2024-02-01"])).toBe("date");
});

test("空列兜底为 string", () => {
  expect(inferColumnType([null, "", undefined])).toBe("string");
});

test("构建 schema", () => {
  const schema = buildCsvSchema(
    "test.csv",
    ["name", "age"],
    [
      { name: "Alice", age: 30 },
      { name: "Bob", age: 25 },
    ]
  );
  expect(schema.rowCount).toBe(2);
  expect(schema.columns[1].type).toBe("number");
  expect(schema.preview).toContain("Alice");
});
```

---

## 总结

CSV 解析模块通过 **Web Worker + 纯函数分层**的设计，实现了：

| 目标       | 实现方式                                   |
| ---------- | ------------------------------------------ |
| 不卡主线程 | Worker 独立线程 + PapaParse 流式 `step`    |
| 实时进度   | 每 5000 行 `postMessage` 节流              |
| 类型推断   | `schema-infer.ts` 纯函数，采样 50 个非空值 |
| 类型安全   | 可辨识联合消息协议 + `satisfies` 校验      |
| 可测试     | 纯函数与副作用分离，Worker 逻辑可 mock     |

**核心思想：把"跑"（IO、消息）和"算"（类型推断）分开。** Worker 只管调度 PapaParse 和收发消息；`schema-infer` 是不依赖环境的纯函数，可独立测试、可复用、可替换。

后续优化方向集中在**内存**（大文件全量 rows）、**推断准确度**（采样策略）、**错误处理**（`buildCsvSchema` 兜底）、**取消机制**四个方面。

---

_文档版本：1.0 · 适用于 Web Worker + PapaParse 流式 CSV 解析_
