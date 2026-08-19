begin;

create table public.point_sources (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source_key text not null unique,
  name text not null,
  service_key text not null,
  index_url text not null,
  official_host text not null,
  is_enabled boolean not null default true,
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  constraint point_sources_key_check check (source_key ~ '^[a-z0-9_]+$'),
  constraint point_sources_service_check check (service_key in ('pointclub', 'pay', 'ichiba', 'card')),
  constraint point_sources_name_check check (char_length(btrim(name)) between 1 and 80),
  constraint point_sources_url_check check (index_url like 'https://%' and char_length(index_url) <= 2000),
  constraint point_sources_host_check check (official_host ~ '^[a-z0-9.-]+$'),
  constraint point_sources_error_check check (last_error is null or char_length(last_error) <= 1000)
);

create table public.point_campaigns (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source_id bigint not null references public.point_sources(id) on delete restrict,
  service_key text not null,
  canonical_url text not null unique,
  title text not null,
  entry_required boolean,
  spend_required boolean not null default false,
  lottery_only boolean not null default false,
  conditions text,
  benefit text,
  starts_at timestamptz,
  ends_at timestamptz,
  selection_score smallint not null default 0,
  selection_bucket text not null default 'review',
  source_confidence smallint not null default 0,
  content_hash text not null,
  status text not null default 'active',
  last_seen_at timestamptz not null default now(),
  source_checked_at timestamptz not null default now(),
  raw_metadata jsonb not null default '{}'::jsonb,
  constraint point_campaigns_service_check check (service_key in ('pointclub', 'pay', 'ichiba', 'card')),
  constraint point_campaigns_url_check check (canonical_url like 'https://%' and char_length(canonical_url) <= 2000),
  constraint point_campaigns_title_check check (char_length(btrim(title)) between 1 and 180),
  constraint point_campaigns_conditions_check check (conditions is null or char_length(conditions) <= 2000),
  constraint point_campaigns_benefit_check check (benefit is null or char_length(benefit) <= 1000),
  constraint point_campaigns_score_check check (selection_score between 0 and 100),
  constraint point_campaigns_confidence_check check (source_confidence between 0 and 100),
  constraint point_campaigns_bucket_check check (selection_bucket in ('auto', 'candidate', 'review', 'excluded')),
  constraint point_campaigns_status_check check (status in ('active', 'ended', 'review')),
  constraint point_campaigns_date_check check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table public.point_campaign_steps (
  id bigint generated always as identity primary key,
  campaign_id bigint not null references public.point_campaigns(id) on delete cascade,
  step_key text not null,
  step_order smallint not null default 0,
  title text not null,
  action_type text not null,
  frequency text not null default 'once',
  estimated_minutes smallint not null default 1,
  instructions text,
  constraint point_campaign_steps_key_check check (step_key ~ '^[a-z0-9_]+$'),
  constraint point_campaign_steps_title_check check (char_length(btrim(title)) between 1 and 100),
  constraint point_campaign_steps_action_check check (action_type in ('tap', 'entry', 'condition', 'check')),
  constraint point_campaign_steps_frequency_check check (frequency in ('daily', 'weekly', 'monthly', 'once')),
  constraint point_campaign_steps_minutes_check check (estimated_minutes between 1 and 120),
  constraint point_campaign_steps_instructions_check check (instructions is null or char_length(instructions) <= 1000),
  constraint point_campaign_steps_unique unique (campaign_id, step_key)
);

create table public.point_campaign_member_states (
  campaign_id bigint not null references public.point_campaigns(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.app_members(user_id) on delete cascade,
  decision text not null default 'undecided',
  updated_at timestamptz not null default now(),
  primary key (campaign_id, user_id),
  constraint point_campaign_member_states_decision_check
    check (decision in ('undecided', 'joined', 'skipped', 'not_eligible'))
);

create table public.point_service_preferences (
  user_id uuid not null default auth.uid() references public.app_members(user_id) on delete cascade,
  service_key text not null,
  is_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, service_key),
  constraint point_service_preferences_service_check
    check (service_key in ('pointclub', 'pay', 'ichiba', 'card'))
);

create table public.point_sync_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  sources_checked smallint not null default 0,
  campaigns_found integer not null default 0,
  campaigns_created integer not null default 0,
  campaigns_updated integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  constraint point_sync_runs_status_check check (status in ('running', 'success', 'partial', 'failed')),
  constraint point_sync_runs_counts_check check (
    sources_checked >= 0 and campaigns_found >= 0 and campaigns_created >= 0 and campaigns_updated >= 0
  )
);

create table public.point_sync_config (
  singleton boolean primary key default true check (singleton),
  cron_secret_hash text not null,
  updated_at timestamptz not null default now(),
  constraint point_sync_config_hash_check check (cron_secret_hash ~ '^[0-9a-f]{64}$')
);

create index point_campaigns_source_status_idx on public.point_campaigns (source_id, status, ends_at);
create index point_campaigns_bucket_score_idx on public.point_campaigns (selection_bucket, selection_score desc, ends_at);
create index point_campaigns_last_seen_idx on public.point_campaigns (last_seen_at);
create index point_campaign_steps_campaign_order_idx on public.point_campaign_steps (campaign_id, step_order);
create index point_campaign_member_states_user_idx on public.point_campaign_member_states (user_id, decision);
create index point_sync_runs_started_idx on public.point_sync_runs (started_at desc);

alter table public.point_activities
  add column campaign_id bigint references public.point_campaigns(id) on delete set null,
  add column step_key text,
  add column origin text not null default 'manual',
  add column assigned_to uuid references public.app_members(user_id) on delete cascade,
  add constraint point_activities_origin_check check (origin in ('manual', 'campaign')),
  add constraint point_activities_campaign_shape_check check (
    (origin = 'manual' and campaign_id is null and step_key is null)
    or (origin = 'campaign' and campaign_id is not null and step_key is not null and assigned_to is not null)
  );

alter table public.point_activities
  add constraint point_activities_campaign_assignment_unique
  unique (campaign_id, assigned_to, step_key);
create index point_activities_assigned_active_idx
  on public.point_activities (assigned_to, is_active, sort_order);

insert into public.point_sources (source_key, name, service_key, index_url, official_host)
values
  ('rakuten_pointclub', '楽天PointClub', 'pointclub', 'https://point.rakuten.co.jp/campaign/', 'point.rakuten.co.jp'),
  ('rakuten_pay', '楽天ペイ', 'pay', 'https://pay.rakuten.co.jp/campaign/', 'pay.rakuten.co.jp')
on conflict (source_key) do update set
  name = excluded.name,
  service_key = excluded.service_key,
  index_url = excluded.index_url,
  official_host = excluded.official_host,
  updated_at = now();

revoke all on table
  public.point_sources,
  public.point_campaigns,
  public.point_campaign_steps,
  public.point_campaign_member_states,
  public.point_service_preferences,
  public.point_sync_runs
from anon;

revoke all on table public.point_sync_config from public, anon, authenticated;

grant select on table
  public.point_sources,
  public.point_campaigns,
  public.point_campaign_steps,
  public.point_sync_runs
to authenticated;
grant select, insert, update, delete on table
  public.point_campaign_member_states,
  public.point_service_preferences
to authenticated;
alter table public.point_sources enable row level security;
alter table public.point_campaigns enable row level security;
alter table public.point_campaign_steps enable row level security;
alter table public.point_campaign_member_states enable row level security;
alter table public.point_service_preferences enable row level security;
alter table public.point_sync_runs enable row level security;
alter table public.point_sync_config enable row level security;

create policy "Household members read point sources"
  on public.point_sources for select to authenticated
  using ((select public.is_app_member()));
create policy "Household members read point campaigns"
  on public.point_campaigns for select to authenticated
  using ((select public.is_app_member()));
create policy "Household members read point campaign steps"
  on public.point_campaign_steps for select to authenticated
  using ((select public.is_app_member()));
create policy "Household members read point sync runs"
  on public.point_sync_runs for select to authenticated
  using ((select public.is_app_member()));

create policy "Members read their campaign decisions"
  on public.point_campaign_member_states for select to authenticated
  using ((select public.is_app_member()) and user_id = (select auth.uid()));
create policy "Members create their campaign decisions"
  on public.point_campaign_member_states for insert to authenticated
  with check ((select public.is_app_member()) and user_id = (select auth.uid()));
create policy "Members update their campaign decisions"
  on public.point_campaign_member_states for update to authenticated
  using ((select public.is_app_member()) and user_id = (select auth.uid()))
  with check ((select public.is_app_member()) and user_id = (select auth.uid()));
create policy "Members delete their campaign decisions"
  on public.point_campaign_member_states for delete to authenticated
  using ((select public.is_app_member()) and user_id = (select auth.uid()));

create policy "Members read their point service preferences"
  on public.point_service_preferences for select to authenticated
  using ((select public.is_app_member()) and user_id = (select auth.uid()));
create policy "Members create their point service preferences"
  on public.point_service_preferences for insert to authenticated
  with check ((select public.is_app_member()) and user_id = (select auth.uid()));
create policy "Members update their point service preferences"
  on public.point_service_preferences for update to authenticated
  using ((select public.is_app_member()) and user_id = (select auth.uid()))
  with check ((select public.is_app_member()) and user_id = (select auth.uid()));
create policy "Members delete their point service preferences"
  on public.point_service_preferences for delete to authenticated
  using ((select public.is_app_member()) and user_id = (select auth.uid()));

drop policy "Household members manage point activities" on public.point_activities;

create policy "Household members read point activities"
  on public.point_activities for select to authenticated
  using ((select public.is_app_member()));
create policy "Household members create point activities"
  on public.point_activities for insert to authenticated
  with check (
    (select public.is_app_member())
    and (
      (origin = 'manual' and assigned_to is null)
      or (
        origin = 'campaign'
        and assigned_to = (select auth.uid())
        and exists (
          select 1 from public.point_campaign_member_states as states
          where states.campaign_id = point_activities.campaign_id
            and states.user_id = (select auth.uid())
            and states.decision = 'joined'
        )
        and exists (
          select 1 from public.point_campaign_steps as steps
          where steps.campaign_id = point_activities.campaign_id
            and steps.step_key = point_activities.step_key
        )
      )
    )
  );
create policy "Members update permitted point activities"
  on public.point_activities for update to authenticated
  using (
    (select public.is_app_member())
    and (origin = 'manual' or assigned_to = (select auth.uid()))
  )
  with check (
    (select public.is_app_member())
    and (
      (origin = 'manual' and assigned_to is null)
      or (
        origin = 'campaign'
        and assigned_to = (select auth.uid())
        and exists (
          select 1 from public.point_campaign_member_states as states
          where states.campaign_id = point_activities.campaign_id
            and states.user_id = (select auth.uid())
            and states.decision = 'joined'
        )
        and exists (
          select 1 from public.point_campaign_steps as steps
          where steps.campaign_id = point_activities.campaign_id
            and steps.step_key = point_activities.step_key
        )
      )
    )
  );
create policy "Members delete permitted point activities"
  on public.point_activities for delete to authenticated
  using (
    (select public.is_app_member())
    and (origin = 'manual' or assigned_to = (select auth.uid()))
  );

create or replace function public.set_point_campaign_decision(
  p_campaign_id bigint,
  p_decision text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  member_id uuid := (select auth.uid());
begin
  if member_id is null or not (select public.is_app_member()) then
    raise exception 'not authorized';
  end if;

  if p_decision not in ('joined', 'skipped', 'not_eligible', 'undecided') then
    raise exception 'invalid decision';
  end if;

  if not exists (
    select 1 from public.point_campaigns
    where id = p_campaign_id and status = 'active'
  ) then
    raise exception 'campaign is not active';
  end if;

  insert into public.point_campaign_member_states (campaign_id, user_id, decision, updated_at)
  values (p_campaign_id, member_id, p_decision, now())
  on conflict (campaign_id, user_id) do update set
    decision = excluded.decision,
    updated_at = excluded.updated_at;

  if p_decision = 'joined' then
    insert into public.point_activities (
      title,
      frequency,
      action_type,
      estimated_minutes,
      official_url,
      conditions,
      deadline,
      source_checked_at,
      is_active,
      sort_order,
      created_by,
      campaign_id,
      step_key,
      origin,
      assigned_to
    )
    select
      steps.title,
      steps.frequency,
      steps.action_type,
      steps.estimated_minutes,
      campaigns.canonical_url,
      coalesce(steps.instructions, campaigns.conditions),
      campaigns.ends_at,
      campaigns.source_checked_at,
      true,
      1000 + steps.step_order,
      member_id,
      campaigns.id,
      steps.step_key,
      'campaign',
      member_id
    from public.point_campaigns as campaigns
    join public.point_campaign_steps as steps on steps.campaign_id = campaigns.id
    where campaigns.id = p_campaign_id
    on conflict (campaign_id, assigned_to, step_key)
    do update set
      title = excluded.title,
      frequency = excluded.frequency,
      action_type = excluded.action_type,
      estimated_minutes = excluded.estimated_minutes,
      official_url = excluded.official_url,
      conditions = excluded.conditions,
      deadline = excluded.deadline,
      source_checked_at = excluded.source_checked_at,
      is_active = true,
      updated_at = now();
  else
    update public.point_activities
    set is_active = false, updated_at = now()
    where campaign_id = p_campaign_id
      and assigned_to = member_id;
  end if;
end;
$$;

revoke all on function public.set_point_campaign_decision(bigint, text) from public, anon;
grant execute on function public.set_point_campaign_decision(bigint, text) to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'point_sources',
    'point_campaigns',
    'point_campaign_steps',
    'point_campaign_member_states',
    'point_service_preferences',
    'point_sync_runs'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
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
