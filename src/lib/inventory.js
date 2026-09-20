export const INVENTORY_STATUSES = [
  { value: 'enough', label: '十分' },
  { value: 'low', label: '残りわずか' },
  { value: 'out', label: 'なし' },
]

export const INVENTORY_CATEGORIES = ['食品', '調味料', '日用品', '掃除用品', '防災品', 'その他']

export const INVENTORY_UNITS = ['個', '袋', '本', '箱', '缶', 'ロール', 'パック', '枚', 'kg', 'g', 'L', 'ml']

const STATUS_ORDER = { out: 0, low: 1, enough: 2 }

export function normalizeInventoryName(value) {
  return String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('ja-JP')
}

export function inventoryStatus(item) {
  const quantity = item.quantity === null || item.quantity === undefined || item.quantity === ''
    ? null
    : Number(item.quantity)
  const minimum = item.min_quantity === null || item.min_quantity === undefined || item.min_quantity === ''
    ? null
    : Number(item.min_quantity)
  if (quantity === 0) return 'out'
  if (Number.isFinite(quantity) && Number.isFinite(minimum)) return quantity < minimum ? 'low' : 'enough'
  return item.status
}

export function inventoryNeedsRestock(item) {
  const status = inventoryStatus(item)
  return status === 'low' || status === 'out'
}

export function sortInventoryItems(items) {
  return [...items].sort((left, right) => (
    (STATUS_ORDER[inventoryStatus(left)] ?? 9) - (STATUS_ORDER[inventoryStatus(right)] ?? 9)
    || left.category.localeCompare(right.category, 'ja')
    || left.name.localeCompare(right.name, 'ja')
  ))
}

export function changedInventoryQuantity(quantity, delta) {
  if (quantity === null || quantity === undefined || quantity === '') return null
  const next = Math.max(0, Math.round((Number(quantity) + delta) * 100) / 100)
  return Number.isFinite(next) ? next : null
}

export function statusForQuantity(quantity, currentStatus, minimum = null) {
  const numericQuantity = quantity === null || quantity === undefined || quantity === '' ? null : Number(quantity)
  if (numericQuantity === 0) return 'out'
  if (Number.isFinite(numericQuantity) && minimum !== null && minimum !== '' && Number.isFinite(Number(minimum))) {
    return numericQuantity < Number(minimum) ? 'low' : 'enough'
  }
  if (Number.isFinite(numericQuantity) && numericQuantity > 0 && currentStatus === 'out') return 'low'
  return currentStatus
}

export function restockAmount(item) {
  const quantity = Number(item.quantity)
  const minimum = Number(item.min_quantity)
  if (item.quantity == null || item.min_quantity == null || !Number.isFinite(quantity) || !Number.isFinite(minimum)) return null
  return Math.max(0, Math.round((minimum - quantity) * 100) / 100)
}

export function shoppingCategoryForInventory(category) {
  if (['食品', '食材', '調味料'].includes(category)) return '食材'
  if (['日用品', '掃除用品', '防災品'].includes(category)) return '日用品'
  return 'その他'
}
