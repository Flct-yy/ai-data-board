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

  try {
    const { csvSchema, rows }: { csvSchema: CsvSchema; rows: Record<string, unknown>[] } =
      await req.json();

    if (!csvSchema || !Array.isArray(rows)) {
      return NextResponse.json(
        { error: "Bad Request", detail: "csvSchema or rows invalid" },
        { status: 400 }
      );
    }

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      console.error("auth error:", authErr);
      return NextResponse.json(
        { error: "Unauthorized", detail: authErr?.message ?? "no user session" },
        { status: 401 }
      );
    }

    const id = uuidv4();
    const title = csvSchema.fileName?.replace(/\.csv$/i, "") || "untitled csv";

    const { error: sessionErr } = await supabase.from("sessions").insert({
      id,
      title,
      csv_schema: csvSchema,
      user_id: user.id,
    });

    if (sessionErr) {
      console.error("insert sessions error", sessionErr);
      return NextResponse.json({ error: sessionErr.message }, { status: 500 });
    }

    // 2. 插入csv全部行数据（当前方案：单条记录jsonb存储所有rows）
    const { error: dataErr } = await supabase.from("csv_data").insert({
      session_id: id,
      rows: rows,
    });

    if (dataErr) {
      console.error("insert csv_data error, rollback session", dataErr);
      await supabase.from("sessions").delete().eq("id", id);
      return NextResponse.json({ error: dataErr.message }, { status: 500 });
    }

    return NextResponse.json({ id });
  } catch (err) {
    console.error("route handler unexpected error", err);
    return NextResponse.json(
      { error: "Server error", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
