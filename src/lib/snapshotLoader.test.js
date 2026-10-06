import test from 'node:test'
import assert from 'node:assert/strict'
import { createSnapshotLoader } from './snapshotLoader.js'
import { clearHouseholdCache, HOUSEHOLD_CACHE_KEY, writeHouseholdCache } from './householdCache.js'

function fixture() {
  const pending = []
  const values = new Map()
  const storage = { getItem: (k) => values.get(k), setItem: (k, v) => values.set(k, v), removeItem: (k) => values.delete(k) }
  const events = []
  const callbacks = { onSuccess: (value) => events.push(value), onError: (e) => events.push(e), onSettled: () => events.push('settled') }
  const loader = createSnapshotLoader(
    () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
    (userId, snapshot) => writeHouseholdCache(userId, snapshot, storage),
  )
  return { loader, pending, storage, events, callbacks }
}

test('ログアウト後に到着した応答はキャッシュにも画面にも戻らない', async () => {
  const f = fixture()
  f.loader.activate('a')
  const request = f.loader.load('a', f.callbacks)
  f.loader.invalidate()
  clearHouseholdCache(f.storage)
  f.pending[0].resolve({ loans: [{ id: 1 }] })
  assert.deepEqual(await request, { ok: false, skipped: true })
  assert.equal(f.storage.getItem(HOUSEHOLD_CACHE_KEY), undefined)
  assert.deepEqual(f.events, [])
})

test('アカウント切り替えと応答の逆転でも最新アカウントだけを保存する', async () => {
  const f = fixture()
  f.loader.activate('a')
  const a = f.loader.load('a', f.callbacks)
  f.loader.invalidate()
  f.loader.activate('b')
  const b = f.loader.load('b', f.callbacks)
  f.pending[1].resolve({ owner: 'b' })
  assert.equal((await b).ok, true)
  f.pending[0].resolve({ owner: 'a' })
  assert.equal((await a).skipped, true)
  assert.equal(JSON.parse(f.storage.getItem(HOUSEHOLD_CACHE_KEY)).userId, 'b')
  assert.deepEqual(f.events, [{ owner: 'b' }, 'settled'])
})

test('古い通信エラーは新しい画面に反映せず最新エラーのみ通知する', async () => {
  const f = fixture()
  f.loader.activate('a')
  const old = f.loader.load('a', f.callbacks)
  const latest = f.loader.load('a', f.callbacks)
  f.pending[0].reject(new Error('stale'))
  assert.equal((await old).skipped, true)
  const failure = new Error('offline')
  f.pending[1].reject(failure)
  assert.equal((await latest).error, failure)
  assert.deepEqual(f.events, [failure, 'settled'])
})

test('ログアウト後の遅延コールバックは新しい取得も開始しない', async () => {
  const f = fixture()
  f.loader.activate('a')
  f.loader.invalidate()
  assert.equal((await f.loader.load('a', f.callbacks)).skipped, true)
  f.loader.activate('b')
  assert.equal((await f.loader.load('a', f.callbacks)).skipped, true)
  assert.equal(f.pending.length, 0)
})
