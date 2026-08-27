import { useState } from 'react'
import { LifeTasksView } from './LifeTasksView'
import { WishView } from './WishView'

export function WishHubView({ wishes, lifeTasks, wishProps, lifeTaskProps }) {
  const [section, setSection] = useState('wishes')
  const openWishes = wishes.filter((wish) => !wish.is_completed).length
  const openLifeTasks = lifeTasks.filter((task) => task.status !== '完了').length

  return (
    <>
      <div className="wish-hub-tabs" role="group" aria-label="Wishの表示切り替え">
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
