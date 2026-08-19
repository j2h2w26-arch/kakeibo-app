export const INVENTORY_STATUSES = [
  { value: 'enough', label: '十分' },
  { value: 'low', label: '残りわずか' },
  { value: 'out', label: 'なし' },
]

export const INVENTORY_UNITS = ['個', '袋', '本', '箱', 'ロール', 'パック', '枚']

const STATUS_ORDER = { out: 0, low: 1, enough: 2 }

export function normalizeInventoryName(value) {
  return String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('ja-JP')
}

export function inventoryNeedsRestock(item) {
  return item.status === 'low' || item.status === 'out'
}

export function sortInventoryItems(items) {
  return [...items].sort((left, right) => (
    (STATUS_ORDER[left.status] ?? 9) - (STATUS_ORDER[right.status] ?? 9)
    || left.category.localeCompare(right.category, 'ja')
    || left.name.localeCompare(right.name, 'ja')
  ))
}

export function changedInventoryQuantity(quantity, delta) {
  if (quantity === null || quantity === undefined || quantity === '') return null
  const next = Math.max(0, Math.round((Number(quantity) + delta) * 100) / 100)
  return Number.isFinite(next) ? next : null
}

export function statusForQuantity(quantity, currentStatus) {
  if (quantity === 0) return 'out'
  if (quantity !== null && quantity !== undefined && quantity > 0 && currentStatus === 'out') return 'low'
  return currentStatus
}
