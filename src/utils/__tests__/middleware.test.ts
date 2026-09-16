import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const createServerClientMock = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createServerClient: (...args: unknown[]) => createServerClientMock(...args),
}));

import { createClient } from '../supabase/middleware';

describe('utils/supabase/middleware.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
  });

  it('返回 { supabase, response }', () => {
    const fakeSupabase = { auth: { getUser: vi.fn() } };
    createServerClientMock.mockReturnValue(fakeSupabase);

    const request = new NextRequest('http://localhost:3000/dashboard', {
      headers: { cookie: 'sb-token=abc' },
    });

    const result = createClient(request);

    expect(result).toHaveProperty('supabase', fakeSupabase);
    expect(result.response).toBeInstanceOf(Response);
    expect(createServerClientMock).toHaveBeenCalledTimes(1);
  });

  it('setAll 更新 request.cookies', () => {
    let capturedConfig: any;
    createServerClientMock.mockImplementation((_u, _k, cfg) => {
      capturedConfig = cfg;
      return {};
    });

    const request = new NextRequest('http://localhost:3000/', {
      headers: { cookie: 'sb-token=old' },
    });

    const setSpy = vi.spyOn(request.cookies, 'set');

    createClient(request);

    capturedConfig.cookies.setAll([
      { name: 'sb-token', value: 'new', options: { path: '/' } },
    ]);

    expect(setSpy).toHaveBeenCalledWith('sb-token', 'new');
  });
});