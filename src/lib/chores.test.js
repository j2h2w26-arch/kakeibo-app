import assert from 'node:assert/strict'
import test from 'node:test'
import {
  choreCounts,
  choreDueState,
  choreScheduleLabel,
  filterManagedChores,
  nextChoreDueOn,
  sortChores,
} from './chores.js'

test('家事の周期を日本語で表示する', () => {
  assert.equal(choreScheduleLabel({ schedule_type: 'interval', interval_value: 3, interval_unit: 'months' }), '3か月ごと')
  assert.equal(choreScheduleLabel({ schedule_type: 'weekly', weekday: 6 }), '毎週土曜日')
  assert.equal(choreScheduleLabel({ schedule_type: 'monthly', day_of_month: 15 }), '毎月15日')
  assert.equal(choreScheduleLabel({ schedule_type: 'yearly', month_of_year: 9, day_of_month: 1 }), '毎年9月1日')
  assert.equal(choreScheduleLabel({ schedule_type: 'once' }), '一度だけ')
})

test('完了日基準の次回期限を月末と閏年で補正する', () => {
  assert.equal(nextChoreDueOn({ schedule_type: 'interval', interval_value: 1, interval_unit: 'months' }, '2026-01-31'), '2026-02-28')
  assert.equal(nextChoreDueOn({ schedule_type: 'yearly', month_of_year: 2, day_of_month: 29 }, '2027-02-28'), '2028-02-29')
})

test('曜日固定は同じ曜日に完了した場合7日後にする', () => {
  assert.equal(nextChoreDueOn({ schedule_type: 'weekly', weekday: 6 }, '2026-09-19'), '2026-09-26')
})

test('日付固定は今回より後の最初の月日を返す', () => {
  assert.equal(nextChoreDueOn({ schedule_type: 'monthly', day_of_month: 25 }, '2026-09-19'), '2026-09-25')
  assert.equal(nextChoreDueOn({ schedule_type: 'monthly', day_of_month: 10 }, '2026-09-19'), '2026-10-10')
  assert.equal(nextChoreDueOn({ schedule_type: 'yearly', month_of_year: 12, day_of_month: 1 }, '2026-09-19'), '2026-12-01')
  assert.equal(nextChoreDueOn({ schedule_type: 'yearly', month_of_year: 8, day_of_month: 1 }, '2026-09-19'), '2027-08-01')
})

test('期限超過・今日・今週の件数を分ける', () => {
  const chores = [
    { title: 'A', is_active: true, next_due_on: '2026-09-18' },
    { title: 'B', is_active: true, next_due_on: '2026-09-19' },
    { title: 'C', is_active: true, next_due_on: '2026-09-23' },
    { title: 'D', is_active: false, next_due_on: '2026-09-17' },
  ]
  assert.deepEqual(choreDueState(chores[0], '2026-09-19'), { kind: 'overdue', label: '1日超過', days: -1 })
  assert.deepEqual(choreCounts(chores, '2026-09-19'), { overdue: 1, today: 1, week: 1, active: 3, inactive: 1 })
  assert.deepEqual(sortChores(chores, '2026-09-19').map((chore) => chore.title), ['A', 'B', 'C'])
})

test('未完了の家事は翌日も同じ項目が期限超過として残る', () => {
  const chore = { title: 'フィルター掃除', is_active: true, next_due_on: '2026-09-19' }
  assert.deepEqual(choreDueState(chore, '2026-09-20'), { kind: 'overdue', label: '1日超過', days: -1 })
})

test('管理する家事をキーワード・カテゴリ・状態で絞り込む', () => {
  const appliancesById = new Map([
    [1, { manufacturer: 'Panasonic', name: 'エアコン', model_number: 'CS-255DFL-W' }],
  ])
  const chores = [
    { id: 1, title: 'フィルターを掃除', category: '家電', assigned_to: 'ふたり', appliance_id: 1, is_active: true },
    { id: 2, title: '排水口を掃除', category: '浴室・洗面', assigned_to: '夫', appliance_id: null, is_active: true },
    { id: 3, title: '古い家事', category: '家電', assigned_to: '妻', appliance_id: null, is_active: false },
  ]

  assert.deepEqual(filterManagedChores(chores, { query: 'CS-255', appliancesById }).map(({ id }) => id), [1])
  assert.deepEqual(filterManagedChores(chores, { category: '浴室・洗面', appliancesById }).map(({ id }) => id), [2])
  assert.deepEqual(filterManagedChores(chores, { status: 'inactive', appliancesById }).map(({ id }) => id), [3])
})
