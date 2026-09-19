begin;

select plan(11);

select tests.create_supabase_user('chore_member');
select tests.create_supabase_user('chore_outsider');

insert into public.app_members (user_id, display_name)
values (tests.get_supabase_uid('chore_member'), '家事テスト');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.household_chores'::regclass),
  'RLS is enabled on household_chores'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.household_chore_completions'::regclass),
  'RLS is enabled on household_chore_completions'
);

select tests.authenticate_as('chore_member');

select lives_ok(
  $$
    insert into public.household_chores (
      title, category, assigned_to, schedule_type,
      interval_value, interval_unit, next_due_on
    ) values (
      'RLS test chore', 'その他', 'ふたり', 'interval',
      1, 'weeks', current_date
    )
  $$,
  'a household member can create a chore'
);

select lives_ok(
  $$update public.household_chores set note = 'member update' where title = 'RLS test chore'$$,
  'a household member can update a chore'
);

select lives_ok(
  $$
    select public.complete_household_chore(
      (select id from public.household_chores where title = 'RLS test chore'),
      current_date,
      null
    )
  $$,
  'a household member can complete a chore atomically'
);

select is(
  (select count(*) from public.household_chore_completions where completed_by = auth.uid()),
  1::bigint,
  'the member can read the completion history'
);

select tests.authenticate_as('chore_outsider');

select is(
  (select count(*) from public.household_chores),
  0::bigint,
  'a non-member cannot read chores'
);

select throws_ok(
  $$
    insert into public.household_chores (
      title, category, assigned_to, schedule_type,
      interval_value, interval_unit, next_due_on
    ) values (
      'blocked chore', 'その他', 'ふたり', 'interval',
      1, 'weeks', current_date
    )
  $$,
  '42501',
  'a non-member cannot create a chore'
);

select results_eq(
  $$update public.household_chores set note = 'blocked' returning id$$,
  $$values (null::bigint) limit 0$$,
  'a non-member cannot update chores'
);

select throws_ok(
  $$delete from public.household_chores$$,
  '42501',
  'chores cannot be deleted through the client API'
);

select tests.clear_authentication();

select throws_ok(
  $$select count(*) from public.household_chores$$,
  '42501',
  'anon has no table grant'
);

select * from finish();
rollback;
