begin;

create table public.inventory_items (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  category text not null default '日用品',
  status text not null default 'enough',
  quantity numeric(8, 2),
  unit text,
  note text,
  updated_by uuid not null default auth.uid()
    references public.app_members(user_id) on delete restrict,
  constraint inventory_items_name_check
    check (char_length(btrim(name)) between 1 and 80),
  constraint inventory_items_category_check
    check (category in ('食材', '日用品', 'その他')),
  constraint inventory_items_status_check
    check (status in ('enough', 'low', 'out')),
  constraint inventory_items_quantity_check
    check (quantity is null or quantity between 0 and 999999.99),
  constraint inventory_items_unit_check
    check (unit is null or char_length(btrim(unit)) between 1 and 12),
  constraint inventory_items_note_check
    check (note is null or char_length(note) <= 200)
);

create unique index inventory_items_normalized_name_idx
  on public.inventory_items (lower(btrim(name)));
create index inventory_items_needed_idx
  on public.inventory_items (status, category, updated_at desc)
  where status in ('low', 'out');
create index inventory_items_updated_by_idx
  on public.inventory_items (updated_by);

revoke all on table public.inventory_items from public, anon;
grant select, insert, update, delete on table public.inventory_items to authenticated;
grant usage, select on sequence public.inventory_items_id_seq to authenticated;

alter table public.inventory_items enable row level security;

create policy "Household members read inventory"
  on public.inventory_items
  for select
  to authenticated
  using ((select public.is_app_member()));

create policy "Household members create inventory"
  on public.inventory_items
  for insert
  to authenticated
  with check (
    (select public.is_app_member())
    and updated_by = (select auth.uid())
  );

create policy "Household members update inventory"
  on public.inventory_items
  for update
  to authenticated
  using ((select public.is_app_member()))
  with check (
    (select public.is_app_member())
    and updated_by = (select auth.uid())
  );

create policy "Household members delete inventory"
  on public.inventory_items
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
      and tablename = 'inventory_items'
  ) then
    alter publication supabase_realtime add table public.inventory_items;
  end if;
end;
$$;

commit;
