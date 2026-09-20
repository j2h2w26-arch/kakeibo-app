begin;

create table public.life_goal_phases (
  id bigint generated always as identity primary key,
  goal_id bigint not null references public.life_goals(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 1 and 100),
  note text check (note is null or char_length(note) <= 1000),
  status text not null default '未着手' check (status in ('未着手', '進行中', '完了')),
  target_date date,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references public.app_members(user_id) on delete restrict,
  unique (id, goal_id)
);
create table public.life_goal_relations (
  source_goal_id bigint not null references public.life_goals(id) on delete restrict,
  target_goal_id bigint not null references public.life_goals(id) on delete restrict,
  kind text not null check (kind in ('支える', '前提', '関連')),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references public.app_members(user_id) on delete restrict,
  primary key (source_goal_id, target_goal_id),
  check (source_goal_id <> target_goal_id)
);

alter table public.life_goal_milestones add column phase_id bigint;
alter table public.life_goal_milestones add constraint life_goal_milestones_phase_goal_fk
  foreign key (phase_id, goal_id) references public.life_goal_phases(id, goal_id) on delete restrict;
alter table public.life_goal_task_links add column phase_id bigint;
alter table public.life_goal_task_links add constraint life_goal_task_links_phase_goal_fk
  foreign key (phase_id, goal_id) references public.life_goal_phases(id, goal_id) on delete restrict;
grant update (phase_id) on public.life_goal_task_links to authenticated;
grant update (phase_id) on public.life_goal_milestones to authenticated;
create policy "Members assign task phases" on public.life_goal_task_links for update to authenticated
  using ((select public.is_app_member())) with check ((select public.is_app_member()));

create index life_goal_phases_goal_idx on public.life_goal_phases(goal_id, sort_order, id);
create index life_goal_phases_creator_idx on public.life_goal_phases(created_by);
create index life_goal_relations_target_idx on public.life_goal_relations(target_goal_id);
create index life_goal_relations_creator_idx on public.life_goal_relations(created_by);
create index life_goal_milestones_phase_idx on public.life_goal_milestones(phase_id, goal_id);
create index life_goal_task_links_phase_idx on public.life_goal_task_links(phase_id, goal_id);

alter table public.life_goal_phases enable row level security;
alter table public.life_goal_relations enable row level security;
revoke all on public.life_goal_phases, public.life_goal_relations from public, anon, authenticated;
grant select, insert on public.life_goal_phases to authenticated;
grant update (title, note, status, target_date, sort_order, updated_at) on public.life_goal_phases to authenticated;
grant select, insert, delete on public.life_goal_relations to authenticated;
revoke all on sequence public.life_goal_phases_id_seq from public, anon, authenticated;
grant usage, select on sequence public.life_goal_phases_id_seq to authenticated;

create policy "Members read phases" on public.life_goal_phases for select to authenticated
  using ((select public.is_app_member()));
create policy "Members insert phases" on public.life_goal_phases for insert to authenticated
  with check ((select public.is_app_member()) and created_by = (select auth.uid()));
create policy "Members update phases" on public.life_goal_phases for update to authenticated
  using ((select public.is_app_member())) with check ((select public.is_app_member()));
create policy "Members read relations" on public.life_goal_relations for select to authenticated
  using ((select public.is_app_member()));
create policy "Members insert relations" on public.life_goal_relations for insert to authenticated
  with check ((select public.is_app_member()) and created_by = (select auth.uid()));
create policy "Members delete relations" on public.life_goal_relations for delete to authenticated
  using ((select public.is_app_member()));
alter publication supabase_realtime add table public.life_goal_phases, public.life_goal_relations;
commit;
