import test from 'node:test'
import assert from 'node:assert/strict'
import { recipeDescriptionParts } from './description.ts'

test('YouTube概要欄の材料と手順を見出しから取り込む', () => {
  const result = recipeDescriptionParts(`料理の紹介
【材料（2人分）】
・卵 2個
・塩 少々
【作り方】
1. 卵を割る
2. 混ぜて焼く
https://example.com/profile`)
  assert.deepEqual(result.ingredients, [
    { name: '卵 2個', quantity_text: '' },
    { name: '塩 少々', quantity_text: '' },
  ])
  assert.deepEqual(result.steps, [{ body: '卵を割る' }, { body: '混ぜて焼く' }])
})

test('見出しのない概要欄から材料や手順を推測しない', () => {
  assert.deepEqual(recipeDescriptionParts('卵を使った簡単な料理です。\n#shorts'), {
    ingredients: [], steps: [],
  })
})
