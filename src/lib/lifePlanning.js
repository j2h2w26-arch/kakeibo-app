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

export function buildGoalMap(goals, routes, milestones, taskLinks, tasks, includeArchived = false) {
  const taskById = new Map(tasks.map((task) => [task.id, task]))
  return goals
    .filter((goal) => includeArchived || !goal.is_archived)
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

export function filterGoals(goals, scope, query = '') {
  const search = query.trim().toLocaleLowerCase()
  return goals.filter((goal) => {
    const inScope = scope === 'archive' ? goal.is_archived
      : !goal.is_archived && (scope === 'achieved' ? goal.status === '達成' : goal.status !== '達成')
    return inScope && (!search || `${goal.title} ${goal.vision || ''} ${goal.category}`.toLocaleLowerCase().includes(search))
  })
}

export function monthValue(date) { return date ? date.slice(0, 7) : '' }

// An unchanged month must not overwrite a legacy day-specific deadline.
export function dateForMonth(month, original = null) {
  if (!month) return null
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month < '1900-01' || month > '9999-12') throw new Error('年月を確認してください')
  return monthValue(original) === month ? original : `${month}-01`
}

export function monthIndex(date) {
  const [year, month] = date.slice(0, 7).split('-').map(Number)
  return year * 12 + month - 1
}

export function monthAt(index) {
  return `${Math.floor(index / 12).toString().padStart(4, '0')}-${(index % 12 + 1).toString().padStart(2, '0')}`
}

export function addMonths(date, count) { return monthAt(monthIndex(date) + count) }

export function timelineBounds(items, years, today) {
  const dates = items.filter((item) => item.target_date).map((item) => monthIndex(item.target_date))
  const now = monthIndex(today)
  const start = years ? now : Math.min(now, ...dates)
  const end = Math.min(119999, years ? start + years * 12 : Math.max(now + 12, ...dates) + 1)
  return { start, end }
}

export function buildGoalGraph(goals, relations, focusId = null) {
  const ids = new Set(goals.map((goal) => goal.id))
  let edges = relations.filter((edge) => ids.has(edge.source_goal_id) && ids.has(edge.target_goal_id))
  const visible = focusId ? new Set([focusId, ...edges.filter((edge) => edge.source_goal_id === focusId || edge.target_goal_id === focusId).flatMap((edge) => [edge.source_goal_id, edge.target_goal_id])]) : ids
  const selected = goals.filter((goal) => visible.has(goal.id))
  edges = edges.filter((edge) => visible.has(edge.source_goal_id) && visible.has(edge.target_goal_id))
  const levels = new Map(selected.map((goal) => [goal.id, 1]))
  const remaining = new Set(visible)
  // Topological layers; cycles stay visible in the final layer.
  let layer = 1
  while (remaining.size) {
    const roots = [...remaining].filter((id) => !edges.some((edge) => edge.kind !== '関連' && edge.target_goal_id === id && remaining.has(edge.source_goal_id)))
    if (!roots.length) { for (const id of remaining) levels.set(id, layer); break }
    for (const id of roots) { levels.set(id, layer); remaining.delete(id) }
    layer += 1
  }
  const tasks = new Map()
  const links = []
  for (const goal of selected) for (const task of goal.linkedTasks) {
    tasks.set(task.id, task)
    links.push({ from: `task-${task.id}`, to: `goal-${goal.id}`, label: '支える' })
  }
  const nodes = [
    ...[...tasks.values()].map((task) => ({ id: `task-${task.id}`, title: task.title, type: 'todo', status: task.status, level: 0, goalId: selected.find((goal) => goal.linkedTasks.some((item) => item.id === task.id))?.id })),
    ...selected.map((goal) => ({ id: `goal-${goal.id}`, goalId: goal.id, title: goal.title, status: goal.status, type: goal.status === '検討中' ? 'decision' : 'goal', level: levels.get(goal.id) })),
  ]
  const rows = new Map()
  for (const node of nodes) {
    const row = rows.get(node.level) || 0
    node.x = 24 + node.level * 280
    node.y = 24 + row * 140
    rows.set(node.level, row + 1)
  }
  return { nodes, edges: [...links, ...edges.map((edge) => ({ from: `goal-${edge.source_goal_id}`, to: `goal-${edge.target_goal_id}`, label: edge.kind }))], width: Math.max(600, ...nodes.map((node) => node.x + 280)), height: Math.max(340, ...nodes.map((node) => node.y + 124)) }
}

export function lifeGoalCounts(goalMap) {
  return {
    active: goalMap.filter((goal) => goal.status === '進行中').length,
    considering: goalMap.filter((goal) => goal.status === '検討中').length,
    achieved: goalMap.filter((goal) => goal.status === '達成').length,
  }
}
