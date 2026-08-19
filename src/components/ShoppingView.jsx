import { useMemo, useState } from 'react'
import { InventoryPanel } from './InventoryPanel'
import { frequentShoppingItems } from '../lib/daily'
import { todayInTokyo } from '../lib/format'
import { inventoryNeedsRestock } from '../lib/inventory'
import { normalizeShoppingName, parseShoppingItems } from '../lib/shopping'

const CATEGORIES = ['食材', '日用品', 'その他']
const MAX_BULK_ITEMS = 20
const MAX_ITEM_LENGTH = 80

export function ShoppingView({
  items,
  inventoryItems,
  inventorySchemaReady,
  memberId,
  online,
  busy,
  onCreateMany,
  onUpdate,
  onDelete,
  onCreateInventory,
  onUpdateInventory,
  onDeleteInventory,
  onAddInventoryToShopping,
  onReplenishInventory,
}) {
  const [mode, setMode] = useState('shopping')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('食材')
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')

  const pending = items.filter((item) => !item.is_purchased)
  const purchased = items.filter((item) => item.is_purchased)
  const neededInventory = inventoryItems.filter(inventoryNeedsRestock).length
  const parsedItems = useMemo(() => parseShoppingItems(name), [name])
  const inventoryByName = useMemo(() => new Map(
    inventoryItems.map((item) => [normalizeShoppingName(item.name), item]),
  ), [inventoryItems])
  const frequentItems = useMemo(() => frequentShoppingItems(items), [items])

  async function submitItem(event) {
    event.preventDefault()
    if (parsedItems.length === 0) {
      setError('商品名を入力してください。')
      return
    }
    if (parsedItems.length > MAX_BULK_ITEMS) {
      setError(`一度に追加できるのは${MAX_BULK_ITEMS}件までです。`)
      return
    }
    if (parsedItems.some((item) => item.length > MAX_ITEM_LENGTH)) {
      setError(`商品名は1件につき${MAX_ITEM_LENGTH}文字以内にしてください。`)
      return
    }
    const success = await onCreateMany(parsedItems.map((item) => ({
      name: item,
      category,
      is_purchased: false,
      purchased_at: null,
    })))
    if (success) {
      setName('')
      setError('')
    }
  }

  async function toggle(item) {
    await onUpdate(item.id, {
      is_purchased: !item.is_purchased,
      purchased_at: item.is_purchased ? null : todayInTokyo(),
    })
  }

  async function saveEdit(item) {
    if (!editing.name.trim()) {
      setError('商品名を入力してください。')
      return
    }
    const success = await onUpdate(item.id, {
      name: editing.name.trim(),
      category: editing.category,
    })
    if (success) {
      setEditing(null)
      setError('')
    }
  }

  return (
    <section className="view" aria-labelledby="shopping-title">
      <div className="view-heading shopping-heading">
        <div>
          <p className="eyebrow">SHOPPING &amp; STOCK</p>
          <h2 id="shopping-title">買い物と在庫</h2>
        </div>
        <div className="count-bubble">
          <strong>{mode === 'shopping' ? pending.length : neededInventory}</strong>
          <span>{mode === 'shopping' ? '未購入' : '要補充'}</span>
        </div>
      </div>

      <div className="shopping-mode-tabs" aria-label="買い物と在庫の切り替え">
        <button className={mode === 'shopping' ? 'active' : ''} type="button" onClick={() => setMode('shopping')}>
          買うもの <span>{pending.length}</span>
        </button>
        <button className={mode === 'inventory' ? 'active' : ''} type="button" onClick={() => setMode('inventory')}>
          家の在庫 <span>{neededInventory}</span>
        </button>
      </div>

      {mode === 'inventory' ? (
        <InventoryPanel
          inventoryItems={inventoryItems}
          shoppingItems={items}
          inventorySchemaReady={inventorySchemaReady}
          memberId={memberId}
          online={online}
          busy={busy}
          onCreate={onCreateInventory}
          onUpdate={onUpdateInventory}
          onDelete={onDeleteInventory}
          onAddToShopping={onAddInventoryToShopping}
        />
      ) : (
        <>
          {frequentItems.length > 0 && (
            <div className="frequent-shopping">
              <div>
                <strong>いつもの</strong>
                <span>購入履歴からワンタップ追加</span>
              </div>
              <div className="frequent-shopping-chips">
                {frequentItems.map((item) => (
                  <button
                    type="button"
                    key={normalizeShoppingName(item.name)}
                    disabled={!online || busy}
                    onClick={() => onCreateMany([{
                      name: item.name,
                      category: item.category,
                      is_purchased: false,
                      purchased_at: null,
                    }])}
                  >
                    ＋ {item.name}{item.count > 1 ? ` ×${item.count}` : ''}
                  </button>
                ))}
              </div>
            </div>
          )}
          <form className="quick-add" onSubmit={submitItem}>
            <div className="quick-add-main">
              <input
                type="text"
                maxLength="500"
                placeholder="例：卵と鯖と豆腐とネギ"
                value={name}
                onChange={(event) => {
                  setName(event.target.value)
                  setError('')
                }}
                aria-label="買うものをまとめて入力"
              />
              <button
                className={parsedItems.length > 1 ? 'bulk-add-button' : ''}
                type="submit"
                disabled={!online || busy}
                aria-label={`${parsedItems.length || 1}件追加`}
              >
                {parsedItems.length > 1 ? `${parsedItems.length}件` : '＋'}
              </button>
            </div>
            <p className="bulk-add-hint">「と」・読点・カンマ・改行で、まとめて追加できます</p>
            {parsedItems.length > 1 && (
              <div className="bulk-add-preview" aria-label="追加される項目">
                {parsedItems.map((item) => <span key={item}>{item}</span>)}
              </div>
            )}
            <div className="category-row" aria-label="カテゴリ">
              {CATEGORIES.map((value) => (
                <button
                  key={value}
                  className={category === value ? 'active' : ''}
                  type="button"
                  onClick={() => setCategory(value)}
                >
                  {value}
                </button>
              ))}
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
          </form>

          <div className="shopping-section">
            <div className="section-heading">
              <h3>これから買うもの</h3>
              <span>{pending.length}件</span>
            </div>
            <div className="shopping-list">
              {pending.length === 0 && (
                <div className="empty-state compact">
                  <span>✓</span>
                  <strong>買い出し完了！</strong>
                  <p>追加したアイテムはここに表示されます</p>
                </div>
              )}
              {pending.map((item) => (
                <article className="shopping-item" key={item.id}>
                  {editing?.id === item.id ? (
                    <div className="edit-item-form">
                      <input
                        type="text"
                        maxLength="80"
                        value={editing.name}
                        onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                        aria-label="商品名"
                      />
                      <select
                        value={editing.category}
                        onChange={(event) => setEditing({ ...editing, category: event.target.value })}
                        aria-label="カテゴリ"
                      >
                        {CATEGORIES.map((value) => <option key={value}>{value}</option>)}
                      </select>
                      <div>
                        <button type="button" onClick={() => saveEdit(item)} disabled={!online || busy}>保存</button>
                        <button type="button" onClick={() => setEditing(null)}>戻る</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button className="check-button" type="button" onClick={() => toggle(item)} disabled={!online || busy} aria-label={`${item.name}を購入済みにする`} />
                      <div className="shopping-item-copy">
                        <strong>{item.name}</strong>
                        <span className={`category-tag category-${item.category}`}>{item.category}</span>
                      </div>
                      <button className="more-button" type="button" onClick={() => setEditing({ ...item })} aria-label={`${item.name}を編集`}>編集</button>
                      <button
                        className="remove-button"
                        type="button"
                        disabled={!online || busy}
                        onClick={() => window.confirm(`${item.name}を削除しますか？`) && onDelete(item.id)}
                        aria-label={`${item.name}を削除`}
                      >
                        ×
                      </button>
                    </>
                  )}
                </article>
              ))}
            </div>
          </div>

          <details className="purchased-section" defaultOpen={purchased.length > 0 && pending.length === 0}>
            <summary>
              <span>購入済み</span>
              <b>{purchased.length}件</b>
            </summary>
            <div className="shopping-list purchased-list">
              {purchased.length === 0 && <p className="muted-copy">購入済みのアイテムはありません。</p>}
              {purchased.map((item) => {
                const matchingInventory = inventoryByName.get(normalizeShoppingName(item.name))
                return (
                  <article className="shopping-item purchased" key={item.id}>
                    <button className="check-button checked" type="button" onClick={() => toggle(item)} disabled={!online || busy} aria-label={`${item.name}を未購入に戻す`}>✓</button>
                    <div className="shopping-item-copy">
                      <strong>{item.name}</strong>
                      <span>{item.category}</span>
                    </div>
                    {matchingInventory && (
                      <button
                        className="replenish-button"
                        type="button"
                        disabled={!online || busy}
                        onClick={() => onReplenishInventory(matchingInventory)}
                      >
                        在庫を補充
                      </button>
                    )}
                    <button
                      className="remove-button"
                      type="button"
                      disabled={!online || busy}
                      onClick={() => window.confirm(`${item.name}を削除しますか？`) && onDelete(item.id)}
                      aria-label={`${item.name}を削除`}
                    >
                      ×
                    </button>
                  </article>
                )
              })}
            </div>
          </details>
        </>
      )}
    </section>
  )
}
