import assert from 'node:assert/strict'
import test from 'node:test'
import { deriveSyncStatus } from './syncStatus.js'

test('オフライン表示をほかの同期状態より優先する', () => {
  assert.deepEqual(
    deriveSyncStatus({ online: false, syncState: 'error', realtimeState: 'error' }),
    { kind: 'offline', label: 'オフライン', retryable: false },
  )
})

test('取得またはリアルタイム接続の失敗を再試行可能なエラーにする', () => {
  assert.equal(deriveSyncStatus({ online: true, syncState: 'error', realtimeState: 'subscribed' }).retryable, true)
  assert.equal(deriveSyncStatus({ online: true, syncState: 'synced', realtimeState: 'error' }).kind, 'error')
})

test('接続処理中は同期済みと表示しない', () => {
  assert.equal(deriveSyncStatus({ online: true, syncState: 'synced', realtimeState: 'connecting' }).kind, 'syncing')
})
