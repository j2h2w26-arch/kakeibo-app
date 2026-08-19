import assert from 'node:assert/strict'
import test from 'node:test'
import { parseShoppingItems } from './shopping.js'

test('「と」で並べた買い物を個別の項目にする', () => {
  assert.deepEqual(
    parseShoppingItems('卵と鯖と豆腐とネギ'),
    ['卵', '鯖', '豆腐', 'ネギ'],
  )
})

test('読点、カンマ、改行を区切りとして扱う', () => {
  assert.deepEqual(
    parseShoppingItems('卵、鯖, 豆腐\nネギ'),
    ['卵', '鯖', '豆腐', 'ネギ'],
  )
})

test('空白と重複した項目を取り除く', () => {
  assert.deepEqual(parseShoppingItems(' 卵 、卵、 豆腐 '), ['卵', '豆腐'])
})

test('区切りのない商品名は一項目のままにする', () => {
  assert.deepEqual(parseShoppingItems('とろけるチーズ'), ['とろけるチーズ'])
})

test('商品名に含まれるひらがなの「と」は分割しない', () => {
  assert.deepEqual(parseShoppingItems('さといも'), ['さといも'])
})

test('ひらがなだけの項目は空白付きの「と」で分割できる', () => {
  assert.deepEqual(parseShoppingItems('たまご と ねぎ'), ['たまご', 'ねぎ'])
})
