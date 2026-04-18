import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import './App.css'

function App() {
  const [loans, setLoans] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    date: '',
    amount: '',
    lender: '夫',
    borrower: '妻',
    description: '',
  })

  useEffect(() => {
    fetchLoans()
  }, [])

  async function fetchLoans() {
    setLoading(true)
    const { data, error } = await supabase
      .from('loans')
      .select('*')
      .order('date', { ascending: false })
    if (!error) setLoans(data)
    setLoading(false)
  }

  async function addLoan() {
    if (!form.date || !form.amount || !form.description) return
const formattedDate = form.date.replace(/\//g, '-')
    const { error } = await supabase.from('loans').insert([{
      date: formattedDate,
      amount: parseInt(form.amount),
      lender: form.lender,
      borrower: form.borrower,
      description: form.description,
      is_repaid: false,
      repaid_at: null,
    }])
    if (!error) {
      setForm({ date: '', amount: '', lender: '夫', borrower: '妻', description: '' })
      setShowForm(false)
      fetchLoans()
    }
  }

  async function toggleRepaid(loan) {
    const now = new Date().toISOString().split('T')[0]
    const { error } = await supabase
      .from('loans')
      .update({
        is_repaid: !loan.is_repaid,
        repaid_at: !loan.is_repaid ? now : null,
      })
      .eq('id', loan.id)
    if (!error) fetchLoans()
  }

  async function deleteLoan(id) {
    if (!window.confirm('削除しますか？')) return
    const { error } = await supabase.from('loans').delete().eq('id', id)
    if (!error) fetchLoans()
  }

  const totalUnrepaid = loans
    .filter(l => !l.is_repaid)
    .reduce((sum, l) => sum + l.amount, 0)

  const totalRepaid = loans
    .filter(l => l.is_repaid)
    .reduce((sum, l) => sum + l.amount, 0)

  return (
    <div className="app">
      <h1>💰 貸し借り管理</h1>

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

      <button className="add-btn" onClick={() => setShowForm(!showForm)}>
        {showForm ? '✕ 閉じる' : '＋ 新しく追加'}
      </button>

      {showForm && (
        <div className="form">
          <input
            type="date"
            value={form.date}
            onChange={e => setForm({ ...form, date: e.target.value })}
          />
          <input
            type="number"
            placeholder="金額"
            value={form.amount}
            onChange={e => setForm({ ...form, amount: e.target.value })}
          />
          <select
            value={form.lender}
            onChange={e => setForm({ ...form, lender: e.target.value })}
          >
            <option value="夫">夫が貸した</option>
            <option value="妻">妻が貸した</option>
          </select>
          <input
            type="text"
            placeholder="内容・メモ"
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
          />
          <button onClick={addLoan}>追加する</button>
        </div>
      )}

      {loading ? (
        <p>読み込み中...</p>
      ) : (
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
              {loan.is_repaid && loan.repaid_at && (
                <p className="repaid-date">返済日：{loan.repaid_at}</p>
              )}
              <div className="loan-actions">
                <button onClick={() => toggleRepaid(loan)}>
                  {loan.is_repaid ? '✅ 返済済み' : '⬜ 未返済'}
                </button>
                <button className="delete-btn" onClick={() => deleteLoan(loan.id)}>削除</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default App
