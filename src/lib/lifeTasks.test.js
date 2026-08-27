import test from 'node:test'
import assert from 'node:assert/strict'
import { filterLifeTasks, lifeTaskCounts, sortLifeTasks } from './lifeTasks.js'

const TASKS = [
  { id: 1, title: '生命保険に入る', task_type: 'todo', assigned_to: 'ふたり', priority: '高', status: '進行中', target_date: '2026-09-30', created_at: '2026-08-01' },
  { id: 2, title: '資格を取る', task_type: 'goal', assigned_to: '夫', priority: '中', status: '未着手', target_date: null, created_at: '2026-08-02' },
  { id: 3, title: '手続き完了', task_type: 'todo', assigned_to: '妻', priority: '低', status: '完了', target_date: '2026-08-10', created_at: '2026-08-03' },
]

test('人生Todoを進捗・担当・種類で絞り込む', () => {
  assert.deepEqual(filterLifeTasks(TASKS, 'open', 'ふたり', 'todo').map((task) => task.id), [1])
  assert.deepEqual(filterLifeTasks(TASKS, 'done', 'all', 'all').map((task) => task.id), [3])
})

test('進行中と高優先度を先に並べる', () => {
  assert.deepEqual(sortLifeTasks(TASKS).map((task) => task.id), [1, 2, 3])
})

test('人生Todoの共有状況を集計する', () => {
  assert.deepEqual(lifeTaskCounts(TASKS), {
    all: 3,
    open: 2,
    inProgress: 1,
    done: 1,
    夫: 1,
    妻: 1,
    ふたり: 1,
  })
})
