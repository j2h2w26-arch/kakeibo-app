const STATUS_ORDER = new Map([
  ['進行中', 0],
  ['検討中', 1],
  ['保留', 2],
  ['達成', 3],
])

export function goalProgress(goal, milestones = [], linkedTasks = []) {
  const items = [
    ...milestones.map((item) => item.status === '完了'),
    ...linkedTasks.map((item) => item.status === '完了'),
  ]
  if (items.length === 0) return goal.status === '達成' ? 100 : 0
  return Math.round((items.filter(Boolean).length / items.length) * 100)
}

export function buildGoalMap(goals, routes, milestones, taskLinks, tasks) {
  const taskById = new Map(tasks.map((task) => [task.id, task]))
  return goals
    .filter((goal) => !goal.is_archived)
    .map((goal) => {
      const goalRoutes = routes
        .filter((route) => route.goal_id === goal.id)
        .sort((left, right) => left.sort_order - right.sort_order || left.id - right.id)
      const goalMilestones = milestones
        .filter((milestone) => milestone.goal_id === goal.id)
        .sort((left, right) => left.sort_order - right.sort_order
          || (left.target_date || '9999-12-31').localeCompare(right.target_date || '9999-12-31')
          || left.id - right.id)
      const linkedTasks = taskLinks
        .filter((link) => link.goal_id === goal.id)
        .map((link) => taskById.get(link.task_id))
        .filter(Boolean)

      return {
        ...goal,
        routes: goalRoutes,
        milestones: goalMilestones,
        linkedTasks,
        progress: goalProgress(goal, goalMilestones, linkedTasks),
      }
    })
    .sort((left, right) => (STATUS_ORDER.get(left.status) ?? 9) - (STATUS_ORDER.get(right.status) ?? 9)
      || (left.target_date || '9999-12-31').localeCompare(right.target_date || '9999-12-31')
      || left.id - right.id)
}

export function lifeGoalCounts(goalMap) {
  return {
    active: goalMap.filter((goal) => goal.status === '進行中').length,
    considering: goalMap.filter((goal) => goal.status === '検討中').length,
    achieved: goalMap.filter((goal) => goal.status === '達成').length,
  }
}
