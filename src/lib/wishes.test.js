import assert from 'node:assert/strict'
import test from 'node:test'
import { filterWishes, wishOwnerCounts } from './wishes.js'

const WISHES = [
  { id: 1, wanted_by: '夫', is_completed: false },
  { id: 2, wanted_by: '妻', is_completed: false },
  { id: 3, wanted_by: 'ふたり', is_completed: false },
  { id: 4, wanted_by: '夫', is_completed: true },
]

test('Wishを進捗と所有者の両方で絞り込む', () => {
  assert.deepEqual(filterWishes(WISHES, 'open', '夫').map((wish) => wish.id), [1])
  assert.deepEqual(filterWishes(WISHES, 'done', '夫').map((wish) => wish.id), [4])
  assert.deepEqual(filterWishes(WISHES, 'all', '妻').map((wish) => wish.id), [2])
})

test('現在の進捗に合わせて所有者タブの件数を集計する', () => {
  assert.deepEqual(wishOwnerCounts(WISHES, 'open'), { all: 3, 夫: 1, 妻: 1, ふたり: 1 })
  assert.deepEqual(wishOwnerCounts(WISHES, 'done'), { all: 1, 夫: 1, 妻: 0, ふたり: 0 })
})
