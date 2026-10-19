import { createOpenAI } from "@ai-sdk/openai";
import { deepSeek } from "@ai-sdk/deepseek";
import { embed, generateObject } from "ai";
import { z } from "zod";
import { createClient } from "@/utils/supabase/client";

// DeepSeek 的 embedding API 完全 OpenAI 兼容（同 baseURL），
// 用 createOpenAI 覆盖 baseURL + apiKey 即可复用 AI SDK 的 embed()
const deepseekEmbed = createOpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY ?? "",
  baseURL: "https://api.deepseek.com",
}).embedding("deepseek-embed");

interface ChunkRow {
  id: string;
  report_id: string;
  content: string;
  similarity: number;
}

/** 查询改写：把用户问题拆成多个检索 query，提高召回 */
export async function rewriteQuery(question: string): Promise<string[]> {
  const { object } = await generateObject({
    model: deepSeek("deepseek-flash"),
    schema: z.object({
      queries: z.array(z.string()).min(1).max(3),
    }),
    prompt: `把下面问题改写成 1-3 个用于向量检索的短查询（关键词形式）：\n${question}`,
  });
  return object.queries;
}

/** 向量召回：每个 query 各取 topK，合并去重按相似度排序 */
export async function retrieveChunks(queries: string[], topK = 5): Promise<ChunkRow[]> {
  const supabase = createClient();

  const perQuery = await Promise.all(
    queries.map(async q => {
      const { embedding } = await embed({ model: deepseekEmbed, value: q });
      const { data } = await supabase.rpc("match_reports", {
        query_embedding: embedding,
        match_count: topK,
      });
      return (data ?? []) as ChunkRow[];
    })
  );

  const seen = new Set<string>();
  return perQuery
    .flat()
    .filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

/**
 * 重排：简化版用相似度排序，生产可接 cohere reranker 或 cross-encoder。
 * 保留接口以便后续替换实现而不动调用方。
 */
export async function rerank(_question: string, chunks: ChunkRow[]): Promise<ChunkRow[]> {
  return chunks;
}

/** RAG 全流程：改写 → 召回 → 重排 → 返回拼接上下文 */
export async function searchHistory(question: string, topK = 5): Promise<string> {
  const queries = await rewriteQuery(question);
  const chunks = await retrieveChunks(queries, topK);
  const reranked = await rerank(question, chunks);
  return reranked.map(c => c.content).join("\n\n");
}

/** 分析完成后把报告内容写入向量表，供后续 RAG 检索 */
export async function indexReport(
  reportId: string,
  sessionId: string,
  content: string
): Promise<void> {
  const supabase = createClient();
  const { embedding } = await embed({
    model: deepseekEmbed,
    value: content.slice(0, 8000),
  });
  await supabase.from("report_chunks").insert({
    report_id: reportId,
    session_id: sessionId,
    content,
    embedding,
  });
}
