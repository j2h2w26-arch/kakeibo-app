import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const member = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const outsider = '33333333-3333-4333-8333-333333333333'
const migration = (name) => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')

test('レシピの一括保存・在庫連携・RLSを隔離Postgresで検証する', async (t) => {
  const db = new PGlite()
  t.after(() => db.close())
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
  await db.exec(`insert into public.app_members(user_id,display_name) values ('${member}','検証1'),('${other}','検証2');
    create table public.inventory_items(id bigint generated always as identity primary key, name text not null);
    insert into public.inventory_items(name) values ('塩');
    grant select on public.inventory_items to authenticated;`)
  await db.exec(await migration('20260921090000_add_recipe_library.sql'))

  async function as(role, uid = '') {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid])
    await db.exec(`set role ${role}`)
  }

  await as('authenticated', member)
  await t.test('家族はレシピ・材料・手順を一括保存し更新できる', async () => {
    const saved = await db.query(`select public.save_recipe(
      null, '塩むすび', 'https://example.com/recipe', 'web', '元ページ', '2人分', null,
      '[{"name":"米","quantity_text":"1合"},{"name":"塩","quantity_text":"少々","inventory_item_id":1}]'::jsonb,
      '[{"body":"炊く"},{"body":"握る"}]'::jsonb
    ) as id`)
    assert.equal(saved.rows[0].id, 1)
    assert.equal((await db.query('select * from public.recipe_ingredients where recipe_id=1')).rows.length, 2)
    assert.equal((await db.query('select * from public.recipe_steps where recipe_id=1')).rows.length, 2)
    await db.query(`select public.save_recipe(
      1, '塩むすび改', 'https://example.com/recipe', 'web', null, '2個', '熱いうちに',
      '[{"name":"米","quantity_text":"1合"}]'::jsonb,
      '[{"body":"炊いて握る"}]'::jsonb
    )`)
    assert.equal((await db.query('select title from public.recipes where id=1')).rows[0].title, '塩むすび改')
    assert.equal((await db.query('select * from public.recipe_ingredients where recipe_id=1')).rows.length, 1)
  })

  await t.test('入力上限と作成者偽装を拒否する', async () => {
    await assert.rejects(db.exec(`insert into public.recipes(title,created_by) values ('偽装','${other}')`), { code: '42501' })
    await assert.rejects(db.query(`select public.save_recipe(null,'','', 'manual',null,null,null,'[]','[]')`), { code: '22023' })
  })

  await as('authenticated', other)
  await t.test('もう一人の家族も共同編集できるが作成者は変更できない', async () => {
    assert.equal((await db.query("update public.recipes set note='共同編集' where id=1 returning id")).rows.length, 1)
    await assert.rejects(db.exec(`update public.recipes set created_by='${other}' where id=1`), { code: '42501' })
  })

  await as('authenticated', outsider)
  await t.test('非メンバーは閲覧・作成・更新できない', async () => {
    for (const table of ['recipes', 'recipe_ingredients', 'recipe_steps']) assert.equal((await db.query(`select * from public.${table}`)).rows.length, 0)
    await assert.rejects(db.exec("insert into public.recipes(title) values ('不正')"), { code: '42501' })
    assert.equal((await db.query("update public.recipes set title='不正' returning id")).rows.length, 0)
  })

  await as('anon')
  await t.test('未ログインでは全テーブルを操作できない', async () => {
    for (const sql of ['select * from public.recipes', 'select * from public.recipe_ingredients', "insert into public.recipes(title) values ('不正')", 'delete from public.recipes']) {
      await assert.rejects(db.exec(sql), { code: '42501' })
    }
  })
})
