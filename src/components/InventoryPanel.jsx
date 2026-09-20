import { useMemo, useState } from 'react'
import {
  changedInventoryQuantity,
  INVENTORY_CATEGORIES,
  INVENTORY_STATUSES,
  INVENTORY_UNITS,
  inventoryNeedsRestock,
  inventoryStatus,
  normalizeInventoryName,
  restockAmount,
  sortInventoryItems,
  statusForQuantity,
} from '../lib/inventory'
import { normalizeShoppingName } from '../lib/shopping'
import { daysUntil } from '../lib/daily'
import { todayInTokyo } from '../lib/format'

const SUGGESTED_ITEMS = [
  { name: '米', category: '食品' },
  { name: '塩', category: '調味料' },
  { name: '洗濯洗剤', category: '日用品' },
  { name: '食器用洗剤', category: '掃除用品' },
  { name: 'トイレットペーパー', category: '日用品' },
  { name: '非常食', category: '防災品' },
]
const EMPTY_FORM = {
  name: '',
  category: '日用品',
  status: 'enough',
  quantity: '',
  min_quantity: '',
  unit: '個',
  expires_on: '',
  note: '',
}

function updatedLabel(item, memberId) {
  const updatedAt = new Date(item.updated_at)
  if (Number.isNaN(updatedAt.getTime())) return '更新時刻不明'
  const date = new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(updatedAt)
  return `${item.updated_by === memberId ? 'あなた' : 'パートナー'}・${date}`
}

function inventoryFormFrom(item) {
  return {
    name: item.name,
    category: item.category === '食材' ? '食品' : item.category,
    status: item.status,
    quantity: item.quantity ?? '',
    min_quantity: item.min_quantity ?? '',
    unit: item.unit ?? '個',
    expires_on: item.expires_on ?? '',
    note: item.note ?? '',
  }
}

export function InventoryPanel({
  inventoryItems,
  shoppingItems,
  inventorySchemaReady,
  memberId,
  online,
  busy,
  onCreate,
  onUpdate,
  onDelete,
  onAddToShopping,
  onAddManyToShopping,
}) {
  const [filter, setFilter] = useState('needed')
  const [categoryFilter, setCategoryFilter] = useState('すべて')
  const [query, setQuery] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')

  const pendingNames = useMemo(() => new Set(
    shoppingItems
      .filter((item) => !item.is_purchased)
      .map((item) => normalizeShoppingName(item.name)),
  ), [shoppingItems])
  const existingNames = useMemo(() => new Set(
    inventoryItems.map((item) => normalizeInventoryName(item.name)),
  ), [inventoryItems])
  const sortedItems = useMemo(() => sortInventoryItems(inventoryItems), [inventoryItems])
  const shownItems = useMemo(() => {
    const normalizedQuery = normalizeInventoryName(query)
    return sortedItems.filter((item) => (
      (filter !== 'needed' || inventoryNeedsRestock(item))
      && (categoryFilter === 'すべて' || item.category === categoryFilter || (categoryFilter === '食品' && item.category === '食材'))
      && (!normalizedQuery || normalizeInventoryName(`${item.name} ${item.note ?? ''}`).includes(normalizedQuery))
    ))
  }, [categoryFilter, filter, query, sortedItems])
  const neededCount = inventoryItems.filter(inventoryNeedsRestock).length
  const missingFromShopping = sortedItems.filter((item) => (
    inventoryNeedsRestock(item) && !pendingNames.has(normalizeShoppingName(item.name))
  ))

  function resetForm() {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setShowForm(false)
    setError('')
  }

  function startSuggested(item) {
    setForm({ ...EMPTY_FORM, ...item })
    setEditingId(null)
    setShowForm(true)
    setError('')
  }

  function startEdit(item) {
    setForm(inventoryFormFrom(item))
    setEditingId(item.id)
    setShowForm(true)
    setError('')
  }

  async function submit(event) {
    event.preventDefault()
    const name = form.name.trim()
    if (!name) {
      setError('品名を入力してください。')
      return
    }
    if (!editingId && existingNames.has(normalizeInventoryName(name))) {
      setError('同じ品物がすでに在庫に登録されています。')
      return
    }
    const quantity = form.quantity === '' ? null : Number(form.quantity)
    if (quantity !== null && (!Number.isFinite(quantity) || quantity < 0)) {
      setError('現在数は0以上で入力してください。')
      return
    }
    const minQuantity = form.min_quantity === '' ? null : Number(form.min_quantity)
    if (minQuantity !== null && (!Number.isFinite(minQuantity) || minQuantity < 0)) {
      setError('最低在庫数は0以上で入力してください。')
      return
    }
    if (minQuantity !== null && quantity === null) {
      setError('最低在庫数を使う場合は、現在数も入力してください。')
      return
    }
    const input = {
      name,
      category: form.category,
      status: statusForQuantity(quantity, form.status, minQuantity),
      quantity,
      min_quantity: minQuantity,
      unit: quantity === null ? null : form.unit,
      expires_on: form.expires_on || null,
      note: form.note.trim() || null,
    }
    const success = editingId
      ? await onUpdate(editingId, input)
      : await onCreate(input)
    if (success) resetForm()
  }

  async function setStatus(item, status) {
    if (status === item.status) return
    await onUpdate(item.id, {
      status,
      quantity: status === 'out' && item.quantity !== null ? 0 : item.quantity,
    })
  }

  async function changeQuantity(item, delta) {
    const quantity = changedInventoryQuantity(item.quantity, delta)
    if (quantity === null) return
    await onUpdate(item.id, {
      quantity,
      status: statusForQuantity(quantity, item.status, item.min_quantity),
    })
  }

  if (!inventorySchemaReady) {
    return (
      <div className="empty-state inventory-unavailable">
        <span>⌂</span>
        <strong>在庫機能を準備しています</strong>
        <p>データベースの準備が完了すると利用できます。</p>
      </div>
    )
  }

  return (
    <div className="inventory-panel">
      <div className="inventory-summary">
        <div>
          <span>補充が必要</span>
          <strong>{neededCount}<small>件</small></strong>
        </div>
        <p>最低在庫数を決めると、不足を自動で見つけます</p>
        <button
          type="button"
          onClick={() => {
            setShowForm((value) => !value)
            setEditingId(null)
            setForm(EMPTY_FORM)
            setError('')
          }}
        >
          {showForm && !editingId ? '閉じる' : '＋ 在庫を登録'}
        </button>
      </div>

      {missingFromShopping.length > 0 && (
        <button
          className="inventory-bulk-shopping"
          type="button"
          disabled={!online || busy}
          onClick={() => onAddManyToShopping(missingFromShopping)}
        >
          不足している{missingFromShopping.length}件を買うものへ
        </button>
      )}

      {showForm && (
        <form className="panel-form inventory-form" onSubmit={submit}>
          <div className="panel-form-heading">
            <h3>{editingId ? '在庫を編集' : '在庫を登録'}</h3>
            <button type="button" onClick={resetForm}>閉じる</button>
          </div>
          <label>
            <span>品名</span>
            <input
              type="text"
              maxLength="80"
              placeholder="例：洗濯洗剤"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </label>
          <div className="category-row inventory-category-row" aria-label="カテゴリ">
            {INVENTORY_CATEGORIES.map((category) => (
              <button
                className={form.category === category ? 'active' : ''}
                type="button"
                key={category}
                onClick={() => setForm({ ...form, category })}
              >
                {category}
              </button>
            ))}
          </div>
          <div className="inventory-quantity-fields">
            <label>
              <span>現在数（任意）</span>
              <input
                type="number"
                min="0"
                max="999999.99"
                step="0.01"
                inputMode="decimal"
                placeholder="未設定"
                value={form.quantity}
                onChange={(event) => setForm({ ...form, quantity: event.target.value })}
              />
            </label>
            <label>
              <span>最低在庫数</span>
              <input
                type="number"
                min="0"
                max="999999.99"
                step="0.01"
                inputMode="decimal"
                placeholder="未設定"
                value={form.min_quantity}
                disabled={form.quantity === ''}
                onChange={(event) => setForm({ ...form, min_quantity: event.target.value })}
              />
            </label>
            <label>
              <span>単位</span>
              <select
                value={form.unit}
                onChange={(event) => setForm({ ...form, unit: event.target.value })}
                disabled={form.quantity === ''}
              >
                {INVENTORY_UNITS.map((unit) => <option key={unit}>{unit}</option>)}
              </select>
            </label>
          </div>
          {form.quantity !== '' && form.min_quantity !== '' ? (
            <p className="inventory-auto-status">現在数と最低在庫数から、補充の要否を自動判定します。</p>
          ) : (
            <div className="inventory-status-choice" aria-label="在庫状況">
              {INVENTORY_STATUSES.map((status) => (
                <button
                  className={`status-${status.value} ${form.status === status.value ? 'active' : ''}`}
                  type="button"
                  key={status.value}
                  onClick={() => setForm({ ...form, status: status.value })}
                >
                  {status.label}
                </button>
              ))}
            </div>
          )}
          <label>
            <span>賞味・使用期限（任意）</span>
            <input
              type="date"
              value={form.expires_on}
              onChange={(event) => setForm({ ...form, expires_on: event.target.value })}
            />
          </label>
          <label>
            <span>メモ（任意）</span>
            <input
              type="text"
              maxLength="200"
              placeholder="例：詰め替え用"
              value={form.note}
              onChange={(event) => setForm({ ...form, note: event.target.value })}
            />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" type="submit" disabled={!online || busy}>
            {editingId ? '変更を保存' : '在庫に追加'}
          </button>
        </form>
      )}

      {inventoryItems.length === 0 && !showForm && (
        <div className="inventory-onboarding">
          <strong>まずは切らすと困るものから</strong>
          <p>候補を押すと登録内容を確認できます。</p>
          <div>
            {SUGGESTED_ITEMS.map((item) => (
              <button type="button" key={item.name} onClick={() => startSuggested(item)}>
                ＋ {item.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="inventory-filter" aria-label="在庫の表示範囲">
        <button className={filter === 'needed' ? 'active' : ''} type="button" onClick={() => setFilter('needed')}>
          補充が必要 <span>{neededCount}</span>
        </button>
        <button className={filter === 'all' ? 'active' : ''} type="button" onClick={() => setFilter('all')}>
          すべて <span>{inventoryItems.length}</span>
        </button>
      </div>

      <div className="inventory-search-filter">
        <label>
          <span>在庫を検索</span>
          <input
            type="search"
            placeholder="品名・メモで検索"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label>
          <span>カテゴリ</span>
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option>すべて</option>
            {INVENTORY_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
          </select>
        </label>
      </div>

      <div className="inventory-list">
        {shownItems.length === 0 && inventoryItems.length > 0 && (
          <div className="empty-state compact">
            <span>{query || categoryFilter !== 'すべて' ? '⌕' : '✓'}</span>
            <strong>{query || categoryFilter !== 'すべて' ? '条件に合う在庫がありません' : '補充が必要なものはありません'}</strong>
            <p>{query || categoryFilter !== 'すべて' ? '検索条件やカテゴリを変えてください。' : '在庫状況を変更するとここに表示されます。'}</p>
          </div>
        )}
        {shownItems.map((item) => {
          const inShopping = pendingNames.has(normalizeShoppingName(item.name))
          const expiryDays = daysUntil(item.expires_on, todayInTokyo())
          const effectiveStatus = inventoryStatus(item)
          const shortage = restockAmount(item)
          return (
            <article className={`inventory-card status-${effectiveStatus}`} key={item.id}>
              <div className="inventory-card-heading">
                <div>
                  <span>{item.category}</span>
                  <h3>{item.name}</h3>
                </div>
                <button type="button" onClick={() => startEdit(item)}>編集</button>
              </div>
              {item.note && <p>{item.note}</p>}
              {expiryDays !== null && (
                <p className={`inventory-expiry ${expiryDays <= 7 ? 'soon' : ''}`}>
                  {expiryDays < 0
                    ? `期限切れから${Math.abs(expiryDays)}日`
                    : expiryDays === 0
                      ? '期限は今日'
                      : `期限まで${expiryDays}日`}
                </p>
              )}
              {item.quantity != null && item.min_quantity != null ? (
                <p className={`inventory-threshold-status status-${effectiveStatus}`}>
                  最低 {Number(item.min_quantity).toLocaleString('ja-JP')}{item.unit}
                  {shortage > 0 ? `・あと${shortage.toLocaleString('ja-JP')}${item.unit}必要` : '・足りています'}
                </p>
              ) : (
                <div className="inventory-status-buttons" aria-label={`${item.name}の在庫状況`}>
                  {INVENTORY_STATUSES.map((status) => (
                    <button
                      className={`status-${status.value} ${effectiveStatus === status.value ? 'active' : ''}`}
                      type="button"
                      disabled={!online || busy}
                      key={status.value}
                      onClick={() => setStatus(item, status.value)}
                    >
                      {status.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="inventory-card-bottom">
                {item.quantity === null ? (
                  <span className="inventory-no-count">個数未設定</span>
                ) : (
                  <div className="inventory-stepper" aria-label={`${item.name}の現在数`}>
                    <button
                      type="button"
                      aria-label={`${item.name}を1${item.unit}減らす`}
                      disabled={!online || busy || Number(item.quantity) <= 0}
                      onClick={() => changeQuantity(item, -1)}
                    >
                      <b aria-hidden="true">−</b>
                      <span>減らす</span>
                    </button>
                    <strong>
                      <span>現在</span>
                      <b>{Number(item.quantity).toLocaleString('ja-JP')}<small>{item.unit}</small></b>
                    </strong>
                    <button
                      type="button"
                      aria-label={`${item.name}を1${item.unit}増やす`}
                      disabled={!online || busy}
                      onClick={() => changeQuantity(item, 1)}
                    >
                      <b aria-hidden="true">＋</b>
                      <span>増やす</span>
                    </button>
                  </div>
                )}
                {inventoryNeedsRestock(item) && (
                  <button
                    className={`inventory-shopping-button ${inShopping ? 'added' : ''}`}
                    type="button"
                    disabled={!online || busy || inShopping}
                    onClick={() => onAddToShopping(item)}
                  >
                    {inShopping ? '買い物に追加済み' : '買うものに追加'}
                  </button>
                )}
              </div>
              <div className="inventory-audit">
                <span>{updatedLabel(item, memberId)}に更新</span>
                <button
                  type="button"
                  disabled={!online || busy}
                  onClick={() => window.confirm(`${item.name}を在庫から削除しますか？`) && onDelete(item.id)}
                >
                  削除
                </button>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
