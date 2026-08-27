const PRIORITY_ORDER = { 高: 0, 中: 1, 低: 2 }
const STATUS_ORDER = { 進行中: 0, 未着手: 1, 完了: 2 }

export function filterLifeTasks(tasks, statusFilter = 'open', ownerFilter = 'all', typeFilter = 'all') {
  return tasks.filter((task) => {
    const statusMatches = statusFilter === 'all'
      || (statusFilter === 'open' && task.status !== '完了')
      || (statusFilter === 'done' && task.status === '完了')
    const ownerMatches = ownerFilter === 'all' || task.assigned_to === ownerFilter
    const typeMatches = typeFilter === 'all' || task.task_type === typeFilter
    return statusMatches && ownerMatches && typeMatches
  })
}

export function sortLifeTasks(tasks) {
  return [...tasks].sort((left, right) => {
    const statusDifference = (STATUS_ORDER[left.status] ?? 9) - (STATUS_ORDER[right.status] ?? 9)
    if (statusDifference !== 0) return statusDifference

    const priorityDifference = (PRIORITY_ORDER[left.priority] ?? 9) - (PRIORITY_ORDER[right.priority] ?? 9)
    if (priorityDifference !== 0) return priorityDifference

    if (left.target_date && right.target_date) return left.target_date.localeCompare(right.target_date)
    if (left.target_date) return -1
    if (right.target_date) return 1
    return String(right.created_at || '').localeCompare(String(left.created_at || ''))
  })
}

export function lifeTaskCounts(tasks) {
  return tasks.reduce((counts, task) => {
    counts.all += 1
    counts[task.assigned_to] = (counts[task.assigned_to] || 0) + 1
    if (task.status === '完了') counts.done += 1
    else counts.open += 1
    if (task.status === '進行中') counts.inProgress += 1
    return counts
  }, { all: 0, open: 0, inProgress: 0, done: 0, 夫: 0, 妻: 0, ふたり: 0 })
}
