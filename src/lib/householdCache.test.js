import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clearHouseholdCache,
  HOUSEHOLD_CACHE_KEY,
  HOUSEHOLD_CACHE_TTL_MS,
  readHouseholdCache,
  writeHouseholdCache,
} from './householdCache.js'

function createStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    values,
  }
}

test('有効期限内の家計データだけを端末キャッシュから復元する', () => {
  const storage = createStorage()
  const savedAt = new Date('2026-09-16T00:00:00.000Z')
  writeHouseholdCache('member-a', { loans: [{ id: 1 }] }, storage, savedAt)

  assert.deepEqual(
    readHouseholdCache('member-a', storage, savedAt.getTime() + HOUSEHOLD_CACHE_TTL_MS - 1),
    { snapshot: { loans: [{ id: 1 }] }, savedAt: savedAt.toISOString() },
  )
})

test('期限切れの家計データを復元せず端末から削除する', () => {
  const storage = createStorage()
  const savedAt = new Date('2026-09-16T00:00:00.000Z')
  writeHouseholdCache('member-a', { loans: [{ id: 1 }] }, storage, savedAt)

  assert.equal(readHouseholdCache('member-a', storage, savedAt.getTime() + HOUSEHOLD_CACHE_TTL_MS + 1), null)
  assert.equal(storage.getItem(HOUSEHOLD_CACHE_KEY), null)
})

test('ログアウト時に現行版と旧版の家計キャッシュを両方削除する', () => {
  const storage = createStorage()
  storage.setItem(HOUSEHOLD_CACHE_KEY, '{}')
  storage.setItem('futari-home-cache-v8', '{}')
  storage.setItem('futari-home-cache-v7', '{}')
  storage.setItem('futari-home-cache-v6', '{}')

  clearHouseholdCache(storage)

  assert.equal(storage.getItem(HOUSEHOLD_CACHE_KEY), null)
  assert.equal(storage.getItem('futari-home-cache-v8'), null)
  assert.equal(storage.getItem('futari-home-cache-v7'), null)
  assert.equal(storage.getItem('futari-home-cache-v6'), null)
})

test('端末容量不足でも取得済みデータの処理を失敗させない', () => {
  const storage = createStorage()
  storage.setItem = () => { throw new Error('quota exceeded') }

  assert.equal(writeHouseholdCache('member-a', { loans: [] }, storage), null)
})

test('別アカウントの個人設定・所有者不明の旧版を復元しない', () => {
  const storage = createStorage()
  writeHouseholdCache('member-a', { notificationPreferences: { enabled: true } }, storage)
  assert.equal(readHouseholdCache('member-b', storage), null)
  assert.equal(storage.getItem(HOUSEHOLD_CACHE_KEY), null)
  storage.setItem('futari-home-cache-v11', JSON.stringify({ snapshot: { loans: [] }, savedAt: new Date().toISOString() }))
  assert.equal(readHouseholdCache('member-a', storage), null)
  assert.equal(storage.getItem('futari-home-cache-v11'), null)
})

test('未認証・未来日時・破損キャッシュは復元しない', () => {
  const storage = createStorage()
  assert.equal(writeHouseholdCache(null, {}, storage), null)
  writeHouseholdCache('member-a', {}, storage, new Date(Date.now() + 60000))
  assert.equal(readHouseholdCache('member-a', storage), null)
  storage.setItem(HOUSEHOLD_CACHE_KEY, 'broken')
  assert.equal(readHouseholdCache('member-a', storage), null)
})

test('読み取り・削除自体が拒否されてもログアウトを妨げない', () => {
  const denied = () => { throw new Error('SecurityError') }
  const storage = { getItem: denied, setItem: denied, removeItem: denied }
  assert.equal(readHouseholdCache('member-a', storage), null)
  assert.equal(writeHouseholdCache('member-a', {}, storage), null)
  assert.doesNotThrow(() => clearHouseholdCache(storage))
})
