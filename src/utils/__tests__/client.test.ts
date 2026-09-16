import { describe, it, expect, vi, beforeEach } from 'vitest';

const createBrowserClientMock = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: (...args: unknown[]) => createBrowserClientMock(...args),
}));

import { createClient } from '../supabase/client';   // ← 相对路径

describe('utils/supabase/client.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
  });

  it('用正确的 env 创建 browser client', () => {
    createBrowserClientMock.mockReturnValue({ from: vi.fn() });

    createClient();

    expect(createBrowserClientMock).toHaveBeenCalledTimes(1);
    expect(createBrowserClientMock).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'sb_publishable_test'
    );
  });

  it('返回 createBrowserClient 的实例', () => {
    const fakeClient = { auth: {} };
    createBrowserClientMock.mockReturnValue(fakeClient);

    expect(createClient()).toBe(fakeClient);
  });
});