import { useState } from 'react'
import { todayInTokyo } from '../lib/format'

const CATEGORIES = ['食材', '日用品', 'その他']

export function ShoppingView({ items, online, busy, onCreate, onUpdate, onDelete }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('食材')
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')

  const pending = items.filter((item) => !item.is_purchased)
  const purchased = items.filter((item) => item.is_purchased)

  async function submitItem(event) {
    event.preventDefault()
    if (!name.trim()) {
      setError('商品名を入力してください。')
      return
    }
    const success = await onCreate({
      name: name.trim(),
      category,
      is_purchased: false,
      purchased_at: null,
    })
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
          <p className="eyebrow">SHOPPING LIST</p>
          <h2 id="shopping-title">買い出し</h2>
        </div>
        <div className="count-bubble">
          <strong>{pending.length}</strong>
          <span>未購入</span>
        </div>
      </div>

      <form className="quick-add" onSubmit={submitItem}>
        <div className="quick-add-main">
          <input
            type="text"
            maxLength="80"
            placeholder="買うものを追加"
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label="商品名"
          />
          <button type="submit" disabled={!online || busy} aria-label="追加">＋</button>
        </div>
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
          {purchased.map((item) => (
            <article className="shopping-item purchased" key={item.id}>
              <button className="check-button checked" type="button" onClick={() => toggle(item)} disabled={!online || busy} aria-label={`${item.name}を未購入に戻す`}>✓</button>
              <div className="shopping-item-copy">
                <strong>{item.name}</strong>
                <span>{item.category}</span>
              </div>
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
          ))}
        </div>
      </details>
    </section>
  )
}
