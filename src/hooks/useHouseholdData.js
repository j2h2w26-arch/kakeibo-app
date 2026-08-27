import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchHouseholdSnapshot } from '../lib/data'

const CACHE_KEY = 'futari-home-cache-v6'
const EMPTY_SNAPSHOT = {
  loans: [],
  repayments: {},
  items: [],
  inventoryItems: [],
  inventorySchemaReady: false,
  expenses: [],
  expenseSchemaReady: false,
  wishes: [],
  wishComments: [],
  wishConsultationSchemaReady: false,
  notificationPreferences: null,
  notificationSchemaReady: false,
  lifeTasks: [],
  lifeTasksSchemaReady: false,
  pointActivities: [],
  pointCompletions: [],
  pointSources: [],
  pointCampaigns: [],
  pointCampaignSteps: [],
  pointCampaignStates: [],
  pointServicePreferences: [],
  pointSyncRuns: [],
  pointCampaignSchemaReady: false,
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

    let channel = supabase
      .channel('futari-home-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loans' }, queueRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'repayments' }, queueRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items' }, queueRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wishes' }, queueRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'point_activities' }, queueRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'point_activity_completions' }, queueRefresh)

    if (snapshot.inventorySchemaReady) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory_items' },
        queueRefresh,
      )
    }

    if (snapshot.expenseSchemaReady) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: 'household_expenses' }, queueRefresh)
    }

    if (snapshot.wishConsultationSchemaReady) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: 'wish_comments' }, queueRefresh)
    }

    if (snapshot.notificationSchemaReady) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: 'notification_preferences' }, queueRefresh)
    }

    if (snapshot.lifeTasksSchemaReady) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: 'life_tasks' }, queueRefresh)
    }

    if (snapshot.pointCampaignSchemaReady) {
      for (const table of [
        'point_sources',
        'point_campaigns',
        'point_campaign_steps',
        'point_campaign_member_states',
        'point_service_preferences',
        'point_sync_runs',
      ]) {
        channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, queueRefresh)
      }
    }

    channel.subscribe()

    return () => {
      window.clearTimeout(timerRef.current)
      supabase.removeChannel(channel)
    }
  }, [
    enabled,
    refresh,
    snapshot.expenseSchemaReady,
    snapshot.inventorySchemaReady,
    snapshot.lifeTasksSchemaReady,
    snapshot.notificationSchemaReady,
    snapshot.pointCampaignSchemaReady,
    snapshot.wishConsultationSchemaReady,
  ])

  return { snapshot, loading, syncState, error, refresh }
}
