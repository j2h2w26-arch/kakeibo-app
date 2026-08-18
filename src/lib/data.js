import { supabase } from './supabase'
import { mapRepayments } from './format'

function unwrap(result) {
  if (result.error) throw result.error
  return result.data
}

export async function fetchHouseholdSnapshot() {
  const [loansResult, repaymentsResult, itemsResult, wishesResult] = await Promise.all([
    supabase.from('loans').select('*').order('date', { ascending: false }),
    supabase.from('repayments').select('*').order('date', { ascending: false }),
    supabase.from('shopping_items').select('*').order('created_at', { ascending: false }),
    supabase.from('wishes').select('*').order('created_at', { ascending: false }),
  ])

  const loans = unwrap(loansResult) || []
  const repayments = unwrap(repaymentsResult) || []
  const items = unwrap(itemsResult) || []
  const wishes = unwrap(wishesResult) || []
  return { loans, repayments: mapRepayments(repayments), items, wishes }
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

export async function updateShoppingItem(id, input) {
  unwrap(await supabase.from('shopping_items').update(input).eq('id', id))
}

export async function removeShoppingItem(id) {
  unwrap(await supabase.from('shopping_items').delete().eq('id', id))
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
