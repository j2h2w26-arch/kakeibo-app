// Both the cache write and the UI commit must belong to the latest request.
// Invalidating before logout also rejects a response already in flight.
export function createSnapshotLoader(fetchSnapshot, writeCache) {
  let generation = 0
  let activeUserId = null
  return {
    isActive(userId) { return Boolean(userId) && userId === activeUserId },
    activate(userId) { generation += 1; activeUserId = userId },
    invalidate() { generation += 1; activeUserId = null },
    async load(userId, { onSuccess, onError, onSettled }) {
      if (!userId || userId !== activeUserId) return { ok: false, skipped: true }
      const request = ++generation
      try {
        const snapshot = await fetchSnapshot()
        if (request !== generation) return { ok: false, skipped: true }
        const savedAt = writeCache(userId, snapshot)
        onSuccess(snapshot, savedAt)
        return { ok: true, syncedAt: savedAt }
      } catch (error) {
        if (request !== generation) return { ok: false, skipped: true }
        onError(error)
        return { ok: false, error }
      } finally {
        if (request === generation) onSettled()
      }
    },
  }
}
