begin;

create table public.recipes (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  title text not null,
  source_url text,
  source_kind text not null default 'manual',
  source_title text,
  servings text,
  note text,
  is_archived boolean not null default false,
  created_by uuid not null default auth.uid()
    references public.app_members(user_id) on delete restrict,
  constraint recipes_title_check check (char_length(btrim(title)) between 1 and 160),
  constraint recipes_source_url_check check (
    source_url is null
    or (char_length(source_url) <= 2048 and source_url ~ '^https?://')
  ),
  constraint recipes_source_kind_check check (source_kind in ('manual', 'web', 'youtube', 'instagram')),
  constraint recipes_source_title_check check (source_title is null or char_length(source_title) <= 300),
  constraint recipes_servings_check check (servings is null or char_length(servings) <= 80),
  constraint recipes_note_check check (note is null or char_length(note) <= 2000)
);

create table public.recipe_ingredients (
  id bigint generated always as identity primary key,
  recipe_id bigint not null references public.recipes(id) on delete cascade,
  position integer not null,
  name text not null,
  quantity_text text,
  inventory_item_id bigint references public.inventory_items(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint recipe_ingredients_position_check check (position between 0 and 199),
  constraint recipe_ingredients_name_check check (char_length(btrim(name)) between 1 and 200),
  constraint recipe_ingredients_quantity_check check (quantity_text is null or char_length(quantity_text) <= 100),
  constraint recipe_ingredients_recipe_position_key unique (recipe_id, position)
);

create table public.recipe_steps (
  id bigint generated always as identity primary key,
  recipe_id bigint not null references public.recipes(id) on delete cascade,
  position integer not null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint recipe_steps_position_check check (position between 0 and 99),
  constraint recipe_steps_body_check check (char_length(btrim(body)) between 1 and 2000),
  constraint recipe_steps_recipe_position_key unique (recipe_id, position)
);

create index recipes_updated_idx on public.recipes (is_archived, updated_at desc, id desc);
create index recipes_created_by_idx on public.recipes (created_by);
create index recipe_ingredients_recipe_idx on public.recipe_ingredients (recipe_id, position);
create index recipe_ingredients_inventory_idx on public.recipe_ingredients (inventory_item_id)
  where inventory_item_id is not null;
create index recipe_steps_recipe_idx on public.recipe_steps (recipe_id, position);

revoke all on table public.recipes, public.recipe_ingredients, public.recipe_steps
from public, anon, authenticated;

grant select, insert, delete on table public.recipes to authenticated;
grant update (
  updated_at, title, source_url, source_kind, source_title,
  servings, note, is_archived
) on table public.recipes to authenticated;
grant select, insert, update, delete on table public.recipe_ingredients, public.recipe_steps to authenticated;
grant usage, select on sequence
  public.recipes_id_seq,
  public.recipe_ingredients_id_seq,
  public.recipe_steps_id_seq
to authenticated;

alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_steps enable row level security;

create policy "Household members read recipes"
  on public.recipes for select to authenticated
  using ((select public.is_app_member()));
create policy "Household members create recipes"
  on public.recipes for insert to authenticated
  with check ((select public.is_app_member()) and created_by = (select auth.uid()));
create policy "Household members update recipes"
  on public.recipes for update to authenticated
  using ((select public.is_app_member()))
  with check ((select public.is_app_member()));
create policy "Household members delete recipes"
  on public.recipes for delete to authenticated
  using ((select public.is_app_member()));

create policy "Household members read recipe ingredients"
  on public.recipe_ingredients for select to authenticated
  using ((select public.is_app_member()));
create policy "Household members create recipe ingredients"
  on public.recipe_ingredients for insert to authenticated
  with check (
    (select public.is_app_member())
    and exists (select 1 from public.recipes where id = recipe_id)
  );
create policy "Household members update recipe ingredients"
  on public.recipe_ingredients for update to authenticated
  using ((select public.is_app_member()))
  with check (
    (select public.is_app_member())
    and exists (select 1 from public.recipes where id = recipe_id)
  );
create policy "Household members delete recipe ingredients"
  on public.recipe_ingredients for delete to authenticated
  using ((select public.is_app_member()));

create policy "Household members read recipe steps"
  on public.recipe_steps for select to authenticated
  using ((select public.is_app_member()));
create policy "Household members create recipe steps"
  on public.recipe_steps for insert to authenticated
  with check (
    (select public.is_app_member())
    and exists (select 1 from public.recipes where id = recipe_id)
  );
create policy "Household members update recipe steps"
  on public.recipe_steps for update to authenticated
  using ((select public.is_app_member()))
  with check (
    (select public.is_app_member())
    and exists (select 1 from public.recipes where id = recipe_id)
  );
create policy "Household members delete recipe steps"
  on public.recipe_steps for delete to authenticated
  using ((select public.is_app_member()));

create or replace function public.save_recipe(
  p_recipe_id bigint,
  p_title text,
  p_source_url text,
  p_source_kind text,
  p_source_title text,
  p_servings text,
  p_note text,
  p_ingredients jsonb,
  p_steps jsonb
)
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  saved_id bigint;
  ingredient jsonb;
  step_item jsonb;
  item_position integer := 0;
begin
  if not public.is_app_member() then
    raise exception 'Not an app member' using errcode = '42501';
  end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 160 then
    raise exception 'Recipe title is required' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_ingredients, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_ingredients, '[]'::jsonb)) > 200 then
    raise exception 'Invalid recipe ingredients' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_steps, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_steps, '[]'::jsonb)) > 100 then
    raise exception 'Invalid recipe steps' using errcode = '22023';
  end if;

  if p_recipe_id is null then
    insert into public.recipes (
      title, source_url, source_kind, source_title, servings, note, created_by
    ) values (
      btrim(p_title), nullif(btrim(p_source_url), ''), coalesce(nullif(p_source_kind, ''), 'manual'),
      nullif(btrim(p_source_title), ''), nullif(btrim(p_servings), ''), nullif(btrim(p_note), ''), auth.uid()
    ) returning id into saved_id;
  else
    update public.recipes set
      title = btrim(p_title),
      source_url = nullif(btrim(p_source_url), ''),
      source_kind = coalesce(nullif(p_source_kind, ''), 'manual'),
      source_title = nullif(btrim(p_source_title), ''),
      servings = nullif(btrim(p_servings), ''),
      note = nullif(btrim(p_note), ''),
      updated_at = now()
    where id = p_recipe_id
    returning id into saved_id;
    if saved_id is null then raise exception 'Recipe not found' using errcode = 'P0002'; end if;
    delete from public.recipe_ingredients where recipe_id = saved_id;
    delete from public.recipe_steps where recipe_id = saved_id;
  end if;

  for ingredient in select value from jsonb_array_elements(coalesce(p_ingredients, '[]'::jsonb)) loop
    if char_length(btrim(ingredient->>'name')) not between 1 and 200 then
      raise exception 'Ingredient name is required' using errcode = '22023';
    end if;
    insert into public.recipe_ingredients (recipe_id, position, name, quantity_text, inventory_item_id)
    values (
      saved_id,
      item_position,
      btrim(ingredient->>'name'),
      nullif(btrim(ingredient->>'quantity_text'), ''),
      nullif(ingredient->>'inventory_item_id', '')::bigint
    );
    item_position := item_position + 1;
  end loop;

  item_position := 0;
  for step_item in select value from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb)) loop
    if char_length(btrim(step_item->>'body')) not between 1 and 2000 then
      raise exception 'Recipe step is required' using errcode = '22023';
    end if;
    insert into public.recipe_steps (recipe_id, position, body)
    values (saved_id, item_position, btrim(step_item->>'body'));
    item_position := item_position + 1;
  end loop;

  return saved_id;
end;
$$;

revoke all on function public.save_recipe(bigint, text, text, text, text, text, text, jsonb, jsonb)
from public, anon;
grant execute on function public.save_recipe(bigint, text, text, text, text, text, text, jsonb, jsonb)
to authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array['recipes', 'recipe_ingredients', 'recipe_steps'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;

commit;
