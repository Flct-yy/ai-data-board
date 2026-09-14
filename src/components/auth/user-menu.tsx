"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import type { User } from "@supabase/supabase-js";

export function UserMenu() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) return null;

  if (!user) {
    return (
      <a href="/login" className="text-sm text-brand-600 hover:underline">
        登录
      </a>
    );
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-gray-500">{user.email}</span>
      <form action="/auth/signout" method="post">
        <button type="submit" className="text-gray-500 hover:text-brand-600">
          登出
        </button>
      </form>
    </div>
  );
}
