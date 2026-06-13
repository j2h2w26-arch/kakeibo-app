import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import './App.css'

const TABS = ['貸し借り', '買い出し']
const CATEGORIES = ['食材', '日用品', 'その他']

function App() {
  const [tab, setTab] = useState('貸し借り')

  // 貸し借り
  const [loans, setLoans] = useState([])
  const [repayments, setRepayments] = useState({})
  const [loansLoading, setLoansLoading] = useState(true)
  const [showLoanForm, setShowLoanForm] = useState(false)
  const [expandedLoan, setExpandedLoan] = useState(null)
  const [repayForm, setRepayForm] = useState({ amount: '', date: '', note: '' })
  const [loanForm, setLoanForm] = useState({ date: '', amount: '', lender: '夫', borrower: '妻', description: '' })

  // 買い出し
  const [items, setItems] = useState([])
  const [itemsLoading, setItemsLoading] = useState(true)
  const [showItemForm, setShowItemForm] = useState(false)
  const [itemForm, setItemForm] = useState({ name: '', category: '食材' })
  const [editingItem, setEditingItem] = useState(null)

  useEffect(() => { fetchLoans() }, [])
  useEffect(() => { if (tab === '買い出し') fetchItems() }, [tab])

  async function fetchLoans() {
    setLoansLoading(true)
    const { data, error } = await supabase.from('loans').select('*').order('date', { ascending: false })
    if (!error) {
      setLoans(data)
      fetchAllRepayments(data)
    }
    setLoansLoading(false)
  }

  async function fetchAllRepayments(loanList) {
    const ids = loanList.map(l => l.id)
    if (ids.length === 0) return
    const { data, error } = await supabase.from('repayments').select('*').in('loan_id', ids).order('date', { ascending: false })
    if (!error) {
      const map = {}
      data.forEach(r => {
        if (!map[r.loan_id]) map[r.loan_id] = []
        map[r.loan_id].push(r)
      })
      setRepayments(map)
    }
  }

  async function addLoan() {
    if (!loanForm.date || !loanForm.amount || !loanForm.description) return
    const formattedDate = loanForm.date.replace(/\//g, '-')
    const { error } = await supabase.from('loans').insert([{
      date: formattedDate,
      amount: parseInt(loanForm.amount),
      lender: loanForm.lender,
      borrower: loanForm.borrower,
      description: loanForm.description,
      is_repaid: false,
      repaid_at: null,
    }])
    if (error) alert('エラー: ' + error.message)
    else {
      setLoanForm({ date: '', amount: '', lender: '夫', borrower: '妻', description: '' })
      setShowLoanForm(false)
      fetchLoans()
    }
  }

  async function deleteLoan(id) {
    if (!window.confirm('削除しますか？')) return
    const { error } = await supabase.from('loans').delete().eq('id', id)
    if (!error) fetchLoans()
  }

  async function addRepayment(loan) {
    if (!repayForm.amount || !repayForm.date) return
    const paid = repayments[loan.id]?.reduce((s, r) => s + r.amount, 0) || 0
    const remaining = loan.amount - paid
    const amt = parseInt(repayForm.amount)
    if (amt > remaining) { alert('返済額が残額を超えています'); return }
    const { error } = await supabase.from('repayments').insert([{
      loan_id: loan.id,
      amount: amt,
      date: repayForm.date.replace(/\//g, '-'),
      note: repayForm.note || null,
    }])
    if (error) { alert('エラー: ' + error.message); return }
    if (paid + amt >= loan.amount) {
      await supabase.from('loans').update({ is_repaid: true, repaid_at: repayForm.date.replace(/\//g, '-') }).eq('id', loan.id)
    }
    setRepayForm({ amount: '', date: '', note: '' })
    fetchLoans()
  }

  async function deleteRepayment(repayment, loan) {
    if (!window.confirm('この返済履歴を取り消しますか？')) return
    const { error } = await supabase.from('repayments').delete().eq('id', repayment.id)
    if (error) { alert('エラー: ' + error.message); return }
    await supabase.from('loans').update({ is_repaid: false, repaid_at: null }).eq('id', loan.id)
    fetchLoans()
  }

  async function fetchItems() {
    setItemsLoading(true)
    const { data, error } = await supabase.from('shopping_items').select('*').order('created_at', { ascending: false })
    if (!error) setItems(data)
    setItemsLoading(false)
  }

  async function addItem() {
    if (!itemForm.name) return
    const { error } = await supabase.from('shopping_items').insert([{ name: itemForm.name, category: itemForm.category, is_purchased: false }])
    if (error) alert('エラー: ' + error.message)
    else { setItemForm({ name: '', category: '食材' }); setShowItemForm(false); fetchItems() }
  }

  async function togglePurchased(item) {
    const now = new Date().toISOString().split('T')[0]
    await supabase.from('shopping_items').update({ is_purchased: !item.is_purchased, purchased_at: !item.is_purchased ? now : null }).eq('id', item.id)
    fetchItems()
  }

  async function deleteItem(id) {
    if (!window.confirm('削除しますか？')) return
    await supabase.from('shopping_items').delete().eq('id', id)
    fetchItems()
  }

  async function saveEdit(item) {
    await supabase.from('shopping_items').update({ name: editingItem.name, category: editingItem.category }).eq('id', item.id)
    setEditingItem(null); fetchItems()
  }

  const totalUnrepaid = loans.filter(l => !l.is_repaid).reduce((sum, l) => {
    const paid = repayments[l.id]?.reduce((s, r) => s + r.amount, 0) || 0
    return sum + (l.amount - paid)
  }, 0)
  const totalRepaid = loans.reduce((sum, l) => {
    return sum + (repayments[l.id]?.reduce((s, r) => s + r.amount, 0) || 0)
  }, 0)

  const unpurchasedItems = items.filter(i => !i.is_purchased)
  const purchasedItems = items.filter(i => i.is_purchased)

  return (
    <div className="app">
      <div className="header">
        <h1>💸 夫婦管理</h1>
      </div>

      <div className="tabs">
        {TABS.map(t => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === '貸し借り' && (
        <>
          <div className="summary">
            <div className="summary-card unpaid">
              <p>未返済残額</p>
              <h2>¥{totalUnrepaid.toLocaleString()}</h2>
            </div>
            <div className="summary-card paid">
              <p>返済済み合計</p>
              <h2>¥{totalRepaid.toLocaleString()}</h2>
            </div>
          </div>

          <button className="add-btn" onClick={() => setShowLoanForm(!showLoanForm)}>
            {showLoanForm ? '✕ 閉じる' : '＋ 新規登録'}
          </button>

          {showLoanForm && (
            <div className="form">
              <input type="date" value={loanForm.date} onChange={e => setLoanForm({ ...loanForm, date: e.target.value })} />
              <input type="number" placeholder="金額" value={loanForm.amount} onChange={e => setLoanForm({ ...loanForm, amount: e.target.value })} />
              <select value={loanForm.lender} onChange={e => setLoanForm({ ...loanForm, lender: e.target.value, borrower: e.target.value === '夫' ? '妻' : '夫' })}>
                <option value="夫">夫が貸した</option>
                <option value="妻">妻が貸した</option>
              </select>
              <input type="text" placeholder="内容・メモ" value={loanForm.description} onChange={e => setLoanForm({ ...loanForm, description: e.target.value })} />
              <button onClick={addLoan}>登録する</button>
            </div>
          )}

          {loansLoading ? <p className="loading">読み込み中...</p> : (
            <div className="loans">
              {loans.length === 0 && <p className="empty">記録がありません</p>}
              {loans.map(loan => {
                const paid = repayments[loan.id]?.reduce((s, r) => s + r.amount, 0) || 0
                const remaining = loan.amount - paid
                const progress = Math.min((paid / loan.amount) * 100, 100)
                const isExpanded = expandedLoan === loan.id

                return (
                  <div key={loan.id} className={`loan-card ${loan.is_repaid ? 'repaid' : ''}`}>
                    <div className="loan-header">
                      <span className="loan-date">{loan.date}</span>
                      <span className={`status-badge ${loan.is_repaid ? 'done' : 'pending'}`}>
                        {loan.is_repaid ? '完済' : '未完済'}
                      </span>
                    </div>
                    <p className="loan-desc">{loan.description}</p>
                    <p className="loan-people">{loan.lender} → {loan.borrower}</p>

                    <div className="amount-row">
                      <span className="loan-amount">¥{loan.amount.toLocaleString()}</span>
                      {paid > 0 && <span className="paid-amount">返済済 ¥{paid.toLocaleString()}</span>}
                    </div>

                    {paid > 0 && (
                      <div className="progress-wrap">
                        <div className="progress-bar">
                          <div className="progress-fill" style={{ width: `${progress}%` }} />
                        </div>
                        <span className="progress-text">{Math.round(progress)}%</span>
                      </div>
                    )}

                    {remaining > 0 && (
                      <p className="remaining">残額 ¥{remaining.toLocaleString()}</p>
                    )}

                    <div className="loan-actions">
                      {!loan.is_repaid && (
                        <button className="repay-btn" onClick={() => setExpandedLoan(isExpanded ? null : loan.id)}>
                          {isExpanded ? '閉じる' : '部分返済'}
                        </button>
                      )}
                      <button className="history-btn" onClick={() => setExpandedLoan(isExpanded ? null : loan.id)}>
                        履歴 {repayments[loan.id]?.length || 0}件
                      </button>
                      <button className="delete-btn" onClick={() => deleteLoan(loan.id)}>削除</button>
                    </div>

                    {isExpanded && (
                      <div className="expanded">
                        {!loan.is_repaid && (
                          <div className="repay-form">
                            <p className="repay-form-title">部分返済を記録</p>
                            <input type="number" placeholder={`返済額（残 ¥${remaining.toLocaleString()}）`} value={repayForm.amount} onChange={e => setRepayForm({ ...repayForm, amount: e.target.value })} />
                            <input type="date" value={repayForm.date} onChange={e => setRepayForm({ ...repayForm, date: e.target.value })} />
                            <input type="text" placeholder="メモ（任意）" value={repayForm.note} onChange={e => setRepayForm({ ...repayForm, note: e.target.value })} />
                            <button className="repay-submit" onClick={() => addRepayment(loan)}>返済を記録</button>
                          </div>
                        )}

                        {repayments[loan.id]?.length > 0 && (
                          <div className="repay-history">
                            <p className="history-title">返済履歴</p>
                            {repayments[loan.id].map(r => (
                              <div key={r.id} className="history-item">
                                <div>
                                  <span className="history-date">{r.date}</span>
                                  {r.note && <span className="history-note"> · {r.note}</span>}
                                </div>
                                <div className="history-right">
                                  <span className="history-amount">¥{r.amount.toLocaleString()}</span>
                                  <button className="cancel-btn" onClick={() => deleteRepayment(r, loan)}>取消</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {tab === '買い出し' && (
        <>
          <button className="add-btn" onClick={() => setShowItemForm(!showItemForm)}>
            {showItemForm ? '✕ 閉じる' : '＋ 追加'}
          </button>

          {showItemForm && (
            <div className="form">
              <input type="text" placeholder="商品名" value={itemForm.name} onChange={e => setItemForm({ ...itemForm, name: e.target.value })} />
              <select value={itemForm.category} onChange={e => setItemForm({ ...itemForm, category: e.target.value })}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button onClick={addItem}>追加する</button>
            </div>
          )}

          {itemsLoading ? <p className="loading">読み込み中...</p> : (
            <>
              <h3 className="section-title">未購入 ({unpurchasedItems.length})</h3>
              <div className="loans">
                {unpurchasedItems.length === 0 && <p className="empty">未購入アイテムなし</p>}
                {unpurchasedItems.map(item => (
                  <div key={item.id} className="loan-card">
                    {editingItem?.id === item.id ? (
                      <>
                        <input type="text" value={editingItem.name} onChange={e => setEditingItem({ ...editingItem, name: e.target.value })} />
                        <select value={editingItem.category} onChange={e => setEditingItem({ ...editingItem, category: e.target.value })}>
                          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <div className="loan-actions">
                          <button onClick={() => saveEdit(item)}>保存</button>
                          <button onClick={() => setEditingItem(null)}>キャンセル</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="loan-header">
                          <span className="loan-desc">{item.name}</span>
                          <span className="category-badge">{item.category}</span>
                        </div>
                        <div className="loan-actions">
                          <button onClick={() => togglePurchased(item)}>⬜ 未購入</button>
                          <button onClick={() => setEditingItem(item)}>編集</button>
                          <button className="delete-btn" onClick={() => deleteItem(item.id)}>削除</button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>

              <h3 className="section-title">購入済み ({purchasedItems.length})</h3>
              <div className="loans">
                {purchasedItems.length === 0 && <p className="empty">購入済みアイテムなし</p>}
                {purchasedItems.map(item => (
                  <div key={item.id} className="loan-card repaid">
                    <div className="loan-header">
                      <span className="loan-desc">{item.name}</span>
                      <span className="category-badge">{item.category}</span>
                    </div>
                    <div className="loan-actions">
                      <button onClick={() => togglePurchased(item)}>✅ 購入済み</button>
                      <button className="delete-btn" onClick={() => deleteItem(item.id)}>削除</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

export default App
