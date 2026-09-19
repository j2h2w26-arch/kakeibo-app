begin;

create table public.life_goals (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  title text not null,
  vision text,
  category text not null default 'その他',
  owner text not null default 'ふたり',
  horizon text not null default '3年以内',
  status text not null default '検討中',
  target_date date,
  is_archived boolean not null default false,
  created_by uuid not null default auth.uid()
    references public.app_members(user_id) on delete restrict,
  constraint life_goals_title_check
    check (char_length(btrim(title)) between 1 and 100),
  constraint life_goals_vision_check
    check (vision is null or char_length(vision) <= 1000),
  constraint life_goals_category_check
    check (category in ('お金', '健康', '家族', '住まい', '学び', 'キャリア', '旅行・移住', 'その他')),
  constraint life_goals_owner_check
    check (owner in ('夫', '妻', 'ふたり')),
  constraint life_goals_horizon_check
    check (horizon in ('1年以内', '3年以内', '5年以内', 'いつか')),
  constraint life_goals_status_check
    check (status in ('検討中', '進行中', '達成', '保留'))
);

create table public.life_goal_routes (
  id bigint generated always as identity primary key,
  goal_id bigint not null references public.life_goals(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  title text not null,
  note text,
  status text not null default '候補',
  sort_order integer not null default 0,
  created_by uuid not null default auth.uid()
    references public.app_members(user_id) on delete restrict,
  constraint life_goal_routes_title_check
    check (char_length(btrim(title)) between 1 and 100),
  constraint life_goal_routes_note_check
    check (note is null or char_length(note) <= 1000),
  constraint life_goal_routes_status_check
    check (status in ('候補', '検討中', '本命', '保留', '見送り')),
  constraint life_goal_routes_goal_pair_unique unique (id, goal_id)
);

create table public.life_goal_milestones (
  id bigint generated always as identity primary key,
  goal_id bigint not null references public.life_goals(id) on delete restrict,
  route_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  title text not null,
  note text,
  status text not null default '未着手',
  target_date date,
  completed_at timestamptz,
  sort_order integer not null default 0,
  created_by uuid not null default auth.uid()
    references public.app_members(user_id) on delete restrict,
  constraint life_goal_milestones_title_check
    check (char_length(btrim(title)) between 1 and 100),
  constraint life_goal_milestones_note_check
    check (note is null or char_length(note) <= 1000),
  constraint life_goal_milestones_status_check
    check (status in ('未着手', '進行中', '完了')),
  constraint life_goal_milestones_completion_check
    check (
      (status = '完了' and completed_at is not null)
      or (status <> '完了' and completed_at is null)
    ),
  constraint life_goal_milestones_route_goal_fk
    foreign key (route_id, goal_id)
    references public.life_goal_routes(id, goal_id) on delete restrict
);

create table public.life_goal_task_links (
  goal_id bigint not null references public.life_goals(id) on delete restrict,
  task_id bigint not null references public.life_tasks(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid()
    references public.app_members(user_id) on delete restrict,
  primary key (goal_id, task_id)
);

create index life_goals_status_target_idx
  on public.life_goals (is_archived, status, target_date);
create index life_goals_created_by_idx
  on public.life_goals (created_by);
create index life_goal_routes_goal_idx
  on public.life_goal_routes (goal_id, sort_order, id);
create index life_goal_routes_created_by_idx
  on public.life_goal_routes (created_by);
create index life_goal_milestones_goal_idx
  on public.life_goal_milestones (goal_id, sort_order, target_date, id);
create index life_goal_milestones_route_idx
  on public.life_goal_milestones (route_id, goal_id);
create index life_goal_milestones_created_by_idx
  on public.life_goal_milestones (created_by);
create index life_goal_task_links_task_idx
  on public.life_goal_task_links (task_id, goal_id);
create index life_goal_task_links_created_by_idx
  on public.life_goal_task_links (created_by);

revoke all on table
  public.life_goals,
  public.life_goal_routes,
  public.life_goal_milestones,
  public.life_goal_task_links
from public, anon, authenticated;

grant select, insert on table public.life_goals to authenticated;
grant update (
  updated_at, title, vision, category, owner, horizon, status, target_date, is_archived
) on table public.life_goals to authenticated;

grant select, insert on table public.life_goal_routes to authenticated;
grant update (
  updated_at, title, note, status, sort_order
) on table public.life_goal_routes to authenticated;

grant select, insert on table public.life_goal_milestones to authenticated;
grant update (
  updated_at, title, note, status, target_date, completed_at, sort_order, route_id
) on table public.life_goal_milestones to authenticated;

grant select, insert, delete on table public.life_goal_task_links to authenticated;

revoke all on sequence
  public.life_goals_id_seq,
  public.life_goal_routes_id_seq,
  public.life_goal_milestones_id_seq
from public, anon, authenticated;
grant usage, select on sequence
  public.life_goals_id_seq,
  public.life_goal_routes_id_seq,
  public.life_goal_milestones_id_seq
to authenticated;

alter table public.life_goals enable row level security;
alter table public.life_goal_routes enable row level security;
alter table public.life_goal_milestones enable row level security;
alter table public.life_goal_task_links enable row level security;

create policy "Household members read life goals"
  on public.life_goals for select to authenticated
  using ((select public.is_app_member()));
create policy "Household members create life goals"
  on public.life_goals for insert to authenticated
  with check ((select public.is_app_member()) and created_by = (select auth.uid()));
create policy "Household members update life goals"
  on public.life_goals for update to authenticated
  using ((select public.is_app_member()))
  with check ((select public.is_app_member()));

create policy "Household members read life goal routes"
  on public.life_goal_routes for select to authenticated
  using ((select public.is_app_member()));
create policy "Household members create life goal routes"
  on public.life_goal_routes for insert to authenticated
  with check ((select public.is_app_member()) and created_by = (select auth.uid()));
create policy "Household members update life goal routes"
  on public.life_goal_routes for update to authenticated
  using ((select public.is_app_member()))
  with check ((select public.is_app_member()));

create policy "Household members read life goal milestones"
  on public.life_goal_milestones for select to authenticated
  using ((select public.is_app_member()));
create policy "Household members create life goal milestones"
  on public.life_goal_milestones for insert to authenticated
  with check ((select public.is_app_member()) and created_by = (select auth.uid()));
create policy "Household members update life goal milestones"
  on public.life_goal_milestones for update to authenticated
  using ((select public.is_app_member()))
  with check ((select public.is_app_member()));

create policy "Household members read life goal task links"
  on public.life_goal_task_links for select to authenticated
  using ((select public.is_app_member()));
create policy "Household members create life goal task links"
  on public.life_goal_task_links for insert to authenticated
  with check ((select public.is_app_member()) and created_by = (select auth.uid()));
create policy "Household members delete life goal task links"
  on public.life_goal_task_links for delete to authenticated
  using ((select public.is_app_member()));

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'life_goals',
    'life_goal_routes',
    'life_goal_milestones',
    'life_goal_task_links'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;

commit;
