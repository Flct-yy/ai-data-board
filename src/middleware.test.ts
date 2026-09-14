import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const getUserMock = vi.fn();
const setAllCapture: { fn: ((c: any) => void) | null } = { fn: null };

vi.mock('@/utils/supabase/middleware', () => ({
  createClient: (request: NextRequest) => {
    let currentResponse = new Response(null);
    const supabase = {
      auth: { getUser: getUserMock },
    };
    // 模拟真实的 setAll 行为：写 cookie 到一个新 response
    const config = {
      cookies: {
        setAll(cookiesToSet: any[]) {
          const headers = new Headers();
          cookiesToSet.forEach(({ name, value }) =>
            headers.append('set-cookie', `${name}=${value}`)
          );
          currentResponse = new Response(null, { headers });
        },
      },
    };
    setAllCapture.fn = (cookies) => config.cookies.setAll(cookies);
    return {
      supabase,
      get response() {
        return currentResponse;
      },
    };
  },
}));

import { middleware } from '@/middleware';

describe('src/middleware.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
  });

  it('调用了 supabase.auth.getUser()（触发 token 刷新）', async () => {
    const request = new NextRequest('http://localhost:3000/dashboard');
    await middleware(request);

    expect(getUserMock).toHaveBeenCalledOnce();
  });

  it('返回的是 setAll 之后的最新 response（防止解构陷阱）', async () => {
    const request = new NextRequest('http://localhost:3000/dashboard');
    const responsePromise = middleware(request);

    // 模拟 setAll 在 getUser 之后被调用
    setAllCapture.fn?.([{ name: 'sb-token', value: 'new' }]);

    const response = await responsePromise;
    expect(response.headers.get('set-cookie')).toContain('sb-token=new');
  });
});