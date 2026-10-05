export const PUSH_STOP_WARNING = '通知の停止を一部確認できませんでした。端末の通知設定でこのサイトをオフにし、再ログイン後に登録端末を確認してください。'

// Dependencies are injected so permission, races and failures can be tested without
// contacting any push service or creating a real subscription.
export function createPushDevice({ configured, capability, permission, requestPermission, store, lock, browser, api }) {
  let session = null
  let initialized = false
  let generation = 0
  let state = { status: configured ? 'checking' : 'setup', busy: false, devices: [], suppressOs: true, message: '' }
  const listeners = new Set()
  function publish(patch) {
    state = { ...state, ...patch }
    listeners.forEach((listener) => listener())
  }
  async function disableLocal() {
    return store.update((value) => ({ ...value, revision: value.revision + 1,
      record: value.record ? { ...value.record, enabled: false } : null }))
  }
  async function clean(credential) {
    let ok = true
    let saved
    try { saved = await store.read() } catch { ok = false }
    if (saved?.record?.enabled && saved.record.owner !== credential?.userId) return false
    try { await browser.unsubscribe(); await browser.closeNotifications() } catch { ok = false }
    if (saved?.record) {
      if (credential?.userId === saved.record.owner) {
        try {
          await api(credential, 'remove_push_subscription', { p_id: saved.record.id })
          await store.update((value) => value.record?.id === saved.record.id
            ? { ...value, record: null } : value)
        } catch { ok = false }
      } else ok = false // Keep the ID for the original owner to retry; never transfer it.
    }
    return ok
  }
  async function inspect() {
    const mine = generation
    const credential = session
    if (!capability()) {
      publish({ status: configured ? 'unsupported' : 'setup', suppressOs: false })
      return
    }
    await lock(async () => {
      if (mine !== generation) return
      try {
        let saved = await store.read()
        if (saved.sessionOwner !== (credential?.userId || null)) {
          saved = await store.update((value) => ({ ...value, sessionOwner: credential?.userId || null,
            revision: value.revision + 1, record: value.record ? { ...value.record, enabled: false } : null }))
        }
        if (!configured || !credential || permission() !== 'granted' || !saved.record?.enabled) {
          await disableLocal()
          const ok = await clean(credential)
          if (mine === generation) publish({ status: !configured ? 'setup' : permission() === 'denied' ? 'denied' : 'off',
            suppressOs: !ok, message: ok ? '' : PUSH_STOP_WARNING })
        } else {
          const devices = await api(credential, 'list_push_subscriptions', {})
          const subscribed = await browser.hasSubscription()
          const active = subscribed && devices.some((item) => item.id === saved.record.id)
          if (!active) { await disableLocal(); await clean(credential) }
          if (mine === generation) publish({ status: active ? 'on' : 'off', devices, suppressOs: active, message: '' })
        }
        if (configured && credential && mine === generation) {
          const devices = await api(credential, 'list_push_subscriptions', {})
          if (mine === generation) publish({ devices })
        }
      } catch {
        if (mine !== generation) return
        // A missing membership or unverifiable subscription must not stay active.
        try { await disableLocal(); await clean(credential) } catch { /* Report uncertainty below. */ }
        if (mine === generation) publish({ status: configured ? 'error' : 'setup', suppressOs: true,
          message: '通知設定を確認できないため端末側の停止を試みました。オンラインで再確認し、必要なら再登録してください。サーバー側の準備が未反映の場合もあります。' })
      }
    })
  }
  function setSession(next) {
    const previous = session
    session = next
    if (initialized && previous?.userId === next?.userId) return // Token refresh does not revoke consent.
    initialized = true
    generation += 1
    const mine = generation
    publish({ status: configured ? 'checking' : 'setup', devices: [], suppressOs: true, message: '' })
    if (!capability()) { void inspect(); return }
    // No network call in the Supabase auth callback. Invalidate persisted consent
    // before joining the operation lock, fencing an in-flight registration.
    void store.update((value) => value.sessionOwner === (next?.userId || null) ? value : {
      ...value, sessionOwner: next?.userId || null, revision: value.revision + 1,
      record: value.record ? { ...value.record, enabled: false } : null,
    }).then(() => {
      if (previous && previous.userId !== next?.userId) return lock(() => clean(previous))
    }).then(inspect).catch(async () => {
      if (mine !== generation) return
      try { await browser.unsubscribe(); await browser.closeNotifications() } catch { /* Warning remains. */ }
      publish({ status: configured ? 'error' : 'setup', suppressOs: true, message: PUSH_STOP_WARNING })
    })
  }
  async function enable(deviceName) {
    if (!configured || !capability() || !session || state.busy || state.status === 'checking') return false
    if (!deviceName.trim() || deviceName.trim().length > 40) {
      publish({ message: '端末名を1〜40文字で入力してください。' }); return false
    }
    if (permission() === 'denied') { publish({ status: 'denied' }); return false }
    const credential = session
    const mine = generation
    publish({ busy: true, message: '' })
    // Invoke directly in the button gesture, before any storage/network await.
    try {
      const permissionResult = permission() === 'granted' ? Promise.resolve('granted') : requestPermission()
      if (await permissionResult !== 'granted') {
        if (mine === generation) publish({ status: 'denied' })
        return false
      }
      return await lock(async () => {
        const saved = await store.read()
        const current = async () => mine === generation && session?.userId === credential.userId
          && (await store.read()).revision === saved.revision
          && saved.sessionOwner === credential.userId
        if (!await current()) return false
        if (!await clean(credential)) throw new Error('cleanup')
        let registered
        try {
          // Also proves that the migration is available before asking the browser
          // for a subscription. The captured JWT cannot switch to another user.
          await api(credential, 'list_push_subscriptions', {})
          if (!await current()) return false
          const subscription = await browser.subscribe()
          if (!await current() || permission() !== 'granted') throw new Error('stale')
          registered = await api(credential, 'register_push_subscription', {
            p_endpoint: subscription.endpoint, p_p256dh: subscription.keys.p256dh,
            p_auth: subscription.keys.auth, p_device_name: deviceName.trim(), p_consent: true,
          })
          const result = await store.update((value) => {
            const valid = mine === generation && value.revision === saved.revision
              && value.sessionOwner === credential.userId && permission() === 'granted'
            return { ...value, record: { owner: credential.userId, id: registered.id, enabled: valid } }
          })
          if (!result.record.enabled) throw new Error('stale')
          if (mine === generation) publish({ status: 'on', suppressOs: true, message: 'この端末を登録しました。通知は設定した朝夕・対象がある場合のみです。' })
          return true
        } catch {
          // Preserve a known server ID on failure, including an IndexedDB failure,
          // so an incomplete unsubscribe is not reported as a successful stop.
          let stopped = true
          try { await disableLocal() } catch { stopped = false }
          try { await browser.unsubscribe() } catch { stopped = false }
          if (registered) {
            try { await api(credential, 'remove_push_subscription', { p_id: registered.id }) }
            catch { stopped = false }
          }
          if (mine === generation) publish({ status: 'error', suppressOs: !stopped,
            message: stopped ? '登録を完了できませんでした。通知は有効にしていません。再確認してからお試しください。' : PUSH_STOP_WARNING })
          return false
        }
      })
    } catch {
      if (mine === generation) publish({ status: 'error', message: '通知を登録できません。停止状態を再確認してください。', suppressOs: true })
      return false
    } finally { publish({ busy: false }) }
  }
  async function stop() {
    generation += 1
    const credential = session
    publish({ busy: true, suppressOs: true, message: '' })
    try {
      let localOk = true
      try { await disableLocal() } catch { localOk = false }
      const cleaned = await lock(() => clean(credential))
      const ok = localOk && cleaned
      publish({ status: 'off', devices: [], suppressOs: !ok, message: ok ? 'この端末の通知を停止しました。' : PUSH_STOP_WARNING })
      return ok
    } catch { publish({ status: 'error', message: PUSH_STOP_WARNING }); return false }
    finally { publish({ busy: false }) }
  }
  async function remove(id) {
    if (!session || state.busy) return
    const credential = session
    const mine = generation
    publish({ busy: true, message: '' })
    try {
      const saved = await store.read()
      if (mine !== generation) return
      if (saved.record?.id === id) return await stop()
      await api(credential, 'remove_push_subscription', { p_id: id })
      if (mine === generation) publish({ devices: state.devices.filter((item) => item.id !== id),
        message: 'この登録への新しい配信を停止しました。受付済みの通知は届く場合があります。' })
    } catch { if (mine === generation) publish({ message: '解除を確認できません。オンラインで再試行してください。' }) }
    finally { publish({ busy: false }) }
  }
  return { getSnapshot: () => state, subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
    setSession, inspect, enable, stop, remove }
}
