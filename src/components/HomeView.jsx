import { AppIcon } from './AppIcon'

const MODULES = [
  {
    id: 'money',
    title: 'お金',
    description: '貸し借り・家計簿',
    tone: 'violet',
  },
  {
    id: 'shopping',
    title: '暮らし',
    description: '買い物・在庫・家事',
    tone: 'cyan',
  },
  {
    id: 'wishes',
    title: '未来',
    description: '目標・人生ToDo・Wish',
    tone: 'rose',
  },
  {
    id: 'points',
    title: 'ポイント',
    description: '今日できること',
    tone: 'amber',
  },
]

export function HomeView({ member, onNavigate }) {
  return (
    <section className="view home-view function-chooser" aria-labelledby="home-title">
      <div className="function-chooser-heading">
        <p className="eyebrow">ふたりの暮らし</p>
        <h2 id="home-title">今日は、何をしよう？</h2>
        <p>{member.display_name}さん、使いたい機能を選んでください。</p>
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
              <strong>{module.title}</strong>
              <span>{module.description}</span>
            </span>
            <i aria-hidden="true">↗</i>
          </button>
        ))}
      </div>
    </section>
  )
}
