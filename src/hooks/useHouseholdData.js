import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchHouseholdSnapshot } from '../lib/data'
import { createSnapshotLoader } from '../lib/snapshotLoader'
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
  lifeGoalPhases: [],
  lifeGoalRelations: [],
  lifeWorkspaceSchemaReady: false,
  lifePlanningSchemaReady: false,
  appliances: [],
  chores: [],
  choreCompletions: [],
  choresSchemaReady: false,
  recipes: [],
  recipeIngredients: [],
  recipeSteps: [],
  recipesSchemaReady: false,
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

export function useHouseholdData(userId) {
  const enabled = Boolean(userId)
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT)
  const [snapshotOwner, setSnapshotOwner] = useState(null)
  const [loading, setLoading] = useState(true)
  const [syncState, setSyncState] = useState('idle')
  const [realtimeState, setRealtimeState] = useState('idle')
  const [lastSyncedAt, setLastSyncedAt] = useState(null)
  const [error, setError] = useState(null)
  const [realtimeRetryKey, setRealtimeRetryKey] = useState(0)
  const timerRef = useRef(null)
  const [loader] = useState(() => createSnapshotLoader(fetchHouseholdSnapshot, writeHouseholdCache))

  const refresh = useCallback(async ({ quiet = false } = {}) => {
    if (!enabled || !loader.isActive(userId)) return { ok: false, skipped: true }
    if (!quiet) setLoading(true)
    setSyncState('syncing')
    return loader.load(userId, {
      onSuccess(nextSnapshot, savedAt) {
        setSnapshot(nextSnapshot)
        setSnapshotOwner(userId)
        setLastSyncedAt(savedAt)
        setError(null)
        setSyncState('synced')
      },
      onError(nextError) {
        setError(nextError)
        setSyncState('error')
      },
      onSettled() { setLoading(false) },
    })
  }, [enabled, userId, loader])

  useEffect(() => {
    loader.invalidate()
    if (enabled) loader.activate(userId)
    let active = true
    // Restore browser storage after subscribing, never during render. The owner
    // check in the return value hides the previous account immediately.
    queueMicrotask(() => {
      if (!active) return
      const cached = enabled ? readHouseholdCache(userId) : null
      setSnapshot(cached ? { ...EMPTY_SNAPSHOT, ...cached.snapshot } : EMPTY_SNAPSHOT)
      setSnapshotOwner(userId || null)
      setLastSyncedAt(cached?.savedAt || null)
      setError(null)
      if (enabled) refresh()
      else {
        setLoading(true)
        setSyncState('idle')
        setRealtimeState('idle')
      }
    })
    return () => {
      active = false
      window.clearTimeout(timerRef.current)
      loader.invalidate()
    }
  }, [enabled, userId, refresh, loader])

  useEffect(() => {
    if (!enabled) return undefined

    const queueRefresh = () => {
      window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => refresh({ quiet: true }), 250)
    }

    let active = true
    queueMicrotask(() => { if (active) setRealtimeState('connecting') })
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
      for (const table of ['life_goals', 'life_goal_routes', 'life_goal_milestones', 'life_goal_task_links', 'life_goal_phases', 'life_goal_relations']) {
        channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, queueRefresh)
      }
    }

    if (snapshot.choresSchemaReady) {
      channel = channel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'household_appliances' }, queueRefresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'household_chores' }, queueRefresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'household_chore_completions' }, queueRefresh)
    }

    if (snapshot.recipesSchemaReady) {
      for (const table of ['recipes', 'recipe_ingredients', 'recipe_steps']) {
        channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, queueRefresh)
      }
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
    snapshot.recipesSchemaReady,
    snapshot.notificationSchemaReady,
    snapshot.pointCampaignSchemaReady,
    snapshot.wishConsultationSchemaReady,
  ])

  const retrySync = useCallback(() => {
    setRealtimeRetryKey((current) => current + 1)
    return refresh()
  }, [refresh])

  const clearLocalData = useCallback(() => {
    loader.invalidate()
    window.clearTimeout(timerRef.current)
    clearHouseholdCache()
    setSnapshot(EMPTY_SNAPSHOT)
    setSnapshotOwner(null)
    setLoading(true)
    setSyncState('idle')
    setRealtimeState('idle')
    setLastSyncedAt(null)
    setError(null)
  }, [loader])

  return {
    snapshot: snapshotOwner === userId ? snapshot : EMPTY_SNAPSHOT,
    loading: snapshotOwner !== userId || loading,
    syncState,
    realtimeState,
    lastSyncedAt,
    error,
    refresh,
    retrySync,
    clearLocalData,
  }
}
