import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { PUSH_DB, PUSH_STORE } from '../src/lib/pushStorage.js'

const source = await readFile(new URL('../public/push-worker.js', import.meta.url), 'utf8')
function worker({ saved = { sessionOwner: 'a', record: { owner: 'a', id: 'sub-a', enabled: true } }, permission = 'granted', brokenStorage = false } = {}) {
  const handlers = {}
  const notifications = []
  const opened = []
  const unsubscribed = []
  const indexedDB = { open(name, version) {
    assert.equal(name, PUSH_DB); assert.equal(version, 1)
    const request = {}
    queueMicrotask(() => {
      if (brokenStorage) return request.onerror()
      request.result = { close() {}, transaction(store) {
        assert.equal(store, PUSH_STORE)
        const transaction = { objectStore() { return { get(key) {
          assert.equal(key, 'consent')
          const item = { result: saved }
          queueMicrotask(() => transaction.oncomplete())
          return item
        } } } }
        return transaction
      } }
      request.onsuccess()
    })
    return request
  } }
  const self = { addEventListener: (name, listener) => { handlers[name] = listener },
    location: { origin: 'https://app.example' },
    clients: { openWindow: async (url) => opened.push(url) },
    registration: { showNotification: async (title, options) => notifications.push({ title, ...options }),
      pushManager: { getSubscription: async () => ({ unsubscribe: async () => unsubscribed.push(true) }) } } }
  vm.runInNewContext(source, { self, indexedDB, Notification: { permission }, Date, URL })
  const payload = { type: 'futari-daily-v1', subscriptionId: 'sub-a', scheduledAt: Date.now() - 1000, expiresAt: Date.now() + 10000 }
  return { notifications, opened, unsubscribed, handlers, payload,
    send: async (data) => { let done; handlers.push({ data: { json: () => data }, waitUntil: (promise) => { done = promise } }); await done },
    click: async (data) => { let done; handlers.notificationclick({ notification: { data, close() {} }, waitUntil: (p) => { done = p } }); await done },
  }
}

test('Push receiver uses only generic text and a fixed same-origin destination', async () => {
  const f = worker()
  await f.send({ ...f.payload, title: 'secret', body: 'private money', url: 'https://evil.example' })
  assert.equal(f.notifications.length, 1)
  assert.equal(f.notifications[0].body, '今日のやることを確認しましょう')
  assert.equal(f.notifications[0].title, 'ふたりの暮らし')
  assert.equal(JSON.stringify(f.notifications).includes('secret'), false)
  await f.click({ type: 'futari-daily-v1', url: 'https://evil.example' })
  assert.deepEqual(f.opened, ['https://app.example/'])
})

test('Missing/revoked consent, wrong owner/subscription, blocked permission, unavailable storage do not notify', async () => {
  for (const options of [
    { saved: null },
    { saved: { sessionOwner: 'a', record: { id: 'sub-a', owner: 'a', enabled: false } } },
    { saved: { sessionOwner: 'b', record: { id: 'sub-a', owner: 'a', enabled: true } } },
    { saved: { sessionOwner: 'a', record: { id: 'other', owner: 'a', enabled: true } } },
    { permission: 'denied' }, { brokenStorage: true },
  ]) {
    const f = worker(options); await f.send(f.payload); assert.equal(f.notifications.length, 0)
  }
})

test('Expired, future, oversized lifetime and malformed messages are ignored', async () => {
  const f = worker()
  for (const message of [null, {}, { ...f.payload, expiresAt: Date.now() - 1 },
    { ...f.payload, scheduledAt: Date.now() + 10000 }, { ...f.payload, expiresAt: Date.now() + 3600001 },
    { ...f.payload, expiresAt: 'tomorrow' }, { ...f.payload, type: 'unknown' }]) await f.send(message)
  assert.equal(f.notifications.length, 0)
})

test('Receiver does not replace install/activate/update handlers or auto-register renewed subscriptions', async () => {
  const f = worker()
  assert.deepEqual(Object.keys(f.handlers).sort(), ['notificationclick', 'push', 'pushsubscriptionchange'])
  let done
  f.handlers.pushsubscriptionchange({ waitUntil: (promise) => { done = promise } }); await done
  assert.equal(f.unsubscribed.length, 1)
  const vite = await readFile(new URL('../vite.config.js', import.meta.url), 'utf8')
  assert.match(vite, /importScripts: \['\/push-worker.js'\]/)
  assert.match(vite, /skipWaiting: false/)
  assert.match(vite, /registerType: 'prompt'/)
  assert.match(vite, /navigateFallback: '\/index.html'/)
})
