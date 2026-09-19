import { useState } from 'react'
import { LifePlanningView } from './LifePlanningView'
import { LifeTasksView } from './LifeTasksView'
import { WishView } from './WishView'

export function WishHubView({ wishes, lifeTasks, lifeGoals, wishProps, lifeTaskProps, lifePlanningProps }) {
  const [section, setSection] = useState('goals')
  const openWishes = wishes.filter((wish) => !wish.is_completed).length
  const openLifeTasks = lifeTasks.filter((task) => task.status !== '完了').length
  const openLifeGoals = lifeGoals.filter((goal) => !goal.is_archived && goal.status !== '達成').length

  return (
    <>
      <div className="wish-hub-tabs" role="group" aria-label="未来機能の表示切り替え">
        <button
          id="life-goals-tab"
          type="button"
          aria-pressed={section === 'goals'}
          aria-controls="life-goals-panel"
          className={section === 'goals' ? 'active' : ''}
          onClick={() => setSection('goals')}
        >
          <span aria-hidden="true">◇</span>
          <strong>目標マップ</strong>
          <small>{openLifeGoals}件</small>
        </button>
        <button
          id="life-tasks-tab"
          type="button"
          aria-pressed={section === 'life'}
          aria-controls="life-tasks-panel"
          className={section === 'life' ? 'active' : ''}
          onClick={() => setSection('life')}
        >
          <span aria-hidden="true">◎</span>
          <strong>人生ToDo</strong>
          <small>{openLifeTasks}件</small>
        </button>
        <button
          id="wish-list-tab"
          type="button"
          aria-pressed={section === 'wishes'}
          aria-controls="wish-list-panel"
          className={section === 'wishes' ? 'active' : ''}
          onClick={() => setSection('wishes')}
        >
          <span aria-hidden="true">♡</span>
          <strong>Wishリスト</strong>
          <small>{openWishes}件</small>
        </button>
      </div>

      <div id="life-goals-panel" hidden={section !== 'goals'}>
        <LifePlanningView goals={lifeGoals} tasks={lifeTasks} {...lifePlanningProps} />
      </div>
      <div
        id="wish-list-panel"
        hidden={section !== 'wishes'}
      >
        <WishView wishes={wishes} {...wishProps} />
      </div>
      <div
        id="life-tasks-panel"
        hidden={section !== 'life'}
      >
        <LifeTasksView tasks={lifeTasks} {...lifeTaskProps} />
      </div>
    </>
  )
}
