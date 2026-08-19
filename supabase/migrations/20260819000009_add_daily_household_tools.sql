begin;

alter table public.inventory_items
  add column expires_on date;

create index inventory_items_expires_on_idx
  on public.inventory_items (expires_on)
  where expires_on is not null;

alter table public.wishes
  add column wish_type text not null default '買いたい'
    constraint wishes_wish_type_check
    check (wish_type in ('買いたい', '行きたい', 'やりたい')),
  add column consultation_status text not null default '相談中'
    constraint wishes_consultation_status_check
    check (consultation_status in ('相談中', '決定', '見送り')),
  add column candidate_date date;

create table public.household_expenses (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  spent_on date not null default current_date,
  merchant text not null,
  amount bigint not null,
  category text not null default 'その他',
  paid_by text not null,
  created_by uuid not null default auth.uid()
    references public.app_members(user_id) on delete restrict,
  items text,
  note text,
  receipt_path text,
  constraint household_expenses_merchant_check
    check (char_length(btrim(merchant)) between 1 and 80),
  constraint household_expenses_amount_check
    check (amount between 1 and 100000000),
  constraint household_expenses_category_check
    check (category in ('食費', '日用品', '外食', '交通', '旅行', '固定費', 'その他')),
  constraint household_expenses_paid_by_check
    check (paid_by in ('夫', '妻', '共通')),
  constraint household_expenses_items_check
    check (items is null or char_length(items) <= 1000),
  constraint household_expenses_note_check
    check (note is null or char_length(note) <= 500),
  constraint household_expenses_receipt_path_check
    check (receipt_path is null or char_length(receipt_path) <= 500)
);

create index household_expenses_spent_on_idx
  on public.household_expenses (spent_on desc, created_at desc);
create index household_expenses_created_by_idx
  on public.household_expenses (created_by);

revoke all on table public.household_expenses from public, anon;
grant select, insert, update, delete on table public.household_expenses to authenticated;
grant usage, select on sequence public.household_expenses_id_seq to authenticated;

alter table public.household_expenses enable row level security;

create policy "Household members manage expenses"
  on public.household_expenses
  for all
  to authenticated
  using ((select public.is_app_member()))
  with check (
    (select public.is_app_member())
    and created_by = (select auth.uid())
  );

create table public.wish_comments (
  id bigint generated always as identity primary key,
  wish_id bigint not null references public.wishes(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid()
    references public.app_members(user_id) on delete restrict,
  body text not null,
  constraint wish_comments_body_check
    check (char_length(btrim(body)) between 1 and 300)
);

create index wish_comments_wish_created_idx
  on public.wish_comments (wish_id, created_at);
create index wish_comments_created_by_idx
  on public.wish_comments (created_by);

revoke all on table public.wish_comments from public, anon;
grant select, insert, delete on table public.wish_comments to authenticated;
grant usage, select on sequence public.wish_comments_id_seq to authenticated;

alter table public.wish_comments enable row level security;

create policy "Household members read wish comments"
  on public.wish_comments
  for select
  to authenticated
  using ((select public.is_app_member()));

create policy "Household members create own wish comments"
  on public.wish_comments
  for insert
  to authenticated
  with check (
    (select public.is_app_member())
    and created_by = (select auth.uid())
  );

create policy "Members delete own wish comments"
  on public.wish_comments
  for delete
  to authenticated
  using (
    (select public.is_app_member())
    and created_by = (select auth.uid())
  );

create table public.notification_preferences (
  user_id uuid primary key default auth.uid()
    references public.app_members(user_id) on delete cascade,
  morning_enabled boolean not null default false,
  morning_time time not null default '08:00',
  evening_enabled boolean not null default false,
  evening_time time not null default '19:00',
  updated_at timestamptz not null default now()
);

revoke all on table public.notification_preferences from public, anon;
grant select, insert, update, delete on table public.notification_preferences to authenticated;

alter table public.notification_preferences enable row level security;

create policy "Members manage own notification preferences"
  on public.notification_preferences
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Household members read receipt images"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'receipts'
    and (select public.is_app_member())
  );

create policy "Household members upload receipt images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'receipts'
    and (select public.is_app_member())
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "Household members delete receipt images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'receipts'
    and (select public.is_app_member())
  );

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'household_expenses',
    'wish_comments',
    'notification_preferences'
  ] loop
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
