import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const husband = '11111111-1111-4111-8111-111111111111'
const wife = '22222222-2222-4222-8222-222222222222'
const outsider = '33333333-3333-4333-8333-333333333333'

test('全機能の共有・個人設定・拒否を隔離DBの2人で検証（実ログインやRealtimeではない）', async (t) => {
  const db = new PGlite()
  t.after(() => db.close())
  // The original three tables predate migrations. Storage is a SQL-only stub:
  // signed URLs, object bytes and Auth token verification are not simulated.
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth, public to authenticated, anon;
    create publication supabase_realtime;
    insert into auth.users values ('${husband}'), ('${wife}'), ('${outsider}');
    create table public.loans(id bigint generated always as identity primary key,
      created_at timestamptz default now(),date date,amount bigint,lender text,borrower text,
      description text,is_repaid boolean default false,repaid_at date);
    create table public.repayments(id bigint generated always as identity primary key,
      created_at timestamptz default now(),loan_id bigint references loans(id) on delete cascade,
      amount bigint,date date,note text);
    create table public.shopping_items(id bigint generated always as identity primary key,
      created_at timestamptz default now(),name text,category text,is_purchased boolean default false,purchased_at timestamptz);
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1, '/'); $$;
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated,anon;
    grant select,insert,delete on storage.objects to authenticated,anon;
  `)
  const directory = new URL('../supabase/migrations/', import.meta.url)
  for (const name of (await readdir(directory)).filter((n) => n.endsWith('.sql')).sort()) {
    // Do not provision pg_cron/pg_net/vault or make external calls in tests.
    if (name === '20260819000004_schedule_point_campaign_sync.sql') continue
    await db.exec(await readFile(new URL(name, directory), 'utf8'))
    if (name === '20260817000000_prepare_secure_household.sql') {
      await db.exec(`insert into app_members(user_id,display_name) values ('${husband}','検証夫'),('${wife}','検証妻')`)
    }
  }
  async function as(role, uid = '') {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid])
    await db.exec(`set role ${role}`)
  }
  const row = async (sql, args = []) => (await db.query(sql, args)).rows[0]
  const denied = (sql, args = []) => assert.rejects(db.query(sql, args), { code: '42501' })
  const tables = (await db.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows.map((r) => r.tablename)

  await t.test('31公開テーブルのRLSが有効、画像バケットは非公開', async () => {
    assert.equal(tables.length, 31)
    assert.equal((await db.query("select tablename from pg_tables where schemaname='public' and not rowsecurity")).rows.length, 0)
    assert.equal((await row("select public from storage.buckets where id='receipts'")).public, false)
  })

  await t.test('夫婦双方で作成・相互閲覧・編集・削除、人生目標はアーカイブと復元', async () => {
    const cases = [
      ['shopping_items', 'name', "insert into shopping_items(name,category) values ('検証','食材') returning id"],
      ['inventory_items', 'name', "insert into inventory_items(name,category,status,quantity,unit) values ('検証','食品','enough',2,'個') returning id"],
      ['wishes', 'title', "insert into wishes(title) values ('検証') returning id"],
      ['life_tasks', 'title', "insert into life_tasks(title) values ('検証') returning id"],
      ['life_goals', 'title', "insert into life_goals(title) values ('検証') returning id"],
      ['point_activities', 'title', "insert into point_activities(title,official_url) values ('検証','https://example.com') returning id"],
    ]
    for (const [creator, partner] of [[husband, wife], [wife, husband]]) {
      for (const [table, field, insert] of cases) {
        await as('authenticated', creator)
        const { id } = await row(insert)
        await as('authenticated', partner)
        assert.equal((await row(`select ${field} from ${table} where id=$1`, [id]))[field], '検証', table)
        const extra = table === 'inventory_items' ? ', updated_by=auth.uid()' : ''
        assert.equal((await row(`update ${table} set ${field}='変更' ${extra} where id=$1 returning ${field}`, [id]))[field], '変更', table)
        if (table === 'life_goals') {
          assert.equal((await row('update life_goals set is_archived=true where id=$1 returning is_archived', [id])).is_archived, true)
          assert.equal((await row('update life_goals set is_archived=false where id=$1 returning is_archived', [id])).is_archived, false)
        } else {
          assert.equal((await db.query(`delete from ${table} where id=$1 returning id`, [id])).rows.length, 1, table)
        }
      }
    }
  })

  await t.test('貸借・返済は相互操作、支出・レシートは共有、他人の画像パスへのアップロードは拒否', async () => {
    await as('authenticated', husband)
    const loan = await row("insert into loans(date,amount,lender,borrower,description) values (current_date,1000,'夫','妻','検証') returning id")
    const expense = await row("insert into household_expenses(merchant,amount,paid_by) values ('検証店',100,'夫') returning id")
    await db.query("insert into storage.objects(bucket_id,name) values ('receipts',$1)", [`${husband}/test.jpg`])
    await as('authenticated', wife)
    assert.equal((await row('select amount from household_expenses where id=$1', [expense.id])).amount, 100)
    assert.equal((await db.query('select * from storage.objects')).rows.length, 1)
    await denied("insert into storage.objects(bucket_id,name) values ('receipts',$1)", [`${husband}/forged.jpg`])
    const repayment = await row('select * from record_repayment($1,400,current_date,null)', [loan.id])
    await assert.rejects(db.query('select * from record_repayment($1,700,current_date,null)', [loan.id]), { code: '22003' })
    await as('authenticated', husband)
    await db.query('select cancel_repayment($1)', [repayment.id])
    assert.equal((await db.query('select * from repayments where loan_id=$1', [loan.id])).rows.length, 0)
  })

  await t.test('個人通知・ポイ活設定は分離し、他人の完了・コメントを削除できない', async () => {
    await as('authenticated', husband)
    await db.exec("insert into notification_preferences(morning_enabled) values (true); insert into point_service_preferences(service_key,is_enabled) values ('pointclub',true)")
    const activity = await row("insert into point_activities(title,official_url) values ('検証共有','https://example.com') returning id")
    const completion = await row("insert into point_activity_completions(activity_id,period_key) values ($1,'once') returning id", [activity.id])
    const wish = await row("insert into wishes(title) values ('検証相談') returning id")
    const comment = await row("insert into wish_comments(wish_id,body) values ($1,'夫のコメント') returning id", [wish.id])
    await as('authenticated', wife)
    assert.equal((await db.query('select * from notification_preferences')).rows.length, 0)
    assert.equal((await db.query('select * from point_service_preferences')).rows.length, 0)
    assert.equal((await db.query('update notification_preferences set morning_enabled=false returning user_id')).rows.length, 0)
    await denied('insert into notification_preferences(user_id) values ($1)', [husband])
    await denied("insert into point_activity_completions(activity_id,period_key,user_id) values ($1,'daily:2026-10-01',$2)", [activity.id, husband])
    assert.equal((await db.query('delete from point_activity_completions where id=$1 returning id', [completion.id])).rows.length, 0)
    assert.equal((await db.query('delete from wish_comments where id=$1 returning id', [comment.id])).rows.length, 0)
    await db.exec('insert into notification_preferences(evening_enabled) values (true)')
    assert.equal((await row('select user_id from notification_preferences')).user_id, wife)
  })

  await t.test('家事は妻が完了し夫も履歴を参照、同じ日の二重完了で重複しない', async () => {
    await as('authenticated', husband)
    const chore = await row("insert into household_chores(title,schedule_type,interval_value,interval_unit,next_due_on) values ('検証掃除','interval',1,'weeks',current_date) returning id")
    await as('authenticated', wife)
    await db.query('select complete_household_chore($1,current_date,null)', [chore.id])
    await as('authenticated', husband)
    assert.equal((await row('select completed_by from household_chore_completions where chore_id=$1', [chore.id])).completed_by, wife)
    // RPC may return an idempotent existing completion instead of throwing.
    try { await db.query('select complete_household_chore($1,current_date,null)', [chore.id]) } catch (e) { assert.ok(['23505', '22023'].includes(e.code)) }
    assert.equal((await db.query('select * from household_chore_completions where chore_id=$1', [chore.id])).rows.length, 1)
  })

  await t.test('匿名と非メンバーは全公開テーブル・画像を閲覧できず主要書込みも拒否', async () => {
    for (const [role, uid] of [['anon', ''], ['authenticated', outsider]]) {
      await as(role, uid)
      for (const table of tables) {
        try { assert.equal((await db.query(`select * from public.${table}`)).rows.length, 0, `${role}:${table}`) }
        catch (e) { assert.equal(e.code, '42501', `${role}:${table}: ${e.message}`) }
      }
      assert.equal((await db.query('select * from storage.objects')).rows.length, 0)
      await denied("insert into shopping_items(name,category) values ('不正','食材')")
      await denied("insert into wishes(title) values ('不正')")
      await denied("insert into life_tasks(title) values ('不正')")
      await denied("insert into household_expenses(merchant,amount,paid_by) values ('不正',100,'夫')")
      await denied("insert into storage.objects(bucket_id,name) values ('receipts',$1)", [`${uid}/bad.jpg`])
      await denied('select record_repayment(1,1,current_date,null)')
      await denied('select complete_household_chore(1,current_date,null)')
    }
  })
})
