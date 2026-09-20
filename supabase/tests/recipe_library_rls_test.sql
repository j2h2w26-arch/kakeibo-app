begin;

select plan(10);
select tests.create_supabase_user('recipe_member');
select tests.create_supabase_user('recipe_outsider');
insert into public.app_members(user_id, display_name)
values (tests.get_supabase_uid('recipe_member'), 'レシピテスト');

select ok((select relrowsecurity from pg_class where oid = 'public.recipes'::regclass), 'recipes RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.recipe_ingredients'::regclass), 'ingredients RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.recipe_steps'::regclass), 'steps RLS enabled');

select tests.authenticate_as('recipe_member');
select lives_ok(
  $$select public.save_recipe(null, 'テスト料理', null, 'manual', null, '2人分', null,
    '[{"name":"塩","quantity_text":"少々"}]'::jsonb,
    '[{"body":"混ぜる"}]'::jsonb)$$,
  'member saves a complete recipe'
);
select is((select count(*) from public.recipes), 1::bigint, 'member reads recipe');
select is((select count(*) from public.recipe_ingredients), 1::bigint, 'member reads ingredient');

select tests.authenticate_as('recipe_outsider');
select is((select count(*) from public.recipes), 0::bigint, 'outsider reads no recipes');
select throws_ok($$insert into public.recipes(title) values ('blocked')$$, '42501', 'outsider cannot insert');
select results_eq($$update public.recipes set title='blocked' returning id$$, $$values(null::bigint) limit 0$$, 'outsider cannot update');

select tests.clear_authentication();
select throws_ok($$select * from public.recipes$$, '42501', 'anon has no recipe grant');

select * from finish();
rollback;
