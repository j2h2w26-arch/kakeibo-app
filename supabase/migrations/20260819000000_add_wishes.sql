begin;

create table public.wishes (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  title text not null,
  wanted_by text not null default 'ふたり',
  priority text not null default 'ほしい',
  price bigint,
  url text,
  target_month date,
  note text,
  is_completed boolean not null default false,
  completed_at timestamptz,
  created_by uuid default auth.uid() references public.app_members(user_id) on delete set null,
  constraint wishes_title_check
    check (char_length(btrim(title)) between 1 and 80),
  constraint wishes_wanted_by_check
    check (wanted_by in ('夫', '妻', 'ふたり')),
  constraint wishes_priority_check
    check (priority in ('いつか', 'ほしい', '最優先')),
  constraint wishes_price_check
    check (price is null or price > 0),
  constraint wishes_url_check
    check (
      url is null
      or (
        char_length(url) <= 2000
        and (url like 'https://%' or url like 'http://%')
      )
    ),
  constraint wishes_target_month_check
    check (target_month is null or extract(day from target_month) = 1),
  constraint wishes_note_check
    check (note is null or char_length(note) <= 500),
  constraint wishes_completion_check
    check (
      (is_completed and completed_at is not null)
      or (not is_completed and completed_at is null)
    )
);

create index wishes_status_created_at_idx
  on public.wishes (is_completed, created_at desc);

revoke all on table public.wishes from anon;
grant select, insert, update, delete on table public.wishes to authenticated;
grant usage, select on sequence public.wishes_id_seq to authenticated;

alter table public.wishes enable row level security;

create policy "Household members manage wishes"
  on public.wishes
  for all
  to authenticated
  using ((select public.is_app_member()))
  with check ((select public.is_app_member()));

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'wishes'
  ) then
    alter publication supabase_realtime add table public.wishes;
  end if;
end;
$$;

commit;
