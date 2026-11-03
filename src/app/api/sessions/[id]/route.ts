import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { mergeGlossary } from "@/lib/csv/glossary";
import type { CsvSchema } from "@/types";

export const runtime = "nodejs";

const glossaryEntrySchema = z.object({
  label: z.string().max(80).optional(),
  unit: z.string().max(40).optional(),
  note: z.string().max(500).optional(),
});

const patchSchema = z
  .object({
    glossary: z.record(z.string(), glossaryEntrySchema).optional(),
    title: z.string().trim().min(1).max(120).optional(),
  })
  .strict()
  .refine(data => data.glossary !== undefined || data.title !== undefined, {
    message: "nothing to update",
  });

async function getAuthorizedClient() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;

  const { error: userError } = await supabase.auth.getUser();
  if (userError) {
    console.warn("[sessions:item] getUser failed, using session:", userError.message);
  }

  return supabase;
}

/**
 * 只允许更新 csv_schema.glossary 和 title，不接受任意字段。
 * glossary 按列合并，不覆盖 csv_schema 里的 fileName/profile 等其它内容。
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getAuthorizedClient();
  if (!supabase) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Bad Request", detail: "only glossary and title are allowed" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("sessions")
      .select("id,csv_schema")
      .eq("id", id)
      .maybeSingle<{ id: string; csv_schema: CsvSchema | null }>();

    if (error) {
      console.error("[sessions:item] select error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Not Found" }, { status: 404 });
    }

    const update: { title?: string; csv_schema?: CsvSchema } = {};

    if (parsed.data.title !== undefined) {
      update.title = parsed.data.title;
    }

    if (parsed.data.glossary !== undefined) {
      if (!data.csv_schema) {
        return NextResponse.json(
          { error: "Bad Request", detail: "session has no csv_schema" },
          { status: 400 }
        );
      }
      update.csv_schema = {
        ...data.csv_schema,
        glossary: mergeGlossary(data.csv_schema.glossary, parsed.data.glossary),
      };
    }

    const { data: updated, error: updateError } = await supabase
      .from("sessions")
      .update(update)
      .eq("id", id)
      .select("id,title,csv_schema")
      .single<{ id: string; title: string; csv_schema: CsvSchema | null }>();

    if (updateError) {
      console.error("[sessions:item] update error:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ session: updated });
  } catch (err) {
    console.error("[sessions:item] unexpected error:", err);
    return NextResponse.json(
      { error: "Server error", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

/** 删除会话；csv_data / messages / reports / report_chunks 由外键级联删除 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getAuthorizedClient();
  if (!supabase) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { data, error } = await supabase
      .from("sessions")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle<{ id: string }>();

    if (error) {
      console.error("[sessions:item] delete error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Not Found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[sessions:item] unexpected delete error:", err);
    return NextResponse.json(
      { error: "Server error", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
