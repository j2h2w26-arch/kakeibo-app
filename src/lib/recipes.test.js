import test from 'node:test'
import assert from 'node:assert/strict'
import {
  groupRecipes,
  missingRecipeIngredients,
  recipeSearchText,
  recipeSourceKind,
} from './recipes.js'

test('URLからレシピの取得元を判定する', () => {
  assert.equal(recipeSourceKind('https://www.youtube.com/shorts/abc'), 'youtube')
  assert.equal(recipeSourceKind('https://youtu.be/abc'), 'youtube')
  assert.equal(recipeSourceKind('https://www.instagram.com/reel/abc'), 'instagram')
  assert.equal(recipeSourceKind('https://example.com/recipe'), 'web')
  assert.equal(recipeSourceKind('not-a-url'), 'manual')
})

test('材料と手順を順番どおりにレシピへまとめる', () => {
  const result = groupRecipes(
    [{ id: 1, title: 'カレー' }],
    [{ id: 2, recipe_id: 1, position: 1, name: '肉' }, { id: 1, recipe_id: 1, position: 0, name: '玉ねぎ' }],
    [{ id: 2, recipe_id: 1, position: 1, body: '煮る' }, { id: 1, recipe_id: 1, position: 0, body: '切る' }],
  )
  assert.deepEqual(result[0].ingredients.map((item) => item.name), ['玉ねぎ', '肉'])
  assert.deepEqual(result[0].steps.map((item) => item.body), ['切る', '煮る'])
})

test('十分な在庫と追加済み商品を除き不足材料だけ返す', () => {
  const recipe = { ingredients: [
    { name: '塩', inventory_item_id: 1 },
    { name: '玉ねぎ', inventory_item_id: 2 },
    { name: '豚肉', inventory_item_id: null },
    { name: 'にんじん', inventory_item_id: null },
  ] }
  const inventory = [
    { id: 1, name: '塩', status: 'enough', quantity: 2, min_quantity: 1 },
    { id: 2, name: '玉ねぎ', status: 'low', quantity: 0, min_quantity: 1 },
  ]
  const shopping = [{ name: '豚肉', is_purchased: false }]
  assert.deepEqual(
    missingRecipeIngredients(recipe, inventory, shopping).map((item) => item.name),
    ['玉ねぎ', 'にんじん'],
  )
  assert.match(recipeSearchText({ title: 'カレー', ingredients: [{ name: '玉ねぎ' }] }), /玉ねぎ/)
})
