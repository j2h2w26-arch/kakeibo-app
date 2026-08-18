const FEATURES = {
  wishes: {
    eyebrow: 'WISH LIST',
    title: 'ふたりのWish',
    icon: '♡',
    description: '自分の欲しいもの、相手に贈りたいもの、ふたりで叶えたいことを一緒に育てます。',
    items: ['欲しい人と優先度', '価格・URL・購入予定月', 'コメントと買い物への連携'],
  },
  points: {
    eyebrow: 'POINT ACTIONS',
    title: '今日のポイ活',
    icon: '★',
    description: '散在する楽天ポイントの獲得先をまとめ、今日やることを順番に消化できる司令塔にします。',
    items: ['毎日・毎月の獲得先を集約', 'エントリーと条件の進捗管理', '公式ページを連続で巡回'],
  },
}

export function FeaturePreview({ feature, onBack }) {
  const content = FEATURES[feature]

  return (
    <section className="view feature-preview" aria-labelledby={`${feature}-title`}>
      <div className="preview-icon" aria-hidden="true">{content.icon}</div>
      <p className="eyebrow">{content.eyebrow}</p>
      <h2 id={`${feature}-title`}>{content.title}</h2>
      <p className="feature-preview-copy">{content.description}</p>

      <div className="preview-roadmap">
        <span>次の開発フェーズ</span>
        <ol>
          {content.items.map((item) => <li key={item}>{item}</li>)}
        </ol>
      </div>

      <button className="secondary-button" type="button" onClick={onBack}>ホームへ戻る</button>
    </section>
  )
}
