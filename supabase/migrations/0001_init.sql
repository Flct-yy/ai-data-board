-- AI 数据分析看板 · 数据库初始化
-- 在 Supabase SQL Editor 执行
-- ⚠️ 本脚本会删除并重建以下表及其全部数据：
--    report_chunks, reports, csv_data, messages, sessions

-- ============ 删除旧表（顺序：先子表后父表，cascade 兜底） ============
drop table if exists public.report_chunks cascade;
drop table if exists public.reports       cascade;
drop table if exists public.csv_data      cascade;
drop table if exists public.messages      cascade;
drop table if exists public.sessions      cascade;

-- ============ 扩展 ============
create extension if not exists vector;

-- ============ 会话表 ============
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  csv_schema jsonb,
  created_at timestamptz not null default now()
);

create index if not exists sessions_user_id_created_at_idx
  on sessions (user_id, created_at desc);

-- ============ 消息表 ============
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  role text not null check (role in ('user','assistant','tool')),
  content text not null,
  tool_call_id text,
  created_at timestamptz not null default now()
);

create index if not exists messages_session_id_created_at_idx
  on messages (session_id, created_at);

-- ============ 分析报告表 ============
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  question text not null,
  answer text not null,
  chart_specs jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create index if not exists reports_session_id_created_at_idx
  on reports (session_id, created_at);

-- ============ CSV 行数据表 ============
create table if not exists csv_data (
  session_id uuid primary key references sessions(id) on delete cascade,
  rows jsonb not null,
  created_at timestamptz not null default now()
);

-- ============ 报告内容向量表 ============
create table if not exists report_chunks (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports(id) on delete cascade,
  session_id uuid not null references sessions(id) on delete cascade,
  content text not null,
  embedding vector(1536),
  created_at timestamptz not null default now()
);

-- 向量索引（HNSW，余弦距离）
drop index if exists report_chunks_embedding_idx;
create index if not exists report_chunks_embedding_idx
  on report_chunks using hnsw (embedding vector_cosine_ops);

drop function if exists match_reports(vector, int, uuid);
drop function if exists match_reports(vector, int);

create or replace function public.match_reports(
  query_embedding public.vector(1536),
  match_count int default 5,
  filter_user_id uuid default null
) returns table (
  id uuid,
  report_id uuid,
  content text,
  similarity float
)
language sql stable
set search_path = public, extensions
as $$
  select
    rc.id,
    rc.report_id,
    rc.content,
    1 - (rc.embedding <=> query_embedding) as similarity
  from public.report_chunks rc
  join public.sessions s on s.id = rc.session_id
  where filter_user_id is null or s.user_id = filter_user_id
  order by rc.embedding <=> query_embedding
  limit match_count;
$$;

-- ============ 启用 RLS + 策略 ============
alter table sessions      enable row level security;
alter table messages      enable row level security;
alter table reports       enable row level security;
alter table csv_data      enable row level security;
alter table report_chunks enable row level security;

-- sessions：直接按 user_id 判断
drop policy if exists sessions_select_own on sessions;
drop policy if exists sessions_insert_own on sessions;
drop policy if exists sessions_update_own on sessions;
drop policy if exists sessions_delete_own on sessions;

create policy sessions_select_own on sessions
  for select using (auth.uid() = user_id);
create policy sessions_insert_own on sessions
  for insert with check (auth.uid() = user_id);
create policy sessions_update_own on sessions
  for update using (auth.uid() = user_id);
create policy sessions_delete_own on sessions
  for delete using (auth.uid() = user_id);

-- 子表：通过 session 归属判断
drop policy if exists messages_all_own on messages;
create policy messages_all_own on messages
  for all using (
    exists (
      select 1 from sessions
      where sessions.id = messages.session_id
        and sessions.user_id = auth.uid()
    )
  );

drop policy if exists csv_data_all_own on csv_data;
create policy csv_data_all_own on csv_data
  for all using (
    exists (
      select 1 from sessions
      where sessions.id = csv_data.session_id
        and sessions.user_id = auth.uid()
    )
  );

drop policy if exists reports_all_own on reports;
create policy reports_all_own on reports
  for all using (
    exists (
      select 1 from sessions
      where sessions.id = reports.session_id
        and sessions.user_id = auth.uid()
    )
  );

drop policy if exists report_chunks_all_own on report_chunks;
create policy report_chunks_all_own on report_chunks
  for all using (
    exists (
      select 1 from sessions
      where sessions.id = report_chunks.session_id
        and sessions.user_id = auth.uid()
    )
  );