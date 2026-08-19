begin;

create policy "Clients cannot read point sync config"
  on public.point_sync_config for select to authenticated
  using (false);

commit;
