-- messages 稳定排序：同一轮 user/assistant/tool 共享 created_at，用 seq 消歧
-- 0001 已对齐新库建表；本迁移用于已经执行过旧版 0001 的库。

alter table public.messages add column if not exists seq integer;

-- 回填：同一时间戳内按 user → assistant → tool 的语义顺序编号
with ranked as (
  select
    id,
    row_number() over (
      partition by session_id
      order by
        created_at,
        case role
          when 'user' then 0
          when 'assistant' then 1
          else 2
        end,
        id
    ) as rn
  from public.messages
)
update public.messages m
set seq = r.rn
from ranked r
where m.id = r.id
  and m.seq is null;

alter table public.messages alter column seq set default 0;
alter table public.messages alter column seq set not null;

create index if not exists messages_session_id_created_at_seq_idx
  on public.messages (session_id, created_at, seq);

create index if not exists messages_session_id_seq_idx
  on public.messages (session_id, seq);
