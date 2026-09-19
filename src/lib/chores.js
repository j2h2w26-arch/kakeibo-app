const DAY_MS = 24 * 60 * 60 * 1000

const UNIT_LABELS = {
  days: '日',
  weeks: '週',
  months: 'か月',
  years: '年',
}

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

function parseDate(value) {
  const [year, month, day] = String(value || '').split('-').map(Number)
  if (![year, month, day].every(Number.isFinite)) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  return Number.isNaN(date.getTime()) ? null : date
}

function toDateString(date) {
  return date.toISOString().slice(0, 10)
}

function daysInMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

function addMonths(date, amount, preferredDay = date.getUTCDate()) {
  const monthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1))
  const day = Math.min(preferredDay, daysInMonth(monthStart.getUTCFullYear(), monthStart.getUTCMonth()))
  return new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), day))
}

export function choreScheduleLabel(chore) {
  if (chore.schedule_type === 'interval') {
    return `${chore.interval_value}${UNIT_LABELS[chore.interval_unit] || ''}ごと`
  }
  if (chore.schedule_type === 'weekly') return `毎週${WEEKDAY_LABELS[chore.weekday] || ''}曜日`
  if (chore.schedule_type === 'monthly') return `毎月${chore.day_of_month}日`
  if (chore.schedule_type === 'yearly') return `毎年${chore.month_of_year}月${chore.day_of_month}日`
  return '一度だけ'
}

export function nextChoreDueOn(chore, completedOn) {
  const completed = parseDate(completedOn)
  if (!completed || chore.schedule_type === 'once') return null

  if (chore.schedule_type === 'interval') {
    const amount = Number(chore.interval_value)
    if (!Number.isInteger(amount) || amount < 1) return null
    if (chore.interval_unit === 'days') {
      completed.setUTCDate(completed.getUTCDate() + amount)
      return toDateString(completed)
    }
    if (chore.interval_unit === 'weeks') {
      completed.setUTCDate(completed.getUTCDate() + (amount * 7))
      return toDateString(completed)
    }
    if (chore.interval_unit === 'months') return toDateString(addMonths(completed, amount))
    if (chore.interval_unit === 'years') return toDateString(addMonths(completed, amount * 12))
    return null
  }

  if (chore.schedule_type === 'weekly') {
    let difference = (Number(chore.weekday) - completed.getUTCDay() + 7) % 7
    if (difference === 0) difference = 7
    completed.setUTCDate(completed.getUTCDate() + difference)
    return toDateString(completed)
  }

  if (chore.schedule_type === 'monthly') {
    const preferredDay = Number(chore.day_of_month)
    const currentMonthDay = Math.min(
      preferredDay,
      daysInMonth(completed.getUTCFullYear(), completed.getUTCMonth()),
    )
    const currentCandidate = new Date(Date.UTC(
      completed.getUTCFullYear(),
      completed.getUTCMonth(),
      currentMonthDay,
    ))
    return toDateString(currentCandidate > completed
      ? currentCandidate
      : addMonths(completed, 1, preferredDay))
  }

  if (chore.schedule_type === 'yearly') {
    const monthIndex = Number(chore.month_of_year) - 1
    const preferredDay = Number(chore.day_of_month)
    let targetYear = completed.getUTCFullYear()
    let day = Math.min(preferredDay, daysInMonth(targetYear, monthIndex))
    let candidate = new Date(Date.UTC(targetYear, monthIndex, day))
    if (candidate <= completed) {
      targetYear += 1
      day = Math.min(preferredDay, daysInMonth(targetYear, monthIndex))
      candidate = new Date(Date.UTC(targetYear, monthIndex, day))
    }
    return toDateString(candidate)
  }

  return null
}

export function choreDueState(chore, today) {
  if (!chore.is_active) return { kind: 'inactive', label: '無効' }
  const due = parseDate(chore.next_due_on)
  const current = parseDate(today)
  if (!due || !current) return { kind: 'unscheduled', label: '期限未設定' }
  const difference = Math.round((due - current) / DAY_MS)
  if (difference < 0) return { kind: 'overdue', label: `${Math.abs(difference)}日超過`, days: difference }
  if (difference === 0) return { kind: 'today', label: '今日', days: difference }
  if (difference <= 7) return { kind: 'week', label: difference === 1 ? '明日' : `${difference}日後`, days: difference }
  return { kind: 'later', label: `${difference}日後`, days: difference }
}

export function choreCounts(chores, today) {
  return chores.reduce((counts, chore) => {
    const state = choreDueState(chore, today)
    if (state.kind === 'overdue') counts.overdue += 1
    if (state.kind === 'today') counts.today += 1
    if (state.kind === 'week') counts.week += 1
    if (chore.is_active) counts.active += 1
    else counts.inactive += 1
    return counts
  }, { overdue: 0, today: 0, week: 0, active: 0, inactive: 0 })
}

export function sortChores(chores, today, includeInactive = false) {
  const visible = includeInactive ? chores : chores.filter((chore) => chore.is_active)
  return [...visible].sort((left, right) => {
    if (left.is_active !== right.is_active) return left.is_active ? -1 : 1
    const leftState = choreDueState(left, today)
    const rightState = choreDueState(right, today)
    const leftDays = leftState.days ?? Number.POSITIVE_INFINITY
    const rightDays = rightState.days ?? Number.POSITIVE_INFINITY
    return leftDays - rightDays
      || Number(left.sort_order || 0) - Number(right.sort_order || 0)
      || String(left.title).localeCompare(String(right.title), 'ja')
  })
}
