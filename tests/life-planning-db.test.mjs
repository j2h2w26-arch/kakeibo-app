import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const member = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const outsider = '33333333-3333-4333-8333-333333333333'
const migration = (name) => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')

test('人生設計の移行・権限・整合性を隔離Postgresで検証する', async (t) => {
  const db = new PGlite()
  t.after(() => db.close())
  // Emulate Supabase JWT identity. The member table/function below are read
  // verbatim from the existing migration, not replaced by an always-true mock.
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth, public to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    create publication supabase_realtime;
    insert into auth.users values ('${member}'), ('${other}'), ('${outsider}');`)
  const foundation = await migration('20260817000000_prepare_secure_household.sql')
  const membership = foundation.slice(foundation.indexOf('create table if not exists public.app_members'), foundation.indexOf('-- NOT VALID'))
  await db.exec(membership)
  await db.exec(`insert into public.app_members(user_id,display_name) values ('${member}','検証用1'),('${other}','検証用2');
    create table public.life_tasks(id bigint primary key, title text not null);
    insert into public.life_tasks values (10,'共通のToDo');
    grant select on public.life_tasks to authenticated;`)
  await db.exec(await migration('20260919103401_add_life_planning.sql'))
  async function as(role, uid = '') {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid])
    await db.exec(`set role ${role}`)
  }
  await as('authenticated', member)
  await db.exec(`insert into public.life_goals(title,target_date) values ('既存の目標','2028-02-29'),('別の目標',null);
    insert into public.life_goal_task_links(goal_id,task_id) values (1,10),(2,10);`)
  await as('postgres')
  await db.exec(await migration('20260919111641_expand_life_planning_workspace.sql'))

  await t.test('既存目標・日付・共通ToDoを移行で失わない', async () => {
    assert.equal((await db.query('select target_date::text from public.life_goals where id=1')).rows[0].target_date, '2028-02-29')
    assert.equal((await db.query('select * from public.life_goal_task_links')).rows.length, 2)
  })
  await as('authenticated', member)
  await t.test('メンバーはフェーズと関連を作成・閲覧・編集できる', async () => {
    await db.exec("insert into public.life_goal_phases(goal_id,title) values (1,'調査'),(2,'準備'); insert into public.life_goal_relations(source_goal_id,target_goal_id,kind) values (1,2,'支える');")
    assert.equal((await db.query("update public.life_goal_phases set title='調査完了', status='完了',target_date='2046-09-01' where id=1 returning title")).rows[0].title, '調査完了')
    assert.equal((await db.query('select * from public.life_goal_relations')).rows.length, 1)
    await db.exec("insert into public.life_goal_milestones(goal_id,title,phase_id) values (1,'節目',1); update public.life_goal_task_links set phase_id=1 where goal_id=1 and task_id=10;")
    assert.equal((await db.query('select phase_id from public.life_goal_task_links where goal_id=1')).rows[0].phase_id, 1)
  })
  await t.test('別の目標のフェーズ、自己参照、重複関係を拒否', async () => {
    for (const sql of [
      'update public.life_goal_milestones set phase_id=2 where goal_id=1',
      'update public.life_goal_task_links set phase_id=2 where goal_id=1',
      "insert into public.life_goal_relations(source_goal_id,target_goal_id,kind) values (1,1,'関連')",
      "insert into public.life_goal_relations(source_goal_id,target_goal_id,kind) values (1,2,'関連')",
    ]) await assert.rejects(db.exec(sql), (error) => ['23503', '23505', '23514'].includes(error.code))
  })
  await t.test('メンバーも所有者の偽装・フェーズの物理削除はできない', async () => {
    await assert.rejects(db.exec(`insert into public.life_goal_phases(goal_id,title,created_by) values (1,'偽装','${other}')`), { code: '42501' })
    await assert.rejects(db.exec(`update public.life_goal_phases set created_by='${other}' where id=1`), { code: '42501' })
    await assert.rejects(db.exec('delete from public.life_goal_phases where id=1'), { code: '42501' })
  })
  await t.test('アーカイブしてもデータが残り、再読込・復元できる', async () => {
    await db.exec('update public.life_goals set is_archived=true where id=1')
    assert.equal((await db.query('select is_archived from public.life_goals where id=1')).rows[0].is_archived, true)
    await db.exec('update public.life_goals set is_archived=false where id=1')
    assert.equal((await db.query('select count(*)::int as count from public.life_goal_milestones where goal_id=1')).rows[0].count, 1)
  })
  await as('authenticated', outsider)
  await t.test('既存データがある状態でも非メンバーは閲覧・更新・削除できない', async () => {
    for (const table of ['life_goals', 'life_goal_phases', 'life_goal_relations', 'life_goal_task_links']) assert.equal((await db.query(`select * from public.${table}`)).rows.length, 0)
    assert.equal((await db.query("update public.life_goal_phases set title='不正' where id=1 returning id")).rows.length, 0)
    assert.equal((await db.query('delete from public.life_goal_relations returning source_goal_id')).rows.length, 0)
    for (const sql of ["insert into public.life_goal_phases(goal_id,title) values (1,'不正')", "insert into public.life_goal_relations(source_goal_id,target_goal_id,kind) values (2,1,'前提')"]) await assert.rejects(db.exec(sql), { code: '42501' })
  })
  await as('anon')
  await t.test('未ログインでは新テーブルへの全操作を拒否', async () => {
    for (const sql of [
      'select * from public.life_goal_phases', 'select * from public.life_goal_relations',
      "insert into public.life_goal_phases(goal_id,title) values (1,'不正')",
      "insert into public.life_goal_relations(source_goal_id,target_goal_id,kind) values (2,1,'関連')",
      "update public.life_goal_phases set title='不正'", "update public.life_goal_relations set kind='関連'",
      'delete from public.life_goal_phases', 'delete from public.life_goal_relations',
    ]) await assert.rejects(db.exec(sql), { code: '42501' })
  })
  await as('authenticated', other)
  await t.test('もう一人の家族も共同編集・関係解除できる', async () => {
    assert.equal((await db.query("update public.life_goal_phases set note='共同編集' where id=1 returning id")).rows.length, 1)
    assert.equal((await db.query('delete from public.life_goal_relations where source_goal_id=1 and target_goal_id=2 returning source_goal_id')).rows.length, 1)
  })
})
