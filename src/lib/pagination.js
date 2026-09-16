export async function collectPages(fetchPage, { pageSize = 500, maxPages = 1000 } = {}) {
  const rows = []

  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize
    const result = await fetchPage(from, from + pageSize - 1)
    if (result.error) return { data: null, error: result.error }

    const pageRows = result.data || []
    rows.push(...pageRows)
    if (pageRows.length < pageSize) return { data: rows, error: null }
  }

  return {
    data: null,
    error: new Error(`データ取得が安全上限（${maxPages * pageSize}件）を超えました。`),
  }
}
