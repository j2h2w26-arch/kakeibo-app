begin;

create index household_appliances_created_by_idx
  on public.household_appliances (created_by)
  where created_by is not null;

create index household_chores_created_by_idx
  on public.household_chores (created_by)
  where created_by is not null;

create index household_chore_completions_completed_by_idx
  on public.household_chore_completions (completed_by);

commit;
