import { useState } from 'react'

const STATUS = {
  setup: ['準備中', '配信の準備が完了してから利用できます。今は通知許可を求めず、端末も登録しません。'],
  checking: ['確認中', 'この端末の登録状態を確認しています。'],
  unsupported: ['この環境では利用できません', 'iPhone・iPadはホーム画面に追加して開いてください。対応する新しいブラウザーとHTTPS接続が必要です。'],
  denied: ['通知が許可されていません', 'OSまたはブラウザーのサイト設定から通知を許可してください。勝手に許可を求め直すことはありません。'],
  off: ['この端末はオフ', '受け取りたい端末で、ご本人が登録してください。'],
  on: ['この端末は登録済み', '配信は朝夕の設定と対象の有無に従います。到着時刻や必達は保証されません。'],
  error: ['確認が必要です', '通信・端末の設定をご確認のうえ、再確認してください。'],
}

export function PushNotificationSettings({ state, online, onEnable, onStop, onRefresh, onRemove }) {
  const [name, setName] = useState('自分のスマホ')
  const [consent, setConsent] = useState(false)
  const [title, detail] = STATUS[state.status] || STATUS.error
  const canEnable = ['off', 'error'].includes(state.status)
  return (
    <section className="push-settings" aria-labelledby="push-title" aria-busy={state.busy}>
      <h3 id="push-title">アプリを閉じていても届く通知</h3>
      <p className="push-status">{title}</p>
      <p>{detail}</p>
      <p>通知には「今日のやることを確認しましょう」とだけ表示します。金額・品名・写真は表示しません。</p>
      {canEnable && <div className="push-controls">
        <label htmlFor="push-device-name">この端末の名前</label>
        <input id="push-device-name" value={name} maxLength={40} onChange={(event) => setName(event.target.value)} disabled={state.busy} />
        <label className="push-consent"><input type="checkbox" checked={consent} disabled={state.busy} onChange={(event) => setConsent(event.target.checked)} />
          この端末で通知を受け取ることに同意します</label>
        <button type="button" className="primary-button" disabled={!online || state.busy || !consent || !name.trim()}
          onClick={() => onEnable(name)}>この端末で通知を受け取る</button>
      </div>}
      {state.status !== 'setup' && state.status !== 'unsupported' && <div className="push-actions">
        <button className="secondary-button" type="button" disabled={state.busy || !online} onClick={onRefresh}>状態を再確認</button>
        <button className="secondary-button" type="button" disabled={state.busy} onClick={onStop}>この端末の通知を停止</button>
      </div>}
      {!online && <p>オフラインです。端末側の停止は試みますが、サーバー側の解除はオンラインで再確認が必要です。</p>}
      {state.message && <p className="push-feedback" role="status">{state.message}</p>}
      {state.devices.length > 0 && <div>
        <h4>自分が登録した端末</h4>
        <ul className="push-devices">{state.devices.map((item) => <li key={item.id}>
          <span>{item.device_name}</span>
          <button className="secondary-button" type="button" disabled={state.busy || !online}
            onClick={() => window.confirm(`「${item.device_name}」への新しい配信を停止しますか？`) && onRemove(item.id)}>登録を解除</button>
        </li>)}</ul>
      </div>}
      <p className="push-note">朝夕の時刻は上の「朝夕のお知らせ」で変更します。両方オフなら定期通知はありません。省電力・集中モード・通信状況により遅れる場合があります。</p>
    </section>
  )
}
