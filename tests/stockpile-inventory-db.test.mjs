import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const member = '11111111-1111-4111-8111-111111111111'
const outsider = '33333333-3333-4333-8333-333333333333'
const migration = (name) => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')

test('備蓄在庫の移行・権限・既存データ保持を隔離Postgresで検証する', async (t) => {
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
    insert into auth.users values ('${member}'), ('${outsider}');`)
  const foundation = await migration('20260817000000_prepare_secure_household.sql')
  const membership = foundation.slice(
    foundation.indexOf('create table if not exists public.app_members'),
    foundation.indexOf('-- NOT VALID'),
  )
  await db.exec(membership)
  await db.exec(`insert into public.app_members(user_id,display_name) values ('${member}','検証用');`)
  await db.exec(await migration('20260819000008_add_shared_inventory.sql'))

  async function as(role, uid = '') {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid])
    await db.exec(`set role ${role}`)
  }

  await as('authenticated', member)
  await db.exec("insert into public.inventory_items(name,category,status,quantity,unit) values ('既存の米','食材','enough',1,'袋')")
  await as('postgres')
  await db.exec(await migration('20260920100414_expand_stockpile_inventory.sql'))

  await t.test('既存在庫を失わず食材を食品へ移行する', async () => {
    const item = (await db.query("select name,category,quantity::float8,min_quantity from public.inventory_items where name='既存の米'")).rows[0]
    assert.deepEqual(item, { name: '既存の米', category: '食品', quantity: 1, min_quantity: null })
  })

  await as('authenticated', member)
  await t.test('家族は全備蓄カテゴリと最低在庫数を保存できる', async () => {
    for (const category of ['食品', '調味料', '日用品', '掃除用品', '防災品', 'その他']) {
      await db.query('insert into public.inventory_items(name,category,status,quantity,min_quantity,unit) values ($1,$2,$3,$4,$5,$6)', [`検証${category}`, category, 'low', 1, 2, '個'])
    }
    assert.equal((await db.query('select * from public.inventory_items')).rows.length, 7)
    assert.equal((await db.query("update public.inventory_items set quantity=2,status='enough',updated_by=auth.uid() where name='検証防災品' returning id")).rows.length, 1)
  })

  await t.test('最低在庫数だけの不完全な登録を拒否する', async () => {
    await assert.rejects(
      db.exec("insert into public.inventory_items(name,category,status,min_quantity) values ('不完全','食品','low',2)"),
      { code: '23514' },
    )
  })

  await as('authenticated', outsider)
  await t.test('非メンバーは既存在庫があっても閲覧・変更できない', async () => {
    assert.equal((await db.query('select * from public.inventory_items')).rows.length, 0)
    assert.equal((await db.query("update public.inventory_items set note='不正' returning id")).rows.length, 0)
    await assert.rejects(db.exec("insert into public.inventory_items(name,category,status) values ('不正','食品','low')"), { code: '42501' })
  })

  await as('anon')
  await t.test('未ログインでは備蓄在庫を操作できない', async () => {
    for (const sql of [
      'select * from public.inventory_items',
      "insert into public.inventory_items(name,category,status) values ('不正','食品','low')",
      "update public.inventory_items set note='不正'",
      'delete from public.inventory_items',
    ]) await assert.rejects(db.exec(sql), { code: '42501' })
  })
})
