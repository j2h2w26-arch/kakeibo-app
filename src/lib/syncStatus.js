export function deriveSyncStatus({ online, syncState, realtimeState }) {
  if (!online) return { kind: 'offline', label: 'オフライン', retryable: false }
  if (syncState === 'error' || realtimeState === 'error') {
    return { kind: 'error', label: '同期エラー', retryable: true }
  }
  if (syncState === 'syncing' || realtimeState === 'connecting') {
    return { kind: 'syncing', label: '同期中', retryable: false }
  }
  if (syncState === 'synced') return { kind: 'synced', label: '同期済み', retryable: false }
  return { kind: 'idle', label: '待機中', retryable: false }
}
