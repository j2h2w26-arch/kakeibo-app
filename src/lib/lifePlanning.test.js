import test from 'node:test'
import assert from 'node:assert/strict'
import { addMonths, buildGoalGraph, buildGoalMap, dateForMonth, filterGoals, goalProgress, lifeGoalCounts, monthAt, monthIndex, timelineBounds } from './lifePlanning.js'

const goals = [
  { id: 2, title: 'いつかの目標', status: '検討中', target_date: null, is_archived: false },
  { id: 1, title: '進める目標', status: '進行中', target_date: '2027-01-01', is_archived: false },
  { id: 3, title: '保存済み', status: '達成', target_date: null, is_archived: true },
]

test('保存・達成・アーカイブを分け、復元した目標を再表示できる', () => {
  const map = buildGoalMap(goals, [], [], [], [], true)
  assert.equal(map.length, 3)
  assert.deepEqual(filterGoals(map, 'archive').map((goal) => goal.id), [3])
  assert.deepEqual(filterGoals(map, 'active').map((goal) => goal.id), [1, 2])
  const restored = map.map((goal) => goal.id === 3 ? { ...goal, is_archived: false } : goal)
  assert.deepEqual(filterGoals(restored, 'achieved').map((goal) => goal.id), [3])
  assert.equal(filterGoals(restored, 'archive').length, 0)
  assert.equal(filterGoals(map, 'active', '  進める  ')[0].id, 1)
})

test('年月の変更がなければ既存の日付精度を保持し、未定と不正月を区別する', () => {
  assert.equal(dateForMonth('2028-02', '2028-02-29'), '2028-02-29')
  assert.equal(dateForMonth('2028-03', '2028-02-29'), '2028-03-01')
  assert.equal(dateForMonth('', '2028-02-29'), null)
  for (const invalid of ['2028-13', '2028-00', '0028-01', '2028-2', 'a']) assert.throws(() => dateForMonth(invalid))
})

test('20年先・年越し・全期間に過去と長期目標を含める', () => {
  assert.equal(addMonths('2026-12-31', 3), '2027-03')
  assert.equal(addMonths('2026-09-20', 240), '2046-09')
  assert.equal(monthAt(monthIndex('2046-09')), '2046-09')
  const range = timelineBounds([{ target_date: '2020-01-01' }, { target_date: '2070-12-01' }, { target_date: null }], null, '2026-09-20')
  assert.equal(monthAt(range.start), '2020-01')
  assert.equal(monthAt(range.end), '2071-01')
  assert.equal(timelineBounds([], 20, '2026-09-20').end - monthIndex('2026-09'), 240)
})

test('共通ToDoは1つの箱から複数目標へつながり、前提を左に並べる', () => {
  const task = { id: 10, title: '英語面接', status: '進行中' }
  const nodes = [1, 2, 3].map((id) => ({ id, title: `目標${id}`, status: '進行中', linkedTasks: id === 3 ? [] : [task] }))
  const graph = buildGoalGraph(nodes, [{ source_goal_id: 1, target_goal_id: 3, kind: '前提' }, { source_goal_id: 2, target_goal_id: 3, kind: '支える' }])
  assert.equal(graph.nodes.filter((node) => node.type === 'todo').length, 1)
  assert.equal(graph.edges.filter((edge) => edge.from === 'task-10').length, 2)
  assert.ok(graph.nodes.find((node) => node.id === 'goal-1').x < graph.nodes.find((node) => node.id === 'goal-3').x)
})

test('循環した目標や見えない関連先があっても描画を停止しない', () => {
  const nodes = [1, 2, 3].map((id) => ({ id, title: `目標${id}`, status: '検討中', linkedTasks: [] }))
  const relations = [{ source_goal_id: 1, target_goal_id: 2, kind: '前提' }, { source_goal_id: 2, target_goal_id: 1, kind: '前提' }, { source_goal_id: 1, target_goal_id: 99, kind: '関連' }]
  const graph = buildGoalGraph(nodes, relations, 1)
  assert.deepEqual(graph.nodes.map((node) => node.goalId), [1, 2])
  assert.equal(graph.edges.length, 2)
  assert.ok(graph.nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y)))
})

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
