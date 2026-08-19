import { useMemo, useState } from 'react'
import { formatDate, formatYen, parsePositiveYen, todayInTokyo } from '../lib/format'

const CATEGORIES = ['食費', '日用品', '外食', '交通', '旅行', '固定費', 'その他']
const PAYERS = ['夫', '妻', '共通']
const MAX_RECEIPT_SIZE = 5 * 1024 * 1024

const EMPTY_EXPENSE = () => ({
  spent_on: todayInTokyo(),
  merchant: '',
  amount: '',
  category: '食費',
  paid_by: '共通',
  items: '',
  note: '',
})

export function ExpensePanel({ expenses, online, busy, onCreate, onDelete, onOpenReceipt }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_EXPENSE)
  const [receipt, setReceipt] = useState(null)
  const [month, setMonth] = useState(todayInTokyo().slice(0, 7))
  const [error, setError] = useState('')

  const visibleExpenses = useMemo(() => expenses.filter(
    (expense) => expense.spent_on.startsWith(month),
  ), [expenses, month])
  const total = visibleExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0)

  function resetForm() {
    setForm(EMPTY_EXPENSE())
    setReceipt(null)
    setError('')
    setShowForm(false)
  }

  function chooseReceipt(event) {
    const file = event.target.files?.[0] || null
    if (file && file.type && !file.type.startsWith('image/')) {
      setReceipt(null)
      setError('レシートは画像ファイルを選んでください。')
      return
    }
    if (file && file.size > MAX_RECEIPT_SIZE) {
      setReceipt(null)
      setError('レシート画像は5MB以内にしてください。')
      return
    }
    setReceipt(file)
    setError('')
  }

  async function submit(event) {
    event.preventDefault()
    const amount = parsePositiveYen(form.amount)
    if (!form.spent_on || !form.merchant.trim() || !amount) {
      setError('日付・お店・1円以上の金額を入力してください。')
      return
    }
    const success = await onCreate({
      spent_on: form.spent_on,
      merchant: form.merchant.trim(),
      amount,
      category: form.category,
      paid_by: form.paid_by,
      items: form.items.trim() || null,
      note: form.note.trim() || null,
    }, receipt)
    if (success) resetForm()
  }

  return (
    <div className="expense-panel">
      <div className="expense-summary">
        <div>
          <span>{month.replace('-', '年')}月の家計費</span>
          <strong>{formatYen(total)}</strong>
          <small>{visibleExpenses.length}件</small>
        </div>
        <button type="button" onClick={() => setShowForm((value) => !value)}>
          {showForm ? '閉じる' : '＋ 支出を記録'}
        </button>
      </div>

      {showForm && (
        <form className="panel-form expense-form" onSubmit={submit}>
          <div className="panel-form-heading">
            <h3>レシート・支出を記録</h3>
            <button type="button" onClick={resetForm}>閉じる</button>
          </div>
          <label className="receipt-capture">
            <span>レシート写真（任意）</span>
            <input type="file" accept="image/*" capture="environment" onChange={chooseReceipt} />
            <b>{receipt ? `✓ ${receipt.name}` : 'カメラで撮る／写真を選ぶ'}</b>
          </label>
          <p className="receipt-note">写真は夫婦だけが見られる非公開領域に保存されます。店名・金額・品目は確認して入力してください。</p>
          <div className="form-grid">
            <label>
              <span>日付</span>
              <input type="date" value={form.spent_on} onChange={(event) => setForm({ ...form, spent_on: event.target.value })} />
            </label>
            <label>
              <span>支払った人</span>
              <select value={form.paid_by} onChange={(event) => setForm({ ...form, paid_by: event.target.value })}>
                {PAYERS.map((payer) => <option key={payer}>{payer}</option>)}
              </select>
            </label>
          </div>
          <label>
            <span>お店</span>
            <input type="text" maxLength="80" placeholder="例：まいばすけっと" value={form.merchant} onChange={(event) => setForm({ ...form, merchant: event.target.value })} />
          </label>
          <div className="form-grid">
            <label>
              <span>合計金額</span>
              <div className="money-input">
                <span>¥</span>
                <input type="number" min="1" step="1" inputMode="numeric" placeholder="0" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} />
              </div>
            </label>
            <label>
              <span>カテゴリ</span>
              <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                {CATEGORIES.map((category) => <option key={category}>{category}</option>)}
              </select>
            </label>
          </div>
          <label>
            <span>買ったもの（任意）</span>
            <textarea rows="3" maxLength="1000" placeholder="卵、豆腐、洗剤など" value={form.items} onChange={(event) => setForm({ ...form, items: event.target.value })} />
          </label>
          <label>
            <span>メモ（任意）</span>
            <input type="text" maxLength="500" placeholder="旅行用、立替など" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" type="submit" disabled={!online || busy}>家計簿に保存</button>
        </form>
      )}

      <div className="expense-month-filter">
        <label>
          <span>表示月</span>
          <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
        </label>
      </div>

      <div className="expense-list">
        {visibleExpenses.length === 0 && (
          <div className="empty-state compact">
            <span>¥</span>
            <strong>この月の支出はまだありません</strong>
            <p>レシートや支出を記録するとここに並びます。</p>
          </div>
        )}
        {visibleExpenses.map((expense) => (
          <article className="expense-card" key={expense.id}>
            <div className="expense-card-main">
              <span>{formatDate(expense.spent_on)}・{expense.category}</span>
              <h3>{expense.merchant}</h3>
              <p>{expense.items || expense.note || `${expense.paid_by}が支払い`}</p>
            </div>
            <strong>{formatYen(expense.amount)}</strong>
            <div className="expense-card-actions">
              {expense.receipt_path && (
                <button type="button" onClick={() => onOpenReceipt(expense.receipt_path)}>レシート</button>
              )}
              <button
                className="danger-action"
                type="button"
                disabled={!online || busy}
                onClick={() => window.confirm(`${expense.merchant}の支出を削除しますか？`) && onDelete(expense)}
              >
                削除
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
