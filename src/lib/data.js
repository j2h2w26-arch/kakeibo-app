import { supabase } from './supabase'
import { mapRepayments } from './format'

function unwrap(result) {
  if (result.error) throw result.error
  return result.data
}

function unwrapOptional(result) {
  if (!result.error) return result.data
  if (['42P01', 'PGRST205'].includes(result.error.code)) return []
  throw result.error
}

export async function fetchHouseholdSnapshot() {
  const [
    loansResult,
    repaymentsResult,
    itemsResult,
    inventoryItemsResult,
    wishesResult,
    pointActivitiesResult,
    pointCompletionsResult,
    pointSourcesResult,
    pointCampaignsResult,
    pointCampaignStepsResult,
    pointCampaignStatesResult,
    pointServicePreferencesResult,
    pointSyncRunsResult,
  ] = await Promise.all([
    supabase.from('loans').select('*').order('date', { ascending: false }),
    supabase.from('repayments').select('*').order('date', { ascending: false }),
    supabase.from('shopping_items').select('*').order('created_at', { ascending: false }),
    supabase.from('inventory_items').select('*').order('updated_at', { ascending: false }),
    supabase.from('wishes').select('*').order('created_at', { ascending: false }),
    supabase.from('point_activities').select('*').order('sort_order').order('created_at'),
    supabase.from('point_activity_completions').select('*').order('completed_at', { ascending: false }),
    supabase.from('point_sources').select('*').order('id'),
    supabase.from('point_campaigns').select('*').order('selection_score', { ascending: false }),
    supabase.from('point_campaign_steps').select('*').order('step_order'),
    supabase.from('point_campaign_member_states').select('*'),
    supabase.from('point_service_preferences').select('*'),
    supabase.from('point_sync_runs').select('*').order('started_at', { ascending: false }).limit(1),
  ])

  const loans = unwrap(loansResult) || []
  const repayments = unwrap(repaymentsResult) || []
  const items = unwrap(itemsResult) || []
  const inventoryItems = unwrapOptional(inventoryItemsResult) || []
  const wishes = unwrap(wishesResult) || []
  const pointActivities = unwrap(pointActivitiesResult) || []
  const pointCompletions = unwrap(pointCompletionsResult) || []
  const pointSources = unwrapOptional(pointSourcesResult) || []
  const pointCampaigns = unwrapOptional(pointCampaignsResult) || []
  const pointCampaignSteps = unwrapOptional(pointCampaignStepsResult) || []
  const pointCampaignStates = unwrapOptional(pointCampaignStatesResult) || []
  const pointServicePreferences = unwrapOptional(pointServicePreferencesResult) || []
  const pointSyncRuns = unwrapOptional(pointSyncRunsResult) || []
  const pointCampaignSchemaReady = [
    pointSourcesResult,
    pointCampaignsResult,
    pointCampaignStepsResult,
    pointCampaignStatesResult,
    pointServicePreferencesResult,
    pointSyncRunsResult,
  ].every((result) => !result.error)
  return {
    loans,
    repayments: mapRepayments(repayments),
    items,
    inventoryItems,
    inventorySchemaReady: !inventoryItemsResult.error,
    wishes,
    pointActivities,
    pointCompletions,
    pointSources,
    pointCampaigns,
    pointCampaignSteps,
    pointCampaignStates,
    pointServicePreferences,
    pointSyncRuns,
    pointCampaignSchemaReady,
  }
}

export async function createLoan(input) {
  unwrap(await supabase.from('loans').insert([input]))
}

export async function removeLoan(id) {
  unwrap(await supabase.from('loans').delete().eq('id', id))
}

export async function recordRepayment(input) {
  unwrap(
    await supabase.rpc('record_repayment', {
      p_loan_id: input.loanId,
      p_amount: input.amount,
      p_date: input.date,
      p_note: input.note || null,
    }),
  )
}

export async function cancelRepayment(id) {
  unwrap(await supabase.rpc('cancel_repayment', { p_repayment_id: id }))
}

export async function createShoppingItem(input) {
  unwrap(await supabase.from('shopping_items').insert([input]))
}

export async function createShoppingItems(inputs) {
  unwrap(await supabase.from('shopping_items').insert(inputs))
}

export async function updateShoppingItem(id, input) {
  unwrap(await supabase.from('shopping_items').update(input).eq('id', id))
}

export async function removeShoppingItem(id) {
  unwrap(await supabase.from('shopping_items').delete().eq('id', id))
}

export async function createInventoryItem(input) {
  unwrap(await supabase.from('inventory_items').insert([input]))
}

export async function updateInventoryItem(id, input) {
  unwrap(await supabase.from('inventory_items').update(input).eq('id', id))
}

export async function removeInventoryItem(id) {
  unwrap(await supabase.from('inventory_items').delete().eq('id', id))
}

export async function createWish(input) {
  unwrap(await supabase.from('wishes').insert([input]))
}

export async function updateWish(id, input) {
  unwrap(await supabase.from('wishes').update(input).eq('id', id))
}

export async function removeWish(id) {
  unwrap(await supabase.from('wishes').delete().eq('id', id))
}

export async function createPointActivity(input) {
  unwrap(await supabase.from('point_activities').insert([input]))
}

export async function updatePointActivity(id, input) {
  unwrap(await supabase.from('point_activities').update(input).eq('id', id))
}

export async function removePointActivity(id) {
  unwrap(await supabase.from('point_activities').delete().eq('id', id))
}

export async function completePointActivity(input) {
  unwrap(await supabase.from('point_activity_completions').insert([input]))
}

export async function undoPointActivityCompletion(id) {
  unwrap(await supabase.from('point_activity_completions').delete().eq('id', id))
}

export async function setPointCampaignDecision(campaignId, decision) {
  unwrap(await supabase.rpc('set_point_campaign_decision', {
    p_campaign_id: campaignId,
    p_decision: decision,
  }))
}

export async function setPointServicePreference(userId, serviceKey, isEnabled) {
  unwrap(await supabase.from('point_service_preferences').upsert({
    user_id: userId,
    service_key: serviceKey,
    is_enabled: isEnabled,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,service_key' }))
}

export async function syncPointCampaigns() {
  unwrap(await supabase.functions.invoke('sync-point-campaigns', {
    body: { trigger: 'manual' },
  }))
}
