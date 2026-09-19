export const HOUSEHOLD_CACHE_KEY = 'futari-home-cache-v9'
export const HOUSEHOLD_CACHE_TTL_MS = 24 * 60 * 60 * 1000

const LEGACY_CACHE_KEYS = ['futari-home-cache-v8', 'futari-home-cache-v7', 'futari-home-cache-v6']

function availableStorage(storage) {
  return storage || globalThis.localStorage
}

export function clearHouseholdCache(storage) {
  const target = availableStorage(storage)
  if (!target) return
  target.removeItem(HOUSEHOLD_CACHE_KEY)
  for (const key of LEGACY_CACHE_KEYS) target.removeItem(key)
}

export function readHouseholdCache(storage, now = Date.now()) {
  const target = availableStorage(storage)
  if (!target) return null

  try {
    const cached = JSON.parse(target.getItem(HOUSEHOLD_CACHE_KEY))
    const savedAtMs = Date.parse(cached?.savedAt)
    if (!cached?.snapshot || !Number.isFinite(savedAtMs) || now - savedAtMs > HOUSEHOLD_CACHE_TTL_MS) {
      clearHouseholdCache(target)
      return null
    }
    return { snapshot: cached.snapshot, savedAt: cached.savedAt }
  } catch {
    clearHouseholdCache(target)
    return null
  }
}

export function writeHouseholdCache(snapshot, storage, savedAt = new Date()) {
  const target = availableStorage(storage)
  if (!target) return null

  try {
    const savedAtIso = savedAt.toISOString()
    target.setItem(HOUSEHOLD_CACHE_KEY, JSON.stringify({ snapshot, savedAt: savedAtIso }))
    for (const key of LEGACY_CACHE_KEYS) target.removeItem(key)
    return savedAtIso
  } catch {
    clearHouseholdCache(target)
    return null
  }
}
