import { useMemo, useState } from 'react'
import {
  groupRecipes,
  missingRecipeIngredients,
  normalizeRecipeSourceUrl,
  recipeSearchText,
  recipeSourceKind,
} from '../lib/recipes'

function rowId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`
}

function emptyForm() {
  return {
    id: null,
    title: '',
    source_url: '',
    source_kind: 'manual',
    source_title: '',
    servings: '',
    note: '',
    ingredients: [{ key: rowId(), name: '', quantity_text: '', inventory_item_id: '' }],
    steps: [{ key: rowId(), body: '' }],
  }
}

function sourceLabel(kind) {
  return { youtube: 'YouTube', instagram: 'Instagram', web: 'Web', manual: '手入力' }[kind] || '手入力'
}

function sourceActionLabel(kind) {
  return {
    youtube: 'YouTubeで動画を見る',
    instagram: 'Instagramで投稿を見る',
    web: '元のレシピを見る',
  }[kind] || '元のページを開く'
}

export function RecipeView({
  recipes,
  ingredients,
  steps,
  inventoryItems,
  shoppingItems,
  schemaReady,
  online,
  busy,
  onSave,
  onDelete,
  onImport,
  onAddToShopping,
}) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [url, setUrl] = useState('')
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const [importNote, setImportNote] = useState('')
  const hydratedRecipes = useMemo(
    () => groupRecipes(recipes, ingredients, steps),
    [recipes, ingredients, steps],
  )
  const shownRecipes = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ja-JP')
    return normalized
      ? hydratedRecipes.filter((recipe) => recipeSearchText(recipe).includes(normalized))
      : hydratedRecipes
  }, [hydratedRecipes, query])

  function changeIngredient(index, field, value) {
    setForm((current) => ({
      ...current,
      ingredients: current.ingredients.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item),
    }))
  }

  function changeStep(index, value) {
    setForm((current) => ({
      ...current,
      steps: current.steps.map((item, itemIndex) => itemIndex === index ? { ...item, body: value } : item),
    }))
  }

  function closeForm() {
    setForm(emptyForm())
    setShowForm(false)
    setError('')
    setImportNote('')
  }

  function startEdit(recipe) {
    setForm({
      id: recipe.id,
      title: recipe.title,
      source_url: recipe.source_url || '',
      source_kind: recipe.source_kind || 'manual',
      source_title: recipe.source_title || '',
      servings: recipe.servings || '',
      note: recipe.note || '',
      ingredients: recipe.ingredients.length
        ? recipe.ingredients.map((item) => ({ ...item, key: rowId(), inventory_item_id: item.inventory_item_id || '' }))
        : [{ key: rowId(), name: '', quantity_text: '', inventory_item_id: '' }],
      steps: recipe.steps.length
        ? recipe.steps.map((item) => ({ ...item, key: rowId() }))
        : [{ key: rowId(), body: '' }],
    })
    setImportNote('')
    setError('')
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleImport(event) {
    event.preventDefault()
    if (!url.trim()) return
    setImporting(true)
    setError('')
    try {
      const normalizedUrl = normalizeRecipeSourceUrl(url)
      setUrl(normalizedUrl)
      const imported = await onImport(normalizedUrl)
      setForm({
        ...emptyForm(),
        title: imported.title || '',
        source_url: imported.source_url || normalizedUrl,
        source_kind: imported.source_kind || recipeSourceKind(normalizedUrl),
        source_title: imported.source_title || imported.title || '',
        servings: imported.servings || '',
        note: imported.note || '',
        ingredients: imported.ingredients?.length
          ? imported.ingredients.map((item) => ({ key: rowId(), name: item.name || '', quantity_text: item.quantity_text || '', inventory_item_id: '' }))
          : [{ key: rowId(), name: '', quantity_text: '', inventory_item_id: '' }],
        steps: imported.steps?.length
          ? imported.steps.map((item) => ({ key: rowId(), body: typeof item === 'string' ? item : item.body || '' }))
          : [{ key: rowId(), body: '' }],
      })
      setImportNote(imported.import_note || '内容を確認してから保存してください。')
      setShowForm(true)
    } catch (nextError) {
      setError(nextError.message || 'URLを読み取れませんでした。')
    } finally {
      setImporting(false)
    }
  }

  async function handleSave(event) {
    event.preventDefault()
    const cleanedIngredients = form.ingredients
      .map((item) => ({ ...item, name: item.name.trim(), quantity_text: item.quantity_text.trim() }))
      .filter((item) => item.name)
    const cleanedSteps = form.steps.map((item) => ({ ...item, body: item.body.trim() })).filter((item) => item.body)
    if (!form.title.trim()) {
      setError('レシピ名を入力してください。')
      return
    }
    if (!cleanedIngredients.length && !cleanedSteps.length) {
      setError('材料か手順を1つ以上入力してください。')
      return
    }
    setError('')
    const saved = await onSave({
      ...form,
      title: form.title.trim(),
      source_url: form.source_url.trim(),
      source_kind: form.source_url ? recipeSourceKind(form.source_url) : 'manual',
      ingredients: cleanedIngredients,
      steps: cleanedSteps,
    })
    if (saved) closeForm()
  }

  if (!schemaReady) {
    return <div className="inventory-unavailable" role="status">レシピ機能を準備しています。同期後にもう一度お試しください。</div>
  }

  return (
    <section className="recipe-view">
      <div className="shopping-heading recipe-heading">
        <div><span>RECIPE LIBRARY</span><h2>レシピ</h2><p>材料と手順だけ、すぐ見返せる形で。</p></div>
        <strong>{hydratedRecipes.length}<small>件</small></strong>
      </div>

      <form className="recipe-import" onSubmit={handleImport}>
        <label>
          <span>レシピのURL</span>
          <input type="url" required placeholder="YouTube・Instagram・レシピページ" value={url} onChange={(event) => setUrl(event.target.value)} />
        </label>
        <button type="submit" disabled={!online || busy || importing}>{importing ? '読み取り中…' : 'URLから取り込む'}</button>
        <small>取得できるYouTube概要欄やレシピページから材料・手順を読み取ります。元リンクも残ります。</small>
      </form>

      <button className="recipe-manual-button" type="button" onClick={() => showForm ? closeForm() : setShowForm(true)}>
        {showForm ? '入力を閉じる' : '＋ 手入力でレシピを追加'}
      </button>

      {showForm && (
        <form className="panel-form recipe-form" onSubmit={handleSave}>
          <div className="section-heading"><div><h3>{form.id ? 'レシピを編集' : 'レシピを登録'}</h3><span>取り込んだ内容は自由に直せます</span></div></div>
          {importNote && <p className="recipe-import-note" role="status">{importNote}</p>}
          <div className="recipe-form-grid">
            <label><span>レシピ名</span><input maxLength="160" required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
            <label><span>分量（任意）</span><input maxLength="80" placeholder="例：2人分" value={form.servings} onChange={(event) => setForm({ ...form, servings: event.target.value })} /></label>
          </div>
          <label><span>元のURL（任意）</span><input type="url" maxLength="2048" value={form.source_url} onChange={(event) => setForm({ ...form, source_url: event.target.value })} /></label>

          <fieldset className="recipe-parts">
            <legend>材料</legend>
            {form.ingredients.map((item, index) => (
              <div className="recipe-ingredient-row" key={item.key}>
                <input aria-label={`材料${index + 1}`} maxLength="200" placeholder="材料名" value={item.name} onChange={(event) => changeIngredient(index, 'name', event.target.value)} />
                <input aria-label={`材料${index + 1}の分量`} maxLength="100" placeholder="分量" value={item.quantity_text} onChange={(event) => changeIngredient(index, 'quantity_text', event.target.value)} />
                <select aria-label={`材料${index + 1}と在庫の連携`} value={item.inventory_item_id} onChange={(event) => changeIngredient(index, 'inventory_item_id', event.target.value)}>
                  <option value="">在庫と未連携</option>
                  {inventoryItems.map((stock) => <option value={stock.id} key={stock.id}>{stock.name}</option>)}
                </select>
                <button type="button" aria-label={`材料${index + 1}を削除`} disabled={form.ingredients.length === 1} onClick={() => setForm({ ...form, ingredients: form.ingredients.filter((_, itemIndex) => itemIndex !== index) })}>×</button>
              </div>
            ))}
            <button type="button" className="recipe-add-row" onClick={() => setForm({ ...form, ingredients: [...form.ingredients, { key: rowId(), name: '', quantity_text: '', inventory_item_id: '' }] })}>＋ 材料を追加</button>
          </fieldset>

          <fieldset className="recipe-parts">
            <legend>手順</legend>
            {form.steps.map((item, index) => (
              <div className="recipe-step-row" key={item.key}>
                <b>{index + 1}</b>
                <textarea aria-label={`手順${index + 1}`} maxLength="2000" rows="2" placeholder="手順を入力" value={item.body} onChange={(event) => changeStep(index, event.target.value)} />
                <button type="button" aria-label={`手順${index + 1}を削除`} disabled={form.steps.length === 1} onClick={() => setForm({ ...form, steps: form.steps.filter((_, itemIndex) => itemIndex !== index) })}>×</button>
              </div>
            ))}
            <button type="button" className="recipe-add-row" onClick={() => setForm({ ...form, steps: [...form.steps, { key: rowId(), body: '' }] })}>＋ 手順を追加</button>
          </fieldset>
          <label><span>メモ（任意）</span><textarea maxLength="2000" rows="3" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" type="submit" disabled={!online || busy}>{form.id ? '変更を保存' : 'レシピを保存'}</button>
        </form>
      )}

      {!showForm && error && <p className="form-error recipe-error" role="alert">{error}</p>}

      <label className="recipe-search"><span>レシピを検索</span><input type="search" placeholder="レシピ名・材料で検索" value={query} onChange={(event) => setQuery(event.target.value)} /></label>

      <div className="recipe-list">
        {shownRecipes.length === 0 && (
          <div className="empty-state compact"><span>⌕</span><strong>{hydratedRecipes.length ? '条件に合うレシピがありません' : 'レシピはまだありません'}</strong><p>{hydratedRecipes.length ? '検索語を変えてください。' : 'URLを貼るか、手入力で最初のレシピを追加しましょう。'}</p></div>
        )}
        {shownRecipes.map((recipe) => {
          const missing = missingRecipeIngredients(recipe, inventoryItems, shoppingItems)
          return (
            <article className="recipe-card" key={recipe.id}>
              <div className="recipe-card-topline"><span>{sourceLabel(recipe.source_kind)}</span><button type="button" onClick={() => startEdit(recipe)}>編集</button></div>
              <h3>{recipe.title}</h3>
              {recipe.servings && <p className="recipe-servings">{recipe.servings}</p>}
              <div className="recipe-quick-summary"><span>材料 {recipe.ingredients.length}</span><span>手順 {recipe.steps.length}</span>{missing.length > 0 && <span>不足 {missing.length}</span>}</div>
              <details>
                <summary>材料と手順を見る</summary>
                {recipe.ingredients.length > 0 && <div className="recipe-detail"><h4>材料</h4><ul>{recipe.ingredients.map((item) => <li key={item.id}><span>{item.name}</span><b>{item.quantity_text}</b></li>)}</ul></div>}
                {recipe.steps.length > 0 && <div className="recipe-detail"><h4>手順</h4><ol>{recipe.steps.map((item) => <li key={item.id}>{item.body}</li>)}</ol></div>}
                {recipe.note && <p className="recipe-note">{recipe.note}</p>}
              </details>
              <div className="recipe-actions">
                {recipe.source_url && <a href={recipe.source_url} target="_blank" rel="noreferrer">{sourceActionLabel(recipe.source_kind)}</a>}
                {missing.length > 0 && <button type="button" disabled={!online || busy} onClick={() => onAddToShopping(missing)}>不足{missing.length}件を買い物へ</button>}
              </div>
              <button className="recipe-delete" type="button" disabled={!online || busy} onClick={() => window.confirm(`${recipe.title}を削除しますか？`) && onDelete(recipe.id)}>削除</button>
            </article>
          )
        })}
      </div>
    </section>
  )
}
