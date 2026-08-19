import { useState } from 'react'

const DEFAULT_PREFERENCES = {
  morning_enabled: false,
  morning_time: '08:00',
  evening_enabled: false,
  evening_time: '19:00',
}

export function DailyReminderSettings({ preferences, online, busy, onSave }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(() => ({ ...DEFAULT_PREFERENCES, ...(preferences || {}) }))
  const [error, setError] = useState('')

  async function save() {
    if ((form.morning_enabled || form.evening_enabled) && 'Notification' in window) {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setError('端末の通知が許可されていません。設定から通知を許可してください。')
        return
      }
    }
    const success = await onSave({
      morning_enabled: form.morning_enabled,
      morning_time: form.morning_time,
      evening_enabled: form.evening_enabled,
      evening_time: form.evening_time,
    })
    if (success) {
      setError('')
      setOpen(false)
    }
  }

  return (
    <div className="reminder-settings">
      <button className="reminder-settings-toggle" type="button" onClick={() => setOpen((value) => !value)}>
        <span>🔔 朝夕のお知らせ</span>
        <b>{preferences?.morning_enabled || preferences?.evening_enabled ? '設定中' : 'オフ'}</b>
      </button>
      {open && (
        <div className="reminder-settings-panel">
          <p>アプリを開いたとき、設定時刻を過ぎていれば1日1回お知らせします。</p>
          {[
            ['morning', '朝'],
            ['evening', '夕方'],
          ].map(([key, label]) => (
            <div className="reminder-setting-row" key={key}>
              <label>
                <input
                  type="checkbox"
                  checked={form[`${key}_enabled`]}
                  onChange={(event) => setForm({ ...form, [`${key}_enabled`]: event.target.checked })}
                />
                <span>{label}</span>
              </label>
              <input
                type="time"
                value={String(form[`${key}_time`]).slice(0, 5)}
                disabled={!form[`${key}_enabled`]}
                onChange={(event) => setForm({ ...form, [`${key}_time`]: event.target.value })}
              />
            </div>
          ))}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" type="button" disabled={!online || busy} onClick={save}>通知設定を保存</button>
        </div>
      )}
    </div>
  )
}
