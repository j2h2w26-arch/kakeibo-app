import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from '@supabase/supabase-js'

const MAX_CAMPAIGNS_PER_SOURCE = 20
const FETCH_TIMEOUT_MS = 12000
const OFFICIAL_HOSTS = new Set(['point.rakuten.co.jp', 'pay.rakuten.co.jp'])

type PointSource = {
  id: number
  source_key: string
  name: string
  service_key: 'pointclub' | 'pay'
  index_url: string
  official_host: string
}

type CampaignAnalysis = {
  title: string
  entryRequired: boolean | null
  spendRequired: boolean
  lotteryOnly: boolean
  conditions: string | null
  benefit: string | null
  startsAt: string | null
  endsAt: string | null
  selectionScore: number
  selectionBucket: 'auto' | 'candidate' | 'review' | 'excluded'
  sourceConfidence: number
  status: 'active' | 'ended' | 'review'
  contentHash: string
  metadata: Record<string, unknown>
}

type CampaignStep = {
  step_key: string
  step_order: number
  title: string
  action_type: 'tap' | 'entry' | 'condition' | 'check'
  frequency: 'once'
  estimated_minutes: number
  instructions: string | null
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

function clip(value: string, length: number) {
  return value.trim().replace(/\s+/g, ' ').slice(0, length)
}

function decodeEntities(value: string) {
  const named: Record<string, string> = {
    amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', yen: '¥',
  }
  return value
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] ?? match)
}

function htmlToText(html: string) {
  return decodeEntities(
    html
      .replace(/<(script|style|svg|noscript)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[^]*?-->/g, ' ')
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<\/p>|<\/li>|<\/h[1-6]>|<\/tr>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/[ \t]+/g, ' ').replace(/\n\s+/g, '\n').trim()
}

function metaTitle(html: string) {
  const variants = [
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["'][^>]*>/i,
    /<title[^>]*>([\s\S]*?)<\/title>/i,
    /<h1[^>]*>([\s\S]*?)<\/h1>/i,
  ]
  for (const pattern of variants) {
    const match = html.match(pattern)
    if (match?.[1]) return clip(htmlToText(match[1]), 180)
  }
  return ''
}

function canonicalCampaignLinks(html: string, source: PointSource) {
  const urls = new Set<string>()
  const hrefPattern = /href\s*=\s*["']([^"']+)["']/gi
  let match: RegExpExecArray | null
  while ((match = hrefPattern.exec(html)) && urls.size < MAX_CAMPAIGNS_PER_SOURCE) {
    try {
      const url = new URL(decodeEntities(match[1]), source.index_url)
      url.hash = ''
      url.search = ''
      const isCampaignPath = url.pathname.startsWith('/campaign/') && url.pathname !== '/campaign/'
      const excludedPath = /\/(?:faq|terms|agreement|guidance|rule|history)(?:\/|$)/i.test(url.pathname)
      if (
        url.protocol === 'https:'
        && url.hostname === source.official_host
        && OFFICIAL_HOSTS.has(url.hostname)
        && isCampaignPath
        && !excludedPath
      ) {
        urls.add(url.toString())
      }
    } catch {
      // Ignore malformed links from third-party page content.
    }
  }
  return [...urls]
}

async function fetchHtml(url: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'FutariHome/1.0 personal-household-campaign-checker',
      },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html')) throw new Error(`unexpected content type: ${contentType}`)
    return await response.text()
  } finally {
    clearTimeout(timeout)
  }
}

function toTokyoIso(year: number, month: number, day: number, hour: number, minute: number) {
  return new Date(Date.UTC(year, month - 1, day, hour - 9, minute)).toISOString()
}

function campaignDates(text: string) {
  const found: Array<{ year: number; month: number; day: number; hour?: number; minute?: number }> = []
  const patterns = [
    /(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日(?:\([^)]*\))?\s*(?:(\d{1,2})\s*:\s*(\d{2}))?/g,
    /(20\d{2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{1,2})(?:\([^)]*\))?\s*(?:(\d{1,2})\s*:\s*(\d{2}))?/g,
  ]
  for (const pattern of patterns) {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(text)) && found.length < 20) {
      const value = {
        year: Number(match[1]), month: Number(match[2]), day: Number(match[3]),
        hour: match[4] ? Number(match[4]) : undefined,
        minute: match[5] ? Number(match[5]) : undefined,
      }
      if (value.month < 1 || value.month > 12 || value.day < 1 || value.day > 31) continue
      if (!found.some((item) => JSON.stringify(item) === JSON.stringify(value))) found.push(value)
    }
  }
  const [first, second] = found
  return {
    startsAt: first ? toTokyoIso(first.year, first.month, first.day, first.hour ?? 0, first.minute ?? 0) : null,
    endsAt: second ? toTokyoIso(second.year, second.month, second.day, second.hour ?? 23, second.minute ?? 59) : null,
  }
}

function snippetAround(text: string, keyword: RegExp, length: number) {
  const match = keyword.exec(text)
  if (!match) return null
  const start = Math.max(0, match.index)
  return clip(text.slice(start, start + length), length)
}

async function sha256(value: string) {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function analyzeCampaign(html: string): Promise<CampaignAnalysis> {
  const text = htmlToText(html)
  const title = metaTitle(html)
  const { startsAt, endsAt } = campaignDates(text)
  const endedInCopy = /(?:キャンペーン|本キャンペーン)(?:は|が)?終了しました/.test(text)
  const endedByDate = endsAt ? new Date(endsAt).getTime() < Date.now() : false
  const entryRequired = /エントリー\s*(?:：|:)?\s*(?:必要|必須)/.test(text)
    ? true
    : /エントリー\s*(?:：|:)?\s*不要/.test(text) ? false : null
  const spendRequired = /(?:購入|お買い物|支払|決済|チャージ|契約|申込|カード発行|口座開設)/.test(text)
  const lotteryOnly = /(?:抽選|くじ|ルーレット|山分け)/.test(text)
  const generallyEligible = /楽天会員なら(?:だれ|誰|どなた)でも|(?:だれ|誰|どなた)でも参加/.test(text)
  const restricted = /(?:初めて|はじめて|久しぶり|対象店舗|対象地域|対象者限定|会員限定|県内|市内)/.test(text)
  const conditions = snippetAround(text, /(?:参加方法|条件|対象者)/, 700)
  const benefit = snippetAround(text, /(?:特典|ポイント進呈|プレゼント)/, 400)

  let sourceConfidence = 35
  if (title.length >= 8) sourceConfidence += 20
  if (startsAt && endsAt) sourceConfidence += 20
  if (entryRequired !== null) sourceConfidence += 10
  if (conditions) sourceConfidence += 10
  if (benefit) sourceConfidence += 5
  sourceConfidence = Math.min(sourceConfidence, 100)

  let score = generallyEligible ? 25 : restricted ? 5 : 15
  score += spendRequired ? 0 : 20
  score += spendRequired ? 7 : 15
  score += lotteryOnly ? 7 : benefit ? 15 : 5
  if (endsAt) {
    const days = (new Date(endsAt).getTime() - Date.now()) / 86400000
    score += days <= 3 ? 10 : days <= 7 ? 6 : 3
  }
  score += 10
  score += sourceConfidence >= 70 ? 5 : 2
  if (spendRequired) score -= 20
  if (lotteryOnly) score -= 10
  score = Math.max(0, Math.min(score, 100))

  const status = endedInCopy || endedByDate ? 'ended' : sourceConfidence < 55 ? 'review' : 'active'
  let selectionBucket: CampaignAnalysis['selectionBucket'] = 'review'
  if (status === 'ended') selectionBucket = 'excluded'
  else if (sourceConfidence < 60 || (restricted && !generallyEligible)) selectionBucket = 'review'
  else if (score >= 70 && !spendRequired && generallyEligible) selectionBucket = 'auto'
  else if (score >= 40) selectionBucket = 'candidate'
  else selectionBucket = 'excluded'

  return {
    title: title || '名称を確認できないキャンペーン',
    entryRequired,
    spendRequired,
    lotteryOnly,
    conditions,
    benefit,
    startsAt,
    endsAt,
    selectionScore: score,
    selectionBucket,
    sourceConfidence,
    status,
    contentHash: await sha256(text.slice(0, 50000)),
    metadata: { generally_eligible: generallyEligible, restricted, parser_version: 1 },
  }
}

function campaignSteps(campaign: CampaignAnalysis): CampaignStep[] {
  const steps: CampaignStep[] = [{
    step_key: 'check_eligibility',
    step_order: 10,
    title: `${clip(campaign.title, 70)}の対象条件を確認`,
    action_type: 'check',
    frequency: 'once',
    estimated_minutes: 2,
    instructions: '公式ページで対象者、期間、対象サービス、特典上限を本人が確認します。',
  }]
  if (campaign.entryRequired) {
    steps.push({
      step_key: 'enter_campaign',
      step_order: 20,
      title: `${clip(campaign.title, 70)}にエントリー`,
      action_type: 'entry',
      frequency: 'once',
      estimated_minutes: 1,
      instructions: '公式ページを開き、本人がエントリーします。自動操作は行いません。',
    })
  }
  if (campaign.lotteryOnly && !campaign.spendRequired) {
    steps.push({
      step_key: 'join_lottery',
      step_order: 30,
      title: `${clip(campaign.title, 70)}の抽選・くじに参加`,
      action_type: 'tap',
      frequency: 'once',
      estimated_minutes: 1,
      instructions: '公式ページ上で本人が抽選・くじを実行します。',
    })
  }
  if (campaign.spendRequired) {
    steps.push({
      step_key: 'complete_condition',
      step_order: 30,
      title: `${clip(campaign.title, 70)}の利用条件を達成`,
      action_type: 'condition',
      frequency: 'once',
      estimated_minutes: 2,
      instructions: campaign.conditions || '公式ページの利用・購入条件を確認し、本人が達成状況を記録します。',
    })
  }
  return steps
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')
  const adminKey = secretKeys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  if (!adminKey || !supabaseUrl) return jsonResponse({ error: 'Supabase environment is not configured' }, 500)

  const supabase = createClient(supabaseUrl, adminKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const cronSecret = req.headers.get('x-sync-secret') || ''
  const { data: syncConfig } = await supabase
    .from('point_sync_config')
    .select('cron_secret_hash')
    .eq('singleton', true)
    .maybeSingle()
  const isCron = Boolean(
    cronSecret
    && syncConfig?.cron_secret_hash
    && await sha256(cronSecret) === syncConfig.cron_secret_hash
  )

  if (!isCron) {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user) return jsonResponse({ error: 'Unauthorized' }, 401)
    const { data: member } = await supabase
      .from('app_members')
      .select('user_id')
      .eq('user_id', authData.user.id)
      .maybeSingle()
    if (!member) return jsonResponse({ error: 'Household membership required' }, 403)

    const { data: recentRun } = await supabase
      .from('point_sync_runs')
      .select('started_at')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (recentRun && Date.now() - new Date(recentRun.started_at).getTime() < 10 * 60 * 1000) {
      return jsonResponse({ error: '更新は10分おきに実行できます' }, 429)
    }
  }

  const { data: run, error: runError } = await supabase
    .from('point_sync_runs')
    .insert({ status: 'running' })
    .select('id')
    .single()
  if (runError) return jsonResponse({ error: runError.message }, 500)

  const summary = {
    sources_checked: 0,
    campaigns_found: 0,
    campaigns_created: 0,
    campaigns_updated: 0,
    errors: [] as Array<{ source: string; message: string }>,
  }

  try {
    const { data: sources, error: sourceError } = await supabase
      .from('point_sources')
      .select('id, source_key, name, service_key, index_url, official_host')
      .eq('is_enabled', true)
      .order('id')
    if (sourceError) throw sourceError

    for (const source of (sources || []) as PointSource[]) {
      summary.sources_checked += 1
      const checkedAt = new Date().toISOString()
      try {
        const indexHtml = await fetchHtml(source.index_url)
        const links = canonicalCampaignLinks(indexHtml, source)
        summary.campaigns_found += links.length

        for (const canonicalUrl of links) {
          try {
            const html = await fetchHtml(canonicalUrl)
            const analysis = await analyzeCampaign(html)
            const { data: existing } = await supabase
              .from('point_campaigns')
              .select('id, content_hash')
              .eq('canonical_url', canonicalUrl)
              .maybeSingle()
            const changed = !existing || existing.content_hash !== analysis.contentHash

            const payload = {
              source_id: source.id,
              service_key: source.service_key,
              canonical_url: canonicalUrl,
              title: analysis.title,
              entry_required: analysis.entryRequired,
              spend_required: analysis.spendRequired,
              lottery_only: analysis.lotteryOnly,
              conditions: analysis.conditions,
              benefit: analysis.benefit,
              starts_at: analysis.startsAt,
              ends_at: analysis.endsAt,
              selection_score: analysis.selectionScore,
              selection_bucket: analysis.selectionBucket,
              source_confidence: analysis.sourceConfidence,
              content_hash: analysis.contentHash,
              status: analysis.status,
              last_seen_at: checkedAt,
              source_checked_at: checkedAt,
              updated_at: checkedAt,
              raw_metadata: analysis.metadata,
            }
            const { data: campaign, error: campaignError } = await supabase
              .from('point_campaigns')
              .upsert(payload, { onConflict: 'canonical_url' })
              .select('id')
              .single()
            if (campaignError) throw campaignError

            if (!existing) summary.campaigns_created += 1
            else if (changed) summary.campaigns_updated += 1

            if (changed) {
              const steps = campaignSteps(analysis).map((step) => ({ ...step, campaign_id: campaign.id }))
              const { error: deleteStepsError } = await supabase
                .from('point_campaign_steps')
                .delete()
                .eq('campaign_id', campaign.id)
              if (deleteStepsError) throw deleteStepsError
              const { error: stepError } = await supabase.from('point_campaign_steps').insert(steps)
              if (stepError) throw stepError
            }

            if (analysis.status === 'ended') {
              await supabase.from('point_activities').update({ is_active: false, updated_at: checkedAt }).eq('campaign_id', campaign.id)
            }
          } catch (error) {
            summary.errors.push({
              source: source.source_key,
              message: clip(`${canonicalUrl}: ${error instanceof Error ? error.message : String(error)}`, 1000),
            })
          }
        }

        await supabase.from('point_sources').update({
          last_checked_at: checkedAt,
          last_success_at: checkedAt,
          last_error: null,
          updated_at: checkedAt,
        }).eq('id', source.id)
      } catch (error) {
        const message = clip(error instanceof Error ? error.message : String(error), 1000)
        summary.errors.push({ source: source.source_key, message })
        await supabase.from('point_sources').update({
          last_checked_at: checkedAt,
          last_error: message,
          updated_at: checkedAt,
        }).eq('id', source.id)
      }
    }

    const finalStatus = summary.errors.length === 0 ? 'success' : summary.campaigns_found > 0 ? 'partial' : 'failed'
    await supabase.from('point_sync_runs').update({
      ...summary,
      status: finalStatus,
      finished_at: new Date().toISOString(),
    }).eq('id', run.id)
    return jsonResponse({ ok: finalStatus !== 'failed', status: finalStatus, ...summary })
  } catch (error) {
    const message = clip(error instanceof Error ? error.message : String(error), 1000)
    summary.errors.push({ source: 'system', message })
    await supabase.from('point_sync_runs').update({
      ...summary,
      status: 'failed',
      finished_at: new Date().toISOString(),
    }).eq('id', run.id)
    return jsonResponse({ ok: false, status: 'failed', ...summary }, 500)
  }
})
