"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import type { User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";

export function UserMenu() {
  const router = useRouter();
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
      <a
        href="/login"
        className="text-brand-600 hover:text-brand-700 focus-visible:ring-brand-500 rounded text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
      >
        登录
      </a>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span className="truncate text-gray-500">{user.email}</span>
      <button
        className="hover:text-brand-600 focus-visible:text-brand-600 text-gray-500 transition-colors focus-visible:outline-none"
        onClick={() => router.push("/history")}
      >
        历史记录
      </button>
      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className="hover:text-brand-600 focus-visible:text-brand-600 text-gray-500 transition-colors focus-visible:outline-none"
        >
          登出
        </button>
      </form>
    </div>
  );
}
