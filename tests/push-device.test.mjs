import test from 'node:test'
import assert from 'node:assert/strict'
import { createPushDevice, PUSH_STOP_WARNING } from '../src/lib/pushDevice.js'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
function fixture(options = {}) {
  let saved = { revision: 0, sessionOwner: null, record: null }
  let queue = Promise.resolve()
  let osPermission = options.permission || 'granted'
  let subscribed = false
  let permissionCalls = 0
  const calls = []
  const records = []
  let fail = ''
  let registerGate
  const controller = createPushDevice({
    configured: options.configured ?? true, capability: () => options.capable ?? true,
    permission: () => osPermission,
    requestPermission: async () => { permissionCalls++; return osPermission },
    store: { read: async () => structuredClone(saved), update: async (change) => {
      if (fail === 'storage') throw new Error('storage')
      saved = change(structuredClone(saved)); return structuredClone(saved)
    } },
    lock: (action) => { const next = queue.then(action); queue = next.catch(() => {}); return next },
    browser: {
      hasSubscription: async () => subscribed,
      subscribe: async () => { calls.push('subscribe'); subscribed = true; return { endpoint: 'secret', keys: { p256dh: 'key', auth: 'auth' } } },
      unsubscribe: async () => { calls.push('unsubscribe'); if (fail === 'unsubscribe') throw new Error('offline'); subscribed = false },
      closeNotifications: async () => {},
    },
    api: async (credential, name, args) => {
      calls.push({ owner: credential.userId, token: credential.token, name, args })
      if (name === 'list_push_subscriptions') {
        if (fail === 'list') throw new Error('no member / offline')
        return records.filter((item) => item.owner === credential.userId)
      }
      if (name === 'register_push_subscription') {
        if (registerGate) await registerGate
        if (fail === 'register') throw new Error('not deployed')
        const record = { id: `id-${records.length}`, owner: credential.userId, device_name: args.p_device_name }
        records.push(record); return record
      }
      if (fail === 'remove') throw new Error('offline')
      const index = records.findIndex((item) => item.id === args.p_id && item.owner === credential.userId)
      if (index >= 0) records.splice(index, 1)
      return true
    },
  })
  return { controller, records, calls, saved: () => saved, permissionCalls: () => permissionCalls,
    setPermission: (value) => { osPermission = value }, fail: (value) => { fail = value },
    gate: (value) => { registerGate = value }, subscribed: () => subscribed,
    login: async (id = 'a') => { controller.setSession({ userId: id, token: `token-${id}` }); await tick(); await controller.inspect() },
  }
}

test('Push remains off until explicit action; schedule/permission alone do not register', async () => {
  const f = fixture(); await f.login()
  assert.equal(f.controller.getSnapshot().status, 'off')
  assert.equal(f.records.length, 0)
  assert.equal(f.permissionCalls(), 0)
  assert.equal(await f.controller.enable('スマホ'), true)
  assert.equal(f.saved().record.enabled, true)
  assert.equal(f.controller.getSnapshot().suppressOs, true)
  assert.equal(f.records[0].owner, 'a')
  assert.equal(JSON.stringify(f.saved()).includes('secret'), false)
  assert.equal(JSON.stringify(f.saved()).includes('token'), false)
})

test('Disabled rollout and unsupported browsers never ask permission or register', async () => {
  for (const options of [{ configured: false }, { capable: false }]) {
    const f = fixture(options); await f.login(); await f.controller.enable('phone')
    assert.equal(f.permissionCalls(), 0); assert.equal(f.records.length, 0)
    assert.ok(['setup', 'unsupported'].includes(f.controller.getSnapshot().status))
  }
})

test('Denied permission is not repeatedly requested; missing consent from dismiss stays off', async () => {
  const f = fixture({ permission: 'denied' }); await f.login(); await f.controller.enable('phone')
  assert.equal(f.permissionCalls(), 0); assert.equal(f.records.length, 0)
  f.setPermission('default'); await f.controller.enable('phone')
  assert.equal(f.permissionCalls(), 1); assert.equal(f.records.length, 0)
})

test('Backend registration failure rolls back browser subscription and does not claim enabled', async () => {
  const f = fixture(); await f.login(); f.fail('register')
  assert.equal(await f.controller.enable('phone'), false)
  assert.equal(f.subscribed(), false); assert.equal(f.saved().record, null)
  assert.equal(f.controller.getSnapshot().status, 'error')
})

test('Stop disables local consent before failed server revoke; retry removes pending ID', async () => {
  const f = fixture(); await f.login(); await f.controller.enable('phone'); f.fail('remove')
  assert.equal(await f.controller.stop(), false)
  assert.equal(f.saved().record.enabled, false)
  assert.equal(f.subscribed(), false)
  assert.equal(f.controller.getSnapshot().message, PUSH_STOP_WARNING)
  f.fail(''); assert.equal(await f.controller.stop(), true)
  assert.equal(f.records.length, 0); assert.equal(f.saved().record, null)
})

test('Failed browser unsubscribe is not represented as a successful stop', async () => {
  const f = fixture(); await f.login(); await f.controller.enable('phone'); f.fail('unsubscribe')
  assert.equal(await f.controller.stop(), false)
  assert.equal(f.controller.getSnapshot().suppressOs, true)
  assert.equal(f.controller.getSnapshot().message, PUSH_STOP_WARNING)
  assert.equal(f.records.length, 0)
})

test('Logout while registration awaits response removes late result with original JWT', async () => {
  const f = fixture(); await f.login()
  let release
  f.gate(new Promise((resolve) => { release = resolve }))
  const enable = f.controller.enable('phone'); await tick()
  f.controller.setSession(null); await tick()
  release(); assert.equal(await enable, false); await tick(); await f.controller.inspect()
  assert.equal(f.records.length, 0)
  assert.equal(f.subscribed(), false)
  assert.ok(!f.saved().record?.enabled)
  for (const call of f.calls.filter((item) => item.name === 'remove_push_subscription')) assert.equal(call.token, 'token-a')
})

test('Account switch cannot adopt old consent or send late registration with new JWT', async () => {
  const f = fixture(); await f.login()
  let release
  f.gate(new Promise((resolve) => { release = resolve }))
  const enable = f.controller.enable('phone'); await tick()
  f.controller.setSession({ userId: 'b', token: 'token-b' }); await tick()
  release(); await enable; await tick(); await f.controller.inspect()
  assert.equal(f.saved().sessionOwner, 'b')
  assert.ok(!f.saved().record?.enabled)
  assert.equal(f.records.length, 0)
  assert.ok(f.calls.filter((item) => item.name === 'register_push_subscription').every((item) => item.owner === 'a'))
})

test('Token refresh does not subscribe, disable or transfer existing consent', async () => {
  const f = fixture(); await f.login(); await f.controller.enable('phone')
  const before = f.saved().revision
  f.controller.setSession({ userId: 'a', token: 'refreshed' }); await tick()
  assert.equal(f.saved().revision, before)
  assert.equal(f.saved().record.enabled, true)
  assert.equal(f.records.length, 1)
})

test('Permission revocation or unverifiable server state fails closed', async () => {
  for (const reason of ['permission', 'list']) {
    const f = fixture(); await f.login(); await f.controller.enable('phone')
    if (reason === 'permission') f.setPermission('denied'); else f.fail('list')
    await f.controller.inspect()
    assert.ok(!f.saved().record?.enabled)
    assert.equal(f.subscribed(), false)
    assert.notEqual(f.controller.getSnapshot().status, 'on')
  }
})

test('Storage failures prevent registration; empty or long names do not prompt', async () => {
  const f = fixture(); await f.login()
  await f.controller.enable(' '); await f.controller.enable('x'.repeat(41))
  f.fail('storage'); assert.equal(await f.controller.enable('phone'), false)
  assert.equal(f.records.length, 0)
  assert.equal(f.subscribed(), false)
})

test('Storage write failure on stop still attempts browser and server unsubscribe', async () => {
  const f = fixture(); await f.login(); await f.controller.enable('phone'); f.fail('storage')
  assert.equal(await f.controller.stop(), false)
  assert.equal(f.subscribed(), false)
  assert.equal(f.records.length, 0)
  assert.equal(f.controller.getSnapshot().message, PUSH_STOP_WARNING)
})
