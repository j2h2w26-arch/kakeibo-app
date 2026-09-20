import { useId, useMemo, useRef, useState } from 'react'
import { buildGoalGraph, dateForMonth, monthAt, monthIndex, monthValue, timelineBounds } from '../lib/lifePlanning'
import { todayInTokyo } from '../lib/format'

export function GoalGraph({ goals, relations, selectedId, onSelect }) {
  const [zoom, setZoom] = useState(1)
  const [focused, setFocused] = useState(() => window.matchMedia('(max-width: 899px)').matches)
  const [selectedTaskId, setSelectedTaskId] = useState(null)
  const viewport = useRef(null)
  const marker = useId()
  const graph = useMemo(() => buildGoalGraph(goals, relations, focused ? selectedId : null), [goals, relations, focused, selectedId])
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const taskGoals = goals.filter((goal) => goal.linkedTasks.some((task) => `task-${task.id}` === selectedTaskId))
  const selectedTask = taskGoals[0]?.linkedTasks.find((task) => `task-${task.id}` === selectedTaskId)
  return <section className="goal-visual" aria-label="目標のフロー図">
    <div className="goal-visual-toolbar">
      <button type="button" aria-label="図を縮小" disabled={zoom <= 0.5} onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}>−</button>
      <span>{Math.round(zoom * 100)}%</span>
      <button type="button" aria-label="図を拡大" disabled={zoom >= 1.75} onClick={() => setZoom((value) => Math.min(1.75, value + 0.25))}>＋</button>
      <button type="button" onClick={() => { setZoom(1); viewport.current?.scrollTo({ left: 0, top: 0 }) }}>自動整列</button>
      <label><input type="checkbox" checked={focused} disabled={!selectedId} onChange={(event) => setFocused(event.target.checked)} />選択した目標の周辺</label>
    </div>
    <p className="goal-visual-hint">箱を選ぶと詳細が開きます。図は縦横にスクロールできます。</p>
    {selectedTask && <aside className="goal-task-inspector" aria-label="共通ToDoの詳細"><strong>{selectedTask.title}</strong><p>{selectedTask.status} · {selectedTask.assigned_to || 'ふたり'}</p><p>このToDoが支える目標</p>{taskGoals.map((goal) => <button type="button" key={goal.id} onClick={() => onSelect(goal.id)}>{goal.title}を開く</button>)}<button type="button" onClick={() => setSelectedTaskId(null)}>ToDoの詳細を閉じる</button></aside>}
    <div className="goal-graph-scroll" ref={viewport} tabIndex={0} aria-label="目標マップ。矢印キーでスクロール">
      <div style={{ width: graph.width * zoom, height: graph.height * zoom }}>
        <div className="goal-graph-canvas" style={{ width: graph.width, height: graph.height, transform: `scale(${zoom})` }}>
          <svg width={graph.width} height={graph.height} aria-hidden="true">
            <defs><marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#667460" /></marker></defs>
            {graph.edges.map((edge) => {
              const from = byId.get(edge.from), to = byId.get(edge.to)
              if (!from || !to) return null
              const sameColumn = from.x === to.x
              const startX = from.x + 220, startY = from.y + 48
              const endX = sameColumn ? to.x + 220 : to.x, endY = to.y + 48
              const midX = sameColumn ? startX + 45 : (startX + endX) / 2
              return <g key={`${edge.from}-${edge.to}`}><path d={`M${startX},${startY} C${midX},${startY} ${midX},${endY} ${endX},${endY}`} fill="none" stroke="#667460" strokeWidth="2" strokeDasharray={edge.label === '関連' ? '5 4' : undefined} markerEnd={`url(#${marker})`} /><text x={midX} y={(startY + endY) / 2 - 7} textAnchor="middle" className="goal-edge-label">{edge.label}</text></g>
            })}
          </svg>
          {graph.nodes.map((node) => <button key={node.id} type="button" className={`goal-graph-node node-${node.type} ${node.id === `goal-${selectedId}` ? 'is-selected' : ''}`} style={{ left: node.x, top: node.y }} onClick={() => node.type === 'todo' ? setSelectedTaskId(node.id) : onSelect(node.goalId)}><small>{node.type === 'todo' ? 'ToDo' : node.type === 'decision' ? '判断待ちの目標' : '目標'} · {node.status}</small><strong>{node.title}</strong></button>)}
        </div>
      </div>
    </div>
    <details className="goal-graph-text"><summary>つながりを文章で確認</summary><ul>{graph.edges.map((edge) => <li key={`${edge.from}-${edge.to}`}>{byId.get(edge.from)?.title} → {edge.label} → {byId.get(edge.to)?.title}</li>)}</ul>{!graph.edges.length && <p>詳細から目標やToDoをつなぐと、矢印が表示されます。</p>}</details>
  </section>
}

export function MonthEditor({ label, date, disabled, onSave }) {
  const [month, setMonth] = useState(monthValue(date))
  const [error, setError] = useState('')
  return <form className="goal-month-editor" onSubmit={async (event) => {
    event.preventDefault()
    try { const success = await onSave(dateForMonth(month, date)); if (!success) setError('保存できませんでした。再試行してください。'); else setError('') } catch (error) { setError(error.message) }
  }}><label><span>{label}</span><input type="month" min="1900-01" max="9999-12" value={month} disabled={disabled} onChange={(event) => setMonth(event.target.value)} /></label><button type="submit" disabled={disabled || month === monthValue(date)}>保存</button>{error && <p role="alert">{error}</p>}</form>
}

function TimelineRow({ item, bounds, disabled, onSave, onSelect }) {
  const track = useRef(null)
  const drag = useRef(null)
  const [draft, setDraft] = useState(null)
  const current = draft === null ? item.target_date : `${draft}-01`
  const index = current ? monthIndex(current) : null
  const outside = index !== null && (index < bounds.start || index > bounds.end)
  const position = index === null ? 0 : Math.max(0, Math.min(100, (index - bounds.start) / (bounds.end - bounds.start) * 100))
  function move(event) {
    if (!drag.current) return
    const ratio = Math.max(0, Math.min(1, (event.clientX - drag.current.left) / drag.current.width))
    setDraft(monthAt(Math.round(bounds.start + ratio * (bounds.end - bounds.start))))
  }
  return <div className={`goal-timeline-row row-${item.type}`}>
    <button type="button" onClick={() => onSelect(item.goalId)}>{item.type === 'goal' ? '◇' : item.type === 'phase' ? '▰' : '○'} {item.title}</button>
    <div className="goal-timeline-track" ref={track}>
      {index !== null ? <button type="button" className="goal-timeline-point" aria-label={`${item.title}の予定を移動`} disabled={disabled} style={{ left: `clamp(24px, ${position}%, calc(100% - 24px))` }} onPointerDown={(event) => { if (event.button !== 0) return; drag.current = track.current.getBoundingClientRect(); event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={move} onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null; setDraft(null) }} onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setDraft(monthAt(Math.max(22800, Math.min(119999, index + (event.key === 'ArrowLeft' ? -1 : 1))))) } }}>◆</button> : <span>時期未定</span>}
    </div>
    <div className="goal-timeline-date"><span>{current ? monthValue(current) : '未定'}{outside ? '（表示範囲外）' : ''}</span>{draft !== null && <><button disabled={disabled} type="button" onClick={async () => { if (await onSave(dateForMonth(draft, item.target_date))) setDraft(null) }}>移動を保存</button><button type="button" onClick={() => setDraft(null)}>戻す</button></>}</div>
  </div>
}

const RANGES = [1, 3, 5, 10, 20, null]
export function GoalTimeline({ goals, phases, onUpdateGoal, onUpdatePhase, onUpdateMilestone, onSelect, disabled, workspaceReady }) {
  const [range, setRange] = useState(2)
  const items = goals.flatMap((goal) => [{ ...goal, type: 'goal', goalId: goal.id }, ...phases.filter((phase) => phase.goal_id === goal.id).map((phase) => ({ ...phase, type: 'phase', goalId: goal.id })), ...goal.milestones.map((item) => ({ ...item, type: 'milestone', goalId: goal.id }))])
  const bounds = timelineBounds(items, RANGES[range], todayInTokyo())
  const labels = Array.from({ length: 6 }, (_, index) => monthAt(Math.round(bounds.start + index / 5 * (bounds.end - bounds.start))))
  return <section className="goal-visual" aria-label="横断タイムライン">
    <label className="goal-range-label">表示期間：{RANGES[range] ? `${RANGES[range]}年` : '全期間'}<input type="range" min="0" max="5" step="1" value={range} aria-valuetext={RANGES[range] ? `${RANGES[range]}年` : '全期間'} onChange={(event) => setRange(Number(event.target.value))} /></label>
    <p className="goal-visual-hint">◆を左右に動かして保存。キーボードの矢印でも1か月ずつ変更できます。詳細では年月を直接入力できます。</p>
    <div className="goal-timeline-scroll" tabIndex={0} aria-label="時間軸を横スクロール"><div className="goal-timeline-table">
      <div className="goal-timeline-axis"><span>目標・フェーズ・節目</span><div>{labels.map((label) => <small key={label}>{label}</small>)}</div><span>予定年月</span></div>
      {items.map((item) => <TimelineRow key={`${item.type}-${item.id}-${item.target_date}`} item={item} bounds={bounds} disabled={disabled || (item.type === 'phase' && !workspaceReady)} onSelect={onSelect} onSave={(target_date) => (item.type === 'goal' ? onUpdateGoal : item.type === 'phase' ? onUpdatePhase : onUpdateMilestone)(item.id, { target_date, updated_at: new Date().toISOString() })} />)}
    </div></div>
  </section>
}

export function GoalRoadmap({ goal, phases, taskLinks, onSelect }) {
  if (!goal) return <p className="goal-detail-empty">目標を選ぶとロードマップを表示します。</p>
  const ordered = phases.filter((phase) => phase.goal_id === goal.id).sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
  const groups = [...ordered, { id: null, title: 'フェーズ未割当', status: '共通の節目・行動' }]
  return <section className="goal-visual" aria-label="目標のロードマップ"><h3>{goal.title}への道筋</h3><p className="goal-visual-hint">詳細からフェーズを追加し、節目とToDoを割り当てます。</p><div className="goal-roadmap-scroll"><ol className="goal-roadmap">{groups.map((phase, index) => {
    const milestones = goal.milestones.filter((item) => (item.phase_id || null) === phase.id)
    const tasks = goal.linkedTasks.filter((task) => (taskLinks.find((link) => link.goal_id === goal.id && link.task_id === task.id)?.phase_id || null) === phase.id)
    if (phase.id === null && !milestones.length && !tasks.length && ordered.length) return null
    return <li key={phase.id || 'unassigned'}><button type="button" onClick={() => onSelect(goal.id)}><small>{phase.id ? `STEP ${index + 1} · ${phase.status}` : phase.status}</small><strong>{phase.title}</strong><span>{phase.target_date ? monthValue(phase.target_date) : '時期未定'}</span></button>{phase.note && <p>{phase.note}</p>}<ul>{milestones.map((item) => <li key={`m-${item.id}`}>○ {item.title} · {item.status}</li>)}{tasks.map((item) => <li key={`t-${item.id}`}>✓ {item.title} · {item.status}</li>)}</ul></li>
  })}</ol></div></section>
}
