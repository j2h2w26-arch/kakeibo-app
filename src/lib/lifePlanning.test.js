import test from 'node:test'
import assert from 'node:assert/strict'
import { buildGoalMap, goalProgress, lifeGoalCounts } from './lifePlanning.js'

const goals = [
  { id: 2, title: 'いつかの目標', status: '検討中', target_date: null, is_archived: false },
  { id: 1, title: '進める目標', status: '進行中', target_date: '2027-01-01', is_archived: false },
  { id: 3, title: '保存済み', status: '達成', target_date: null, is_archived: true },
]

test('目標にルート・道標・共通Todoをまとめて進捗順に並べる', () => {
  const result = buildGoalMap(
    goals,
    [{ id: 1, goal_id: 1, title: 'ルート', sort_order: 0 }],
    [
      { id: 2, goal_id: 1, title: '後', status: '未着手', sort_order: 2, target_date: null },
      { id: 1, goal_id: 1, title: '先', status: '完了', sort_order: 1, target_date: null },
    ],
    [{ goal_id: 1, task_id: 10 }],
    [{ id: 10, title: '共通Todo', status: '完了' }],
  )

  assert.deepEqual(result.map((goal) => goal.id), [1, 2])
  assert.deepEqual(result[0].milestones.map((item) => item.id), [1, 2])
  assert.equal(result[0].linkedTasks[0].title, '共通Todo')
  assert.equal(result[0].progress, 67)
})

test('項目がない達成済み目標は100%とする', () => {
  assert.equal(goalProgress({ status: '達成' }), 100)
  assert.equal(goalProgress({ status: '進行中' }), 0)
})

test('目標の状態別件数を集計する', () => {
  assert.deepEqual(lifeGoalCounts([
    { status: '進行中' },
    { status: '検討中' },
    { status: '達成' },
    { status: '保留' },
  ]), { active: 1, considering: 1, achieved: 1 })
})
