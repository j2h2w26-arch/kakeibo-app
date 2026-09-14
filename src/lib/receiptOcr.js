const TOTAL_LABELS = [
  /(?:^|\s)(?:合計|総計|現計|お支払(?:い)?|請求額|領収金額|税込合計)(?:\s|[:：¥￥]|$)/i,
  /(?:^|\s)(?:grand\s+total|total)(?:\s|[:：¥￥]|$)/i,
]

const EXCLUDED_AMOUNT_LABELS = /小計|税|消費税|内税|外税|お預り|預り|おつり|釣銭|値引|割引|subtotal|tax|change/i
const EXCLUDED_MERCHANT_LINE = /領収書|レシート|電話|tel|日時|日付|担当|レジ|取引|伝票|〒|https?:|www\.|合計|総計|小計/i
const EXCLUDED_ITEM_LINE = /合計|総計|小計|消費税|内税|外税|お預り|預り|おつり|釣銭|支払|クレジット|現金|領収|レシート|電話|tel|日時|日付|担当|レジ|取引|伝票|ポイント|お買上|total|subtotal|tax|change/i

function normalizeDigits(value) {
  return value
    .replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0))
    .replace(/[，,]/g, '')
}

function receiptLines(text) {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/[\t ]+/g, ' ').trim())
    .filter(Boolean)
}

function amountsInLine(line) {
  const normalized = normalizeDigits(line)
  const matches = normalized.match(/(?:¥|￥)?\s*\d{1,7}(?:\s*円)?/g) || []
  return matches
    .map((match) => Number(match.replace(/[^\d]/g, '')))
    .filter((amount) => Number.isSafeInteger(amount) && amount > 0)
}

function extractAmount(lines) {
  const ranked = []
  lines.forEach((line, index) => {
    if (EXCLUDED_AMOUNT_LABELS.test(line)) return
    const labelRank = TOTAL_LABELS.findIndex((pattern) => pattern.test(line))
    if (labelRank === -1) return
    for (const amount of amountsInLine(line)) {
      ranked.push({ amount, labelRank, index })
    }
  })

  ranked.sort((left, right) => (
    left.labelRank - right.labelRank
    || right.index - left.index
    || right.amount - left.amount
  ))
  return ranked[0]?.amount || null
}

function toIsoDate(year, month, day) {
  const fullYear = year.length === 2 ? Number(`20${year}`) : Number(year)
  const numericMonth = Number(month)
  const numericDay = Number(day)
  const date = new Date(Date.UTC(fullYear, numericMonth - 1, numericDay))
  if (
    date.getUTCFullYear() !== fullYear
    || date.getUTCMonth() + 1 !== numericMonth
    || date.getUTCDate() !== numericDay
  ) return null
  return `${String(fullYear).padStart(4, '0')}-${String(numericMonth).padStart(2, '0')}-${String(numericDay).padStart(2, '0')}`
}

function extractDate(lines) {
  for (const line of lines) {
    const normalized = normalizeDigits(line)
    const match = normalized.match(/\b(20\d{2}|\d{2})\s*[年/.-]\s*(\d{1,2})\s*[月/.-]\s*(\d{1,2})\s*日?/)
    if (match) {
      const date = toIsoDate(match[1], match[2], match[3])
      if (date) return date
    }
  }
  return null
}

function extractMerchant(lines) {
  return lines.find((line) => (
    line.length >= 2
    && line.length <= 80
    && !EXCLUDED_MERCHANT_LINE.test(line)
    && !/^[-=*#_\d\s:：/.]+$/.test(normalizeDigits(line))
  )) || null
}

function extractItems(lines) {
  const itemNames = []
  for (const line of lines) {
    if (EXCLUDED_ITEM_LINE.test(line)) continue
    if (!amountsInLine(line).length) continue

    const name = normalizeDigits(line)
      .replace(/(?:¥|￥)?\s*\d[\d,]*(?:\s*円)?\s*$/, '')
      .replace(/^[-*・●■□]+\s*/, '')
      .trim()

    if (name.length < 2 || name.length > 80 || /^\d/.test(name)) continue
    if (!itemNames.includes(name)) itemNames.push(name)
    if (itemNames.length === 20) break
  }
  return itemNames.length ? itemNames.join('、') : null
}

export function parseReceiptText(text) {
  const lines = receiptLines(text || '')
  return {
    merchant: extractMerchant(lines),
    amount: extractAmount(lines),
    spentOn: extractDate(lines),
    items: extractItems(lines),
  }
}

export async function recognizeReceipt(file, onProgress = () => {}) {
  const { createWorker } = await import('tesseract.js')
  let worker
  try {
    worker = await createWorker(['jpn', 'eng'], 1, {
      workerPath: `${window.location.origin}/ocr/worker.min.js`,
      corePath: `${window.location.origin}/ocr`,
      workerBlobURL: false,
      errorHandler: () => {},
      logger: ({ status, progress }) => {
        if (typeof progress === 'number') onProgress({ status, progress })
      },
    })
    const { data } = await worker.recognize(file)
    return {
      text: data.text || '',
      confidence: Number.isFinite(data.confidence) ? data.confidence : null,
      fields: parseReceiptText(data.text || ''),
    }
  } finally {
    await worker?.terminate()
  }
}
