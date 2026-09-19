import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchHouseholdSnapshot } from '../lib/data'
import {
  clearHouseholdCache,
  readHouseholdCache,
  writeHouseholdCache,
} from '../lib/householdCache'

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
  lifeGoals: [],
  lifeGoalRoutes: [],
  lifeGoalMilestones: [],
  lifeGoalTaskLinks: [],
  lifePlanningSchemaReady: false,
  appliances: [],
  chores: [],
  choreCompletions: [],
  choresSchemaReady: false,
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

export function useHouseholdData(enabled) {
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT)
  const [loading, setLoading] = useState(true)
  const [syncState, setSyncState] = useState('idle')
  const [realtimeState, setRealtimeState] = useState('idle')
  const [lastSyncedAt, setLastSyncedAt] = useState(null)
  const [error, setError] = useState(null)
  const [realtimeRetryKey, setRealtimeRetryKey] = useState(0)
  const timerRef = useRef(null)
  const requestIdRef = useRef(0)

  const refresh = useCallback(async ({ quiet = false } = {}) => {
    if (!enabled) return { ok: false, skipped: true }
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    if (!quiet) setLoading(true)
    setSyncState('syncing')
    try {
      const nextSnapshot = await fetchHouseholdSnapshot()
      const savedAt = writeHouseholdCache(nextSnapshot)
      if (requestId === requestIdRef.current) {
        setSnapshot(nextSnapshot)
        setLastSyncedAt(savedAt)
        setError(null)
        setSyncState('synced')
      }
      return { ok: true, syncedAt: savedAt }
    } catch (nextError) {
      if (requestId === requestIdRef.current) {
        setError(nextError)
        setSyncState('error')
      }
      return { ok: false, error: nextError }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      requestIdRef.current += 1
      window.clearTimeout(timerRef.current)
      setSnapshot(EMPTY_SNAPSHOT)
      setLoading(true)
      setSyncState('idle')
      setRealtimeState('idle')
      setLastSyncedAt(null)
      setError(null)
      return undefined
    }

    const cached = readHouseholdCache()
    if (cached) {
      setSnapshot({ ...EMPTY_SNAPSHOT, ...cached.snapshot })
      setLastSyncedAt(cached.savedAt)
    }
    refresh()
    return undefined
  }, [enabled, refresh])

  useEffect(() => {
    if (!enabled) return undefined

    const queueRefresh = () => {
      window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => refresh({ quiet: true }), 250)
    }

    let active = true
    setRealtimeState('connecting')
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

    if (snapshot.lifePlanningSchemaReady) {
      for (const table of ['life_goals', 'life_goal_routes', 'life_goal_milestones', 'life_goal_task_links']) {
        channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, queueRefresh)
      }
    }

    if (snapshot.choresSchemaReady) {
      channel = channel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'household_appliances' }, queueRefresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'household_chores' }, queueRefresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'household_chore_completions' }, queueRefresh)
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

    channel.subscribe((status) => {
      if (!active) return
      if (status === 'SUBSCRIBED') setRealtimeState('subscribed')
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setRealtimeState('error')
      else if (status === 'CLOSED') setRealtimeState('idle')
    })

    return () => {
      active = false
      window.clearTimeout(timerRef.current)
      supabase.removeChannel(channel)
    }
  }, [
    enabled,
    refresh,
    realtimeRetryKey,
    snapshot.expenseSchemaReady,
    snapshot.inventorySchemaReady,
    snapshot.choresSchemaReady,
    snapshot.lifeTasksSchemaReady,
    snapshot.lifePlanningSchemaReady,
    snapshot.notificationSchemaReady,
    snapshot.pointCampaignSchemaReady,
    snapshot.wishConsultationSchemaReady,
  ])

  const retrySync = useCallback(() => {
    setRealtimeRetryKey((current) => current + 1)
    return refresh()
  }, [refresh])

  const clearLocalData = useCallback(() => {
    requestIdRef.current += 1
    window.clearTimeout(timerRef.current)
    clearHouseholdCache()
    setSnapshot(EMPTY_SNAPSHOT)
    setLoading(true)
    setSyncState('idle')
    setRealtimeState('idle')
    setLastSyncedAt(null)
    setError(null)
  }, [])

  return {
    snapshot,
    loading,
    syncState,
    realtimeState,
    lastSyncedAt,
    error,
    refresh,
    retrySync,
    clearLocalData,
  }
}
