import { AppIcon } from './AppIcon'

const MODULES = [
  {
    id: 'money',
    eyebrow: 'MONEY',
    title: 'お金',
    description: '貸し借り・精算・家計簿',
    tone: 'violet',
  },
  {
    id: 'shopping',
    eyebrow: 'SHOPPING',
    title: '買い物',
    description: '買い物リスト・家の在庫',
    tone: 'cyan',
  },
  {
    id: 'wishes',
    eyebrow: 'WISH',
    title: 'Wish',
    description: '欲しいもの・人生ToDo',
    tone: 'rose',
  },
  {
    id: 'points',
    eyebrow: 'POINT ACTIONS',
    title: 'ポイ活',
    description: '今日のアクション・キャンペーン',
    tone: 'amber',
  },
]

export function HomeView({ member, onNavigate }) {
  return (
    <section className="view home-view" aria-labelledby="home-title">
      <div className="function-chooser-heading">
        <p className="eyebrow">FUTARI HOME</p>
        <h2 id="home-title">今日は、なにをする？</h2>
        <p>{member.display_name}さんが使いたい機能を選んでください。</p>
      </div>
      <div className="function-chooser-grid">
        {MODULES.map((module, index) => (
          <button
            className={`function-choice ${module.tone}`}
            type="button"
            key={module.id}
            onClick={() => onNavigate(module.id)}
            style={{ '--choice-index': index }}
          >
            <span className="function-choice-icon" aria-hidden="true"><AppIcon name={module.id} size={31} /></span>
            <span className="function-choice-copy">
              <small>{module.eyebrow}</small>
              <strong>{module.title}</strong>
              <span>{module.description}</span>
            </span>
            <i aria-hidden="true">→</i>
          </button>
        ))}
      </div>
    </section>
  )
}
