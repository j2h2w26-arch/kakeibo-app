begin;

create table public.point_activities (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  title text not null,
  frequency text not null default 'daily',
  action_type text not null default 'check',
  estimated_minutes smallint not null default 1,
  official_url text not null,
  conditions text,
  deadline timestamptz,
  source_checked_at timestamptz not null default now(),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid default auth.uid() references public.app_members(user_id) on delete set null,
  constraint point_activities_title_check
    check (char_length(btrim(title)) between 1 and 100),
  constraint point_activities_frequency_check
    check (frequency in ('daily', 'weekly', 'monthly', 'once')),
  constraint point_activities_action_type_check
    check (action_type in ('tap', 'entry', 'condition', 'check')),
  constraint point_activities_minutes_check
    check (estimated_minutes between 1 and 120),
  constraint point_activities_url_check
    check (
      char_length(official_url) <= 2000
      and (official_url like 'https://%' or official_url like 'http://%')
    ),
  constraint point_activities_conditions_check
    check (conditions is null or char_length(conditions) <= 1000)
);

create table public.point_activity_completions (
  id bigint generated always as identity primary key,
  activity_id bigint not null references public.point_activities(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.app_members(user_id) on delete cascade,
  period_key text not null,
  completed_at timestamptz not null default now(),
  constraint point_activity_completions_period_key_check
    check (
      period_key = 'once'
      or period_key ~ '^daily:[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or period_key ~ '^weekly:[0-9]{4}-W[0-9]{2}$'
      or period_key ~ '^monthly:[0-9]{4}-[0-9]{2}$'
    ),
  constraint point_activity_completions_unique
    unique (activity_id, user_id, period_key)
);

create index point_activities_active_sort_idx
  on public.point_activities (is_active, sort_order, created_at);
create index point_activities_created_by_idx
  on public.point_activities (created_by);
create index point_activity_completions_user_period_idx
  on public.point_activity_completions (user_id, period_key);

revoke all on table public.point_activities, public.point_activity_completions from anon;

grant select, insert, update, delete on table public.point_activities to authenticated;
grant select, insert, delete on table public.point_activity_completions to authenticated;
grant usage, select on sequence
  public.point_activities_id_seq,
  public.point_activity_completions_id_seq
to authenticated;

alter table public.point_activities enable row level security;
alter table public.point_activity_completions enable row level security;

create policy "Household members manage point activities"
  on public.point_activities
  for all
  to authenticated
  using ((select public.is_app_member()))
  with check ((select public.is_app_member()));

create policy "Household members read point completions"
  on public.point_activity_completions
  for select
  to authenticated
  using ((select public.is_app_member()));

create policy "Members record their point completions"
  on public.point_activity_completions
  for insert
  to authenticated
  with check (
    (select public.is_app_member())
    and user_id = (select auth.uid())
  );

create policy "Members remove their point completions"
  on public.point_activity_completions
  for delete
  to authenticated
  using (
    (select public.is_app_member())
    and user_id = (select auth.uid())
  );

insert into public.point_activities (
  title,
  frequency,
  action_type,
  estimated_minutes,
  official_url,
  conditions,
  sort_order,
  created_by
)
values
  (
    'PointClubアプリ起動＆ラッキーくじ',
    'daily',
    'tap',
    2,
    'https://point.rakuten.co.jp/guidance/app/',
    '楽天PointClubアプリを本人が起動し、ポイント実績ページ下部のラッキーチャンスを確認します。',
    10,
    null
  ),
  (
    '楽天市場のキャンペーン・エントリー確認',
    'daily',
    'entry',
    3,
    'https://event.rakuten.co.jp/campaign/',
    '開催中のキャンペーンを確認し、必要なものだけ本人が内容を確認してエントリーします。',
    20,
    null
  ),
  (
    '楽天ペイのキャンペーン確認',
    'monthly',
    'condition',
    3,
    'https://pay.rakuten.co.jp/campaign/',
    '対象店舗・決済方法・期間・エントリー要否を公式ページで確認します。',
    30,
    null
  ),
  (
    '楽天カードのキャンペーン確認',
    'monthly',
    'entry',
    3,
    'https://www.rakuten-card.co.jp/campaign/',
    '楽天e-NAVIを含む公式案内で、エントリーと達成条件を本人が確認します。',
    40,
    null
  );

do $$
declare
  table_name text;
begin
  foreach table_name in array array['point_activities', 'point_activity_completions']
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
