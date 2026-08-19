const STRONG_SEPARATOR = /[\n\r、,，]+/u
const JAPANESE_CONNECTOR = /\s+と\s+|(?<=[\p{Script=Han}\p{Script=Katakana}A-Za-z0-9])と|と(?=[\p{Script=Han}\p{Script=Katakana}A-Za-z0-9])/u

export function normalizeShoppingName(value) {
  return String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('ja-JP')
}

export function parseShoppingItems(input) {
  const seen = new Set()

  return String(input ?? '')
    .split(STRONG_SEPARATOR)
    .flatMap((group) => group.split(JAPANESE_CONNECTOR))
    .map((item) => item.trim())
    .filter((item) => {
      const normalized = normalizeShoppingName(item)
      if (!normalized || seen.has(normalized)) return false
      seen.add(normalized)
      return true
    })
}
