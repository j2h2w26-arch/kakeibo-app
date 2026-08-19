export function parsePositiveYen(value) {
  const amount = Number(value)
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null
}

export function todayInTokyo(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)

  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

export function pointPeriodKey(frequency, now = new Date()) {
  if (frequency === 'once') return 'once'

  const date = todayInTokyo(now)
  if (frequency === 'daily') return `daily:${date}`
  if (frequency === 'monthly') return `monthly:${date.slice(0, 7)}`

  if (frequency === 'weekly') {
    const day = new Date(`${date}T00:00:00Z`)
    const weekday = day.getUTCDay() || 7
    day.setUTCDate(day.getUTCDate() + 4 - weekday)
    const weekYear = day.getUTCFullYear()
    const yearStart = new Date(Date.UTC(weekYear, 0, 1))
    const week = Math.ceil((((day - yearStart) / 86400000) + 1) / 7)
    return `weekly:${weekYear}-W${String(week).padStart(2, '0')}`
  }

  throw new Error('未対応のポイ活頻度です。')
}

export function formatYen(value) {
  return `¥${Number(value || 0).toLocaleString('ja-JP')}`
}

export function formatDate(date) {
  if (!date) return ''
  const [, month, day] = date.split('-').map(Number)
  return `${month}月${day}日`
}

export function calculateLoanSummary(loans, repaymentsByLoan) {
  let totalOutstanding = 0
  let totalRepaid = 0
  let husbandLent = 0
  let wifeLent = 0
  let openLoanCount = 0

  for (const loan of loans) {
    const paid = (repaymentsByLoan[loan.id] || []).reduce(
      (sum, repayment) => sum + Number(repayment.amount),
      0,
    )
    const outstanding = loan.is_repaid
      ? 0
      : Math.max(Number(loan.amount) - paid, 0)

    totalRepaid += paid
    totalOutstanding += outstanding
    if (outstanding > 0) openLoanCount += 1
    if (loan.lender === '夫') husbandLent += outstanding
    if (loan.lender === '妻') wifeLent += outstanding
  }

  const net = husbandLent - wifeLent
  return {
    totalOutstanding,
    totalRepaid,
    openLoanCount,
    netAmount: Math.abs(net),
    netLabel: net > 0 ? '妻から夫へ' : net < 0 ? '夫から妻へ' : '精算なし',
  }
}

export function mapRepayments(repayments) {
  return repayments.reduce((map, repayment) => {
    const loanId = repayment.loan_id
    if (!map[loanId]) map[loanId] = []
    map[loanId].push(repayment)
    return map
  }, {})
}

export function messageFromError(error) {
  const message = error?.message || '処理に失敗しました。通信状態を確認してください。'
  if (message.includes('Invalid login credentials')) {
    return 'メールアドレスまたはパスワードが違います。'
  }
  if (message.includes('Email not confirmed')) {
    return '確認メールからメールアドレスの認証を完了してください。'
  }
  if (message.includes('row-level security')) {
    return 'このアカウントには操作権限がありません。'
  }
  return message
}
