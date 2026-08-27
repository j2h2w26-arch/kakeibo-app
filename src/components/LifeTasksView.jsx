import { useMemo, useState } from 'react'
import { formatDate, todayInTokyo } from '../lib/format'
import { filterLifeTasks, lifeTaskCounts, sortLifeTasks } from '../lib/lifeTasks'

const TASK_TYPES = [
  ['todo', 'やること'],
  ['goal', '目標'],
]
const CATEGORIES = ['保険・手続き', 'お金', '健康', '家族', '住まい', 'キャリア', 'その他']
const ASSIGNEES = ['夫', '妻', 'ふたり']
const PRIORITIES = ['高', '中', '低']
const STATUSES = ['未着手', '進行中', '完了']

const EMPTY_TASK = () => ({
  title: '',
  task_type: 'todo',
  category: '保険・手続き',
  assigned_to: 'ふたり',
  priority: '中',
  status: '未着手',
  target_date: '',
  note: '',
})

function formFromTask(task) {
  return {
    title: task.title,
    task_type: task.task_type,
    category: task.category,
    assigned_to: task.assigned_to,
    priority: task.priority,
    status: task.status,
    target_date: task.target_date || '',
    note: task.note || '',
  }
}

export function LifeTasksView({
  tasks,
  schemaReady,
  online,
  busy,
  onCreate,
  onUpdate,
  onDelete,
}) {
  const [statusFilter, setStatusFilter] = useState('open')
  const [ownerFilter, setOwnerFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_TASK)
  const [error, setError] = useState('')

  const counts = useMemo(() => lifeTaskCounts(tasks), [tasks])
  const ownerCounts = useMemo(() => lifeTaskCounts(
    filterLifeTasks(tasks, statusFilter, 'all', typeFilter),
  ), [statusFilter, tasks, typeFilter])
  const visibleTasks = useMemo(() => sortLifeTasks(
    filterLifeTasks(tasks, statusFilter, ownerFilter, typeFilter),
  ), [ownerFilter, statusFilter, tasks, typeFilter])
  const today = todayInTokyo()

  function resetForm() {
    setForm(EMPTY_TASK())
    setEditingId(null)
    setShowForm(false)
    setError('')
  }

  function startEdit(task) {
    setForm(formFromTask(task))
    setEditingId(task.id)
    setShowForm(true)
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function submitTask(event) {
    event.preventDefault()
    const title = form.title.trim()
    if (!title) {
      setError('目標・やることを入力してください。')
      return
    }

    const existing = tasks.find((task) => task.id === editingId)
    const now = new Date().toISOString()
    const input = {
      title,
      task_type: form.task_type,
      category: form.category,
      assigned_to: form.assigned_to,
      priority: form.priority,
      status: form.status,
      target_date: form.target_date || null,
      note: form.note.trim() || null,
      completed_at: form.status === '完了' ? existing?.completed_at || now : null,
      updated_at: now,
    }
    const success = editingId
      ? await onUpdate(editingId, input)
      : await onCreate(input)
    if (success) resetForm()
  }

  async function updateStatus(task, status) {
    await onUpdate(task.id, {
      status,
      completed_at: status === '完了' ? task.completed_at || new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
  }

  if (!schemaReady) {
    return (
      <section className="view life-tasks-view" aria-labelledby="life-tasks-title">
        <div className="view-heading life-tasks-heading">
          <div><p className="eyebrow">LIFE PLAN</p><h2 id="life-tasks-title">人生ToDo</h2></div>
        </div>
        <div className="empty-state"><span>◎</span><strong>データベースの準備待ちです</strong></div>
      </section>
    )
  }

  return (
    <section className="view life-tasks-view" aria-labelledby="life-tasks-title">
      <div className="view-heading life-tasks-heading">
        <div>
          <p className="eyebrow">LIFE PLAN</p>
          <h2 id="life-tasks-title">人生ToDo</h2>
        </div>
        <button
          className="round-add-button life-tasks-add-button"
          type="button"
          onClick={() => (showForm ? resetForm() : setShowForm(true))}
          aria-expanded={showForm}
        >
          {showForm ? '×' : '＋'}
          <span className="sr-only">人生ToDoを追加</span>
        </button>
      </div>

      <div className="life-tasks-summary">
        <div><span>これから</span><strong>{counts.open}<small>件</small></strong></div>
        <div><span>進行中</span><strong>{counts.inProgress}<small>件</small></strong></div>
        <div><span>完了</span><strong>{counts.done}<small>件</small></strong></div>
        <p>やりたいことではなく、暮らしや将来のために必要なことを記録します。</p>
      </div>

      {showForm && (
        <form className="panel-form life-task-form" onSubmit={submitTask}>
          <div className="panel-form-heading"><h3>{editingId ? '人生ToDoを編集' : '人生ToDoを追加'}</h3><span>◎</span></div>
          <label>
            <span>目標・やること</span>
            <input
              type="text"
              maxLength="100"
              placeholder="例：生命保険に入る"
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
          </label>
          <div className="form-grid life-task-form-grid">
            <label>
              <span>種類</span>
              <select value={form.task_type} onChange={(event) => setForm({ ...form, task_type: event.target.value })}>
                {TASK_TYPES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
            <label>
              <span>カテゴリー</span>
              <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                {CATEGORIES.map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
          </div>
          <div className="form-grid life-task-form-grid">
            <label>
              <span>担当</span>
              <select value={form.assigned_to} onChange={(event) => setForm({ ...form, assigned_to: event.target.value })}>
                {ASSIGNEES.map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label>
              <span>優先度</span>
              <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
                {PRIORITIES.map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
          </div>
          <div className="form-grid life-task-form-grid">
            <label>
              <span>進捗</span>
              <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                {STATUSES.map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label>
              <span>期限・目標日（任意）</span>
              <input type="date" value={form.target_date} onChange={(event) => setForm({ ...form, target_date: event.target.value })} />
            </label>
          </div>
          <label>
            <span>メモ（任意）</span>
            <textarea
              rows="3"
              maxLength="1000"
              placeholder="検討事項、必要書類、次にやることなど"
              value={form.note}
              onChange={(event) => setForm({ ...form, note: event.target.value })}
            />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button life-task-submit" type="submit" disabled={!online || busy}>
            {editingId ? '変更を保存' : '追加する'}
          </button>
        </form>
      )}

      <div className="life-task-filter-heading"><strong>担当</strong><span>夫・妻・ふたりで切り替え</span></div>
      <div className="filter-row life-task-owner-filter" aria-label="担当で絞り込み">
        {[
          ['all', '全部'],
          ['夫', '夫'],
          ['妻', '妻'],
          ['ふたり', 'ふたり'],
        ].map(([value, label]) => (
          <button type="button" className={ownerFilter === value ? 'active' : ''} key={value} onClick={() => setOwnerFilter(value)} aria-pressed={ownerFilter === value}>
            {label}<small>{ownerCounts[value]}</small>
          </button>
        ))}
      </div>

      <div className="filter-row life-task-type-filter" aria-label="種類で絞り込み">
        {[
          ['all', 'すべて'],
          ['todo', 'やること'],
          ['goal', '目標'],
        ].map(([value, label]) => (
          <button type="button" className={typeFilter === value ? 'active' : ''} key={value} onClick={() => setTypeFilter(value)} aria-pressed={typeFilter === value}>{label}</button>
        ))}
      </div>

      <div className="filter-row life-task-status-filter" aria-label="進捗で絞り込み">
        {[
          ['open', 'これから'],
          ['all', 'すべて'],
          ['done', '完了'],
        ].map(([value, label]) => (
          <button type="button" className={statusFilter === value ? 'active' : ''} key={value} onClick={() => setStatusFilter(value)} aria-pressed={statusFilter === value}>{label}</button>
        ))}
      </div>

      <div className="life-task-list">
        {visibleTasks.length === 0 && (
          <div className="empty-state"><span>◎</span><strong>該当する人生ToDoはありません</strong><p>将来のために必要なことを追加してみよう</p></div>
        )}
        {visibleTasks.map((task) => {
          const overdue = task.status !== '完了' && task.target_date && task.target_date < today
          return (
            <article className={`life-task-card priority-${task.priority} ${task.status === '完了' ? 'is-complete' : ''}`} key={task.id}>
              <div className="life-task-card-topline">
                <span>{task.task_type === 'goal' ? '目標' : 'やること'}・{task.assigned_to}</span>
                <b>優先度 {task.priority}</b>
              </div>
              <h3>{task.title}</h3>
              <div className="life-task-meta">
                <span>{task.category}</span>
                <span>{task.status}</span>
                {task.target_date && <span className={overdue ? 'overdue' : ''}>{overdue ? '期限超過 ' : '期限 '}{formatDate(task.target_date)}</span>}
              </div>
              {task.note && <p>{task.note}</p>}
              <div className="life-task-status-actions" aria-label={`${task.title}の進捗`}>
                {STATUSES.map((status) => (
                  <button type="button" className={task.status === status ? 'active' : ''} key={status} disabled={!online || busy || task.status === status} onClick={() => updateStatus(task, status)}>{status}</button>
                ))}
              </div>
              <div className="life-task-actions">
                <button type="button" onClick={() => startEdit(task)}>編集</button>
                <button className="danger-action" type="button" disabled={!online || busy} onClick={() => window.confirm(`${task.title}を削除しますか？`) && onDelete(task.id)}>削除</button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
