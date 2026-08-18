import { useMemo, useState } from 'react'
import {
  calculateLoanSummary,
  formatDate,
  formatYen,
  parsePositiveYen,
  todayInTokyo,
} from '../lib/format'

const EMPTY_LOAN = () => ({
  date: todayInTokyo(),
  amount: '',
  lender: '夫',
  description: '',
})

const EMPTY_REPAYMENT = () => ({ amount: '', date: todayInTokyo(), note: '' })

export function LoanView({
  loans,
  repayments,
  online,
  busy,
  onCreate,
  onDelete,
  onRepay,
  onCancelRepayment,
}) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_LOAN)
  const [formError, setFormError] = useState('')
  const [filter, setFilter] = useState('open')
  const [expandedLoan, setExpandedLoan] = useState(null)
  const [repayForm, setRepayForm] = useState(EMPTY_REPAYMENT)

  const summary = useMemo(
    () => calculateLoanSummary(loans, repayments),
    [loans, repayments],
  )

  const visibleLoans = loans.filter((loan) => {
    if (filter === 'open') return !loan.is_repaid
    if (filter === 'done') return loan.is_repaid
    return true
  })

  async function submitLoan(event) {
    event.preventDefault()
    const amount = parsePositiveYen(form.amount)
    if (!amount || !form.date || !form.description.trim()) {
      setFormError('日付・1円以上の金額・内容を入力してください。')
      return
    }
    const success = await onCreate({
      date: form.date,
      amount,
      lender: form.lender,
      borrower: form.lender === '夫' ? '妻' : '夫',
      description: form.description.trim(),
      is_repaid: false,
      repaid_at: null,
    })
    if (success) {
      setForm(EMPTY_LOAN())
      setFormError('')
      setShowForm(false)
    }
  }

  function openLoan(id) {
    setExpandedLoan((current) => (current === id ? null : id))
    setRepayForm(EMPTY_REPAYMENT())
    setFormError('')
  }

  async function submitRepayment(event, loan, remaining) {
    event.preventDefault()
    const amount = parsePositiveYen(repayForm.amount)
    if (!amount || !repayForm.date) {
      setFormError('返済日と1円以上の返済額を入力してください。')
      return
    }
    if (amount > remaining) {
      setFormError('返済額が残額を超えています。')
      return
    }
    const success = await onRepay({
      loanId: loan.id,
      amount,
      date: repayForm.date,
      note: repayForm.note.trim(),
    })
    if (success) {
      setRepayForm(EMPTY_REPAYMENT())
      setFormError('')
    }
  }

  return (
    <section className="view" aria-labelledby="loans-title">
      <div className="view-heading">
        <div>
          <p className="eyebrow">BALANCE</p>
          <h2 id="loans-title">貸し借り</h2>
        </div>
        <button
          className="round-add-button"
          type="button"
          onClick={() => setShowForm((value) => !value)}
          aria-expanded={showForm}
        >
          {showForm ? '×' : '＋'}
          <span className="sr-only">新規登録</span>
        </button>
      </div>

      <div className="balance-card">
        <div>
          <p>いま精算するなら</p>
          <strong>{summary.netLabel}</strong>
        </div>
        <span className={summary.netAmount === 0 ? 'settled-amount' : ''}>
          {formatYen(summary.netAmount)}
        </span>
      </div>

      <div className="mini-stats">
        <article>
          <span>未返済合計</span>
          <strong>{formatYen(summary.totalOutstanding)}</strong>
        </article>
        <article>
          <span>これまでの返済</span>
          <strong>{formatYen(summary.totalRepaid)}</strong>
        </article>
      </div>

      {showForm && (
        <form className="panel-form" onSubmit={submitLoan}>
          <div className="panel-form-heading">
            <h3>新しい貸し借り</h3>
            <span>入力は4項目だけ</span>
          </div>
          <label>
            <span>日付</span>
            <input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
          </label>
          <label>
            <span>金額</span>
            <div className="money-input">
              <span>¥</span>
              <input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                placeholder="0"
                value={form.amount}
                onChange={(event) => setForm({ ...form, amount: event.target.value })}
              />
            </div>
          </label>
          <label>
            <span>貸した人</span>
            <div className="choice-row">
              {['夫', '妻'].map((person) => (
                <button
                  key={person}
                  className={form.lender === person ? 'selected' : ''}
                  type="button"
                  onClick={() => setForm({ ...form, lender: person })}
                >
                  {person}
                </button>
              ))}
            </div>
          </label>
          <label>
            <span>内容</span>
            <input
              type="text"
              maxLength="80"
              placeholder="旅行代、家具など"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </label>
          {formError && <p className="form-error" role="alert">{formError}</p>}
          <button className="primary-button" type="submit" disabled={!online || busy}>
            登録する
          </button>
        </form>
      )}

      <div className="filter-row" aria-label="貸し借りの表示切り替え">
        {[
          ['open', '未完済'],
          ['all', 'すべて'],
          ['done', '完済'],
        ].map(([value, label]) => (
          <button
            key={value}
            className={filter === value ? 'active' : ''}
            type="button"
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="card-list">
        {visibleLoans.length === 0 && (
          <div className="empty-state">
            <span>✓</span>
            <strong>{filter === 'open' ? '未完済の記録はありません' : '記録がありません'}</strong>
            <p>新しい記録は右上の＋から追加できます</p>
          </div>
        )}
        {visibleLoans.map((loan) => {
          const history = repayments[loan.id] || []
          const paid = history.reduce((sum, repayment) => sum + Number(repayment.amount), 0)
          const remaining = Math.max(Number(loan.amount) - paid, 0)
          const progress = Number(loan.amount) > 0 ? Math.min((paid / Number(loan.amount)) * 100, 100) : 0
          const isExpanded = expandedLoan === loan.id

          return (
            <article className={`record-card ${loan.is_repaid ? 'is-complete' : ''}`} key={loan.id}>
              <button className="record-main" type="button" onClick={() => openLoan(loan.id)} aria-expanded={isExpanded}>
                <div className="record-topline">
                  <span>{formatDate(loan.date)}</span>
                  <span className={`status-pill ${loan.is_repaid ? 'complete' : ''}`}>
                    {loan.is_repaid ? '完済' : `${loan.lender}が貸した`}
                  </span>
                </div>
                <div className="record-title-row">
                  <div>
                    <strong>{loan.description}</strong>
                    <span>{loan.lender} → {loan.borrower}</span>
                  </div>
                  <b>{formatYen(loan.amount)}</b>
                </div>
                <div className="progress-track" aria-label={`返済率 ${Math.round(progress)}%`}>
                  <span style={{ width: `${progress}%` }} />
                </div>
                <div className="record-bottomline">
                  <span>返済済み {formatYen(paid)}</span>
                  <strong>{loan.is_repaid ? '精算完了' : `残り ${formatYen(remaining)}`}</strong>
                </div>
              </button>

              {isExpanded && (
                <div className="record-details">
                  {!loan.is_repaid && (
                    <form className="repayment-form" onSubmit={(event) => submitRepayment(event, loan, remaining)}>
                      <h3>返済を記録</h3>
                      <div className="form-grid">
                        <label>
                          <span>金額</span>
                          <input
                            type="number"
                            min="1"
                            max={remaining}
                            step="1"
                            inputMode="numeric"
                            placeholder={String(remaining)}
                            value={repayForm.amount}
                            onChange={(event) => setRepayForm({ ...repayForm, amount: event.target.value })}
                          />
                        </label>
                        <label>
                          <span>日付</span>
                          <input type="date" value={repayForm.date} onChange={(event) => setRepayForm({ ...repayForm, date: event.target.value })} />
                        </label>
                      </div>
                      <label>
                        <span>メモ（任意）</span>
                        <input
                          type="text"
                          maxLength="80"
                          placeholder="1回目など"
                          value={repayForm.note}
                          onChange={(event) => setRepayForm({ ...repayForm, note: event.target.value })}
                        />
                      </label>
                      {formError && <p className="form-error" role="alert">{formError}</p>}
                      <button className="secondary-button" type="submit" disabled={!online || busy}>返済を記録</button>
                    </form>
                  )}

                  <div className="history-list">
                    <h3>返済履歴 <span>{history.length}件</span></h3>
                    {history.length === 0 && <p className="muted-copy">まだ返済履歴はありません。</p>}
                    {history.map((repayment) => (
                      <div className="history-row" key={repayment.id}>
                        <div>
                          <span>{formatDate(repayment.date)}</span>
                          <small>{repayment.note || '返済'}</small>
                        </div>
                        <strong>{formatYen(repayment.amount)}</strong>
                        <button
                          type="button"
                          disabled={!online || busy}
                          onClick={() => window.confirm('この返済履歴を取り消しますか？') && onCancelRepayment(repayment.id)}
                        >
                          取消
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    className="danger-link"
                    type="button"
                    disabled={!online || busy}
                    onClick={() => window.confirm('この貸し借りと返済履歴をすべて削除しますか？') && onDelete(loan.id)}
                  >
                    この記録を削除
                  </button>
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
