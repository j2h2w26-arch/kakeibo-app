begin;

create table public.life_tasks (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  title text not null,
  task_type text not null default 'todo',
  category text not null default 'その他',
  assigned_to text not null default 'ふたり',
  priority text not null default '中',
  status text not null default '未着手',
  target_date date,
  note text,
  completed_at timestamptz,
  created_by uuid not null default auth.uid()
    references public.app_members(user_id) on delete restrict,
  constraint life_tasks_title_check
    check (char_length(btrim(title)) between 1 and 100),
  constraint life_tasks_type_check
    check (task_type in ('goal', 'todo')),
  constraint life_tasks_category_check
    check (category in ('保険・手続き', 'お金', '健康', '家族', '住まい', 'キャリア', 'その他')),
  constraint life_tasks_assigned_to_check
    check (assigned_to in ('夫', '妻', 'ふたり')),
  constraint life_tasks_priority_check
    check (priority in ('高', '中', '低')),
  constraint life_tasks_status_check
    check (status in ('未着手', '進行中', '完了')),
  constraint life_tasks_note_check
    check (note is null or char_length(note) <= 1000),
  constraint life_tasks_completion_check
    check (
      (status = '完了' and completed_at is not null)
      or (status <> '完了' and completed_at is null)
    )
);

create index life_tasks_status_target_idx
  on public.life_tasks (status, target_date, priority);
create index life_tasks_created_by_idx
  on public.life_tasks (created_by);

revoke all on table public.life_tasks from public, anon;
grant select, insert, delete on table public.life_tasks to authenticated;
grant update (
  updated_at,
  title,
  task_type,
  category,
  assigned_to,
  priority,
  status,
  target_date,
  note,
  completed_at
) on table public.life_tasks to authenticated;
revoke all on sequence public.life_tasks_id_seq from public, anon;
grant usage, select on sequence public.life_tasks_id_seq to authenticated;

alter table public.life_tasks enable row level security;

create policy "Household members read life tasks"
  on public.life_tasks
  for select
  to authenticated
  using ((select public.is_app_member()));

create policy "Household members create life tasks"
  on public.life_tasks
  for insert
  to authenticated
  with check (
    (select public.is_app_member())
    and created_by = (select auth.uid())
  );

create policy "Household members update life tasks"
  on public.life_tasks
  for update
  to authenticated
  using ((select public.is_app_member()))
  with check ((select public.is_app_member()));

create policy "Household members delete life tasks"
  on public.life_tasks
  for delete
  to authenticated
  using ((select public.is_app_member()));

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'life_tasks'
  ) then
    alter publication supabase_realtime add table public.life_tasks;
  end if;
end;
$$;

commit;
