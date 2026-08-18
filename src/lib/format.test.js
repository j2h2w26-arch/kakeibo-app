import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateLoanSummary,
  mapRepayments,
  parsePositiveYen,
  todayInTokyo,
} from './format.js'

test('parsePositiveYen accepts positive safe integers only', () => {
  assert.equal(parsePositiveYen('1200'), 1200)
  assert.equal(parsePositiveYen('0'), null)
  assert.equal(parsePositiveYen('-1'), null)
  assert.equal(parsePositiveYen('1.5'), null)
  assert.equal(parsePositiveYen('abc'), null)
})

test('todayInTokyo uses the Tokyo calendar date', () => {
  assert.equal(todayInTokyo(new Date('2026-08-16T15:30:00.000Z')), '2026-08-17')
})

test('repayments are grouped and loan summary calculates the net settlement', () => {
  const repayments = mapRepayments([
    { id: 1, loan_id: 10, amount: 300 },
    { id: 2, loan_id: 20, amount: 100 },
  ])
  const summary = calculateLoanSummary(
    [
      { id: 10, lender: '夫', amount: 1000 },
      { id: 20, lender: '妻', amount: 500 },
    ],
    repayments,
  )

  assert.deepEqual(summary, {
    totalOutstanding: 1100,
    totalRepaid: 400,
    netAmount: 300,
    netLabel: '妻から夫へ',
  })
})
