import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from '@supabase/supabase-js'
import { recipeDescriptionParts } from './description.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const MAX_HTML_BYTES = 1_000_000
const FETCH_TIMEOUT_MS = 10_000

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json; charset=utf-8' },
  })
}

function isPrivateIpv4(value: string) {
  const parts = value.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false
  const [a, b] = parts
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
}

function isPrivateIpv6(value: string) {
  const normalized = value.toLowerCase().replace(/^\[|\]$/g, '')
  return normalized === '::' || normalized === '::1' || normalized.startsWith('fc')
    || normalized.startsWith('fd') || /^fe[89ab]/.test(normalized)
    || normalized.startsWith('::ffff:127.') || normalized.startsWith('::ffff:10.')
}

async function validateTarget(value: string) {
  let url: URL
  try { url = new URL(value) } catch { throw new Error('正しいURLを入力してください。') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('このURL形式は利用できません。')
  if (url.port && !['80', '443'].includes(url.port)) throw new Error('標準以外のポートは利用できません。')
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('この接続先は利用できません。')
  }
  if (isPrivateIpv4(host) || isPrivateIpv6(host)) throw new Error('内部ネットワークのURLは利用できません。')

  const addresses: string[] = []
  try {
    addresses.push(...await Deno.resolveDns(host, 'A'))
    addresses.push(...await Deno.resolveDns(host, 'AAAA'))
  } catch {
    if (!addresses.length) throw new Error('接続先を確認できませんでした。')
  }
  if (addresses.some((address) => isPrivateIpv4(address) || isPrivateIpv6(address))) {
    throw new Error('内部ネットワークのURLは利用できません。')
  }
  return url
}

async function fetchHtml(input: string) {
  let target = input
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    const url = await validateTarget(target)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    let response: Response
    try {
      response = await fetch(url, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'user-agent': 'FutariRecipeImporter/1.0',
        },
      })
    } finally {
      clearTimeout(timeout)
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      if (!location) throw new Error('転送先を確認できませんでした。')
      target = new URL(location, url).toString()
      continue
    }
    if (!response.ok) throw new Error(`ページを取得できませんでした（${response.status}）。`)
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.toLowerCase().includes('text/html')) throw new Error('HTMLページではないため取り込めません。')
    const declaredLength = Number(response.headers.get('content-length') || 0)
    if (declaredLength > MAX_HTML_BYTES) throw new Error('ページのサイズが大きすぎます。')
    const buffer = await response.arrayBuffer()
    if (buffer.byteLength > MAX_HTML_BYTES) throw new Error('ページのサイズが大きすぎます。')
    return { html: new TextDecoder().decode(buffer), finalUrl: url.toString() }
  }
  throw new Error('転送回数が多すぎます。')
}

function decodeEntities(value: string) {
  const named: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', yen: '¥' }
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity: string) => {
    if (entity.startsWith('#x')) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16))
    if (entity.startsWith('#')) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10))
    return named[entity.toLowerCase()] || `&${entity};`
  })
}

function cleanText(value: unknown, max = 2000) {
  if (typeof value !== 'string') return ''
  return decodeEntities(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, max)
}

function types(value: unknown) {
  return Array.isArray(value) ? value : [value]
}

function findRecipe(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const item of value) { const found = findRecipe(item); if (found) return found }
    return null
  }
  if (!value || typeof value !== 'object') return null
  const object = value as Record<string, unknown>
  if (types(object['@type']).some((type) => String(type).toLowerCase() === 'recipe')) return object
  for (const child of Object.values(object)) { const found = findRecipe(child); if (found) return found }
  return null
}

function instructionTexts(value: unknown): string[] {
  if (typeof value === 'string') return value.split(/\r?\n/).map((item) => cleanText(item)).filter(Boolean)
  if (Array.isArray(value)) return value.flatMap(instructionTexts)
  if (!value || typeof value !== 'object') return []
  const item = value as Record<string, unknown>
  if (item.text) return [cleanText(item.text)].filter(Boolean)
  if (item.itemListElement) return instructionTexts(item.itemListElement)
  return []
}

function metaContent(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, 'i'),
  ]
  for (const pattern of patterns) { const match = html.match(pattern); if (match) return cleanText(match[1], 300) }
  return ''
}

function pageTitle(html: string) {
  return metaContent(html, 'og:title') || cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '', 300)
}

function sourceKind(url: URL) {
  const host = url.hostname.toLowerCase()
  if (host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com')) return 'youtube'
  if (host === 'instagram.com' || host.endsWith('.instagram.com')) return 'instagram'
  return 'web'
}

function youtubeId(url: URL) {
  if (url.hostname === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] || ''
  if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/')[2] || ''
  if (url.pathname.startsWith('/embed/') || url.pathname.startsWith('/live/')) return url.pathname.split('/')[2] || ''
  return url.searchParams.get('v') || ''
}

function normalizedSourceUrl(url: URL) {
  const normalized = new URL(url)
  const host = normalized.hostname.toLowerCase()
  if (host === 'youtube.com' || host === 'm.youtube.com') normalized.hostname = 'www.youtube.com'
  if (host === 'instagram.com' || host === 'm.instagram.com') normalized.hostname = 'www.instagram.com'
  return normalized
}

async function youtubeSnippet(videoId: string) {
  const apiKey = Deno.env.get('YOUTUBE_API_KEY')?.trim()
  if (!apiKey) return null
  const endpoint = new URL('https://www.googleapis.com/youtube/v3/videos')
  endpoint.searchParams.set('part', 'snippet')
  endpoint.searchParams.set('id', videoId)
  endpoint.searchParams.set('key', apiKey)
  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!response.ok) return null
    const payload = await response.json()
    const snippet = payload?.items?.[0]?.snippet
    if (!snippet) return null
    return {
      title: cleanText(snippet.title || '', 300),
      description: typeof snippet.description === 'string' ? snippet.description : '',
      channelTitle: cleanText(snippet.channelTitle || '', 160),
    }
  } catch {
    return null
  }
}

async function importYoutube(url: URL) {
  const videoId = youtubeId(url)
  if (!/^[\w-]{6,20}$/.test(videoId)) throw new Error('YouTube動画のURLを確認してください。')
  const sourceUrl = normalizedSourceUrl(url)
  const snippet = await youtubeSnippet(videoId)
  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(sourceUrl.toString())}&format=json`
  let data: { title?: string } = {}
  if (!snippet?.title) {
    try {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
      if (response.ok) data = await response.json()
    } catch { /* the source link is still useful without metadata */ }
  }
  const descriptionParts = snippet ? recipeDescriptionParts(snippet.description) : { ingredients: [], steps: [] }
  const extracted = descriptionParts.ingredients.length + descriptionParts.steps.length
  return {
    title: cleanText(snippet?.title || data.title || 'YouTubeのレシピ', 160),
    source_title: cleanText(snippet?.title || data.title || '', 300),
    source_url: sourceUrl.toString(),
    source_kind: 'youtube',
    servings: '',
    ingredients: descriptionParts.ingredients,
    steps: descriptionParts.steps,
    note: snippet?.channelTitle ? `投稿者: ${snippet.channelTitle}` : '',
    import_note: extracted
      ? `YouTubeの概要欄から材料${descriptionParts.ingredients.length}件・手順${descriptionParts.steps.length}件を読み取りました。内容を確認して保存してください。`
      : snippet
        ? 'YouTubeのタイトルとリンクを保存しました。概要欄に材料・手順の見出しが見つからなかったため、必要な内容を入力してください。'
        : 'YouTubeのタイトルとリンクを保存しました。概要欄を取得できなかったため、必要な内容を入力してください。',
  }
}

function importInstagram(url: URL) {
  return {
    title: 'Instagramのレシピ', source_title: '', source_url: url.toString(), source_kind: 'instagram',
    servings: '', ingredients: [], steps: [],
    import_note: 'Instagramは投稿内容を自動取得できないため、リンクを保存しました。投稿を見ながら材料と手順を入力してください。',
  }
}

async function importWeb(url: URL) {
  const { html, finalUrl } = await fetchHtml(url.toString())
  let recipe: Record<string, unknown> | null = null
  const scriptPattern = /<script[^>]+type=["']application\/ld\+json[^"']*["'][^>]*>([\s\S]*?)<\/script>/gi
  for (const match of html.matchAll(scriptPattern)) {
    try { recipe = findRecipe(JSON.parse(match[1].trim())); if (recipe) break } catch { /* keep looking */ }
  }
  const title = cleanText(recipe?.name || pageTitle(html) || 'Webのレシピ', 160)
  const rawIngredients = Array.isArray(recipe?.recipeIngredient) ? recipe.recipeIngredient : []
  const ingredients = rawIngredients.map((item) => ({ name: cleanText(item, 200), quantity_text: '' })).filter((item) => item.name)
  const steps = instructionTexts(recipe?.recipeInstructions).slice(0, 100).map((body) => ({ body }))
  const yields = Array.isArray(recipe?.recipeYield) ? recipe?.recipeYield.join('、') : recipe?.recipeYield
  return {
    title,
    source_title: pageTitle(html),
    source_url: finalUrl,
    source_kind: 'web',
    servings: cleanText(yields || '', 80),
    ingredients: ingredients.slice(0, 200),
    steps,
    import_note: recipe
      ? 'ページの構造化データから取り込みました。分量が材料名に含まれる場合があります。内容を確認して保存してください。'
      : 'このページには読み取れるレシピ情報がありませんでした。リンクとタイトルを保存し、材料と手順を入力してください。',
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')
    const adminKey = secretKeys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !adminKey) return json({ error: 'サーバー設定を確認できません。' }, 500)
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    const admin = createClient(supabaseUrl, adminKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: authData, error: authError } = await admin.auth.getUser(token)
    if (authError || !authData.user) return json({ error: 'ログインが必要です。' }, 401)
    const { data: member } = await admin.from('app_members').select('user_id').eq('user_id', authData.user.id).maybeSingle()
    if (!member) return json({ error: '家族メンバーだけが利用できます。' }, 403)

    const body = await req.json().catch(() => ({}))
    const url = normalizedSourceUrl(await validateTarget(typeof body.url === 'string' ? body.url : ''))
    const kind = sourceKind(url)
    if (kind === 'youtube') return json(await importYoutube(url))
    if (kind === 'instagram') return json(importInstagram(url))
    return json(await importWeb(url))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'URLを読み取れませんでした。'
    return json({ error: message.slice(0, 300) }, 400)
  }
})
