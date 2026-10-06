import { DailyReminderSettings } from './DailyReminderSettings'
import { PushNotificationSettings } from './PushNotificationSettings'

export function SettingsView({ preferences, online, busy, onSave, onBack, onSignOut, pushState, pushActions }) {
  return (
    <section className="view settings-view" aria-labelledby="settings-title">
      <button className="back-button" type="button" onClick={onBack}>← 機能を選ぶ</button>
      <p className="eyebrow">SETTINGS</p>
      <h2 id="settings-title">設定</h2>
      <p className="settings-copy">お知らせの時間はここから変更できます。</p>
      <DailyReminderSettings
        key={preferences?.updated_at || 'notification-default'}
        preferences={preferences}
        online={online}
        busy={busy}
        onSave={onSave}
      />
      <PushNotificationSettings state={pushState} online={online} {...pushActions} />
      <button className="settings-sign-out" type="button" onClick={() => window.confirm('ログアウトしますか？') && onSignOut()}>ログアウト</button>
    </section>
  )
}
