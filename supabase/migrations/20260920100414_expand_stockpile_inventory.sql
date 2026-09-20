begin;

alter table public.inventory_items
  drop constraint inventory_items_category_check;

update public.inventory_items
set category = '食品'
where category = '食材';

alter table public.inventory_items
  add column min_quantity numeric(8, 2),
  add constraint inventory_items_category_check
    check (category in ('食品', '調味料', '日用品', '掃除用品', '防災品', 'その他')),
  add constraint inventory_items_min_quantity_check
    check (min_quantity is null or min_quantity between 0 and 999999.99),
  add constraint inventory_items_min_requires_quantity_check
    check (min_quantity is null or quantity is not null);

create index inventory_items_threshold_idx
  on public.inventory_items (category, min_quantity, quantity)
  where min_quantity is not null;

commit;
