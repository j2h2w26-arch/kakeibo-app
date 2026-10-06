import test from 'node:test'
import assert from 'node:assert/strict'
import { createPwaUpdater } from './pwaUpdater.js'

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
function fixture({ waiting = true, controlled = true } = {}) {
  const calls = { reload: 0, update: 0, messages: [], registrations: [] }
  const worker = Object.assign(new EventTarget(), { state: 'installed', postMessage: (value) => calls.messages.push(value) })
  const reg = Object.assign(new EventTarget(), { waiting: waiting ? worker : null, installing: null, update: async () => { calls.update += 1 } })
  const sw = Object.assign(new EventTarget(), { controller: controlled ? {} : null, register: async (...args) => { calls.registrations.push(args); return reg } })
  const page = Object.assign(new EventTarget(), { visibilityState: 'visible' })
  const events = new EventTarget()
  const timerCallbacks = new Map()
  const timers = { setInterval: () => 1, clearInterval() {}, setTimeout: (fn) => { timerCallbacks.set(2, fn); return 2 }, clearTimeout: (id) => timerCallbacks.delete(id) }
  let online = true
  const updater = createPwaUpdater({ serviceWorker: sw, page, events, timers, isOnline: () => online, reload: () => { calls.reload += 1 } })
  return { updater, calls, worker, reg, sw, page, events, timerCallbacks, setOnline(value) { online = value; events.dispatchEvent(new Event(value ? 'online' : 'offline')) } }
}

test('待機中の新版を通知し、確認だけでは有効化や再読み込みをしない', async () => {
  const f = fixture()
  f.updater.start()
  await flush()
  assert.equal(f.updater.getSnapshot().hasUpdate, true)
  assert.equal(f.calls.reload, 0)
  assert.deepEqual(f.calls.messages, [])
  assert.deepEqual(f.calls.registrations[0], ['/sw.js', { scope: '/', updateViaCache: 'none' }])
  f.updater.stop()
})

test('明示確認・オンライン・保存完了の3条件が必要', async () => {
  const f = fixture()
  f.updater.start(); await flush()
  assert.equal(f.updater.apply(), false)
  assert.equal(f.updater.apply({ confirmed: true, busy: true }), false)
  f.setOnline(false)
  assert.equal(f.updater.apply({ confirmed: true }), false)
  assert.deepEqual(f.calls.messages, [])
  f.setOnline(true)
  assert.equal(f.updater.apply({ confirmed: true }), true)
  assert.deepEqual(f.calls.messages, [{ type: 'SKIP_WAITING' }])
  assert.equal(f.calls.reload, 0)
  f.sw.controller = {}; f.sw.dispatchEvent(new Event('controllerchange'))
  assert.equal(f.calls.reload, 1)
  f.updater.stop()
})

test('別タブによる有効化は強制リロードせず利用者の確認を待つ', async () => {
  const f = fixture()
  f.updater.start(); await flush()
  f.reg.waiting = null
  f.sw.controller = {}; f.sw.dispatchEvent(new Event('controllerchange'))
  assert.equal(f.calls.reload, 0)
  assert.equal(f.updater.getSnapshot().hasUpdate, true)
  assert.equal(f.updater.apply({ confirmed: true }), true)
  assert.equal(f.calls.reload, 1)
  f.updater.stop()
})

test('オフライン中は更新取得せず既存SW・キャッシュを消さない', async () => {
  const f = fixture()
  f.setOnline(false)
  f.updater.start(); await f.updater.check()
  assert.equal(f.calls.update, 0)
  assert.equal(f.calls.registrations.length, 0)
  assert.equal(f.updater.getSnapshot().online, false)
  f.updater.stop()
})

test('更新失敗・タイムアウトでも強制リロードしない', async () => {
  const f = fixture()
  f.updater.start(); await flush()
  f.reg.update = async () => { throw new Error('network') }
  await f.updater.check()
  assert.match(f.updater.getSnapshot().error, /確認できません/)
  f.updater.apply({ confirmed: true })
  f.timerCallbacks.get(2)()
  assert.equal(f.updater.getSnapshot().applying, false)
  assert.match(f.updater.getSnapshot().error, /切り替えを確認できません/)
  f.sw.controller = {}; f.sw.dispatchEvent(new Event('controllerchange'))
  assert.equal(f.calls.reload, 0)
  f.updater.stop()
})

test('初回インストールは更新と誤判定せず、後続の待機更新を検知する', async () => {
  const f = fixture({ waiting: false, controlled: false })
  f.updater.start(); await flush()
  f.sw.controller = {}; f.sw.dispatchEvent(new Event('controllerchange'))
  assert.equal(f.updater.getSnapshot().hasUpdate, false)
  f.reg.installing = f.worker
  f.reg.dispatchEvent(new Event('updatefound'))
  f.reg.waiting = f.worker
  f.worker.dispatchEvent(new Event('statechange'))
  assert.equal(f.updater.getSnapshot().hasUpdate, true)
  assert.equal(f.calls.reload, 0)
  f.updater.stop()
})

test('更新適用中に通信が切れた場合は再読み込みを見送る', async () => {
  const f = fixture()
  f.updater.start(); await flush()
  f.updater.apply({ confirmed: true })
  f.setOnline(false)
  f.sw.controller = {}; f.sw.dispatchEvent(new Event('controllerchange'))
  assert.equal(f.calls.reload, 0)
  assert.equal(f.updater.getSnapshot().applying, false)
  f.updater.stop()
})

test('復帰イベントを連打しても頻繁に確認せず、終了後は通知しない', async () => {
  const f = fixture()
  f.updater.start(); await flush()
  f.page.dispatchEvent(new Event('visibilitychange'))
  f.page.dispatchEvent(new Event('visibilitychange'))
  await flush()
  assert.equal(f.calls.update, 1)
  f.updater.stop()
  f.sw.controller = {}; f.sw.dispatchEvent(new Event('controllerchange'))
  assert.equal(f.calls.reload, 0)
})
