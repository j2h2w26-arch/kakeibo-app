import { useState } from 'react'
import { dateForMonth, monthValue } from '../lib/lifePlanning'

export function GoalStructureEditor({ goal, goals, phases, relations, disabled, onCreatePhase, onUpdatePhase, onCreateRelation, onRemoveRelation }) {
  const [phaseForm, setPhaseForm] = useState(null)
  const [target, setTarget] = useState('')
  const [kind, setKind] = useState('支える')
  const [error, setError] = useState('')
  const ownPhases = phases.filter((phase) => phase.goal_id === goal.id).sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
  const ownRelations = relations.filter((edge) => edge.source_goal_id === goal.id || edge.target_goal_id === goal.id)
  return <>
    <section className="goal-detail-section"><h3>フェーズ</h3><p className="goal-detail-empty">例：設計 → 調査 → 準備 → 判断 → 実行。順序の小さいものから並びます。</p>
      {ownPhases.map((phase) => <div className="goal-phase-row" key={phase.id}><div><strong>{phase.title}</strong><small>順序 {phase.sort_order} · {phase.status} · {monthValue(phase.target_date) || '時期未定'}</small></div><button type="button" disabled={disabled} onClick={() => setPhaseForm({ ...phase, month: monthValue(phase.target_date), note: phase.note || '' })}>編集</button></div>)}
      {phaseForm ? <form className="goal-inline-form" onSubmit={async (event) => {
        event.preventDefault()
        if (!phaseForm.title.trim()) return
        try {
          const input = { title: phaseForm.title.trim(), note: phaseForm.note.trim() || null, status: phaseForm.status, target_date: dateForMonth(phaseForm.month, phaseForm.target_date), sort_order: Number(phaseForm.sort_order), updated_at: new Date().toISOString() }
          const success = phaseForm.id ? await onUpdatePhase(phaseForm.id, input) : await onCreatePhase({ ...input, goal_id: goal.id })
          if (success) { setPhaseForm(null); setError('') }
        } catch (error) { setError(error.message) }
      }}>
        <label>フェーズ名<input required maxLength="100" value={phaseForm.title} onChange={(event) => setPhaseForm({ ...phaseForm, title: event.target.value })} /></label>
        <label>フェーズのメモ<textarea maxLength="1000" value={phaseForm.note} onChange={(event) => setPhaseForm({ ...phaseForm, note: event.target.value })} /></label>
        <label>フェーズの順序<input type="number" required min="0" max="10000" value={phaseForm.sort_order} onChange={(event) => setPhaseForm({ ...phaseForm, sort_order: event.target.value })} /></label>
        <label>フェーズの状態<select value={phaseForm.status} onChange={(event) => setPhaseForm({ ...phaseForm, status: event.target.value })}>{['未着手', '進行中', '完了'].map((status) => <option key={status}>{status}</option>)}</select></label>
        <label>フェーズの予定年月<input type="month" min="1900-01" max="9999-12" value={phaseForm.month} onChange={(event) => setPhaseForm({ ...phaseForm, month: event.target.value })} /></label>
        {error && <p role="alert">{error}</p>}<div><button type="button" onClick={() => setPhaseForm(null)}>キャンセル</button><button disabled={disabled} type="submit">フェーズを保存</button></div>
      </form> : <button className="goal-add-detail" type="button" disabled={disabled} onClick={() => setPhaseForm({ title: '', note: '', month: '', status: '未着手', sort_order: Math.max(0, ...ownPhases.map((phase) => phase.sort_order)) + 10 })}>＋ フェーズを追加</button>}
    </section>
    <section className="goal-detail-section"><h3>目標同士のつながり</h3>
      {ownRelations.map((edge) => <div className="goal-relation-row" key={`${edge.source_goal_id}-${edge.target_goal_id}`}><span>{goals.find((item) => item.id === edge.source_goal_id)?.title || '非表示の目標'} → {edge.kind} → {goals.find((item) => item.id === edge.target_goal_id)?.title || '非表示の目標'}</span><button type="button" disabled={disabled} onClick={() => onRemoveRelation(edge.source_goal_id, edge.target_goal_id)}>解除</button></div>)}
      <form className="goal-inline-form" onSubmit={async (event) => { event.preventDefault(); if (target && await onCreateRelation({ source_goal_id: goal.id, target_goal_id: Number(target), kind })) setTarget('') }}>
        <label>この目標が<select value={kind} onChange={(event) => setKind(event.target.value)}>{['支える', '前提', '関連'].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>つなぐ先の目標<select required value={target} onChange={(event) => setTarget(event.target.value)}><option value="">選択してください</option>{goals.filter((item) => item.id !== goal.id && !item.is_archived && !relations.some((edge) => edge.source_goal_id === goal.id && edge.target_goal_id === item.id)).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <button type="submit" disabled={disabled || !target}>目標をつなぐ</button>
      </form>
    </section>
  </>
}
