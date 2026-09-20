import { useState } from 'react'
import { LifePlanningView } from '../src/components/LifePlanningView'
import { HomeView } from '../src/components/HomeView'
import { LivingHubView } from '../src/components/LivingHubView'
import { LoanView } from '../src/components/LoanView'
import { PointActionsView } from '../src/components/PointActionsView'
import { WishView } from '../src/components/WishView'
import { LifeTasksView } from '../src/components/LifeTasksView'
import { SettingsView } from '../src/components/SettingsView'
import { AppIcon } from '../src/components/AppIcon'
import '../src/index.css'
import '../src/App.css'

// Local-only fixture entry, never imported by the production application.
if (!import.meta.env.DEV) throw new Error('Development fixture only')
const cacheKey = 'life-planning-synthetic-preview'
const member = { user_id: 'fixture', display_name: '検証' }
const initial = {
  goals: [
    { id: 1, title: 'アメリカで暮らす', category: '旅行・移住', owner: 'ふたり', horizon: '5年以内', status: '進行中', vision: 'ふたりで新しい暮らしをつくる', target_date: '2031-09-20', is_archived: false },
    { id: 2, title: '実務英語を身につける', category: '学び', owner: '夫', horizon: '1年以内', status: '進行中', target_date: '2027-09-01', is_archived: false },
    { id: 3, title: '外資系企業へ転職', category: 'キャリア', owner: '妻', horizon: '3年以内', status: '検討中', target_date: '2029-09-01', is_archived: false },
    { id: 4, title: '移住資金を貯める', category: 'お金', owner: 'ふたり', horizon: '3年以内', status: '進行中', target_date: '2029-09-01', is_archived: false },
    { id: 5, title: '以前に保存済みにした目標', category: 'その他', owner: 'ふたり', horizon: 'いつか', status: '検討中', target_date: null, is_archived: true },
  ],
  tasks: [{ id: 10, title: '英語面接を週2回練習する', status: '進行中', assigned_to: 'ふたり' }],
  routes: [{ id: 1, goal_id: 1, title: '現地で就職', status: '候補', sort_order: 0 }],
  milestones: [{ id: 1, goal_id: 1, title: '移住の条件を調べる', status: '未着手', target_date: '2027-02-15', phase_id: 1, sort_order: 0 }],
  phases: [{ id: 1, goal_id: 1, title: '調査', status: '進行中', target_date: '2027-03-01', sort_order: 10 }, { id: 2, goal_id: 1, title: '準備', status: '未着手', target_date: '2028-03-01', sort_order: 20 }],
  taskLinks: [{ goal_id: 2, task_id: 10 }, { goal_id: 3, task_id: 10 }],
  relations: [{ source_goal_id: 2, target_goal_id: 1, kind: '支える' }, { source_goal_id: 3, target_goal_id: 1, kind: '前提' }, { source_goal_id: 4, target_goal_id: 1, kind: '支える' }],
}

export default function Preview() {
  const [data, setData] = useState(() => JSON.parse(localStorage.getItem(cacheKey) || 'null') || initial)
  const [online, setOnline] = useState(true)
  const [fail, setFail] = useState(false)
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState('wishes')
  function change(update) {
    if (!online || fail) { setNotice('保存に失敗しました（検証用）。入力は保持されます。'); return false }
    setData((current) => { const next = update(current); localStorage.setItem(cacheKey, JSON.stringify(next)); return next })
    setNotice('保存しました（テストデータのみ）')
    return true
  }
  const update = (table) => (id, input) => change((current) => ({ ...current, [table]: current[table].map((item) => item.id === id ? { ...item, ...input } : item) }))
  const create = (table) => (input) => change((current) => ({ ...current, [table]: [...current[table], { ...input, id: Math.max(0, ...current[table].map((item) => item.id || 0)) + 1 }] }))
  return <div className={`app-shell theme-${tab}`}>
    <header className="app-header"><h1>ふたりの暮らし</h1><span>ローカル検証</span></header>
    <div style={{ padding: 12 }}><label><input type="checkbox" checked={!online} onChange={(event) => setOnline(!event.target.checked)} />オフライン</label><label><input type="checkbox" checked={fail} onChange={(event) => setFail(event.target.checked)} />保存エラー</label><button type="button" onClick={() => { localStorage.removeItem(cacheKey); setData(initial) }}>テストデータを初期化</button><label>確認画面<select value={tab} onChange={(event) => setTab(event.target.value)}>{[['home','ホーム'],['money','お金'],['shopping','暮らし'],['wishes','人生設計'],['points','ポイント'],['wish-list','Wish'],['tasks','人生ToDo'],['settings','設定']].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><p role="status">{notice}</p></div>
    <main className="app-content">{tab === 'home' ? <HomeView member={member} onNavigate={setTab} />
      : tab === 'money' ? <LoanView loans={[]} repayments={{}} expenses={[]} online={false} />
      : tab === 'shopping' ? <LivingHubView shoppingProps={{items:[{id:1,name:'買い物の表示を確認するためのテスト項目',category:'食材',is_purchased:false}],inventoryItems:[],inventorySchemaReady:true,online:false}} choreProps={{chores:[],appliances:[],completions:[],schemaReady:true,today:'2026-09-20',online:false}} />
      : tab === 'points' ? <PointActionsView activities={[]} completions={[]} sources={[]} campaigns={[]} campaignSteps={[]} campaignStates={[]} servicePreferences={[]} syncRuns={[]} member={member} campaignSchemaReady online={false} />
      : tab === 'wish-list' ? <WishView wishes={[]} comments={[]} online={false} />
      : tab === 'tasks' ? <LifeTasksView tasks={data.tasks} schemaReady online={false} />
      : tab === 'settings' ? <SettingsView online={false} onBack={() => setTab('home')} onSignOut={() => setTab('home')} />
      : <LifePlanningView {...data} schemaReady workspaceReady online={online} busy={false}
      onCreateGoal={create('goals')} onUpdateGoal={update('goals')}
      onCreateRoute={create('routes')} onUpdateRoute={update('routes')}
      onCreateMilestone={create('milestones')} onUpdateMilestone={update('milestones')}
      onCreatePhase={create('phases')} onUpdatePhase={update('phases')}
      onCreateRelation={create('relations')}
      onRemoveRelation={(source, target) => change((current) => ({ ...current, relations: current.relations.filter((item) => item.source_goal_id !== source || item.target_goal_id !== target) }))}
      onLinkTask={(goal_id, task_id) => create('taskLinks')({ goal_id, task_id })}
      onUnlinkTask={(goal, task) => change((current) => ({ ...current, taskLinks: current.taskLinks.filter((item) => item.goal_id !== goal || item.task_id !== task) }))}
      onAssignTaskPhase={(goal, task, phase_id) => change((current) => ({ ...current, taskLinks: current.taskLinks.map((item) => item.goal_id === goal && item.task_id === task ? { ...item, phase_id } : item) }))}
    />}</main>
    <nav className="bottom-nav" aria-label="機能を切り替える">{[['home', '選ぶ'], ['money', 'お金'], ['shopping', '暮らし'], ['wishes', '未来'], ['points', 'ポイント']].map(([id, label]) => <button type="button" key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><span><AppIcon name={id} /></span><b>{label}</b></button>)}</nav>
  </div>
}
