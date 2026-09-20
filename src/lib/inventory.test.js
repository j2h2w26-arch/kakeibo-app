import assert from 'node:assert/strict'
import test from 'node:test'
import {
  changedInventoryQuantity,
  inventoryNeedsRestock,
  inventoryStatus,
  normalizeInventoryName,
  restockAmount,
  shoppingCategoryForInventory,
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

test('最低在庫数がある場合は数量から不足を自動判定する', () => {
  assert.equal(inventoryStatus({ quantity: 3, min_quantity: 2, status: 'low' }), 'enough')
  assert.equal(inventoryStatus({ quantity: 1, min_quantity: 2, status: 'enough' }), 'low')
  assert.equal(inventoryStatus({ quantity: 0, min_quantity: 2, status: 'enough' }), 'out')
  assert.equal(inventoryNeedsRestock({ quantity: 1, min_quantity: 2, status: 'enough' }), true)
  assert.equal(restockAmount({ quantity: 0.5, min_quantity: 2 }), 1.5)
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
  assert.equal(statusForQuantity(2, 'low', 2), 'enough')
  assert.equal(statusForQuantity(1, 'enough', 2), 'low')
})

test('備蓄カテゴリを既存の買い物カテゴリへ安全に変換する', () => {
  assert.equal(shoppingCategoryForInventory('調味料'), '食材')
  assert.equal(shoppingCategoryForInventory('防災品'), '日用品')
  assert.equal(shoppingCategoryForInventory('その他'), 'その他')
})
