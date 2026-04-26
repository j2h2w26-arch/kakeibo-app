import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import './App.css'

const TABS = ['貸し借り', '買い出し']
const CATEGORIES = ['食材', '日用品', 'その他']

function App() {
  const [tab, setTab] = useState('貸し借り')

  // 貸し借り
  const [loans, setLoans] = useState([])
  const [loansLoading, setLoansLoading] = useState(true)
  const [showLoanForm, setShowLoanForm] = useState(false)
  const [loanForm, setLoanForm] = useState({
    date: '', amount: '', lender: '夫', borrower: '妻', description: ''
  })

  // 買い出し
  const [items, setItems] = useState([])
  const [itemsLoading, setItemsLoading] = useState(true)
  const [showItemForm, setShowItemForm] = useState(false)
  const [itemForm, setItemForm] = useState({ name: '', category: '食材' })
  const [editingItem, setEditingItem] = useState(null)

  useEffect(() => { fetchLoans() }, [])
  useEffect(() => { if (tab === '買い出し') fetchItems() }, [tab])

  // 貸し借り関数
  async function fetchLoans() {
    setLoansLoading(true)
    const { data, error } = await supabase.from('loans').select('*').order('date', { ascending: false })
    if (!error) setLoans(data)
    setLoansLoading(false)
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
    if (error) { alert('エラー: ' + error.message) }
    else {
      setLoanForm({ date: '', amount: '', lender: '夫', borrower: '妻', description: '' })
      setShowLoanForm(false)
      fetchLoans()
    }
  }

  async function toggleRepaid(loan) {
    const now = new Date().toISOString().split('T')[0]
    const { error } = await supabase.from('loans').update({
      is_repaid: !loan.is_repaid,
      repaid_at: !loan.is_repaid ? now : null,
    }).eq('id', loan.id)
    if (!error) fetchLoans()
  }

  async function deleteLoan(id) {
    if (!window.confirm('削除しますか？')) return
    const { error } = await supabase.from('loans').delete().eq('id', id)
    if (!error) fetchLoans()
  }

  // 買い出し関数
  async function fetchItems() {
    setItemsLoading(true)
    const { data, error } = await supabase.from('shopping_items').select('*').order('created_at', { ascending: false })
    if (!error) setItems(data)
    setItemsLoading(false)
  }

  async function addItem() {
    if (!itemForm.name) return
    const { error } = await supabase.from('shopping_items').insert([{
      name: itemForm.name,
      category: itemForm.category,
      is_purchased: false,
    }])
    if (error) { alert('エラー: ' + error.message) }
    else {
      setItemForm({ name: '', category: '食材' })
      setShowItemForm(false)
      fetchItems()
    }
  }

  async function togglePurchased(item) {
    const now = new Date().toISOString().split('T')[0]
    const { error } = await supabase.from('shopping_items').update({
      is_purchased: !item.is_purchased,
      purchased_at: !item.is_purchased ? now : null,
    }).eq('id', item.id)
    if (!error) fetchItems()
  }

  async function deleteItem(id) {
    if (!window.confirm('削除しますか？')) return
    const { error } = await supabase.from('shopping_items').delete().eq('id', id)
    if (!error) fetchItems()
  }

  async function saveEdit(item) {
    const { error } = await supabase.from('shopping_items').update({
      name: editingItem.name,
      category: editingItem.category,
    }).eq('id', item.id)
    if (!error) { setEditingItem(null); fetchItems() }
  }

  const totalUnrepaid = loans.filter(l => !l.is_repaid).reduce((sum, l) => sum + l.amount, 0)
  const totalRepaid = loans.filter(l => l.is_repaid).reduce((sum, l) => sum + l.amount, 0)
  const unpurchasedItems = items.filter(i => !i.is_purchased)
  const purchasedItems = items.filter(i => i.is_purchased)

  return (
    <div className="app">
      <h1>💰 家族アプリ</h1>

      <div className="tabs">
        {TABS.map(t => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === '貸し借り' && (
        <>
          <div className="summary">
            <div className="summary-card unpaid">
              <p>未返済合計</p>
              <h2>¥{totalUnrepaid.toLocaleString()}</h2>
            </div>
            <div className="summary-card paid">
              <p>返済済み合計</p>
              <h2>¥{totalRepaid.toLocaleString()}</h2>
            </div>
          </div>

          <button className="add-btn" onClick={() => setShowLoanForm(!showLoanForm)}>
            {showLoanForm ? '✕ 閉じる' : '＋ 新しく追加'}
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
              <button onClick={addLoan}>追加する</button>
            </div>
          )}

          {loansLoading ? <p>読み込み中...</p> : (
            <div className="loans">
              {loans.length === 0 && <p>記録がありません</p>}
              {loans.map(loan => (
                <div key={loan.id} className={`loan-card ${loan.is_repaid ? 'repaid' : ''}`}>
                  <div className="loan-header">
                    <span className="loan-date">{loan.date}</span>
                    <span className="loan-amount">¥{loan.amount.toLocaleString()}</span>
                  </div>
                  <p className="loan-desc">{loan.description}</p>
                  <p className="loan-people">{loan.lender} → {loan.borrower}</p>
                  {loan.is_repaid && loan.repaid_at && <p className="repaid-date">返済日：{loan.repaid_at}</p>}
                  <div className="loan-actions">
                    <button onClick={() => toggleRepaid(loan)}>{loan.is_repaid ? '✅ 返済済み' : '⬜ 未返済'}</button>
                    <button className="delete-btn" onClick={() => deleteLoan(loan.id)}>削除</button>
                  </div>
                </div>
              ))}
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

          {itemsLoading ? <p>読み込み中...</p> : (
            <>
              <h3 className="section-title">未購入 ({unpurchasedItems.length})</h3>
              <div className="loans">
                {unpurchasedItems.length === 0 && <p>未購入アイテムなし</p>}
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
                {purchasedItems.length === 0 && <p>購入済みアイテムなし</p>}
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
