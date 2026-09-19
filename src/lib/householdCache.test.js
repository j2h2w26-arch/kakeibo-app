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
  writeHouseholdCache({ loans: [{ id: 1 }] }, storage, savedAt)

  assert.deepEqual(
    readHouseholdCache(storage, savedAt.getTime() + HOUSEHOLD_CACHE_TTL_MS - 1),
    { snapshot: { loans: [{ id: 1 }] }, savedAt: savedAt.toISOString() },
  )
})

test('期限切れの家計データを復元せず端末から削除する', () => {
  const storage = createStorage()
  const savedAt = new Date('2026-09-16T00:00:00.000Z')
  writeHouseholdCache({ loans: [{ id: 1 }] }, storage, savedAt)

  assert.equal(readHouseholdCache(storage, savedAt.getTime() + HOUSEHOLD_CACHE_TTL_MS + 1), null)
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

  assert.equal(writeHouseholdCache({ loans: [] }, storage), null)
})
