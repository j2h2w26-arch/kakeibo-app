import assert from 'node:assert/strict'
import test from 'node:test'
import { collectPages } from './pagination.js'

test('上限を超える行を複数ページに分けてすべて取得する', async () => {
  const source = Array.from({ length: 1201 }, (_, id) => ({ id }))
  const ranges = []
  const result = await collectPages(async (from, to) => {
    ranges.push([from, to])
    return { data: source.slice(from, to + 1), error: null }
  })

  assert.equal(result.error, null)
  assert.equal(result.data.length, 1201)
  assert.deepEqual(ranges, [[0, 499], [500, 999], [1000, 1499]])
})

test('ページ取得エラーを呼び出し元へ返す', async () => {
  const expected = new Error('network error')
  const result = await collectPages(async () => ({ data: null, error: expected }))

  assert.equal(result.data, null)
  assert.equal(result.error, expected)
})

test('件数がページサイズと同じでも空の次ページで終了する', async () => {
  const source = Array.from({ length: 2 }, (_, id) => ({ id }))
  let calls = 0
  const result = await collectPages(async (from, to) => {
    calls += 1
    return { data: source.slice(from, to + 1), error: null }
  }, { pageSize: 2 })

  assert.equal(result.data.length, 2)
  assert.equal(calls, 2)
})
