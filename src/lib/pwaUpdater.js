// Browser-native registration keeps activation separate from page reload.
// In particular, another tab activating a worker must not discard this form.
export function createPwaUpdater({ serviceWorker, isOnline, reload, events, page, timers = globalThis }) {
  let state = { supported: Boolean(serviceWorker), online: isOnline(), hasUpdate: false, checking: false, applying: false, error: '', checked: false }
  let registration
  let started = false
  let stopped = false
  let applyTimer
  let interval
  let lastCheck = 0
  let controller = serviceWorker?.controller
  let activatedUpdate = false
  const listeners = new Set()
  const cleanup = []
  const publish = (patch) => {
    if (stopped) return
    state = { ...state, ...patch }
    listeners.forEach((listener) => listener())
  }
  const listen = (target, event, callback) => {
    target.addEventListener(event, callback)
    cleanup.push(() => target.removeEventListener(event, callback))
  }
  const detectWaiting = () => {
    if (registration?.waiting) publish({ hasUpdate: true, error: '' })
  }
  const watchInstalling = () => {
    const worker = registration?.installing
    if (!worker) return
    listen(worker, 'statechange', () => {
      if (worker.state === 'installed') detectWaiting()
      if (worker.state === 'redundant') publish({ error: '更新を取得できませんでした。通信を確認して再試行してください。' })
    })
  }
  async function ensureRegistration() {
    if (registration) return registration
    registration = await serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
    if (stopped) return registration
    listen(registration, 'updatefound', watchInstalling)
    watchInstalling()
    detectWaiting()
    return registration
  }
  async function check({ automatic = false } = {}) {
    const online = isOnline()
    publish({ online })
    if (!serviceWorker || !online || state.checking || state.applying || stopped) return
    if (automatic && Date.now() - lastCheck < 60000) return
    lastCheck = Date.now()
    publish({ checking: true, error: '' })
    try {
      const reg = await ensureRegistration()
      if (stopped) return
      await reg.update()
      detectWaiting()
      publish({ checked: true })
    } catch {
      publish({ error: '更新を確認できませんでした。今の画面はそのまま使えます。' })
    } finally {
      publish({ checking: false })
    }
  }
  const changedController = () => {
    const previous = controller
    controller = serviceWorker.controller
    if (!previous || previous === controller) return
    activatedUpdate = true
    timers.clearTimeout(applyTimer)
    if (state.applying && isOnline()) {
      publish({ applying: false })
      reload()
    } else {
      publish({ hasUpdate: true, applying: false, online: isOnline() })
    }
  }
  function start() {
    if (started || !serviceWorker) return
    started = true
    listen(serviceWorker, 'controllerchange', changedController)
    const resume = () => {
      publish({ online: isOnline() })
      if (page.visibilityState === 'visible') void check({ automatic: true })
    }
    listen(events, 'online', resume)
    listen(events, 'offline', () => publish({ online: false }))
    listen(page, 'visibilitychange', resume)
    interval = timers.setInterval(resume, 60 * 60 * 1000)
    void check()
  }
  function apply({ confirmed = false, busy = false } = {}) {
    if (!confirmed || busy || !isOnline() || !state.hasUpdate || state.applying) return false
    if (activatedUpdate) { reload(); return true }
    if (!registration?.waiting) {
      publish({ error: '更新の準備を確認しています。もう一度「更新を確認」を押してください。' })
      return false
    }
    publish({ applying: true, error: '' })
    applyTimer = timers.setTimeout(() => {
      publish({ applying: false, error: '更新の切り替えを確認できませんでした。入力を保存した上で再試行してください。' })
    }, 15000)
    try { registration.waiting.postMessage({ type: 'SKIP_WAITING' }) }
    catch {
      timers.clearTimeout(applyTimer)
      publish({ applying: false, error: '更新を開始できませんでした。もう一度確認してください。' })
      return false
    }
    return true
  }
  return {
    start, check, apply,
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    stop() {
      stopped = true
      cleanup.forEach((fn) => fn())
      timers.clearInterval(interval)
      timers.clearTimeout(applyTimer)
    },
  }
}
