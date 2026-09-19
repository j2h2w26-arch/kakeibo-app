import { useState } from 'react'
import { HouseworkView } from './HouseworkView'
import { ShoppingView } from './ShoppingView'

export function LivingHubView({ shoppingProps, choreProps }) {
  const [section, setSection] = useState('shopping')
  const dueChores = choreProps.chores.filter((chore) => (
    chore.is_active && chore.next_due_on && chore.next_due_on <= choreProps.today
  )).length

  return (
    <>
      <div className="living-hub-tabs" role="group" aria-label="暮らしの機能を切り替える">
        <button
          type="button"
          className={section === 'shopping' ? 'active' : ''}
          aria-pressed={section === 'shopping'}
          onClick={() => setSection('shopping')}
        >
          <span aria-hidden="true">☐</span>
          <strong>買い物・在庫</strong>
          <small>{shoppingProps.items.filter((item) => !item.is_purchased).length}件</small>
        </button>
        <button
          type="button"
          className={section === 'chores' ? 'active' : ''}
          aria-pressed={section === 'chores'}
          onClick={() => setSection('chores')}
        >
          <span aria-hidden="true">◎</span>
          <strong>家事</strong>
          <small>{dueChores ? `期限 ${dueChores}件` : '順調'}</small>
        </button>
      </div>
      <div hidden={section !== 'shopping'}><ShoppingView {...shoppingProps} /></div>
      <div hidden={section !== 'chores'}><HouseworkView {...choreProps} /></div>
    </>
  )
}
