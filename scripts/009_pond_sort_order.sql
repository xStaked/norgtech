-- Persist pond ordering across modules
alter table public.ponds
add column if not exists sort_order integer;

with ranked as (
  select
    id,
    row_number() over (
      partition by organization_id
      order by created_at desc, id
    ) - 1 as next_sort_order
  from public.ponds
)
update public.ponds p
set sort_order = ranked.next_sort_order
from ranked
where p.id = ranked.id;

alter table public.ponds
alter column sort_order set default 0;

alter table public.ponds
alter column sort_order set not null;

create index if not exists idx_ponds_org_sort_order
  on public.ponds (organization_id, sort_order);
