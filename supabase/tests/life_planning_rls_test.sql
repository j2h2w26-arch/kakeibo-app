begin;

select plan(27);

select tests.create_supabase_user('life_plan_member');
select tests.create_supabase_user('life_plan_outsider');

insert into public.app_members (user_id, display_name)
values (tests.get_supabase_uid('life_plan_member'), '人生設計テスト');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.life_goals'::regclass),
  'RLS is enabled on life_goals'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.life_goal_routes'::regclass),
  'RLS is enabled on life_goal_routes'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.life_goal_milestones'::regclass),
  'RLS is enabled on life_goal_milestones'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.life_goal_task_links'::regclass),
  'RLS is enabled on life_goal_task_links'
);

select tests.authenticate_as('life_plan_member');

select lives_ok(
  $$insert into public.life_goals (title, category, owner) values ('海外で暮らす', '旅行・移住', 'ふたり')$$,
  'a household member can create a goal'
);
select lives_ok(
  $$
    insert into public.life_goal_routes (goal_id, title, status)
    values ((select id from public.life_goals where title = '海外で暮らす'), '現地就職', '検討中')
  $$,
  'a household member can create a route'
);
select lives_ok(
  $$
    insert into public.life_goal_milestones (goal_id, route_id, title)
    values (
      (select id from public.life_goals where title = '海外で暮らす'),
      (select id from public.life_goal_routes where title = '現地就職'),
      '必要条件を調べる'
    )
  $$,
  'a household member can create a milestone'
);
select lives_ok(
  $$insert into public.life_tasks (title, task_type, created_by) values ('英語を学ぶ', 'todo', auth.uid())$$,
  'a household member can create a related task'
);
select lives_ok(
  $$
    insert into public.life_goal_task_links (goal_id, task_id)
    values (
      (select id from public.life_goals where title = '海外で暮らす'),
      (select id from public.life_tasks where title = '英語を学ぶ')
    )
  $$,
  'a household member can link an existing task'
);
select lives_ok(
  $$update public.life_goals set status = '進行中' where title = '海外で暮らす'$$,
  'a household member can update a goal'
);
select lives_ok(
  $$update public.life_goal_routes set status = '本命' where title = '現地就職'$$,
  'a household member can update a route'
);
select lives_ok(
  $$
    update public.life_goal_milestones
    set status = '完了', completed_at = now()
    where title = '必要条件を調べる'
  $$,
  'a household member can complete a milestone'
);
select is(
  (select count(*) from public.life_goal_task_links),
  1::bigint,
  'the member can read linked tasks'
);

select tests.authenticate_as('life_plan_outsider');

select is((select count(*) from public.life_goals), 0::bigint, 'a non-member cannot read goals');
select is((select count(*) from public.life_goal_routes), 0::bigint, 'a non-member cannot read routes');
select is((select count(*) from public.life_goal_milestones), 0::bigint, 'a non-member cannot read milestones');
select is((select count(*) from public.life_goal_task_links), 0::bigint, 'a non-member cannot read task links');
select throws_ok(
  $$insert into public.life_goals (title) values ('blocked goal')$$,
  '42501',
  'a non-member cannot create a goal'
);
select results_eq(
  $$update public.life_goals set status = '保留' returning id$$,
  $$values (null::bigint) limit 0$$,
  'a non-member cannot update goals'
);
select throws_ok($$delete from public.life_goals$$, '42501', 'goals cannot be deleted through the client API');
select throws_ok($$delete from public.life_goal_routes$$, '42501', 'routes cannot be deleted through the client API');
select throws_ok($$delete from public.life_goal_milestones$$, '42501', 'milestones cannot be deleted through the client API');

select tests.authenticate_as('life_plan_member');
select lives_ok(
  $$delete from public.life_goal_task_links where task_id = (select id from public.life_tasks where title = '英語を学ぶ')$$,
  'a household member can unlink a task'
);

select tests.clear_authentication();

select throws_ok($$select count(*) from public.life_goals$$, '42501', 'anon has no goal table grant');
select throws_ok($$select count(*) from public.life_goal_routes$$, '42501', 'anon has no route table grant');
select throws_ok($$select count(*) from public.life_goal_milestones$$, '42501', 'anon has no milestone table grant');
select throws_ok($$select count(*) from public.life_goal_task_links$$, '42501', 'anon has no task link table grant');

select * from finish();
rollback;
