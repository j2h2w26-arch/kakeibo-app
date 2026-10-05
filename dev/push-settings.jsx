import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { PushNotificationSettings } from '../src/components/PushNotificationSettings'
import { createPushStorage } from '../src/lib/pushStorage'
import '../src/index.css'
import '../src/App.css'

// UI fixture only: no auth, network, permission prompt, SW registration or real data.
export default function Fixture() {
  const [status, setStatus] = useState('setup')
  const [online, setOnline] = useState(true)
  const [narrow, setNarrow] = useState(true)
  const [message, setMessage] = useState('')
  const [storageResult, setStorageResult] = useState('未実施')
  async function checkStorage() {
    try {
      const storage = createPushStorage({ open: (_name, version) => indexedDB.open('futari-push-qa-only-v1', version) })
      await storage.update(() => ({ revision: 0, sessionOwner: 'synthetic', record: null }))
      await Promise.all(Array.from({ length: 5 }, () => storage.update((value) => ({ ...value, revision: value.revision + 1 }))))
      const saved = await storage.read()
      setStorageResult(saved.revision === 5 ? '成功：実IndexedDBで5回の同時更新を保持' : '失敗：更新の欠落')
    } catch { setStorageResult('失敗：ストレージ操作不可') }
  }
  return <main style={{ maxWidth: narrow ? 390 : 1000, margin: '20px auto', padding: 12 }}>
    <h1>通知設定・隔離画面確認</h1>
    <p>合成状態のみ。外部通信・実通知はありません。</p>
    <button type="button" onClick={checkStorage}>隔離ストレージを検査</button><p role="status">{storageResult}</p>
    <label>確認する状態<select aria-label="確認する状態" value={status} onChange={(event) => { setStatus(event.target.value); setMessage('') }}>
      {['setup', 'checking', 'unsupported', 'denied', 'off', 'on', 'error'].map((value) => <option key={value}>{value}</option>)}
    </select></label>
    <label><input type="checkbox" checked={online} onChange={(event) => setOnline(event.target.checked)} />オンライン</label>
    <label><input type="checkbox" checked={narrow} onChange={(event) => setNarrow(event.target.checked)} />スマホ幅</label>
    <PushNotificationSettings key={status} state={{ status, busy: false, message, devices: status === 'on' ? [{ id: 'fixture', device_name: '自分のスマホ（合成データ）' }] : [] }} online={online}
      onEnable={() => { setStatus('on'); setMessage('合成状態：この端末を登録しました。') }}
      onStop={() => { setStatus('off'); setMessage('合成状態：この端末の通知を停止しました。') }}
      onRefresh={() => setMessage('合成状態：確認しました。')}
      onRemove={() => { setStatus('off'); setMessage('合成状態：登録を解除しました。') }} />
  </main>
}

const root = import.meta.hot?.data.root || createRoot(document.getElementById('root'))
if (import.meta.hot) import.meta.hot.data.root = root
root.render(<Fixture />)
