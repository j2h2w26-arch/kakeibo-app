import { useEffect } from 'react'
import { reminderPeriod, todaySummary } from '../lib/daily'
import { todayInTokyo } from '../lib/format'

function reminderMessage(summary) {
  const parts = [
    summary.shopping ? `買うもの${summary.shopping}件` : null,
    summary.expiring ? `期限間近${summary.expiring}件` : null,
    summary.points ? `ポイ活${summary.points}件` : null,
    summary.wishPlans ? `Wish予定${summary.wishPlans}件` : null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join('・') : '今日の共有Todoはありません。'
}

export function useDailyReminder({ memberId, preferences, snapshot, onReminder }) {
  useEffect(() => {
    if (!memberId || !preferences || !snapshot.notificationSchemaReady) return undefined
    const now = new Date()
    const period = reminderPeriod(now, preferences)
    if (!period) return undefined

    const today = todayInTokyo(now)
    const key = `futari-home-reminder-v1:${memberId}:${today}:${period}`
    if (localStorage.getItem(key)) return undefined

    const summary = todaySummary({
      items: snapshot.items,
      inventoryItems: snapshot.inventoryItems,
      pointActivities: snapshot.pointActivities,
      pointCompletions: snapshot.pointCompletions,
      wishes: snapshot.wishes,
      memberId,
      today,
    })
    const title = period === 'morning' ? 'おはよう。今日のまとめ' : 'おつかれさま。夕方のまとめ'
    const body = reminderMessage(summary)
    onReminder?.(`${title}：${body}`)

    if ('Notification' in window && Notification.permission === 'granted') {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready
          .then((registration) => registration.showNotification(title, { body, tag: key }))
          .catch(() => new Notification(title, { body, tag: key }))
      } else {
        new Notification(title, { body, tag: key })
      }
    }
    localStorage.setItem(key, 'shown')
    return undefined
  }, [memberId, onReminder, preferences, snapshot])
}
