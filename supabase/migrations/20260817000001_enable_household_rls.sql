begin;

-- Phase 2 is the production cutover. Apply only after both Auth users and both
-- app_members rows exist and the authenticated frontend has passed Preview QA.
-- Validation happens first. If legacy data is invalid, the transaction aborts
-- before anonymous access is revoked.
alter table public.loans validate constraint loans_amount_positive;
alter table public.loans validate constraint loans_date_required;
alter table public.loans validate constraint loans_people_check;
alter table public.loans validate constraint loans_description_check;
alter table public.loans validate constraint loans_repaid_required;

alter table public.repayments validate constraint repayments_amount_positive;
alter table public.repayments validate constraint repayments_date_required;
alter table public.repayments validate constraint repayments_note_check;

alter table public.shopping_items validate constraint shopping_items_name_check;
alter table public.shopping_items validate constraint shopping_items_category_check;
alter table public.shopping_items validate constraint shopping_items_purchased_required;

revoke all on table public.loans, public.repayments, public.shopping_items from anon;

alter table public.loans enable row level security;
alter table public.repayments enable row level security;
alter table public.shopping_items enable row level security;

drop policy if exists "Household members manage loans" on public.loans;
create policy "Household members manage loans"
  on public.loans
  for all
  to authenticated
  using ((select public.is_app_member()))
  with check ((select public.is_app_member()));

drop policy if exists "Household members manage repayments" on public.repayments;
create policy "Household members manage repayments"
  on public.repayments
  for all
  to authenticated
  using ((select public.is_app_member()))
  with check ((select public.is_app_member()));

drop policy if exists "Household members manage shopping" on public.shopping_items;
create policy "Household members manage shopping"
  on public.shopping_items
  for all
  to authenticated
  using ((select public.is_app_member()))
  with check ((select public.is_app_member()));

commit;
