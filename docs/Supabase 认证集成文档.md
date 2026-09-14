# Supabase 认证集成文档

> 本文档介绍项目中 Supabase 认证相关的文件结构、职责分工、运行流程与源码逻辑，帮助开发者快速理解认证体系的设计。

---

## 目录

- [1. 背景与目的](#1-背景与目的)
- [2. 文件总览](#2-文件总览)
- [3. 核心概念：为什么需要三个 Client](#3-核心概念为什么需要三个-client)
- [4. 运行流程](#4-运行流程)
- [5. 源码逻辑逐文件解析](#5-源码逻辑逐文件解析)
  - [5.1 `utils/supabase/client.ts`](#51-utilssupabaseclientts)
  - [5.2 `utils/supabase/server.ts`](#52-utilssupabaseserverts)
  - [5.3 `utils/supabase/middleware.ts`](#53-utilssupabasemiddlewarets)
  - [5.4 `middleware.ts`（根目录）](#54-middlewarets根目录)
- [6. 测试设计](#6-测试设计)
  - [6.1 测试文件总览](#61-测试文件总览)
  - [6.2 关键测试点解析](#62-关键测试点解析)
- [7. 环境变量要求](#7-环境变量要求)
- [8. 常见陷阱与注意事项](#8-常见陷阱与注意事项)
- [9. 总结](#9-总结)

---

## 1. 背景与目的

本项目使用 **Supabase** 作为认证与数据后端，基于 **Next.js App Router**。

Supabase 的 SSR 集成需要在不同运行环境（浏览器、Server Component、Middleware/Edge）中使用不同的客户端创建方式，并正确处理 **Cookie 的读写与刷新**。本项目将这套逻辑拆分为三个独立的 `createClient`，分别对应三种运行环境，并配套完整的单元测试，确保：

- **Token 能被正确刷新**：Middleware 负责在每次请求时调用 `getUser()` 触发刷新。
- **Cookie 能在不同环境正确传递**：浏览器用 `document.cookie`，Server Component 只读，Middleware 可读写。
- **避免解构陷阱**：Middleware 返回的是动态 `response`，防止拿到过期的 Response 实例。
- **测试可隔离**：通过 `vi.mock` 模拟 `@supabase/ssr`，不依赖真实网络。

---

## 2. 文件总览

| 文件路径 | 类型 | 职责 |
| --- | --- | --- |
| `utils/supabase/client.ts` | 源码 | 浏览器端 Supabase Client |
| `utils/supabase/server.ts` | 源码 | Server Component / Server Action 端 Supabase Client |
| `utils/supabase/middleware.ts` | 源码 | Middleware / Edge 端 Supabase Client |
| `middleware.ts`（根目录） | 源码 | Next.js 全局中间件入口，触发 token 刷新 |
| `utils/supabase/client.test.ts` | 测试 | 验证浏览器 Client 创建 |
| `utils/supabase/server.test.ts` | 测试 | 验证 Server Client 的 cookie 读写 |
| `utils/supabase/middleware.test.ts` | 测试 | 验证 Middleware Client 的 setAll 行为 |
| `middleware.test.ts`（根目录） | 测试 | 验证全局中间件的刷新与响应返回 |

---

## 3. 核心概念：为什么需要三个 Client

Supabase 的 SSR 包 `@supabase/ssr` 提供 `createBrowserClient` 和 `createServerClient`，但它们对 Cookie 的处理方式不同：

| 运行环境 | Cookie 存储 | 可写性 | 使用的 API |
| --- | --- | --- | --- |
| 浏览器 | `document.cookie` | 可读写 | `createBrowserClient` |
| Server Component | `next/headers` 的 `cookies()` | **只读**（写会抛错） | `createServerClient` |
| Server Action / Route Handler | `next/headers` 的 `cookies()` | 可读写 | `createServerClient` |
| Middleware / Edge | `NextRequest` / `NextResponse` | 可读写 | `createServerClient` |

因此项目拆成三个文件，各自处理自己环境下的 Cookie 逻辑，避免"一套代码到处跑"导致的运行时错误。

---

## 4. 运行流程

### 4.1 一次请求的完整链路

```
用户请求
   │
   ▼
┌─────────────────────────────┐
│  middleware.ts (根目录)      │
│  1. createClient(request)   │
│  2. getUser() ← 触发刷新     │
│  3. 返回最新 response        │
└─────────────────────────────┘
   │
   ▼
┌─────────────────────────────┐
│  Server Component           │
│  createClient(cookieStore)  │
│  只读 cookie，不刷新          │
└─────────────────────────────┘
   │
   ▼
┌─────────────────────────────┐
│  Client Component           │
│  createClient()             │
│  浏览器端 session 管理        │
└─────────────────────────────┘
```

### 4.2 关键设计：Middleware 触发刷新

Supabase 的 access token 有有效期。**只有 Middleware 会调用 `auth.getUser()`**，这会：

1. 用 refresh token 换取新的 access token。
2. 通过 `setAll` 把新 cookie 写入 `request.cookies` 和 `NextResponse`。
3. 返回的 `response` 携带新的 `Set-Cookie` 头，浏览器自动更新。

Server Component 中**不调用 `getUser()`**（或调用但不期望刷新），因为它是只读的，写 cookie 会抛错，由 `try/catch` 忽略，交给 Middleware 处理。

---

## 5. 源码逻辑逐文件解析

### 5.1 `utils/supabase/client.ts`

```ts
import { createBrowserClient } from '@supabase/ssr';

export const createClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  return createBrowserClient(supabaseUrl, supabaseKey);
};
```

**逻辑说明：**

- 从环境变量读取 URL 和 Publishable Key。
- 直接返回 `createBrowserClient` 实例。
- 浏览器端 Cookie 由 `@supabase/ssr` 内部通过 `document.cookie` 管理，无需手动传入。
- 使用 `NEXT_PUBLIC_` 前缀，确保变量会被打包进客户端 bundle。

**使用场景：** Client Component、`useEffect` 中的认证监听等。

---

### 5.2 `utils/supabase/server.ts`

```ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const createClient = (
  cookieStore: Awaited<ReturnType<typeof cookies>>
) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Server Component 里会抛错，忽略，交给 middleware 刷新
        }
      },
    },
  });
};
```

**逻辑说明：**

- **参数 `cookieStore`**：由调用方传入（通常是 `await cookies()` 的结果），而不是在函数内部直接调用 `cookies()`，这样便于测试注入。
- **`getAll`**：直接透传 `cookieStore.getAll()`，把请求中的 cookie 交给 Supabase。
- **`setAll`**：尝试写入 cookie，但在 **Server Component** 中，Next.js 会抛出 `Cookies can only be modified in a Server Action or Route Handler` 错误。
  - 用 `try/catch` 包裹，**静默忽略**，避免页面崩溃。
  - 真正的刷新交给 Middleware 完成。

**使用场景：** Server Component、Server Action、Route Handler。

**调用示例：**

```ts
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';

const cookieStore = await cookies();
const supabase = createClient(cookieStore);
const { data: { user } } = await supabase.auth.getUser();
```

---

### 5.3 `utils/supabase/middleware.ts`

```ts
import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

export const createClient = (request: NextRequest) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  return {
    supabase,
    get response() {
      return supabaseResponse;
    },
  };
};
```

**逻辑说明：**

- **`let supabaseResponse`**：初始化为一个 `NextResponse.next({ request })`。
- **`getAll`**：从 `request.cookies` 读取。
- **`setAll`** 分两步：
  1. 把新 cookie 写入 **`request.cookies`**，这样后续的 `getUser` 等调用能读到最新的 cookie。
  2. **重新创建** `supabaseResponse`（用更新后的 request），再把 cookie 写入 `supabaseResponse.cookies`，确保响应头携带 `Set-Cookie`。
- **关键点：返回 `get response()` 而非 `response` 值。**
  - 因为 `supabaseResponse` 在 `setAll` 中会被**重新赋值**。
  - 如果直接返回 `{ supabase, response: supabaseResponse }`，调用方拿到的是**旧引用**，会丢失刷新后的 cookie。
  - 使用 getter 保证每次访问 `response` 都返回最新的实例。

**使用场景：** Next.js Middleware（Edge Runtime）。

---

### 5.4 `middleware.ts`（根目录）

```ts
import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/middleware';

export async function middleware(request: NextRequest) {
  const supabaseClient = createClient(request);

  // 必须调用，触发 token 刷新
  const {
    data: { user },
  } = await supabaseClient.supabase.auth.getUser();

  if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return supabaseClient.response;   // ← getter 拿到最新 response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

**逻辑说明：**

1. **`createClient(request)`**：创建带 cookie 处理能力的 Supabase Client。
2. **`await supabaseClient.supabase.auth.getUser()`**：
   - 这是**必须调用**的一步，用于触发 token 刷新。
   - 即使当前不需要 `user` 信息，也要调用，否则 token 不会刷新。
3. **路由保护**：示例代码，未登录访问 `/dashboard` 时重定向到 `/login`。
4. **`return supabaseClient.response`**：通过 getter 获取**最新的** response，确保携带刷新后的 `Set-Cookie`。
5. **`config.matcher`**：排除静态资源，避免对图片、字体等做无谓的认证检查，提升性能。

**为什么 matcher 要排除静态资源？**

- Middleware 运行在 Edge，每次请求都会执行。
- 静态资源不需要认证，排除后可减少开销。
- 正则 `(?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$)` 表示"不匹配这些路径"。

---

## 6. 测试设计

### 6.1 测试文件总览

| 测试文件 | 被测文件 | 核心验证点 |
| --- | --- | --- |
| `client.test.ts` | `utils/supabase/client.ts` | 用正确 env 创建 browser client |
| `server.test.ts` | `utils/supabase/server.ts` | cookie 配置传递、getAll 透传、setAll 容错 |
| `middleware.test.ts`（utils） | `utils/supabase/middleware.ts` | 返回结构、setAll 更新 request.cookies |
| `middleware.test.ts`（根目录） | `middleware.ts` | getUser 被调用、返回最新 response |

### 6.2 关键测试点解析

#### 6.2.1 模拟 `@supabase/ssr`

所有测试都通过 `vi.mock('@supabase/ssr', ...)` 替换真实实现，避免网络请求：

```ts
const createServerClientMock = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createServerClient: (...args: unknown[]) => createServerClientMock(...args),
}));
```

这样可以直接断言"传了什么参数"、"配置对象的 `cookies.getAll` 返回什么"。

#### 6.2.2 验证 `setAll` 更新 `request.cookies`

```ts
const setSpy = vi.spyOn(request.cookies, 'set');

createClient(request);

capturedConfig.cookies.setAll([
  { name: 'sb-token', value: 'new', options: { path: '/' } },
]);

expect(setSpy).toHaveBeenCalledWith('sb-token', 'new');
```

- 通过 `capturedConfig` 捕获传给 `createServerClient` 的配置对象。
- 手动调用 `setAll`，验证 `request.cookies.set` 被调用。
- 这保证了"新 cookie 会写回 request"，后续 `getUser` 能读到最新值。

#### 6.2.3 验证 `setAll` 抛错时不崩

```ts
const cookieStore = {
  getAll: vi.fn(() => []),
  set: vi.fn(() => {
    throw new Error('Cookies can only be modified in a Server Action');
  }),
};

expect(() =>
  capturedConfig.cookies.setAll([{ name: 'a', value: 'b' }])
).not.toThrow();
```

- 模拟 Server Component 中写 cookie 抛错的场景。
- 验证 `try/catch` 生效，不会让页面崩溃。

#### 6.2.4 验证 Middleware 返回最新 response（防解构陷阱）

```ts
const responsePromise = middleware(request);

// 模拟 setAll 在 getUser 之后被调用
setAllCapture.fn?.([{ name: 'sb-token', value: 'new' }]);

const response = await responsePromise;
expect(response.headers.get('set-cookie')).toContain('sb-token=new');
```

- 这里 mock 的 `createClient` 内部维护了一个 `currentResponse`，并在 `setAll` 时**替换**它。
- `middleware` 通过 getter 拿到的始终是最新实例。
- 如果源码写成 `return { response: supabaseResponse }`（值传递），这个测试会失败——这正是该测试的价值。

#### 6.2.5 验证 `getUser` 被调用

```ts
it('调用了 supabase.auth.getUser()（触发 token 刷新）', async () => {
  const request = new NextRequest('http://localhost:3000/dashboard');
  await middleware(request);

  expect(getUserMock).toHaveBeenCalledOnce();
});
```

- 确保 Middleware 中没有漏掉刷新调用。
- 这是 token 自动刷新的**唯一触发点**，漏掉会导致用户频繁掉线。

---

## 7. 环境变量要求

在 `.env.local` 中配置：

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxx
```

| 变量 | 说明 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目 URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase Publishable Key（新版密钥体系） |

> **注意**：两个变量都带 `NEXT_PUBLIC_` 前缀，因为浏览器端 Client 需要访问。Publishable Key 是公开安全的，真正的权限由 RLS（Row Level Security）控制。

---

## 8. 常见陷阱与注意事项

### 8.1 解构陷阱（最重要）

❌ **错误写法：**

```ts
return {
  supabase,
  response: supabaseResponse,  // 值传递，setAll 后拿到旧引用
};
```

✅ **正确写法：**

```ts
return {
  supabase,
  get response() {
    return supabaseResponse;   // getter，每次拿最新
  },
};
```

**原因**：`setAll` 中会 `supabaseResponse = NextResponse.next(...)` 重新赋值。值传递会锁定旧对象，导致 `Set-Cookie` 丢失。

### 8.2 Server Component 中不要期望刷新

`setAll` 在 Server Component 中会抛错，被 `try/catch` 忽略。**这是预期行为**，不要试图在 Server Component 中写 cookie。

### 8.3 Middleware 必须调用 `getUser()`

即使不关心 `user`，也必须调用，否则 token 不会刷新。可以改为 `await supabaseClient.supabase.auth.getUser()` 后丢弃结果。

### 8.4 matcher 排除静态资源

避免对 `_next/static`、图片等执行 Middleware，减少 Edge 函数调用次数，提升性能并降低成本。

### 8.5 `cookieStore` 通过参数传入

`server.ts` 不直接调用 `cookies()`，而是由调用方传入。这样：

- 便于测试注入 mock。
- 避免在非请求上下文中调用 `cookies()` 报错。

### 8.6 测试中 `vi.clearAllMocks()` 与 `mockResolvedValue`

`beforeEach` 中先 `clearAllMocks()`，再设置默认返回值。否则 mock 的调用记录会跨测试污染。

---

## 9. 总结

本项目通过**三个 Client + 一个 Middleware** 的架构，清晰分离了 Supabase 在不同运行环境下的认证逻辑：

| 关注点 | 解决方案 |
| --- | --- |
| 浏览器认证 | `client.ts` + `createBrowserClient` |
| Server Component 只读 | `server.ts` + `try/catch` 忽略写错误 |
| Token 自动刷新 | 根目录 `middleware.ts` 调用 `getUser()` |
| Cookie 写回响应 | `setAll` 同时写 `request.cookies` 和 `NextResponse` |
| 防止解构陷阱 | 返回 `get response()` getter |
| 测试隔离 | `vi.mock('@supabase/ssr')` + 注入 mock |

配套的四个测试文件覆盖了**参数传递、cookie 读写、容错、刷新触发、响应返回**等关键路径，确保认证流程在重构时不会悄然破坏。

---

*文档版本：1.0 · 适用于 Next.js App Router + @supabase/ssr 集成*