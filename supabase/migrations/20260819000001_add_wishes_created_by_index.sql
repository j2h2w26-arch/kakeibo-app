begin;

create index wishes_created_by_idx on public.wishes (created_by);

commit;
