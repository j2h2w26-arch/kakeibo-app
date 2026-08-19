import { useMemo } from 'react'
import { DailyReminderSettings } from './DailyReminderSettings'
import { calculateLoanSummary, formatYen, pointPeriodKey, todayInTokyo } from '../lib/format'
import { todaySummary } from '../lib/daily'
import { inventoryNeedsRestock } from '../lib/inventory'

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
    description: '買い物と家の在庫を共有',
    tone: 'cyan',
  },
  {
    id: 'wishes',
    icon: '♡',
    eyebrow: 'WISH',
    title: 'Wish',
    description: 'ふたりの欲しいもの',
    tone: 'rose',
  },
  {
    id: 'points',
    icon: '★',
    eyebrow: 'POINT ACTIONS',
    title: '今日のポイ活',
    description: '散らばる獲得先をひとまとめ',
    tone: 'amber',
  },
]

export function HomeView({
  member,
  loans,
  repayments,
  items,
  inventoryItems,
  pointActivities,
  pointCompletions,
  wishes,
  notificationPreferences,
  notificationSchemaReady,
  online,
  busy,
  onSaveNotification,
  onNavigate,
}) {
  const loanSummary = useMemo(
    () => calculateLoanSummary(loans, repayments),
    [loans, repayments],
  )
  const pendingItems = items.filter((item) => !item.is_purchased).length
  const neededInventory = inventoryItems.filter(inventoryNeedsRestock).length
  const openLoans = loanSummary.openLoanCount
  const today = todayInTokyo()
  const completedPointActions = pointActivities.filter((activity) => (
    activity.is_active
    && (!activity.assigned_to || activity.assigned_to === member.user_id)
    && pointCompletions.some((completion) => (
      completion.user_id === member.user_id
      && completion.activity_id === activity.id
      && completion.period_key === pointPeriodKey(activity.frequency)
    ))
  )).length
  const summary = useMemo(() => todaySummary({
    items,
    inventoryItems,
    pointActivities,
    pointCompletions,
    wishes,
    memberId: member.user_id,
    today,
  }), [items, inventoryItems, member.user_id, pointActivities, pointCompletions, today, wishes])

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
          <span>在庫不足</span>
          <strong>{neededInventory}<small>件</small></strong>
        </article>
      </div>

      <section className="today-summary" aria-labelledby="today-summary-title">
        <div className="today-summary-heading">
          <div>
            <p className="eyebrow">TODAY</p>
            <h3 id="today-summary-title">今日のまとめ</h3>
          </div>
          <span>開けば最新</span>
        </div>
        <div className="today-summary-grid">
          <button type="button" onClick={() => onNavigate('shopping')}>
            <span>買うもの</span><strong>{summary.shopping}</strong><small>件</small>
          </button>
          <button type="button" onClick={() => onNavigate('shopping')}>
            <span>期限間近</span><strong>{summary.expiring}</strong><small>件</small>
          </button>
          <button type="button" onClick={() => onNavigate('points')}>
            <span>ポイ活Todo</span><strong>{summary.points}</strong><small>件</small>
          </button>
          <button type="button" onClick={() => onNavigate('wishes')}>
            <span>30日以内のWish</span><strong>{summary.wishPlans}</strong><small>件</small>
          </button>
        </div>
      </section>

      {notificationSchemaReady && (
        <DailyReminderSettings
          key={notificationPreferences?.updated_at || 'notification-default'}
          preferences={notificationPreferences}
          online={online}
          busy={busy}
          onSave={onSaveNotification}
        />
      )}

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
            {module.id === 'shopping' && neededInventory > 0
              ? <em>{neededInventory} 要確認</em>
              : module.id === 'points' && pointActivities.some((activity) => (
              activity.is_active && (!activity.assigned_to || activity.assigned_to === member.user_id)
            ))
              ? <em>{completedPointActions} DONE</em>
              : <i aria-hidden="true">›</i>}
          </button>
        ))}
      </div>
    </section>
  )
}
