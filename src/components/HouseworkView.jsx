import { useMemo, useState } from 'react'
import { choreCounts, choreDueState, choreScheduleLabel, sortChores } from '../lib/chores'
import { formatDate } from '../lib/format'

const CATEGORIES = [
  'キッチン', '浴室・洗面', 'トイレ', '洗濯', 'リビング・寝室',
  '家電', '玄関・屋外', '防災・季節', 'その他',
]
const ASSIGNEES = ['夫', '妻', 'ふたり']
const WEEKDAYS = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日']

function emptyForm(today) {
  return {
    title: '',
    category: 'その他',
    assigned_to: 'ふたり',
    schedule_type: 'interval',
    interval_value: '1',
    interval_unit: 'months',
    weekday: '6',
    day_of_month: '1',
    month_of_year: '1',
    next_due_on: today,
    appliance_name: '',
    manual_url: '',
    note: '',
    is_active: true,
  }
}

function formFromChore(chore) {
  return {
    title: chore.title,
    category: chore.category,
    assigned_to: chore.assigned_to,
    schedule_type: chore.schedule_type,
    interval_value: String(chore.interval_value || 1),
    interval_unit: chore.interval_unit || 'months',
    weekday: String(chore.weekday ?? 6),
    day_of_month: String(chore.day_of_month || 1),
    month_of_year: String(chore.month_of_year || 1),
    next_due_on: chore.next_due_on || '',
    appliance_name: chore.appliance_name || '',
    manual_url: chore.manual_url || '',
    note: chore.note || '',
    is_active: chore.is_active,
  }
}

function scheduleFields(form) {
  return {
    interval_value: form.schedule_type === 'interval' ? Number(form.interval_value) : null,
    interval_unit: form.schedule_type === 'interval' ? form.interval_unit : null,
    weekday: form.schedule_type === 'weekly' ? Number(form.weekday) : null,
    day_of_month: ['monthly', 'yearly'].includes(form.schedule_type) ? Number(form.day_of_month) : null,
    month_of_year: form.schedule_type === 'yearly' ? Number(form.month_of_year) : null,
  }
}

function DueBadge({ chore, today }) {
  const state = choreDueState(chore, today)
  return <span className={`chore-due-badge ${state.kind}`}>{state.label}</span>
}

export function HouseworkView({
  chores,
  completions,
  schemaReady,
  memberId,
  memberName,
  today,
  online,
  busy,
  onCreate,
  onUpdate,
  onComplete,
}) {
  const [mode, setMode] = useState('todo')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(() => emptyForm(today))
  const [error, setError] = useState('')
  const counts = useMemo(() => choreCounts(chores, today), [chores, today])
  const activeChores = useMemo(() => sortChores(chores, today), [chores, today])
  const managedChores = useMemo(() => sortChores(chores, today, true), [chores, today])
  const choresById = useMemo(() => new Map(chores.map((chore) => [chore.id, chore])), [chores])

  function resetForm() {
    setForm(emptyForm(today))
    setEditingId(null)
    setShowForm(false)
    setError('')
  }

  function startEdit(chore) {
    setForm(formFromChore(chore))
    setEditingId(chore.id)
    setShowForm(true)
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function submitChore(event) {
    event.preventDefault()
    const title = form.title.trim()
    if (!title) {
      setError('家事名を入力してください。')
      return
    }
    if (!form.next_due_on && form.is_active) {
      setError('有効な家事には次回期限が必要です。')
      return
    }
    if (form.manual_url && !form.manual_url.startsWith('https://')) {
      setError('説明書URLはhttps://から始まるアドレスを入力してください。')
      return
    }

    const input = {
      title,
      category: form.category,
      assigned_to: form.assigned_to,
      schedule_type: form.schedule_type,
      ...scheduleFields(form),
      next_due_on: form.next_due_on || null,
      appliance_name: form.appliance_name.trim() || null,
      manual_url: form.manual_url.trim() || null,
      note: form.note.trim() || null,
      is_active: form.is_active,
      updated_at: new Date().toISOString(),
    }
    const success = editingId ? await onUpdate(editingId, input) : await onCreate(input)
    if (success) resetForm()
  }

  async function complete(chore) {
    if (!window.confirm(`「${chore.title}」を今日完了にしますか？`)) return
    await onComplete(chore.id, today)
  }

  if (!schemaReady) {
    return (
      <section className="view housework-view" aria-labelledby="housework-title">
        <div className="view-heading"><div><p className="eyebrow">HOUSEWORK</p><h2 id="housework-title">家事</h2></div></div>
        <div className="empty-state"><span>◎</span><strong>データベースの準備待ちです</strong><p>家事用のテーブルを適用すると使えるようになります。</p></div>
      </section>
    )
  }

  return (
    <section className="view housework-view" aria-labelledby="housework-title">
      <div className="view-heading housework-heading">
        <div><p className="eyebrow">HOUSEWORK</p><h2 id="housework-title">家事</h2></div>
        {mode === 'manage' && (
          <button className="round-add-button chore-add-button" type="button" onClick={() => (showForm ? resetForm() : setShowForm(true))} aria-expanded={showForm}>
            {showForm ? '×' : '＋'}<span className="sr-only">家事を追加</span>
          </button>
        )}
      </div>

      <div className="chore-summary" aria-label="家事の状況">
        <div className={counts.overdue ? 'attention' : ''}><span>期限超過</span><strong>{counts.overdue}<small>件</small></strong></div>
        <div><span>今日</span><strong>{counts.today}<small>件</small></strong></div>
        <div><span>これから7日</span><strong>{counts.week}<small>件</small></strong></div>
      </div>

      <div className="housework-mode-tabs" role="tablist" aria-label="家事の表示を切り替える">
        {[
          ['todo', 'やること'],
          ['history', '履歴'],
          ['manage', '管理'],
        ].map(([value, label]) => (
          <button type="button" role="tab" aria-selected={mode === value} className={mode === value ? 'active' : ''} key={value} onClick={() => setMode(value)}>{label}</button>
        ))}
      </div>

      {mode === 'manage' && showForm && (
        <form className="panel-form chore-form" onSubmit={submitChore}>
          <div className="panel-form-heading"><h3>{editingId ? '家事を編集' : '家事を追加'}</h3><span>◎</span></div>
          <label><span>家事名</span><input type="text" maxLength="100" value={form.title} placeholder="例：換気口フィルターを掃除" onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
          <div className="form-grid chore-form-grid">
            <label><span>カテゴリー</span><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{CATEGORIES.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label><span>担当</span><select value={form.assigned_to} onChange={(event) => setForm({ ...form, assigned_to: event.target.value })}>{ASSIGNEES.map((value) => <option key={value}>{value}</option>)}</select></label>
          </div>
          <div className="form-grid chore-form-grid">
            <label><span>繰り返し</span><select value={form.schedule_type} onChange={(event) => setForm({ ...form, schedule_type: event.target.value })}><option value="interval">完了日から一定間隔</option><option value="weekly">毎週・曜日固定</option><option value="monthly">毎月・日付固定</option><option value="yearly">毎年・月日固定</option><option value="once">一度だけ</option></select></label>
            <label><span>次回期限</span><input type="date" value={form.next_due_on} onChange={(event) => setForm({ ...form, next_due_on: event.target.value })} /></label>
          </div>
          {form.schedule_type === 'interval' && <div className="form-grid chore-form-grid"><label><span>間隔</span><input type="number" min="1" max="365" value={form.interval_value} onChange={(event) => setForm({ ...form, interval_value: event.target.value })} /></label><label><span>単位</span><select value={form.interval_unit} onChange={(event) => setForm({ ...form, interval_unit: event.target.value })}><option value="days">日</option><option value="weeks">週</option><option value="months">か月</option><option value="years">年</option></select></label></div>}
          {form.schedule_type === 'weekly' && <label><span>曜日</span><select value={form.weekday} onChange={(event) => setForm({ ...form, weekday: event.target.value })}>{WEEKDAYS.map((value, index) => <option value={index} key={value}>{value}</option>)}</select></label>}
          {form.schedule_type === 'monthly' && <label><span>毎月の日</span><input type="number" min="1" max="31" value={form.day_of_month} onChange={(event) => setForm({ ...form, day_of_month: event.target.value })} /></label>}
          {form.schedule_type === 'yearly' && <div className="form-grid chore-form-grid"><label><span>月</span><input type="number" min="1" max="12" value={form.month_of_year} onChange={(event) => setForm({ ...form, month_of_year: event.target.value })} /></label><label><span>日</span><input type="number" min="1" max="31" value={form.day_of_month} onChange={(event) => setForm({ ...form, day_of_month: event.target.value })} /></label></div>}
          <div className="form-grid chore-form-grid"><label><span>家電名・型番（任意）</span><input type="text" maxLength="100" value={form.appliance_name} onChange={(event) => setForm({ ...form, appliance_name: event.target.value })} /></label><label><span>説明書URL（任意）</span><input type="url" maxLength="2000" placeholder="https://" value={form.manual_url} onChange={(event) => setForm({ ...form, manual_url: event.target.value })} /></label></div>
          <label><span>メモ（任意）</span><textarea rows="3" maxLength="1000" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" type="submit" disabled={!online || busy}>{editingId ? '変更を保存' : '追加する'}</button>
        </form>
      )}

      {mode === 'todo' && (
        <div className="chore-list">
          {activeChores.length === 0 && <div className="empty-state"><span>✓</span><strong>有効な家事はありません</strong><p>管理から家事を追加できます。</p></div>}
          {activeChores.map((chore) => (
            <article className="chore-card" key={chore.id}>
              <div className="chore-card-topline"><DueBadge chore={chore} today={today} /><span>{chore.category}・{chore.assigned_to}</span></div>
              <h3>{chore.title}</h3>
              <div className="chore-card-meta"><span>{choreScheduleLabel(chore)}</span><span>期限 {formatDate(chore.next_due_on)}</span>{chore.last_completed_on && <span>前回 {formatDate(chore.last_completed_on)}</span>}</div>
              {chore.appliance_name && <p className="chore-appliance">家電：{chore.appliance_name}</p>}
              {chore.note && <p>{chore.note}</p>}
              <div className="chore-card-actions">{chore.manual_url && <a href={chore.manual_url} target="_blank" rel="noreferrer">説明書</a>}<button type="button" disabled={!online || busy} onClick={() => complete(chore)}>今日完了</button></div>
            </article>
          ))}
        </div>
      )}

      {mode === 'history' && (
        <div className="chore-history">
          {completions.length === 0 && <div className="empty-state"><span>◎</span><strong>まだ完了履歴はありません</strong></div>}
          {completions.map((completion) => {
            const chore = choresById.get(completion.chore_id)
            return <article key={completion.id}><div><strong>{chore?.title || '家事'}</strong><span>{chore?.category || ''}</span></div><time dateTime={completion.completed_on}>{formatDate(completion.completed_on)}</time><small>{completion.completed_by === memberId ? memberName : '家族'}が完了</small></article>
          })}
        </div>
      )}

      {mode === 'manage' && (
        <div className="chore-manage-list">
          <div className="section-heading"><h3>家事の管理</h3><span>有効 {counts.active}件・無効 {counts.inactive}件</span></div>
          {managedChores.map((chore) => (
            <article className={!chore.is_active ? 'inactive' : ''} key={chore.id}>
              <div><strong>{chore.title}</strong><span>{chore.category}・{choreScheduleLabel(chore)}</span></div>
              <button type="button" onClick={() => startEdit(chore)}>編集</button>
              <button type="button" className={chore.is_active ? 'danger-action' : ''} disabled={!online || busy} onClick={() => onUpdate(chore.id, { is_active: !chore.is_active, next_due_on: chore.next_due_on || today, updated_at: new Date().toISOString() })}>{chore.is_active ? '無効化' : '有効化'}</button>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
