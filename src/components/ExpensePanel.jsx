import { useEffect, useMemo, useRef, useState } from 'react'
import { AppIcon } from './AppIcon'
import { formatDate, formatYen, parsePositiveYen, todayInTokyo } from '../lib/format'
import { recognizeReceipt } from '../lib/receiptOcr'

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
  const [ocrState, setOcrState] = useState({ status: 'idle', progress: 0, message: '' })
  const [receiptPreview, setReceiptPreview] = useState('')
  const ocrRequest = useRef(0)
  useEffect(() => () => { if (receiptPreview) URL.revokeObjectURL(receiptPreview) }, [receiptPreview])
  useEffect(() => () => { ocrRequest.current += 1 }, [])

  const visibleExpenses = useMemo(() => expenses.filter(
    (expense) => expense.spent_on.startsWith(month),
  ), [expenses, month])
  const total = visibleExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0)

  function resetForm() {
    ocrRequest.current += 1
    setForm(EMPTY_EXPENSE())
    setReceipt(null)
    setReceiptPreview('')
    setError('')
    setOcrState({ status: 'idle', progress: 0, message: '' })
    setShowForm(false)
  }

  function chooseReceipt(event) {
    ocrRequest.current += 1
    setReceiptPreview('')
    setOcrState({ status: 'idle', progress: 0, message: '' })
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
    if (file) setReceiptPreview(URL.createObjectURL(file))
    setError('')
    setOcrState({ status: 'idle', progress: 0, message: '' })
  }

  async function readReceipt() {
    if (!receipt) return
    const request = ++ocrRequest.current
    setError('')
    setOcrState({ status: 'reading', progress: 0, message: 'OCRを準備しています…' })
    try {
      const result = await recognizeReceipt(receipt, ({ progress }) => {
        if (request !== ocrRequest.current) return
        const percent = Math.max(0, Math.min(100, Math.round(progress * 100)))
        setOcrState({ status: 'reading', progress: percent, message: `文字を読み取っています… ${percent}%` })
      })
      if (request !== ocrRequest.current) return
      const { fields } = result
      setForm((current) => ({
        ...current,
        spent_on: fields.spentOn || current.spent_on,
        merchant: fields.merchant || current.merchant,
        amount: fields.amount ? String(fields.amount) : current.amount,
        items: fields.items || current.items,
      }))
      const detectedCount = [fields.spentOn, fields.merchant, fields.amount, fields.items].filter(Boolean).length
      setOcrState({
        status: 'done',
        progress: 100,
        message: detectedCount
          ? `${detectedCount}項目の候補を入力しました。内容を確認・修正してください。`
          : '候補を抽出できませんでした。写真を見ながら入力してください。',
      })
    } catch {
      if (request !== ocrRequest.current) return
      setOcrState({ status: 'error', progress: 0, message: '' })
      setError('レシートを読み取れませんでした。明るい場所で撮ったJPEG・PNG画像をお試しください。')
    }
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
        <button type="button" aria-expanded={showForm} onClick={() => showForm ? resetForm() : setShowForm(true)}>
          {showForm ? '閉じる' : '＋ 支出を記録'}
        </button>
      </div>

      {showForm && (
        <form className="panel-form expense-form" onSubmit={submit}>
          <div className="panel-form-heading">
            <h3>レシート・支出を記録</h3>
            <button type="button" onClick={resetForm}>閉じる</button>
          </div>
          <ol className="receipt-steps" aria-label="レシートの登録手順"><li className={!receipt ? 'current' : ''}>1 写真を選ぶ</li><li className={receipt && ocrState.status !== 'done' ? 'current' : ''}>2 読み取る</li><li className={ocrState.status === 'done' ? 'current' : ''}>3 確認・保存</li></ol>
          <label className="receipt-capture">
            <span>レシート写真（任意）</span>
            <input type="file" accept="image/*" capture="environment" onChange={chooseReceipt} />
            <b><AppIcon name="camera" />{receipt ? receipt.name : 'カメラで撮る／写真を選ぶ'}</b>
          </label>
          {receiptPreview && <img className="receipt-preview" src={receiptPreview} alt="選択したレシート。読み取り候補と見比べて確認できます" />}
          {receipt && (
            <div className="receipt-ocr">
              <button type="button" onClick={readReceipt} disabled={ocrState.status === 'reading'}>
                {ocrState.status === 'reading' ? '読み取り中…' : '写真から候補を読み取る'}
              </button>
              {ocrState.status === 'reading' && (
                <progress max="100" value={ocrState.progress} aria-label="レシート文字認識の進み具合" />
              )}
              {ocrState.message && (
                <p className={ocrState.status === 'done' ? 'ocr-result' : ''} role="status">{ocrState.message}</p>
              )}
            </div>
          )}
          <p className="receipt-note">写真からお店・日付・金額などを入力できます。初回の準備には少し時間がかかります。読み取り後は内容を確認してください。</p>
          <details className="receipt-privacy"><summary>写真のプライバシーについて</summary><p>文字認識はこの端末内で行い、外部OCRサービスへ画像を送信しません。保存した写真は、家族だけが見られる非公開領域に保管されます。</p></details>
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
          <button className="primary-button" type="submit" disabled={!online || busy || ocrState.status === 'reading'}>{busy ? '保存しています…' : '内容を確認して保存'}</button>
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
