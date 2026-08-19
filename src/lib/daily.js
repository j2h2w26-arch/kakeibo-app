import { normalizeShoppingName } from './shopping.js'
import { pointPeriodKey } from './format.js'

const DAY_MS = 24 * 60 * 60 * 1000

export function frequentShoppingItems(items, limit = 6) {
  const pending = new Set(
    items.filter((item) => !item.is_purchased).map((item) => normalizeShoppingName(item.name)),
  )
  const history = new Map()

  for (const item of items) {
    if (!item.is_purchased) continue
    const key = normalizeShoppingName(item.name)
    if (!key || pending.has(key)) continue
    const current = history.get(key) || { ...item, name: item.name.trim(), count: 0, latest: '' }
    current.count += 1
    if ((item.purchased_at || item.created_at || '') > current.latest) {
      current.name = item.name.trim()
      current.category = item.category
      current.latest = item.purchased_at || item.created_at || ''
    }
    history.set(key, current)
  }

  return [...history.values()]
    .sort((left, right) => right.count - left.count || right.latest.localeCompare(left.latest))
    .slice(0, limit)
}

export function daysUntil(date, today) {
  if (!date || !today) return null
  const target = new Date(`${date}T00:00:00Z`)
  const start = new Date(`${today}T00:00:00Z`)
  if (Number.isNaN(target.getTime()) || Number.isNaN(start.getTime())) return null
  return Math.round((target - start) / DAY_MS)
}

export function expiringInventory(items, today, withinDays = 7) {
  return items
    .map((item) => ({ ...item, daysLeft: daysUntil(item.expires_on, today) }))
    .filter((item) => item.daysLeft !== null && item.daysLeft <= withinDays)
    .sort((left, right) => left.daysLeft - right.daysLeft)
}

export function reminderPeriod(now, preferences) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const currentMinutes = Number(values.hour) * 60 + Number(values.minute)

  for (const period of ['evening', 'morning']) {
    if (!preferences?.[`${period}_enabled`]) continue
    const [hour, minute] = String(preferences[`${period}_time`] || '').slice(0, 5).split(':').map(Number)
    const start = hour * 60 + minute
    if (Number.isFinite(start) && currentMinutes >= start) return period
  }
  return null
}

export function todaySummary({ items, inventoryItems, pointActivities, pointCompletions, wishes, memberId, today }) {
  const currentPeriodDate = new Date(`${today}T12:00:00+09:00`)
  const shopping = items.filter((item) => !item.is_purchased).length
  const expiring = expiringInventory(inventoryItems, today).length
  const points = pointActivities.filter((activity) => (
    activity.is_active
    && (!activity.assigned_to || activity.assigned_to === memberId)
    && !pointCompletions.some((completion) => (
      completion.activity_id === activity.id
      && completion.user_id === memberId
      && completion.period_key === pointPeriodKey(activity.frequency, currentPeriodDate)
    ))
  )).length
  const wishPlans = wishes.filter((wish) => (
    !wish.is_completed
    && wish.consultation_status !== '見送り'
    && daysUntil(wish.candidate_date, today) !== null
    && daysUntil(wish.candidate_date, today) <= 30
  )).length

  return { shopping, expiring, points, wishPlans }
}
