import assert from 'node:assert/strict'
import test from 'node:test'
import {
  daysUntil,
  expiringInventory,
  frequentShoppingItems,
  reminderPeriod,
  todaySummary,
} from './daily.js'

test('購入履歴から頻度順の定番品を作り、未購入品は除く', () => {
  const items = [
    { name: '卵', category: '食材', is_purchased: true, purchased_at: '2026-08-10' },
    { name: ' 卵 ', category: '食材', is_purchased: true, purchased_at: '2026-08-12' },
    { name: '豆腐', category: '食材', is_purchased: true, purchased_at: '2026-08-11' },
    { name: '豆腐', category: '食材', is_purchased: false },
  ]
  assert.deepEqual(frequentShoppingItems(items), [{
    name: '卵',
    category: '食材',
    is_purchased: true,
    purchased_at: '2026-08-10',
    count: 2,
    latest: '2026-08-12',
  }])
})

test('期限までの日数と期限間近在庫を計算する', () => {
  assert.equal(daysUntil('2026-08-21', '2026-08-19'), 2)
  assert.deepEqual(
    expiringInventory([
      { name: '卵', expires_on: '2026-08-20' },
      { name: '米', expires_on: null },
      { name: '洗剤', expires_on: '2026-09-20' },
    ], '2026-08-19'),
    [{ name: '卵', expires_on: '2026-08-20', daysLeft: 1 }],
  )
})

test('設定時刻を過ぎた通知枠を夕方優先で返す', () => {
  const preferences = {
    morning_enabled: true,
    morning_time: '08:00:00',
    evening_enabled: true,
    evening_time: '19:00:00',
  }
  assert.equal(reminderPeriod(new Date('2026-08-18T23:30:00Z'), preferences), 'morning')
  assert.equal(reminderPeriod(new Date('2026-08-19T10:30:00Z'), preferences), 'evening')
})

test('今日のまとめは現在期間の未完了ポイ活だけを数える', () => {
  const summary = todaySummary({
    items: [{ is_purchased: false }, { is_purchased: true }],
    inventoryItems: [{ expires_on: '2026-08-20' }],
    pointActivities: [
      { id: 1, is_active: true, assigned_to: null, frequency: 'daily' },
      { id: 2, is_active: true, assigned_to: 'member-1', frequency: 'once' },
    ],
    pointCompletions: [
      { activity_id: 1, user_id: 'member-1', period_key: 'daily:2026-08-18' },
      { activity_id: 2, user_id: 'member-1', period_key: 'once' },
    ],
    wishes: [{ is_completed: false, consultation_status: '決定', candidate_date: '2026-08-25' }],
    memberId: 'member-1',
    today: '2026-08-19',
  })

  assert.deepEqual(summary, { shopping: 1, expiring: 1, points: 1, wishPlans: 1 })
})
