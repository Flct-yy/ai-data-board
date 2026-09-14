import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { v4 as uuidv4 } from "uuid";
import { createClient } from "@/utils/supabase/server";
import type { CsvSchema } from "@/types";

export const runtime = "nodejs";

/**
 * 创建分析会话：存 schema 到 sessions 表 + 存全量行到 csv_data 表。
 * 前端 Web Worker 解析完 CSV 后调用此接口。
 */
export async function POST(req: Request) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { csvSchema, rows }: { csvSchema: CsvSchema; rows: Record<string, unknown>[] } =
    await req.json();

  // 校验登录（如果 sessions 表启用了 RLS，这一步是必须的）
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = uuidv4();
  const title = csvSchema.fileName.replace(/\.csv$/i, "");

  // 1. 插入 session（带 user_id，供 RLS 校验）
  const { error: sessionErr } = await supabase.from("sessions").insert({
    id,
    title,
    csv_schema: csvSchema,
    user_id: user.id,
  });

  if (sessionErr) {
    return NextResponse.json({ error: sessionErr.message }, { status: 500 });
  }

  // 2. 插入全量行
  const { error: dataErr } = await supabase.from("csv_data").insert({ session_id: id, rows });

  if (dataErr) {
    // 回滚：删掉刚插入的 session，避免脏数据
    await supabase.from("sessions").delete().eq("id", id);
    return NextResponse.json({ error: dataErr.message }, { status: 500 });
  }

  return NextResponse.json({ id });
}
