import { useMemo, useState } from 'react'
import { pointPeriodKey } from '../lib/format'

const FREQUENCIES = {
  daily: '毎日',
  weekly: '毎週',
  monthly: '毎月',
  once: '1回のみ',
}

const ACTION_TYPES = {
  tap: 'タップ',
  entry: 'エントリー',
  condition: '条件達成',
  check: '確認',
}

const EMPTY_FORM = () => ({
  title: '',
  frequency: 'daily',
  action_type: 'check',
  estimated_minutes: '2',
  official_url: '',
  conditions: '',
  deadline: '',
})

function formFromActivity(activity) {
  return {
    title: activity.title,
    frequency: activity.frequency,
    action_type: activity.action_type,
    estimated_minutes: String(activity.estimated_minutes),
    official_url: activity.official_url,
    conditions: activity.conditions || '',
    deadline: activity.deadline ? activity.deadline.slice(0, 16) : '',
  }
}

function validHttpUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function checkedAtLabel(value) {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).format(new Date(value))
}

function deadlineLabel(value) {
  if (!value) return null
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function PointActionsView({
  activities,
  completions,
  member,
  online,
  busy,
  onCreate,
  onUpdate,
  onDelete,
  onComplete,
  onUndo,
}) {
  const [section, setSection] = useState('today')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')

  const activeActivities = activities.filter((activity) => activity.is_active)
  const ownCompletions = completions.filter((completion) => completion.user_id === member.user_id)
  const currentCompletions = useMemo(() => {
    const result = new Map()
    for (const activity of activeActivities) {
      const key = pointPeriodKey(activity.frequency)
      const completion = ownCompletions.find((item) => (
        item.activity_id === activity.id && item.period_key === key
      ))
      if (completion) result.set(activity.id, completion)
    }
    return result
  }, [activeActivities, ownCompletions])

  const completeCount = currentCompletions.size
  const remainingMinutes = activeActivities.reduce((total, activity) => (
    currentCompletions.has(activity.id) ? total : total + activity.estimated_minutes
  ), 0)

  function resetForm() {
    setForm(EMPTY_FORM())
    setEditingId(null)
    setShowForm(false)
    setError('')
  }

  function startEdit(activity) {
    setForm(formFromActivity(activity))
    setEditingId(activity.id)
    setShowForm(true)
    setSection('manage')
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function submitActivity(event) {
    event.preventDefault()
    const title = form.title.trim()
    const officialUrl = form.official_url.trim()
    const minutes = Number(form.estimated_minutes)

    if (!title) return setError('項目名を入力してください。')
    if (!validHttpUrl(officialUrl)) return setError('公式URLを http:// または https:// から入力してください。')
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120) {
      return setError('所要時間は1〜120分の整数で入力してください。')
    }

    const now = new Date().toISOString()
    const input = {
      title,
      frequency: form.frequency,
      action_type: form.action_type,
      estimated_minutes: minutes,
      official_url: officialUrl,
      conditions: form.conditions.trim() || null,
      deadline: form.deadline ? new Date(form.deadline).toISOString() : null,
      source_checked_at: now,
      updated_at: now,
    }
    const success = editingId
      ? await onUpdate(editingId, input)
      : await onCreate({ ...input, is_active: true, sort_order: activities.length * 10 + 10 })
    if (success) resetForm()
    return undefined
  }

  async function toggleCompletion(activity) {
    const completion = currentCompletions.get(activity.id)
    if (completion) return onUndo(completion.id)
    return onComplete({
      activity_id: activity.id,
      user_id: member.user_id,
      period_key: pointPeriodKey(activity.frequency),
    })
  }

  return (
    <section className="view points-view" aria-labelledby="points-title">
      <div className="view-heading points-heading">
        <div>
          <p className="eyebrow">POINT ACTIONS</p>
          <h2 id="points-title">今日のポイ活</h2>
        </div>
        <button
          className="round-add-button points-add-button"
          type="button"
          onClick={() => (showForm ? resetForm() : (setShowForm(true), setSection('manage')))}
          aria-expanded={showForm}
        >
          {showForm ? '×' : '＋'}
          <span className="sr-only">ポイ活項目を追加</span>
        </button>
      </div>

      <div className="points-summary">
        <div>
          <span>今回の進捗</span>
          <strong>{completeCount}<small> / {activeActivities.length}</small></strong>
        </div>
        <p>{remainingMinutes ? `あと約${remainingMinutes}分` : '今日の分は完了！'}</p>
        <div className="points-progress" aria-label={`${completeCount}件完了`}>
          <i style={{ width: `${activeActivities.length ? completeCount / activeActivities.length * 100 : 0}%` }} />
        </div>
      </div>

      <p className="points-safety-note">自動操作は行いません。公式ページで内容を確認し、本人が操作してください。</p>

      {showForm && (
        <form className="panel-form points-form" onSubmit={submitActivity}>
          <div className="panel-form-heading"><h3>{editingId ? '項目を編集' : '項目を追加'}</h3><span>★</span></div>
          <label>
            <span>項目名</span>
            <input maxLength="100" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="例：楽天市場のキャンペーン確認" />
          </label>
          <div className="form-grid points-form-grid">
            <label>
              <span>頻度</span>
              <select value={form.frequency} onChange={(event) => setForm({ ...form, frequency: event.target.value })}>
                {Object.entries(FREQUENCIES).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
            <label>
              <span>アクション</span>
              <select value={form.action_type} onChange={(event) => setForm({ ...form, action_type: event.target.value })}>
                {Object.entries(ACTION_TYPES).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
          </div>
          <div className="form-grid points-form-grid">
            <label>
              <span>所要時間（分）</span>
              <input type="number" min="1" max="120" step="1" inputMode="numeric" value={form.estimated_minutes} onChange={(event) => setForm({ ...form, estimated_minutes: event.target.value })} />
            </label>
            <label>
              <span>期限（任意）</span>
              <input type="datetime-local" value={form.deadline} onChange={(event) => setForm({ ...form, deadline: event.target.value })} />
            </label>
          </div>
          <label>
            <span>公式URL</span>
            <input type="url" maxLength="2000" value={form.official_url} onChange={(event) => setForm({ ...form, official_url: event.target.value })} placeholder="https://..." />
          </label>
          <label>
            <span>条件・メモ（任意）</span>
            <textarea rows="3" maxLength="1000" value={form.conditions} onChange={(event) => setForm({ ...form, conditions: event.target.value })} />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button points-submit" type="submit" disabled={!online || busy}>{editingId ? '変更を保存' : '項目を追加'}</button>
        </form>
      )}

      <div className="filter-row points-filter" aria-label="ポイ活の表示切り替え">
        {[['today', '今日やる'], ['manage', '管理'], ['history', '履歴']].map(([value, label]) => (
          <button className={section === value ? 'active' : ''} type="button" key={value} onClick={() => setSection(value)}>{label}</button>
        ))}
      </div>

      {section !== 'history' && (
        <div className="points-list">
          {(section === 'today' ? activeActivities : activities).map((activity) => {
            const completion = currentCompletions.get(activity.id)
            const expired = activity.deadline && new Date(activity.deadline) < new Date()
            return (
              <article className={`point-card ${completion ? 'is-complete' : ''} ${!activity.is_active ? 'is-inactive' : ''}`} key={activity.id}>
                <div className="point-card-topline">
                  <span>{ACTION_TYPES[activity.action_type]}</span>
                  <small>{FREQUENCIES[activity.frequency]} · 約{activity.estimated_minutes}分</small>
                </div>
                <h3>{activity.title}</h3>
                {activity.conditions && <p>{activity.conditions}</p>}
                {activity.deadline && <p className={expired ? 'point-deadline expired' : 'point-deadline'}>期限：{deadlineLabel(activity.deadline)}{expired ? '（終了）' : ''}</p>}
                <a className="point-official-link" href={activity.official_url} target="_blank" rel="noreferrer">公式ページを開く ↗</a>
                <small className="point-source">出典：上記公式URL · 確認日 {checkedAtLabel(activity.source_checked_at)}</small>
                <div className="point-actions">
                  {activity.is_active && (
                    <button className={completion ? 'completed' : ''} type="button" disabled={!online || busy} onClick={() => toggleCompletion(activity)}>
                      {completion ? '✓ 完了済み（戻す）' : '完了にする'}
                    </button>
                  )}
                  {section === 'manage' && <button type="button" onClick={() => startEdit(activity)}>編集</button>}
                  {section === 'manage' && (
                    <button className="danger-action" type="button" disabled={!online || busy} onClick={() => window.confirm(`${activity.title}を削除しますか？ 完了履歴も削除されます。`) && onDelete(activity.id)}>削除</button>
                  )}
                </div>
              </article>
            )
          })}
          {activities.length === 0 && <div className="empty-state"><span>★</span><strong>ポイ活項目を追加しよう</strong></div>}
        </div>
      )}

      {section === 'history' && (
        <div className="points-history">
          {ownCompletions.map((completion) => {
            const activity = activities.find((item) => item.id === completion.activity_id)
            return (
              <article key={completion.id}>
                <span>✓</span>
                <div><strong>{activity?.title || '削除済みの項目'}</strong><small>{checkedAtLabel(completion.completed_at)} · {completion.period_key}</small></div>
              </article>
            )
          })}
          {ownCompletions.length === 0 && <div className="empty-state"><span>✓</span><strong>完了履歴はまだありません</strong></div>}
        </div>
      )}
    </section>
  )
}
