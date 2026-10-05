import { createPushDevice } from './pushDevice'
import { createPushStorage } from './pushStorage'

export function publicPushKey(value) {
  if (!/^[A-Za-z0-9_-]{87}$/.test(value || '')) return null
  const bytes = Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='), (char) => char.charCodeAt(0))
  return bytes.length === 65 && bytes[0] === 4 ? bytes : null
}

const publicKey = publicPushKey(import.meta.env.VITE_PUSH_PUBLIC_KEY)
const configured = import.meta.env.VITE_PUSH_ENABLED === 'true' && !!publicKey
const capable = () => window.isSecureContext && 'Notification' in window && 'PushManager' in window
  && !!navigator.serviceWorker && !!navigator.locks && !!window.indexedDB

async function registration() {
  const value = await navigator.serviceWorker?.getRegistration('/')
  if (!value?.active || value.scope !== new URL('/', location.href).href) throw new Error('SW not ready')
  return value
}

const controller = createPushDevice({
  configured,
  capability: capable,
  permission: () => window.Notification?.permission || 'denied',
  requestPermission: () => Notification.requestPermission(),
  store: createPushStorage(window.indexedDB),
  lock: (action) => navigator.locks.request('futari-push-device', action),
  browser: {
    hasSubscription: async () => !!await (await registration()).pushManager.getSubscription(),
    subscribe: async () => (await (await registration()).pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey })).toJSON(),
    unsubscribe: async () => {
      const reg = await navigator.serviceWorker?.getRegistration('/')
      if (!reg) return
      const sub = await reg.pushManager?.getSubscription()
      if (sub) {
        await sub.unsubscribe()
        if (await reg.pushManager.getSubscription()) throw new Error('Unsubscribe incomplete')
      }
    },
    closeNotifications: async () => {
      const reg = await navigator.serviceWorker?.getRegistration('/')
      for (const notification of await reg?.getNotifications({ tag: 'futari-daily-push' }) || []) notification.close()
    },
  },
  api: async (credential, name, args) => {
    // Bind each request to the initiating session, never to a later account.
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST', cache: 'no-store', credentials: 'omit', redirect: 'error',
      headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${credential.token}` },
      body: JSON.stringify(args), signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) throw new Error('通知設定の操作に失敗しました。')
    return response.json()
  },
})

// A second tab must refresh its suppression state after consent changes.
const changes = typeof BroadcastChannel === 'function' ? new BroadcastChannel('futari-push-status-v1') : null
changes?.addEventListener('message', () => { void controller.inspect() })
export const pushDevice = {
  ...controller,
  enable: async (name) => { const result = await controller.enable(name); changes?.postMessage('changed'); return result },
  stop: async () => { const result = await controller.stop(); changes?.postMessage('changed'); return result },
  remove: async (id) => { const result = await controller.remove(id); changes?.postMessage('changed'); return result },
}

// Auth callbacks only invalidate local state; they never await another auth call.
export function updatePushSession(session) {
  pushDevice.setSession(session ? { userId: session.user.id, token: session.access_token } : null)
}

export async function stopPushBeforeSignOut() {
  if (!capable()) return true
  let timer
  try {
    return await Promise.race([pushDevice.stop(), new Promise((resolve) => { timer = setTimeout(() => resolve(false), 2500) })])
  } finally { clearTimeout(timer) }
}
