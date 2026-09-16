import { describe, it, expect, vi, beforeEach } from 'vitest';

const createServerClientMock = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createServerClient: (...args: unknown[]) => createServerClientMock(...args),
}));

import { createClient } from '../supabase/server';   // ← 相对路径

function makeCookieStore(initial: Array<{ name: string; value: string }> = []) {
  const store = [...initial];
  return {
    getAll: vi.fn(() => store.map(({ name, value }) => ({ name, value }))),
    set: vi.fn((name: string, value: string) => {
      store.push({ name, value });
    }),
  };
}

describe('utils/supabase/server.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
  });

  it('把 env + cookies 配置传给 createServerClient', () => {
    const cookieStore = makeCookieStore();
    createServerClientMock.mockReturnValue({});

    createClient(cookieStore as never);

    expect(createServerClientMock).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'sb_publishable_test',
      expect.objectContaining({
        cookies: expect.objectContaining({
          getAll: expect.any(Function),
          setAll: expect.any(Function),
        }),
      })
    );
  });

  it('getAll 透传 cookieStore.getAll', () => {
    const cookieStore = makeCookieStore([
      { name: 'sb-token', value: 'abc' },
    ]);

    let capturedConfig: any;
    createServerClientMock.mockImplementation((_u, _k, cfg) => {
      capturedConfig = cfg;
      return {};
    });

    createClient(cookieStore as never);

    expect(capturedConfig.cookies.getAll()).toEqual([
      { name: 'sb-token', value: 'abc' },
    ]);
  });

  it('setAll 在抛错时不崩（try/catch 生效）', () => {
    const cookieStore = {
      getAll: vi.fn(() => []),
      set: vi.fn(() => {
        throw new Error('Cookies can only be modified in a Server Action');
      }),
    };

    let capturedConfig: any;
    createServerClientMock.mockImplementation((_u, _k, cfg) => {
      capturedConfig = cfg;
      return {};
    });

    createClient(cookieStore as never);

    expect(() =>
      capturedConfig.cookies.setAll([{ name: 'a', value: 'b' }])
    ).not.toThrow();
  });
});