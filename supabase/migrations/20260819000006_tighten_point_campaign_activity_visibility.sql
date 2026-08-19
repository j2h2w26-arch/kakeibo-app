begin;

drop policy "Household members read point activities" on public.point_activities;

create policy "Members read permitted point activities"
  on public.point_activities for select to authenticated
  using (
    (select public.is_app_member())
    and (origin = 'manual' or assigned_to = (select auth.uid()))
  );

commit;
