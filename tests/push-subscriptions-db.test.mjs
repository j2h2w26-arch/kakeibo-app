import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createECDH } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'

const husband = '11111111-1111-4111-8111-111111111111'
const wife = '22222222-2222-4222-8222-222222222222'
const outsider = '33333333-3333-4333-8333-333333333333'
const key = createECDH('prime256v1').generateKeys().toString('base64url')
// Synthetic subscription key, never sent to a real push endpoint.
const auth = Buffer.alloc(16, 1).toString('base64url')
const endpoint = (id) => `https://fcm.googleapis.com/fcm/send/fixture-${id}`

test('Push購読は非公開・本人RPCのみ（隔離DB、外部配信なし）', async (t) => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth,public to anon,authenticated;
    create table public.app_members(user_id uuid primary key);
    insert into public.app_members values ('${husband}'), ('${wife}');
    alter table public.app_members enable row level security;
    grant select on public.app_members to authenticated;
    create policy own_profile on public.app_members for select to authenticated using (user_id=auth.uid());
    create table public.notification_preferences(user_id uuid primary key, morning_enabled boolean);
    insert into public.notification_preferences values ('${husband}',true);
  `)
  await db.exec(await readFile(new URL('../supabase/migrations/20261001223840_add_private_push_subscriptions.sql', import.meta.url), 'utf8'))
  async function as(role, uid = '') {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid])
    await db.exec(`set role ${role}`)
  }
  const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0]
  const list = () => scalar('select public.list_push_subscriptions()')
  const register = (url, overrides = {}) => scalar('select public.register_push_subscription($1,$2,$3,$4,$5)', [
    url, overrides.key ?? key, overrides.auth ?? auth, overrides.name ?? '検証端末',
    Object.hasOwn(overrides, 'consent') ? overrides.consent : true,
  ])
  const remove = (id) => scalar('select public.remove_push_subscription($1)', [id])
  let husbandRecord

  await t.test('移行は既存設定を保持し購読を作らず、RLSと直接アクセス拒否を設定', async () => {
    assert.equal(await scalar('select morning_enabled from public.notification_preferences'), true)
    assert.equal(await scalar('select count(*)::int from push_private.subscriptions'), 0)
    assert.equal(await scalar("select rowsecurity from pg_tables where schemaname='push_private' and tablename='subscriptions'"), true)
    for (const role of ['anon', 'authenticated']) {
      for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
        assert.equal(await scalar('select has_table_privilege($1,$2,$3)', [role, 'push_private.subscriptions', privilege]), false)
      }
    }
    const functions = (await db.query("select n.nspname,p.proname,p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') as anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='push_private' or p.proname in ('register_push_subscription','list_push_subscriptions','remove_push_subscription')")).rows
    assert.equal(functions.length, 6)
    for (const fn of functions) {
      assert.equal(fn.anon, false, fn.proname)
      assert.equal(fn.prosecdef, fn.nspname === 'push_private')
      assert.ok(fn.proconfig.some((value) => value === 'search_path=""'), fn.proname)
    }
  })
  await t.test('本人の同意で登録・更新でき、返却値に配送先や鍵が含まれない', async () => {
    await as('authenticated', husband)
    for (const consent of [false, null]) await assert.rejects(register(endpoint('husband'), { consent }), { code: '22023' })
    husbandRecord = await register(endpoint('husband'))
    assert.deepEqual(Object.keys(husbandRecord).sort(), ['consented_at','created_at','device_name','id','updated_at'])
    const updated = await register(endpoint('husband'), { name: ' 新しい端末名 ' })
    assert.equal(updated.id, husbandRecord.id)
    assert.equal(updated.device_name, '新しい端末名')
    const rows = await list()
    assert.equal(rows.length, 1)
    assert.equal(JSON.stringify(rows).includes(endpoint('husband')), false)
    assert.equal(JSON.stringify(rows).includes(key), false)
    assert.equal(JSON.stringify(rows).includes(auth), false)
  })
  await t.test('配偶者は他人の通知先を閲覧・解除・付け替えできない', async () => {
    await as('authenticated', wife)
    assert.deepEqual(await list(), [])
    await remove(husbandRecord.id)
    await assert.rejects(register(endpoint('husband')), { code: '22023' })
    const own = await register(endpoint('wife'))
    assert.deepEqual((await list()).map((r) => r.id), [own.id])
    for (const sql of [
      'select * from push_private.subscriptions',
      "update push_private.subscriptions set device_name='不正'",
      'delete from push_private.subscriptions',
    ]) await assert.rejects(db.query(sql), { code: '42501' })
    await as('authenticated', husband)
    assert.deepEqual((await list()).map((r) => r.id), [husbandRecord.id])
  })
  await t.test('匿名・非メンバー・空JWTは公開/非公開の関数を直接呼んでも拒否', async () => {
    for (const [role, uid] of [['anon', ''], ['authenticated', outsider], ['authenticated', '']]) {
      await as(role, uid)
      await assert.rejects(list(), { code: '42501' })
      await assert.rejects(register(endpoint('forged')), { code: '42501' })
      await assert.rejects(remove(husbandRecord.id), { code: '42501' })
      await assert.rejects(db.query('select push_private.list_subscriptions()'), { code: '42501' })
      await assert.rejects(db.query('select push_private.register_subscription($1,$2,$3,$4,true)', [endpoint('forged'), key, auth, '偽装']), { code: '42501' })
      await assert.rejects(db.query('select push_private.remove_subscription($1)', [husbandRecord.id]), { code: '42501' })
    }
  })
  await t.test('内部URL・紛らわしいhost・不正鍵・不正端末名を拒否', async () => {
    await as('authenticated', husband)
    for (const url of [null, '', 'https://127.0.0.1/a', 'http://fcm.googleapis.com/fcm/send/a',
      'https://fcm.googleapis.com.evil.test/fcm/send/a', 'https://evil@fcm.googleapis.com/fcm/send/a',
      'https://fcm.googleapis.com:8443/fcm/send/a', 'https://fcm.googleapis.com/fcm/send/a#b',
      'https://fcm.googleapis.com/fcm/send/a\n', 'https://fcm.googleapis.com/fcm/send/../a',
      `https://fcm.googleapis.com/fcm/send/${'a'.repeat(2049)}`]) {
      await assert.rejects(register(url), { code: '22023' })
    }
    for (const options of [{ key: 'bad' }, { auth: 'bad' }, { key: 'A'.repeat(87) },
      { name: '' }, { name: 'a'.repeat(41) }, { name: '\n端末' }]) {
      await assert.rejects(register(endpoint('bad'), options), { code: '22023' })
    }
    assert.equal((await list()).length, 1)
  })
  await t.test('登録は10台まで、既存の更新と本人の解除は上限でも可能', async () => {
    await as('authenticated', husband)
    for (let i = 0; i < 9; i++) await register(endpoint(`extra-${i}`))
    await assert.rejects(register(endpoint('over-quota')), { code: '22023' })
    assert.equal((await list()).length, 10)
    assert.equal((await register(endpoint('husband'))).id, husbandRecord.id)
    assert.equal(await remove(husbandRecord.id), true)
    assert.equal(await remove(husbandRecord.id), true)
    assert.equal((await list()).length, 9)
    await register(endpoint('replacement'))
    await as('postgres')
    assert.equal(await scalar('select count(*)::int from push_private.subscriptions where id=$1', [husbandRecord.id]), 0)
  })
  await t.test('RLSは誤って表権限が追加されても全行を拒否する', async () => {
    await as('postgres')
    await db.exec('grant select,insert,update,delete on push_private.subscriptions to authenticated')
    await as('authenticated', husband)
    assert.equal((await db.query('select * from push_private.subscriptions')).rows.length, 0)
    assert.equal((await db.query("update push_private.subscriptions set device_name='不正' returning id")).rows.length, 0)
    await assert.rejects(db.query('insert into push_private.subscriptions(user_id,endpoint,p256dh,auth_secret,device_name) values ($1,$2,$3,$4,$5)', [husband, endpoint('direct'), key, auth, '不正']), { code: '42501' })
    await as('postgres')
    await db.exec('revoke all on push_private.subscriptions from authenticated')
  })
  await t.test('メンバー削除で購読秘密情報を消し、古いJWTの本人IDでも再登録拒否', async () => {
    await as('postgres')
    await db.query('delete from public.app_members where user_id=$1', [husband])
    assert.equal(await scalar('select count(*)::int from push_private.subscriptions where user_id=$1', [husband]), 0)
    await as('authenticated', husband)
    await assert.rejects(list(), { code: '42501' })
    await assert.rejects(register(endpoint('husband')), { code: '42501' })
    await as('authenticated', wife)
    assert.equal((await list()).length, 1)
  })
})
