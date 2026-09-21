type RecipeSection = 'ingredients' | 'steps'

function sectionHeading(line: string): RecipeSection | null {
  const value = line.replace(/[【】\[\]［］<>＜＞]/g, '').replace(/^[#▼▽◆◇■□●○・*\-\s]+/, '').trim().toLowerCase()
  if (/^(材料|材料一覧|食材|ingredients?)(?:\s*[（(].*[）)])?[：:]?$/.test(value)) return 'ingredients'
  if (/^(作り方|つくり方|手順|調理手順|レシピ|steps?|directions?|method)(?:\s*[（(].*[）)])?[：:]?$/.test(value)) return 'steps'
  return null
}

export function recipeDescriptionParts(description: string) {
  const ingredients: Array<{ name: string; quantity_text: string }> = []
  const steps: Array<{ body: string }> = []
  let section: RecipeSection | null = null

  for (const rawLine of description.split(/\r?\n/)) {
    const line = rawLine.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000)
    if (!line) continue
    const heading = sectionHeading(line)
    if (heading) {
      section = heading
      continue
    }
    if (/^(?:https?:\/\/|#|提供|撮影|編集|music\b|bgm\b)/i.test(line)) {
      if (section === 'steps' && /^https?:\/\//.test(line)) section = null
      continue
    }

    if (section === 'ingredients') {
      const name = line.replace(/^[・●○□■◇◆▼▽*\-–—\s]+/, '').trim()
      if (name && name.length <= 200) ingredients.push({ name, quantity_text: '' })
    } else if (section === 'steps') {
      const body = line.replace(/^(?:step\s*)?\d+[.．、:：)）\-\s]*/i, '').replace(/^[・●○□■◇◆▼▽*\-–—\s]+/, '').trim()
      if (body) steps.push({ body })
    }
  }

  return { ingredients: ingredients.slice(0, 200), steps: steps.slice(0, 100) }
}
