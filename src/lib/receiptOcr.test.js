import test from 'node:test'
import assert from 'node:assert/strict'
import { parseReceiptText } from './receiptOcr.js'

test('parseReceiptText extracts Japanese receipt fields and ignores subtotal', () => {
  const result = parseReceiptText(`
    まいばすけっと 神田店
    TEL 03-1234-5678
    2026年09月13日 18:42
    絹ごし豆腐 108
    たまご 298
    小計 ￥406
    消費税 32
    合計 ￥438
    お預り 1,000
    おつり 562
  `)

  assert.deepEqual(result, {
    merchant: 'まいばすけっと 神田店',
    amount: 438,
    spentOn: '2026-09-13',
    items: '絹ごし豆腐、たまご',
  })
})

test('parseReceiptText accepts full-width digits and English total labels', () => {
  const result = parseReceiptText(`
    FUTARI MARKET
    ２０２６/９/３
    Apple １２０
    Bread ２５０
    GRAND TOTAL ￥３７０
  `)

  assert.deepEqual(result, {
    merchant: 'FUTARI MARKET',
    amount: 370,
    spentOn: '2026-09-03',
    items: 'Apple、Bread',
  })
})

test('parseReceiptText returns null fields for unusable text', () => {
  assert.deepEqual(parseReceiptText('レシート\nありがとうございました'), {
    merchant: 'ありがとうございました',
    amount: null,
    spentOn: null,
    items: null,
  })
})

test('parseReceiptText rejects impossible dates', () => {
  const result = parseReceiptText('ふたり商店\n2026/02/30\n合計 500')
  assert.equal(result.spentOn, null)
})
