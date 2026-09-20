import { useMemo, useState } from 'react'
import { formatDate, todayInTokyo } from '../lib/format'
import { addMonths, buildGoalMap, dateForMonth, filterGoals, lifeGoalCounts, monthValue } from '../lib/lifePlanning'
import { GoalGraph, GoalRoadmap, GoalTimeline, MonthEditor } from './GoalVisualizations'
import { GoalStructureEditor } from './GoalStructureEditor'
import './LifePlanning.css'

const CATEGORIES = ['お金', '健康', '家族', '住まい', '学び', 'キャリア', '旅行・移住', 'その他']
const OWNERS = ['夫', '妻', 'ふたり']
const QUICK_MONTHS = [3, 6, 12, 24, 36, 60, 120, 240]
const GOAL_STATUSES = ['検討中', '進行中', '達成', '保留']
const ROUTE_STATUSES = ['候補', '検討中', '本命', '保留', '見送り']
const MILESTONE_STATUSES = ['未着手', '進行中', '完了']

const emptyGoal = () => ({
  title: '', vision: '', category: 'その他', owner: 'ふたり', horizon: 'いつか', status: '検討中', target_date: '', target_month: '',
})

export function LifePlanningView({
  goals,
  routes,
  milestones,
  taskLinks,
  tasks,
  schemaReady,
  online,
  busy,
  onCreateGoal,
  onUpdateGoal,
  onCreateRoute,
  onUpdateRoute,
  onCreateMilestone,
  onUpdateMilestone,
  onLinkTask,
  onUnlinkTask,
  phases = [], relations = [], workspaceReady = false,
  onCreatePhase, onUpdatePhase, onCreateRelation, onRemoveRelation, onAssignTaskPhase,
}) {
  const [showGoalForm, setShowGoalForm] = useState(false)
  const [editingGoalId, setEditingGoalId] = useState(null)
  const [expandedGoalId, setExpandedGoalId] = useState(null)
  const [goalForm, setGoalForm] = useState(emptyGoal)
  const [routeForm, setRouteForm] = useState({ goalId: null, title: '', note: '' })
  const [milestoneForm, setMilestoneForm] = useState({ goalId: null, title: '', target_date: '', route_id: '' })
  const [taskSelections, setTaskSelections] = useState({})
  const [error, setError] = useState('')
  const [scope, setScope] = useState('active')
  const [query, setQuery] = useState('')
  const [visual, setVisual] = useState('map')
  const [mobileDetail, setMobileDetail] = useState(false)
  const [archivedGoal, setArchivedGoal] = useState(null)

  const goalMap = useMemo(
    () => buildGoalMap(goals, routes, milestones, taskLinks, tasks, true),
    [goals, milestones, routes, taskLinks, tasks],
  )
  const counts = useMemo(() => lifeGoalCounts(goalMap.filter((goal) => !goal.is_archived)), [goalMap])
  const visibleGoals = filterGoals(goalMap, scope, query)
  const selectedGoal = visibleGoals.find((goal) => goal.id === expandedGoalId) || visibleGoals[0]
  const disabled = !online || busy

  function selectGoal(id) { setExpandedGoalId(id); setMobileDetail(true) }
  async function persistGoal(id, input) {
    const success = await onUpdateGoal(id, input)
    if (success) setExpandedGoalId(id)
    return success
  }
  async function archiveGoal(goal, archive) {
    if (await onUpdateGoal(goal.id, { is_archived: archive, updated_at: new Date().toISOString() })) {
      setArchivedGoal(archive ? goal : null)
      if (!archive) { setScope(goal.status === '達成' ? 'achieved' : 'active'); setExpandedGoalId(goal.id); setQuery('') }
    }
  }

  function resetGoalForm() {
    setGoalForm(emptyGoal())
    setEditingGoalId(null)
    setShowGoalForm(false)
    setError('')
  }

  function editGoal(goal) {
    setGoalForm({
      title: goal.title,
      vision: goal.vision || '',
      category: goal.category,
      owner: goal.owner,
      horizon: goal.horizon,
      status: goal.status,
      target_date: goal.target_date || '',
      target_month: monthValue(goal.target_date),
    })
    setEditingGoalId(goal.id)
    setShowGoalForm(true)
    setMobileDetail(true)
    setError('')
  }

  async function submitGoal(event) {
    event.preventDefault()
    const title = goalForm.title.trim()
    if (!title) {
      setError('目標名を入力してください。')
      return
    }
    let targetDate
    try { targetDate = dateForMonth(goalForm.target_month, goalForm.target_date) } catch (error) { setError(error.message); return }
    const { target_month: _month, ...fields } = goalForm
    const input = {
      ...fields,
      title,
      vision: goalForm.vision.trim() || null,
      target_date: targetDate,
      updated_at: new Date().toISOString(),
    }
    const success = editingGoalId
      ? await persistGoal(editingGoalId, input)
      : await onCreateGoal(input)
    if (success) {
      const original = goals.find((goal) => goal.id === editingGoalId)
      setScope(original?.is_archived ? 'archive' : goalForm.status === '達成' ? 'achieved' : 'active')
      setQuery('')
      resetGoalForm()
    }
  }

  async function addRoute(event, goalId) {
    event.preventDefault()
    const title = routeForm.title.trim()
    if (!title) return
    const success = await onCreateRoute({
      goal_id: goalId,
      title,
      note: routeForm.note.trim() || null,
      status: '候補',
      sort_order: routes.filter((route) => route.goal_id === goalId).length,
    })
    if (success) setRouteForm({ goalId: null, title: '', note: '' })
  }

  async function addMilestone(event, goalId) {
    event.preventDefault()
    const title = milestoneForm.title.trim()
    if (!title) return
    const success = await onCreateMilestone({
      goal_id: goalId,
      route_id: milestoneForm.route_id ? Number(milestoneForm.route_id) : null,
      title,
      target_date: milestoneForm.target_date || null,
      status: '未着手',
      completed_at: null,
      sort_order: milestones.filter((milestone) => milestone.goal_id === goalId).length,
    })
    if (success) setMilestoneForm({ goalId: null, title: '', target_date: '', route_id: '' })
  }

  if (!schemaReady) {
    return (
      <section className="view life-planning-view" aria-labelledby="life-planning-title">
        <div className="view-heading"><div><p className="eyebrow">LIFE MAP</p><h2 id="life-planning-title">目標マップ</h2></div></div>
        <div className="empty-state"><span>◇</span><strong>データベースの準備待ちです</strong></div>
      </section>
    )
  }

  return (
    <section className="view life-planning-view" aria-labelledby="life-planning-title">
      <div className="view-heading life-planning-heading">
        <div><p className="eyebrow">LIFE MAP</p><h2 id="life-planning-title">目標マップ</h2></div>
        <button
          className="round-add-button life-goal-add-button"
          type="button"
          onClick={() => { if (showGoalForm) resetGoalForm(); else { setShowGoalForm(true); setMobileDetail(true) } }}
          aria-expanded={showGoalForm}
        >
          {showGoalForm ? '×' : '＋'}<span className="sr-only">目標を追加</span>
        </button>
      </div>

      <div className="life-goal-summary">
        <div><span>進行中</span><strong>{counts.active}<small>件</small></strong></div>
        <div><span>検討中</span><strong>{counts.considering}<small>件</small></strong></div>
        <div><span>達成</span><strong>{counts.achieved}<small>件</small></strong></div>
        <p>大きな目標への道筋と、横断して効くToDoを一緒に見渡せます。</p>
      </div>

      {archivedGoal && <div className="goal-archive-notice" role="status"><span>「{archivedGoal.title}」をアーカイブしました</span><button type="button" disabled={disabled} onClick={() => archiveGoal(archivedGoal, false)}>元に戻す</button><button type="button" onClick={() => { setScope('archive'); setQuery(''); setExpandedGoalId(archivedGoal.id) }}>アーカイブを見る</button></div>}
      <div className="goal-workspace-controls">
        <div className="goal-segment" aria-label="表示する目標">{[['active', '進行・検討中'], ['achieved', '達成済み'], ['archive', 'アーカイブ']].map(([id, label]) => <button type="button" key={id} aria-pressed={scope === id} onClick={() => { setScope(id); resetGoalForm() }}>{label}</button>)}</div>
        <label className="goal-search"><span className="sr-only">目標を検索</span><input type="search" placeholder="目標・分野を検索" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      </div>
      <div className="goal-mobile-switch"><button type="button" aria-pressed={!mobileDetail} onClick={() => setMobileDetail(false)}>図・一覧</button><button type="button" aria-pressed={mobileDetail} onClick={() => setMobileDetail(true)}>詳細・編集</button></div>
      <div className={`goal-workspace ${mobileDetail ? 'show-detail' : ''}`}>
        <aside className="goal-selector" aria-label="目標一覧">{visibleGoals.map((goal) => <button type="button" key={goal.id} aria-pressed={selectedGoal?.id === goal.id} onClick={() => selectGoal(goal.id)}><strong>{goal.title}</strong><small>{goal.status} · {monthValue(goal.target_date) || '時期未定'}</small></button>)}{!visibleGoals.length && <p>該当する目標はありません</p>}</aside>
        <div className="goal-workspace-visuals">
          <div className="goal-segment" aria-label="図の種類">{[['map', '目標マップ'], ['roadmap', 'ロードマップ'], ['timeline', '時間軸']].map(([id, label]) => <button type="button" key={id} aria-pressed={visual === id} onClick={() => setVisual(id)}>{label}</button>)}</div>
          {visual === 'map' && <GoalGraph goals={visibleGoals} relations={relations} selectedId={selectedGoal?.id} onSelect={selectGoal} />}
          {visual === 'roadmap' && <GoalRoadmap goal={selectedGoal} phases={phases} taskLinks={taskLinks} onSelect={selectGoal} />}
          {visual === 'timeline' && <GoalTimeline goals={visibleGoals} phases={phases} disabled={disabled} workspaceReady={workspaceReady} onSelect={selectGoal} onUpdateGoal={persistGoal} onUpdatePhase={onUpdatePhase} onUpdateMilestone={onUpdateMilestone} />}
        </div>
        <div className="goal-workspace-detail">
      {showGoalForm && (
        <form className="panel-form life-goal-form" onSubmit={submitGoal}>
          <div className="panel-form-heading"><h3>{editingGoalId ? '目標を編集' : '目標を追加'}</h3><span>◇</span></div>
          <label><span>目標</span><input maxLength="100" placeholder="例：海外で暮らす" value={goalForm.title} onChange={(event) => setGoalForm({ ...goalForm, title: event.target.value })} /></label>
          <label><span>実現したい状態</span><textarea rows="3" maxLength="1000" placeholder="どんな暮らしにしたいか" value={goalForm.vision} onChange={(event) => setGoalForm({ ...goalForm, vision: event.target.value })} /></label>
          <div className="form-grid life-goal-form-grid">
            <label><span>分野</span><select value={goalForm.category} onChange={(event) => setGoalForm({ ...goalForm, category: event.target.value })}>{CATEGORIES.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label><span>主体</span><select value={goalForm.owner} onChange={(event) => setGoalForm({ ...goalForm, owner: event.target.value })}>{OWNERS.map((value) => <option key={value}>{value}</option>)}</select></label>
          </div>
          <div className="form-grid life-goal-form-grid">
            <label><span>状態</span><select value={goalForm.status} onChange={(event) => setGoalForm({ ...goalForm, status: event.target.value })}>{GOAL_STATUSES.map((value) => <option key={value}>{value}</option>)}</select></label>
          </div>
          <label><span>目標年月（空欄は未定）</span><input type="month" min="1900-01" max="9999-12" value={goalForm.target_month} onChange={(event) => setGoalForm({ ...goalForm, target_month: event.target.value, horizon: 'いつか' })} /></label>
          <div className="goal-quick-months">{QUICK_MONTHS.map((months) => <button type="button" key={months} onClick={() => setGoalForm({ ...goalForm, target_month: addMonths(todayInTokyo(), months), horizon: 'いつか' })}>{months < 12 ? `${months}か月` : `${months / 12}年`}</button>)}<button type="button" onClick={() => setGoalForm({ ...goalForm, target_month: '', horizon: 'いつか' })}>未定</button></div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button life-goal-submit" type="submit" disabled={!online || busy}>{editingGoalId ? '変更を保存' : '目標を追加'}</button>
          <button className="secondary-button" type="button" onClick={resetGoalForm}>キャンセル</button>
        </form>
      )}

      <div className="life-goal-list">
        {visibleGoals.length === 0 && <div className="empty-state"><span>◇</span><strong>該当する目標はありません</strong><p>{scope === 'archive' ? 'アーカイブした目標はここから復元できます' : '目標を追加するか、検索条件を変えてください'}</p></div>}
        {(selectedGoal ? [selectedGoal] : []).map((goal) => {
          const expanded = true
          const unlinkedTasks = tasks.filter((task) => !goal.linkedTasks.some((linked) => linked.id === task.id))
          return (
            <article className={`life-goal-card status-${goal.status}`} key={goal.id}>
              <div className="life-goal-card-main">
                <span className="life-goal-category">{goal.category}・{goal.owner}</span>
                <strong>{goal.title}</strong>
                <span className="life-goal-status">{goal.status}・{monthValue(goal.target_date) || '時期未定'}{goal.is_archived ? '・アーカイブ' : ''}</span>
                <span className="life-goal-progress"><i style={{ width: `${goal.progress}%` }} /></span>
                <small>関連項目の完了率 {goal.progress}%・ルート {goal.routes.length}・道標 {goal.milestones.length}・ToDo {goal.linkedTasks.length}</small>
              </div>

              {expanded && (
                <div className="life-goal-detail">
                  {goal.vision && <p className="life-goal-vision">{goal.vision}</p>}
                  {goal.target_date && <p className="life-goal-target">目標日 {goal.target_date.slice(0, 4)}年{formatDate(goal.target_date)}</p>}
                  <div className="life-goal-actions">
                    <button type="button" onClick={() => editGoal(goal)}>編集</button>
                    <span className="goal-saved-state">保存済み</span>
                    <button type="button" disabled={disabled} onClick={() => archiveGoal(goal, !goal.is_archived)}>{goal.is_archived ? 'アーカイブから戻す' : 'アーカイブする'}</button>
                    {!goal.is_archived && <button type="button" disabled={disabled} onClick={async () => { const status = goal.status === '達成' ? '進行中' : '達成'; if (await persistGoal(goal.id, { status, updated_at: new Date().toISOString() })) setScope(status === '達成' ? 'achieved' : 'active') }}>{goal.status === '達成' ? '進行中に戻す' : '達成済みにする'}</button>}
                  </div>
                  {workspaceReady ? <GoalStructureEditor key={goal.id} goal={goal} goals={goals} phases={phases} relations={relations} disabled={disabled} onCreatePhase={onCreatePhase} onUpdatePhase={onUpdatePhase} onCreateRelation={onCreateRelation} onRemoveRelation={onRemoveRelation} /> : <p className="goal-detail-empty">フェーズと目標同士の連携は準備中です。目標の編集・復元は利用できます。</p>}
                  <MonthEditor key={`${goal.id}-${goal.target_date}`} label="目標年月" date={goal.target_date} disabled={disabled} onSave={(target_date) => persistGoal(goal.id, { target_date, updated_at: new Date().toISOString() })} />

                  <section className="goal-detail-section">
                    <div className="goal-detail-heading"><h3>実現ルート</h3><span>複数案を比べられます</span></div>
                    <div className="goal-route-list">
                      {goal.routes.map((route) => (
                        <div className="goal-route-row" key={route.id}>
                          <div><strong>{route.title}</strong>{route.note && <small>{route.note}</small>}</div>
                          <select value={route.status} aria-label={`${route.title}の状態`} disabled={!online || busy} onChange={(event) => onUpdateRoute(route.id, { status: event.target.value, updated_at: new Date().toISOString() })}>{ROUTE_STATUSES.map((value) => <option key={value}>{value}</option>)}</select>
                        </div>
                      ))}
                    </div>
                    {routeForm.goalId === goal.id ? (
                      <form className="goal-inline-form" onSubmit={(event) => addRoute(event, goal.id)}>
                        <input aria-label="ルート名" autoFocus maxLength="100" placeholder="例：現地就職で移住" value={routeForm.title} onChange={(event) => setRouteForm({ ...routeForm, title: event.target.value })} />
                        <input aria-label="ルートのメモ" maxLength="1000" placeholder="メモ（任意）" value={routeForm.note} onChange={(event) => setRouteForm({ ...routeForm, note: event.target.value })} />
                        <div><button type="button" onClick={() => setRouteForm({ goalId: null, title: '', note: '' })}>やめる</button><button type="submit" disabled={!online || busy}>追加</button></div>
                      </form>
                    ) : <button className="goal-add-detail" type="button" onClick={() => setRouteForm({ goalId: goal.id, title: '', note: '' })}>＋ ルートを追加</button>}
                  </section>

                  <section className="goal-detail-section">
                    <div className="goal-detail-heading"><h3>マイルストーン</h3><span>目標までの節目</span></div>
                    <div className="goal-milestone-list">
                      {goal.milestones.map((milestone) => (
                        <div className={`goal-milestone-row ${milestone.status === '完了' ? 'is-complete' : ''}`} key={milestone.id}>
                          <span aria-hidden="true">{milestone.status === '完了' ? '✓' : '○'}</span>
                          <div><strong>{milestone.title}</strong><small>{milestone.target_date ? `${milestone.target_date.slice(0, 4)}年${formatDate(milestone.target_date)}` : '日付未定'}{milestone.route_id ? `・${goal.routes.find((route) => route.id === milestone.route_id)?.title || ''}` : ''}</small></div>
                          <select value={milestone.status} aria-label={`${milestone.title}の状態`} disabled={!online || busy} onChange={(event) => onUpdateMilestone(milestone.id, { status: event.target.value, completed_at: event.target.value === '完了' ? milestone.completed_at || new Date().toISOString() : null, updated_at: new Date().toISOString() })}>{MILESTONE_STATUSES.map((value) => <option key={value}>{value}</option>)}</select>
                          {workspaceReady && <label className="goal-phase-assignment">フェーズ<select aria-label={`${milestone.title}のフェーズ`} value={milestone.phase_id || ''} disabled={disabled} onChange={(event) => onUpdateMilestone(milestone.id, { phase_id: Number(event.target.value) || null })}><option value="">未割当</option>{phases.filter((phase) => phase.goal_id === goal.id).map((phase) => <option key={phase.id} value={phase.id}>{phase.title}</option>)}</select></label>}
                          <MonthEditor key={`${milestone.id}-${milestone.target_date}`} label={`${milestone.title}の年月`} date={milestone.target_date} disabled={disabled} onSave={(target_date) => onUpdateMilestone(milestone.id, { target_date, updated_at: new Date().toISOString() })} />
                        </div>
                      ))}
                    </div>
                    {milestoneForm.goalId === goal.id ? (
                      <form className="goal-inline-form" onSubmit={(event) => addMilestone(event, goal.id)}>
                        <input aria-label="マイルストーン名" autoFocus maxLength="100" placeholder="例：英語試験の日程を決める" value={milestoneForm.title} onChange={(event) => setMilestoneForm({ ...milestoneForm, title: event.target.value })} />
                        <div className="goal-inline-grid"><input aria-label="マイルストーンの目標日" type="date" value={milestoneForm.target_date} onChange={(event) => setMilestoneForm({ ...milestoneForm, target_date: event.target.value })} /><select aria-label="関連するルート" value={milestoneForm.route_id} onChange={(event) => setMilestoneForm({ ...milestoneForm, route_id: event.target.value })}><option value="">共通の道標</option>{goal.routes.map((route) => <option value={route.id} key={route.id}>{route.title}</option>)}</select></div>
                        <div><button type="button" onClick={() => setMilestoneForm({ goalId: null, title: '', target_date: '', route_id: '' })}>やめる</button><button type="submit" disabled={!online || busy}>追加</button></div>
                      </form>
                    ) : <button className="goal-add-detail" type="button" onClick={() => setMilestoneForm({ goalId: goal.id, title: '', target_date: '', route_id: '' })}>＋ 道標を追加</button>}
                  </section>

                  <section className="goal-detail-section">
                    <div className="goal-detail-heading"><h3>関連する人生ToDo</h3><span>他の目標と共有できます</span></div>
                    <div className="goal-task-links">
                      {goal.linkedTasks.map((task) => <div key={task.id}><span className={task.status === '完了' ? 'is-complete' : ''}>{task.title}<small>{task.status}・{task.assigned_to}</small></span><button type="button" disabled={!online || busy} onClick={() => onUnlinkTask(goal.id, task.id)}>外す</button></div>)}
                      {workspaceReady && goal.linkedTasks.map((task) => <label key={`phase-${task.id}`} className="goal-phase-assignment">{task.title}のフェーズ<select value={taskLinks.find((link) => link.goal_id === goal.id && link.task_id === task.id)?.phase_id || ''} disabled={disabled} onChange={(event) => onAssignTaskPhase(goal.id, task.id, Number(event.target.value) || null)}><option value="">未割当</option>{phases.filter((phase) => phase.goal_id === goal.id).map((phase) => <option value={phase.id} key={phase.id}>{phase.title}</option>)}</select></label>)}
                    </div>
                    {unlinkedTasks.length > 0 ? (
                      <div className="goal-task-link-form"><select aria-label={`${goal.title}に紐づけるToDo`} value={taskSelections[goal.id] || ''} onChange={(event) => setTaskSelections((current) => ({ ...current, [goal.id]: event.target.value }))}><option value="">ToDoを選ぶ</option>{unlinkedTasks.map((task) => <option value={task.id} key={task.id}>{task.title}</option>)}</select><button type="button" disabled={!online || busy || !taskSelections[goal.id]} onClick={async () => { const success = await onLinkTask(goal.id, Number(taskSelections[goal.id])); if (success) setTaskSelections((current) => ({ ...current, [goal.id]: '' })) }}>紐づける</button></div>
                    ) : <p className="goal-detail-empty">{tasks.length === 0 ? 'まず「人生ToDo」からやることを追加してください。' : 'すべてのToDoが紐づいています。'}</p>}
                  </section>
                </div>
              )}
            </article>
          )
        })}
      </div>
        </div>
      </div>
    </section>
  )
}
