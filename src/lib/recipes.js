import { inventoryNeedsRestock } from './inventory.js'
import { normalizeShoppingName } from './shopping.js'

export function recipeSourceKind(url = '') {
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (host === 'youtu.be' || host.endsWith('.youtube.com')) return 'youtube'
    if (host === 'instagram.com' || host.endsWith('.instagram.com')) return 'instagram'
    return 'web'
  } catch {
    return 'manual'
  }
}

export function groupRecipes(recipes = [], ingredients = [], steps = []) {
  const ingredientGroups = new Map()
  const stepGroups = new Map()
  for (const ingredient of ingredients) {
    const current = ingredientGroups.get(ingredient.recipe_id) || []
    current.push(ingredient)
    ingredientGroups.set(ingredient.recipe_id, current)
  }
  for (const step of steps) {
    const current = stepGroups.get(step.recipe_id) || []
    current.push(step)
    stepGroups.set(step.recipe_id, current)
  }
  return recipes.map((recipe) => ({
    ...recipe,
    ingredients: (ingredientGroups.get(recipe.id) || []).sort((a, b) => a.position - b.position),
    steps: (stepGroups.get(recipe.id) || []).sort((a, b) => a.position - b.position),
  }))
}

export function missingRecipeIngredients(recipe, inventoryItems = [], shoppingItems = []) {
  const inventoryById = new Map(inventoryItems.map((item) => [Number(item.id), item]))
  const inventoryByName = new Map(inventoryItems.map((item) => [normalizeShoppingName(item.name), item]))
  const pendingNames = new Set(
    shoppingItems.filter((item) => !item.is_purchased).map((item) => normalizeShoppingName(item.name)),
  )

  return (recipe.ingredients || []).filter((ingredient) => {
    const normalizedName = normalizeShoppingName(ingredient.name)
    if (!normalizedName || pendingNames.has(normalizedName)) return false
    const linked = ingredient.inventory_item_id
      ? inventoryById.get(Number(ingredient.inventory_item_id))
      : inventoryByName.get(normalizedName)
    return !linked || inventoryNeedsRestock(linked)
  })
}

export function recipeSearchText(recipe) {
  return [
    recipe.title,
    recipe.source_title,
    recipe.note,
    ...(recipe.ingredients || []).map((item) => item.name),
  ].filter(Boolean).join(' ').toLocaleLowerCase('ja-JP')
}
