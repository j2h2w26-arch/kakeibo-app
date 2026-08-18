import { useMemo } from 'react'
import { calculateLoanSummary, formatYen } from '../lib/format'

const MODULES = [
  {
    id: 'money',
    icon: '¥',
    eyebrow: 'MONEY',
    title: 'お金',
    description: '貸し借りと精算状況',
    tone: 'violet',
  },
  {
    id: 'shopping',
    icon: '✓',
    eyebrow: 'SHOPPING',
    title: '買い物',
    description: '買い出しメモを共有',
    tone: 'cyan',
  },
  {
    id: 'wishes',
    icon: '♡',
    eyebrow: 'WISH',
    title: 'Wish',
    description: 'ふたりの欲しいもの',
    tone: 'rose',
    upcoming: true,
  },
  {
    id: 'points',
    icon: '★',
    eyebrow: 'POINT ACTIONS',
    title: '今日のポイ活',
    description: '散らばる獲得先をひとまとめ',
    tone: 'amber',
    upcoming: true,
  },
]

export function HomeView({ member, loans, repayments, items, onNavigate }) {
  const loanSummary = useMemo(
    () => calculateLoanSummary(loans, repayments),
    [loans, repayments],
  )
  const pendingItems = items.filter((item) => !item.is_purchased).length
  const openLoans = loanSummary.openLoans.length

  return (
    <section className="view home-view" aria-labelledby="home-title">
      <div className="home-greeting">
        <p className="eyebrow">FUTARI HOME</p>
        <h2 id="home-title">おかえりなさい、{member.display_name}</h2>
        <p>ふたりの暮らしを、ここからひとつずつ。</p>
      </div>

      <div className="home-hero">
        <div>
          <span className="home-hero-label">いま精算するなら</span>
          <strong>{loanSummary.netLabel}</strong>
        </div>
        <b>{formatYen(loanSummary.netAmount)}</b>
        <button type="button" onClick={() => onNavigate('money')}>お金を見る</button>
      </div>

      <div className="home-stats" aria-label="今日の共有状況">
        <article>
          <span>未完済</span>
          <strong>{openLoans}<small>件</small></strong>
        </article>
        <article>
          <span>買うもの</span>
          <strong>{pendingItems}<small>件</small></strong>
        </article>
        <article>
          <span>Wish</span>
          <strong className="status-copy">準備中</strong>
        </article>
      </div>

      <div className="home-section-heading">
        <div>
          <p className="eyebrow">OUR LIFE</p>
          <h3>ふたりのメニュー</h3>
        </div>
        <span>リアルタイム共有</span>
      </div>

      <div className="module-grid">
        {MODULES.map((module) => (
          <button
            className={`module-card ${module.tone}`}
            type="button"
            key={module.id}
            onClick={() => onNavigate(module.id)}
          >
            <span className="module-icon" aria-hidden="true">{module.icon}</span>
            <span className="module-copy">
              <small>{module.eyebrow}</small>
              <strong>{module.title}</strong>
              <span>{module.description}</span>
            </span>
            {module.upcoming ? <em>COMING</em> : <i aria-hidden="true">›</i>}
          </button>
        ))}
      </div>
    </section>
  )
}
