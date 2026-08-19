import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchHouseholdSnapshot } from '../lib/data'

const CACHE_KEY = 'futari-home-cache-v3'
const EMPTY_SNAPSHOT = {
  loans: [],
  repayments: {},
  items: [],
  wishes: [],
  pointActivities: [],
  pointCompletions: [],
}

function readCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY))
    return { ...EMPTY_SNAPSHOT, ...(cached?.snapshot || {}) }
  } catch {
    return EMPTY_SNAPSHOT
  }
}

export function useHouseholdData(enabled) {
  const [snapshot, setSnapshot] = useState(readCache)
  const [loading, setLoading] = useState(true)
  const [syncState, setSyncState] = useState('idle')
  const [error, setError] = useState(null)
  const timerRef = useRef(null)

  const refresh = useCallback(async ({ quiet = false } = {}) => {
    if (!enabled) return
    if (!quiet) setLoading(true)
    setSyncState('syncing')
    try {
      const nextSnapshot = await fetchHouseholdSnapshot()
      setSnapshot(nextSnapshot)
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ snapshot: nextSnapshot, savedAt: new Date().toISOString() }),
      )
      setError(null)
      setSyncState('synced')
    } catch (nextError) {
      setError(nextError)
      setSyncState('error')
    } finally {
      setLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return undefined
    refresh()

    const queueRefresh = () => {
      window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => refresh({ quiet: true }), 250)
    }

    const channel = supabase
      .channel('futari-home-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loans' }, queueRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'repayments' }, queueRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items' }, queueRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wishes' }, queueRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'point_activities' }, queueRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'point_activity_completions' }, queueRefresh)
      .subscribe()

    return () => {
      window.clearTimeout(timerRef.current)
      supabase.removeChannel(channel)
    }
  }, [enabled, refresh])

  return { snapshot, loading, syncState, error, refresh }
}
