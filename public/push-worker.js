/* Additional handlers for the existing Workbox worker; no install/activate/skipWaiting. */
(() => {
  const DB = 'futari-push-consent-v1'
  const STORE = 'device'
  function readConsent() {
    return new Promise((resolve, reject) => {
      const open = indexedDB.open(DB, 1)
      open.onupgradeneeded = () => open.result.createObjectStore(STORE)
      open.onerror = open.onblocked = () => reject(new Error('No consent storage'))
      open.onsuccess = () => {
        const db = open.result
        const tx = db.transaction(STORE, 'readonly')
        const request = tx.objectStore(STORE).get('consent')
        tx.oncomplete = () => { db.close(); resolve(request.result) }
        tx.onerror = () => { db.close(); reject(new Error('No consent')) }
      }
    })
  }
  self.addEventListener('push', (event) => {
    event.waitUntil((async () => {
      try {
        const data = event.data?.json()
        const now = Date.now()
        // Payload contract for the future sender. Ignore arbitrary text and URLs.
        if (data?.type !== 'futari-daily-v1' || typeof data.subscriptionId !== 'string'
          || !Number.isSafeInteger(data.scheduledAt) || !Number.isSafeInteger(data.expiresAt)
          || data.scheduledAt > now || data.expiresAt <= now
          || data.expiresAt - data.scheduledAt > 3600000 || data.expiresAt <= data.scheduledAt) return
        const saved = await readConsent()
        if (!saved?.record?.enabled || saved.sessionOwner !== saved.record.owner
          || saved.record.id !== data.subscriptionId || Notification.permission !== 'granted') return
        await self.registration.showNotification('ふたりの暮らし', {
          body: '今日のやることを確認しましょう', tag: 'futari-daily-push',
          icon: '/futari-home-192x192.png', badge: '/futari-home-192x192.png',
          data: { type: 'futari-daily-v1' }, renotify: false,
        })
      } catch { /* Fail closed; never log payloads or delivery addresses. */ }
    })())
  })
  self.addEventListener('notificationclick', (event) => {
    if (event.notification.data?.type !== 'futari-daily-v1') return
    event.notification.close()
    // Fixed same-origin home. No URL or sensitive data from the push payload.
    event.waitUntil(self.clients.openWindow(new URL('/', self.location.origin).href))
  })
  self.addEventListener('pushsubscriptionchange', (event) => {
    // Do not silently re-register a new endpoint without the signed-in person's consent.
    event.waitUntil((async () => {
      const subscription = await self.registration.pushManager.getSubscription()
      if (subscription) await subscription.unsubscribe()
    })().catch(() => {}))
  })
})()
