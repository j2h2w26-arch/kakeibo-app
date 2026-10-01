import { useRef, useSyncExternalStore } from 'react'
import './PwaUpdateNotice.css'

export function PwaUpdateNotice({ updater, busy }) {
  const state = useSyncExternalStore(updater.subscribe, updater.getSnapshot)
  const dialog = useRef(null)
  if (!state.supported) return null
  const blocked = busy || !state.online || state.applying
  return (
    <aside className={`pwa-update ${state.hasUpdate ? 'pwa-update--available' : ''}`} aria-label="アプリの更新">
      <details open={state.hasUpdate || undefined}>
        <summary>{state.hasUpdate ? '新しいバージョンがあります' : 'アプリの更新'}</summary>
        <p>表示中の版: {import.meta.env.VITE_APP_BUILD}</p>
        <p role="status">{state.error || (!state.online ? 'オフライン中です。接続後に更新できます。' : busy ? '保存処理中です。完了してから更新できます。' : state.applying ? '新版に切り替えています…' : state.hasUpdate ? '入力を保存してから切り替えてください。自動では再読み込みしません。' : state.checked ? '更新の確認ができました。新版が準備できるとお知らせします。' : '今の画面を保ったまま更新を確認できます。')}</p>
        <div className="pwa-update__actions">
          <button type="button" onClick={() => updater.check()} disabled={!state.online || state.checking || state.applying}>{state.checking ? '確認中…' : '更新を確認'}</button>
          {state.hasUpdate && <button type="button" onClick={() => dialog.current.showModal()} disabled={blocked}>新版に切り替える</button>}
        </div>
      </details>
      <dialog ref={dialog} aria-labelledby="pwa-confirm-title" onCancel={(event) => { if (state.applying) event.preventDefault() }}>
        <h2 id="pwa-confirm-title">入力は保存できましたか？</h2>
        <p>この画面を読み直します。まだ保存していない入力は失われます。他に開いている画面の入力も保存しておいてください。</p>
        <p role="status">{state.error || (!state.online ? '接続が戻ってから更新してください。' : busy ? '保存処理が終わるまでお待ちください。' : state.applying ? '新版に切り替えています…' : '')}</p>
        <div className="pwa-update__actions">
          <button type="button" onClick={() => dialog.current.close()} disabled={state.applying}>戻って保存する</button>
          <button type="button" onClick={() => updater.apply({ confirmed: true, busy })} disabled={blocked}>保存済み・更新する</button>
        </div>
      </dialog>
    </aside>
  )
}
