export const HOUSEHOLD_CACHE_KEY = 'futari-home-cache-v12'
export const HOUSEHOLD_CACHE_TTL_MS = 24 * 60 * 60 * 1000

const LEGACY_CACHE_KEYS = ['futari-home-cache-v11', 'futari-home-cache-v10', 'futari-home-cache-v9', 'futari-home-cache-v8', 'futari-home-cache-v7', 'futari-home-cache-v6']

function availableStorage(storage) {
  return storage || globalThis.localStorage
}

export function clearHouseholdCache(storage) {
  try {
    const target = availableStorage(storage)
    if (!target) return
    for (const key of [HOUSEHOLD_CACHE_KEY, ...LEGACY_CACHE_KEYS]) {
      try { target.removeItem(key) } catch { /* Storage may be disabled. */ }
    }
  } catch { /* Do not prevent logout when browser storage is unavailable. */ }
}

export function readHouseholdCache(userId, storage, now = Date.now()) {
  try {
    const target = availableStorage(storage)
    if (!target) return null
    const cached = JSON.parse(target.getItem(HOUSEHOLD_CACHE_KEY))
    const savedAtMs = Date.parse(cached?.savedAt)
    if (!userId || cached?.userId !== userId || !cached?.snapshot || !Number.isFinite(savedAtMs) || savedAtMs > now || now - savedAtMs >= HOUSEHOLD_CACHE_TTL_MS) {
      clearHouseholdCache(target)
      return null
    }
    return { snapshot: cached.snapshot, savedAt: cached.savedAt }
  } catch {
    clearHouseholdCache(storage)
    return null
  }
}

export function writeHouseholdCache(userId, snapshot, storage, savedAt = new Date()) {
  if (!userId) return null
  try {
    const target = availableStorage(storage)
    if (!target) return null
    const savedAtIso = savedAt.toISOString()
    target.setItem(HOUSEHOLD_CACHE_KEY, JSON.stringify({ userId, snapshot, savedAt: savedAtIso }))
    for (const key of LEGACY_CACHE_KEYS) target.removeItem(key)
    return savedAtIso
  } catch {
    clearHouseholdCache(storage)
    return null
  }
}
