import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

/** 删除单条报告；report_chunks 由外键级联删除 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error: userError } = await supabase.auth.getUser();
  if (userError) {
    console.warn("[reports:item] getUser failed, using session:", userError.message);
  }

  try {
    const { data, error } = await supabase
      .from("reports")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle<{ id: string }>();

    if (error) {
      console.error("[reports:item] delete error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Not Found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[reports:item] unexpected error:", err);
    return NextResponse.json(
      { error: "Server error", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
