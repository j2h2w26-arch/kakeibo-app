import assert from 'node:assert/strict'
import test from 'node:test'
import {
  changedInventoryQuantity,
  inventoryNeedsRestock,
  normalizeInventoryName,
  sortInventoryItems,
  statusForQuantity,
} from './inventory.js'

test('在庫名を重複判定用に正規化する', () => {
  assert.equal(normalizeInventoryName('　Ｔｉｓｓｕｅ '), 'tissue')
})

test('残りわずかと在庫なしを補充対象にする', () => {
  assert.equal(inventoryNeedsRestock({ status: 'low' }), true)
  assert.equal(inventoryNeedsRestock({ status: 'out' }), true)
  assert.equal(inventoryNeedsRestock({ status: 'enough' }), false)
})

test('在庫なし、残りわずか、十分の順に並べる', () => {
  const result = sortInventoryItems([
    { name: '洗剤', category: '日用品', status: 'enough' },
    { name: '卵', category: '食材', status: 'out' },
    { name: '豆腐', category: '食材', status: 'low' },
  ])
  assert.deepEqual(result.map((item) => item.name), ['卵', '豆腐', '洗剤'])
})

test('在庫数は0未満にしない', () => {
  assert.equal(changedInventoryQuantity(1, -1), 0)
  assert.equal(changedInventoryQuantity(0, -1), 0)
  assert.equal(changedInventoryQuantity(null, 1), null)
})

test('在庫数が0ならなし、0から増えたら残りわずかにする', () => {
  assert.equal(statusForQuantity(0, 'enough'), 'out')
  assert.equal(statusForQuantity(1, 'out'), 'low')
  assert.equal(statusForQuantity(2, 'low'), 'low')
})
