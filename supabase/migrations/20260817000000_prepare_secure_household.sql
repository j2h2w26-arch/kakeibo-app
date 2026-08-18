begin;

-- Phase 1 is safe to apply while the existing anonymous frontend is live.
-- It prepares Auth, validation, atomic repayment RPCs, and Realtime without
-- changing access to the three existing application tables.
create table if not exists public.app_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  constraint app_members_display_name_check
    check (char_length(btrim(display_name)) between 1 and 40)
);

alter table public.app_members enable row level security;

drop policy if exists "Members can read their profile" on public.app_members;
create policy "Members can read their profile"
  on public.app_members
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.app_members from anon;
grant select on table public.app_members to authenticated;

create or replace function public.is_app_member()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_members
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_app_member() from public;
grant execute on function public.is_app_member() to authenticated;

-- NOT VALID preserves legacy rows while enforcing every new write. Validate
-- these constraints after the legacy-data audit in the cutover phase.
alter table public.loans
  drop constraint if exists loans_amount_positive,
  add constraint loans_amount_positive check (amount is not null and amount > 0) not valid,
  drop constraint if exists loans_date_required,
  add constraint loans_date_required check (date is not null) not valid,
  drop constraint if exists loans_people_check,
  add constraint loans_people_check check (
    lender is not null
    and borrower is not null
    and lender in ('夫', '妻')
    and borrower in ('夫', '妻')
    and lender <> borrower
  ) not valid,
  drop constraint if exists loans_description_check,
  add constraint loans_description_check check (
    description is not null and char_length(btrim(description)) between 1 and 80
  ) not valid,
  drop constraint if exists loans_repaid_required,
  add constraint loans_repaid_required check (is_repaid is not null) not valid;

alter table public.repayments
  drop constraint if exists repayments_amount_positive,
  add constraint repayments_amount_positive check (amount is not null and amount > 0) not valid,
  drop constraint if exists repayments_date_required,
  add constraint repayments_date_required check (date is not null) not valid,
  drop constraint if exists repayments_note_check,
  add constraint repayments_note_check check (
    note is null or char_length(note) <= 80
  ) not valid;

alter table public.shopping_items
  drop constraint if exists shopping_items_name_check,
  add constraint shopping_items_name_check check (
    name is not null and char_length(btrim(name)) between 1 and 80
  ) not valid,
  drop constraint if exists shopping_items_category_check,
  add constraint shopping_items_category_check check (
    category is not null and category in ('食材', '日用品', 'その他')
  ) not valid,
  drop constraint if exists shopping_items_purchased_required,
  add constraint shopping_items_purchased_required check (is_purchased is not null) not valid;

create index if not exists repayments_loan_id_idx on public.repayments (loan_id);
create index if not exists loans_date_idx on public.loans (date desc);
create index if not exists shopping_items_created_at_idx on public.shopping_items (created_at desc);

-- Explicit grants are required by the current Supabase Data API defaults.
grant select, insert, update, delete on table
  public.loans,
  public.repayments,
  public.shopping_items
to authenticated;

grant usage, select on sequence
  public.loans_id_seq,
  public.repayments_id_seq,
  public.shopping_items_id_seq
to authenticated;

-- Record a repayment while holding a lock on its loan. The short transaction
-- prevents simultaneous devices from exceeding the remaining amount.
create or replace function public.record_repayment(
  p_loan_id bigint,
  p_amount bigint,
  p_date date,
  p_note text default null
)
returns public.repayments
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_loan public.loans;
  paid_total bigint;
  inserted_repayment public.repayments;
begin
  if not public.is_app_member() then
    raise exception 'Not an app member' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Repayment amount must be positive' using errcode = '22023';
  end if;
  if p_date is null then
    raise exception 'Repayment date is required' using errcode = '22023';
  end if;
  if p_note is not null and char_length(p_note) > 80 then
    raise exception 'Repayment note is too long' using errcode = '22023';
  end if;

  select * into target_loan
  from public.loans
  where id = p_loan_id
  for update;

  if not found then
    raise exception 'Loan not found' using errcode = 'P0002';
  end if;

  select coalesce(sum(amount), 0) into paid_total
  from public.repayments
  where loan_id = p_loan_id;

  if paid_total + p_amount > target_loan.amount then
    raise exception 'Repayment exceeds remaining amount' using errcode = '22003';
  end if;

  insert into public.repayments (loan_id, amount, date, note)
  values (p_loan_id, p_amount, p_date, nullif(btrim(p_note), ''))
  returning * into inserted_repayment;

  update public.loans
  set
    is_repaid = (paid_total + p_amount = target_loan.amount),
    repaid_at = case
      when paid_total + p_amount = target_loan.amount then p_date
      else null
    end
  where id = p_loan_id;

  return inserted_repayment;
end;
$$;

create or replace function public.cancel_repayment(p_repayment_id bigint)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_loan_id bigint;
  target_loan public.loans;
  paid_total bigint;
  latest_paid_date date;
begin
  if not public.is_app_member() then
    raise exception 'Not an app member' using errcode = '42501';
  end if;

  select loan_id into target_loan_id
  from public.repayments
  where id = p_repayment_id;

  if not found then
    raise exception 'Repayment not found' using errcode = 'P0002';
  end if;

  select * into target_loan
  from public.loans
  where id = target_loan_id
  for update;

  delete from public.repayments where id = p_repayment_id;

  select coalesce(sum(amount), 0), max(date)
  into paid_total, latest_paid_date
  from public.repayments
  where loan_id = target_loan_id;

  update public.loans
  set
    is_repaid = (paid_total = target_loan.amount),
    repaid_at = case when paid_total = target_loan.amount then latest_paid_date else null end
  where id = target_loan_id;
end;
$$;

revoke all on function public.record_repayment(bigint, bigint, date, text) from public;
revoke all on function public.cancel_repayment(bigint) from public;
grant execute on function public.record_repayment(bigint, bigint, date, text) to authenticated;
grant execute on function public.cancel_repayment(bigint) to authenticated;

-- This alters the publication membership, not objects inside the now-locked
-- realtime schema.
do $$
declare
  table_name text;
begin
  foreach table_name in array array['loans', 'repayments', 'shopping_items']
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
