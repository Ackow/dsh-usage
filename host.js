// @ts-check
/**
 * dshd-usage — DeepSeek Harness 用量插件（host 半区）。
 *
 * 在同源 webServer 上注册四个只读路由，供 client 面板 fetch：
 *   /dsh-usage/balance  — DeepSeek 账户余额（凭据在 host 解析，key 不进浏览器）
 *   /dsh-usage/session  — 会话用量折叠：token 四桶 / 命中率 / 成本 / 逐轮序列
 *   /dsh-usage/pricing  — 价格表快照 + 币种（USD/CNY）+ 估算标记
 *   /dsh-usage/history  — 历史明细（v1 为当前会话轮次；多会话枚举待扩展）
 *
 * 计算与 dsh-billing / dsh-usage-chart 语义一致：
 *   - 用量来自 session.events 的 assistant/chunk(usage) 与 assistant/message；
 *   - 命中率 = cacheRead / (uncachedInput + cacheRead + cacheWrite)；
 *   - 成本按「未命中输入 / 命中输入 / 输出」三价估算，标为非精确值。
 *
 * 无运行时依赖。凭据经 credentials 服务或 DEEPSEEK_API_KEY 环境变量解析。
 */

export const name = 'dshd-usage'

/** 服务依赖：webServer（路由载体）；sessions / credentials 按需 ctx.get。 */
export const inject = ['webServer']

const PUBLIC_BASE_URL = 'https://api.deepseek.com'
const DEFAULT_API_KEY_ENV = 'DEEPSEEK_API_KEY'
const OPENROUTER_API_KEY_ENV = 'OPENROUTER_API_KEY'
const CNY_PER_USD_DEFAULT = 6.76
const BEIJING_OFFSET_MINUTES = 480
const DEFAULT_PEAK_WINDOWS = [[9, 12], [14, 18]]
const PRICE_SYNC_URL = 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/'

/**
 * 官方单价（人民币 / 百万 tokens）。
 * 2026-08-17 00:00（北京时间）前用扁平价；之后按峰谷：高峰 9:00–12:00、14:00–18:00。
 * 来源：https://api-docs.deepseek.com/zh-cn/quick_start/pricing/
 */
const PRICING_CNY = {
  'deepseek-v4-flash': {
    cacheHit: 0.02, cacheMiss: 1, output: 2,
    schedules: [{
      effectiveAt: '2026-08-17T00:00:00+08:00',
      timezoneOffsetMinutes: BEIJING_OFFSET_MINUTES,
      peakWindows: DEFAULT_PEAK_WINDOWS,
      offPeak: { cacheHit: 0.05, cacheMiss: 1.5, output: 4.5 },
      peak: { cacheHit: 0.1, cacheMiss: 3.0, output: 9.0 },
    }],
  },
  'deepseek-v4-pro': {
    cacheHit: 0.025, cacheMiss: 3, output: 6,
    schedules: [{
      effectiveAt: '2026-08-17T00:00:00+08:00',
      timezoneOffsetMinutes: BEIJING_OFFSET_MINUTES,
      peakWindows: DEFAULT_PEAK_WINDOWS,
      offPeak: { cacheHit: 0.15, cacheMiss: 4.5, output: 13.5 },
      peak: { cacheHit: 0.30, cacheMiss: 9.0, output: 27.0 },
    }],
  },
  'deepseek-chat': { cacheHit: 0.2, cacheMiss: 2, output: 3 },
  'deepseek-reasoner': { cacheHit: 1, cacheMiss: 4, output: 16 },
}
const FALLBACK_PRICE = { cacheHit: 0.025, cacheMiss: 3, output: 6 }

const DEFAULT_CONFIG = {
  apiKeyEnv: DEFAULT_API_KEY_ENV,
  openrouterApiKeyEnv: OPENROUTER_API_KEY_ENV,
  baseUrl: PUBLIC_BASE_URL,
  cnyPerUsd: CNY_PER_USD_DEFAULT,
  allowRemote: false,
}

export function mergeConfig(config) {
  const raw = config && typeof config === 'object' ? config : {}
  const pricing = {}
  for (const [model, entry] of Object.entries(PRICING_CNY)) pricing[model] = { ...entry }
  for (const [model, entry] of Object.entries(raw.pricing ?? {})) {
    pricing[model] = { ...entry } // 用户覆盖：可带 schedules
  }
  const cnyPerUsd = Number(raw.cnyPerUsd) > 0 ? Number(raw.cnyPerUsd) : CNY_PER_USD_DEFAULT
  return {
    apiKeyEnv: typeof raw.apiKeyEnv === 'string' && raw.apiKeyEnv ? raw.apiKeyEnv : DEFAULT_API_KEY_ENV,
    openrouterApiKeyEnv: typeof raw.openrouterApiKeyEnv === 'string' && raw.openrouterApiKeyEnv ? raw.openrouterApiKeyEnv : OPENROUTER_API_KEY_ENV,
    baseUrl: typeof raw.baseUrl === 'string' && raw.baseUrl ? raw.baseUrl : PUBLIC_BASE_URL,
    cnyPerUsd,
    allowRemote: raw.allowRemote === true,
    pricing,
  }
}

/**
 * 按时间选择适用的单价（含峰谷时段判断）。
 * 返回 { rate, mode }，mode ∈ flat | peak | off-peak。
 */
export function rateAt(pricingEntry, timeMs) {
  let active = null
  for (const sched of pricingEntry?.schedules ?? []) {
    const eff = new Date(sched.effectiveAt).getTime()
    if (Number.isFinite(eff) && timeMs >= eff) {
      if (!active || eff > new Date(active.effectiveAt).getTime()) active = sched
    }
  }
  if (!active) return { rate: pricingEntry, mode: 'flat' }
  const off = Number.isFinite(active.timezoneOffsetMinutes) ? active.timezoneOffsetMinutes : BEIJING_OFFSET_MINUTES
  const shifted = new Date(timeMs + off * 60000)
  const hour = shifted.getUTCHours()
  const windows = Array.isArray(active.peakWindows) && active.peakWindows.length > 0 ? active.peakWindows : DEFAULT_PEAK_WINDOWS
  const inPeak = windows.some(([s, e]) => hour >= s && hour < e)
  return { rate: inPeak ? active.peak : active.offPeak, mode: inPeak ? 'peak' : 'off-peak' }
}

/** 从官方价格页 HTML 提取「缓存命中 / 未命中 / 输出」价（人民币/M）。失败返回 null。 */
export function parsePricingHtml(html) {
  const tables = []
  for (const t of String(html).matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)) {
    const rows = []
    for (const tr of t[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = []
      for (const td of tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)) {
        cells.push(td[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/ /g, ' ').trim())
      }
      if (cells.length) rows.push(cells)
    }
    if (rows.length) tables.push(rows)
  }
  const models = {}
  for (const rows of tables) {
    const header = rows[0] ?? []
    const cols = []
    for (let i = 1; i < header.length; i++) {
      if (/^deepseek-[\w.-]+$/.test(header[i])) cols.push({ idx: i, model: header[i] })
    }
    if (cols.length === 0) continue
    const hitRow = rows.find((r) => String(r[0] ?? '').includes('缓存命中'))
    const missRow = rows.find((r) => String(r[0] ?? '').includes('缓存未命中'))
    const outRow = rows.find((r) => String(r[0] ?? '').includes('输出'))
    if (!hitRow || !missRow || !outRow) continue
    const numAt = (row, idx) => {
      const m = String(row[idx] ?? '').match(/([\d.]+)/)
      return m ? Number(m[1]) : NaN
    }
    for (const { idx, model } of cols) {
      const cacheHit = numAt(hitRow, idx)
      const cacheMiss = numAt(missRow, idx)
      const output = numAt(outRow, idx)
      if (Number.isFinite(cacheHit) && Number.isFinite(cacheMiss) && Number.isFinite(output)) {
        models[model] = { cacheHit, cacheMiss, output }
      }
    }
    if (Object.keys(models).length) break
  }
  return Object.keys(models).length ? models : null
}

// ------------------------------------------------------------- 用量折叠

/** 从会话日志收集每步 token 用量（provider 上报的 usage 为准）。 */
export function collectUsage(session) {
  const steps = new Map()
  if (!session || !Array.isArray(session.events)) return steps
  const stepKey = (turn, step) => `${turn}:${step}`
  for (const event of session.events) {
    if (event.type === 'assistant/chunk') {
      const chunk = event.data?.chunk
      if (chunk?.type !== 'usage') continue
      const key = stepKey(event.data.turn, event.data.step)
      let bucket = steps.get(key)
      if (!bucket) {
        bucket = { turn: event.data.turn, step: event.data.step, time: event.time, usage: null, model: null }
        steps.set(key, bucket)
      }
      const u = chunk.usage ?? {}
      const acc = bucket.usage ?? { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
      // dsh 上报字段为 inputTokens（未命中输入）；内部统一为 uncachedInputTokens。
      acc.uncachedInputTokens += u.inputTokens ?? 0
      acc.outputTokens += u.outputTokens ?? 0
      acc.cacheReadTokens += u.cacheReadTokens ?? 0
      acc.cacheWriteTokens += u.cacheWriteTokens ?? 0
      bucket.usage = acc
    } else if (event.type === 'assistant/message') {
      const key = stepKey(event.data.turn, event.data.step)
      let bucket = steps.get(key)
      if (!bucket) {
        bucket = { turn: event.data.turn, step: event.data.step, time: event.time, usage: null, model: null }
        steps.set(key, bucket)
      }
      const source = event.data.message?.source
      if (source?.model) bucket.model = `${source.provider ?? ''}:${source.model}`
      if (!bucket.usage && event.data.usage) {
        const u = event.data.usage
        bucket.usage = {
          uncachedInputTokens: u.inputTokens ?? 0,
          outputTokens: u.outputTokens ?? 0,
          cacheReadTokens: u.cacheReadTokens ?? 0,
          cacheWriteTokens: u.cacheWriteTokens ?? 0,
        }
      }
    }
  }
  return steps
}

/** 计费输入 tokens（三个 prompt 侧桶之和）。 */
export function billedInputTokens(usage) {
  return (usage.uncachedInputTokens ?? 0) + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0)
}

/** 输入侧缓存命中率（%），无输入时返回 null。 */
export function cacheHitPercent(usage) {
  const denom = billedInputTokens(usage)
  return denom === 0 ? null : Math.round(((usage.cacheReadTokens ?? 0) / denom) * 100)
}

/** 单次用量成本（CNY 估算；DeepSeek 暂不对 cacheWrite 计费，按未命中价近似）。 */
export function costCny(usage, rate) {
  const input = ((usage.uncachedInputTokens ?? 0) + (usage.cacheWriteTokens ?? 0)) / 1e6 * rate.cacheMiss
  const read = (usage.cacheReadTokens ?? 0) / 1e6 * rate.cacheHit
  const out = (usage.outputTokens ?? 0) / 1e6 * rate.output
  return input + read + out
}

function bareModelOf(model) {
  const m = String(model ?? '')
  return m ? (m.includes(':') ? m.slice(m.lastIndexOf(':') + 1) : m) : ''
}

/** 把用量步骤折叠成逐轮序列 + 汇总（成本为 CNY 估算，按请求时刻套峰谷价）。 */
export function foldUsage(usageSteps, config, nowMs, sessionId, pricing) {
  const priceMap = pricing ?? config.pricing
  const rounds = []
  let total = { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
  for (const bucket of usageSteps.values()) {
    if (!bucket.usage) continue
    const u = bucket.usage
    total.uncachedInputTokens += u.uncachedInputTokens ?? 0
    total.cacheReadTokens += u.cacheReadTokens ?? 0
    total.cacheWriteTokens += u.cacheWriteTokens ?? 0
    total.outputTokens += u.outputTokens ?? 0
    const bare = bareModelOf(bucket.model)
    const time = bucket.time ?? nowMs
    const { rate, mode } = rateAt(priceMap[bare] ?? null, time)
    const cost = costCny(u, rate ?? FALLBACK_PRICE)
    rounds.push({
      time,
      turn: bucket.turn,
      sessionId: sessionId ?? null,
      model: bare || '(unknown)',
      uncachedInput: u.uncachedInputTokens ?? 0,
      cacheRead: u.cacheReadTokens ?? 0,
      cacheWrite: u.cacheWriteTokens ?? 0,
      output: u.outputTokens ?? 0,
      costCny: Number(cost.toFixed(6)),
      pricingMode: mode,
      estimated: !(bare in priceMap),
    })
  }
  rounds.sort((a, b) => (a.time ?? 0) - (b.time ?? 0))
  const hitRate = cacheHitPercent(total)
  const totalCost = rounds.reduce((s, r) => s + r.costCny, 0)
  return {
    totals: total,
    billedInput: billedInputTokens(total),
    hitRate,
    costCny: Number(totalCost.toFixed(6)),
    rounds,
  }
}

/** 合并多个会话的用量折叠（全部会话汇总，rounds 标注所属会话）。 */
export function foldSessions(sessions, config, nowMs, pricing) {
  const total = { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
  const rounds = []
  for (const session of sessions) {
    const folded = foldUsage(collectUsage(session), config, nowMs, session.id, pricing)
    total.uncachedInputTokens += folded.totals.uncachedInputTokens
    total.cacheReadTokens += folded.totals.cacheReadTokens
    total.cacheWriteTokens += folded.totals.cacheWriteTokens
    total.outputTokens += folded.totals.outputTokens
    rounds.push(...folded.rounds)
  }
  rounds.sort((a, b) => (a.time ?? 0) - (b.time ?? 0))
  return {
    totals: total,
    billedInput: billedInputTokens(total),
    hitRate: cacheHitPercent(total),
    costCny: Number(rounds.reduce((s, r) => s + r.costCny, 0).toFixed(6)),
    rounds,
  }
}

// ------------------------------------------------------------- 会话标题

/** 解析 JSONL 会话日志为事件数组（跳过 header 行与坏行）。 */
export function parseLogEvents(content) {
  const events = []
  if (!content) return events
  for (const line of content.split('\n')) {
    const t = line.trim()
    if (!t) continue
    try {
      const ev = JSON.parse(t)
      if (ev && typeof ev === 'object' && typeof ev.type === 'string') events.push(ev)
    } catch { /* skip malformed line */ }
  }
  return events
}

/** 会话标题：最后一个 session/title 事件；回退首条用户文本。 */
export function sessionTitleOf(events) {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]
    if (ev.type === 'session/title' && ev.data && typeof ev.data.title === 'string' && ev.data.title.trim()) {
      return ev.data.title.trim()
    }
  }
  // fallback：首条用户消息的文本块
  for (const ev of events) {
    if (ev.type !== 'user/message') continue
    const src = ev.data && ev.data.source
    if (!src || src.kind !== 'user') continue
    const content = ev.data.content
    if (!Array.isArray(content)) continue
    const text = content.filter((b) => b && b.type === 'text').map((b) => b.text).join('\n').trim()
    if (text) return text.length > 40 ? text.slice(0, 40) + '…' : text
  }
  return ''
}

// ------------------------------------------------------------- 余额

function isLoopbackRequest(req) {
  const host = req.headers?.host
  if (host === undefined) return false
  try {
    const hostname = new URL(`http://${host}`).hostname
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]'
  } catch {
    return false
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(body))
}

async function resolveApiKey(ctx, config, ref) {
  const credentials = ctx.get?.('credentials')
  if (credentials && typeof credentials.resolve === 'function') {
    const hit = await credentials.resolve(ref)
    if (hit?.value) return hit.value
  }
  return process.env[ref]
}

async function fetchWithTimeout(url, opts, ms) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('余额请求超时')), ms || 15000)
  try {
    const response = await fetch(url, opts)
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`HTTP ${response.status}：${detail.slice(0, 200) || response.statusText}`)
    }
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

/** DeepSeek 官方 /user/balance。 */
async function fetchDeepseekBalance(ctx, config) {
  const apiKey = await resolveApiKey(ctx, config, config.apiKeyEnv)
  if (!apiKey) {
    throw new Error(`未配置 API Key（凭据引用 ${config.apiKeyEnv} 或同名环境变量）。请先在「模型」设置中保存 DeepSeek API 密钥。`)
  }
  const base = config.baseUrl.endsWith('/') ? config.baseUrl : config.baseUrl + '/'
  const raw = await fetchWithTimeout(new URL('/user/balance', base), {
    headers: { authorization: `Bearer ${apiKey}` },
  })
  return {
    provider: 'deepseek',
    isAvailable: raw?.is_available === true,
    infos: (raw?.balance_infos ?? []).map((info) => ({
      currency: info.currency,
      totalBalance: info.total_balance,
      grantedBalance: info.granted_balance,
      toppedUpBalance: info.topped_up_balance,
    })),
  }
}

/** OpenRouter 公开 /api/v1/credits。 */
async function fetchOpenrouterBalance(ctx, config) {
  const apiKey = await resolveApiKey(ctx, config, config.openrouterApiKeyEnv)
  if (!apiKey) {
    throw new Error(`未配置 API Key（凭据引用 ${config.openrouterApiKeyEnv} 或同名环境变量）。`)
  }
  const raw = await fetchWithTimeout('https://openrouter.ai/api/v1/credits', {
    headers: { authorization: `Bearer ${apiKey}` },
  })
  const data = raw?.data
  return {
    provider: 'openrouter',
    isAvailable: true,
    infos: [{
      currency: 'USD',
      totalBalance: data?.total_credits,
      grantedBalance: null,
      toppedUpBalance: data?.total_credits != null ? data.total_credits - (data.total_usage ?? 0) : null,
    }],
  }
}

async function fetchProviderBalance(ctx, config, provider) {
  if (provider === 'openrouter') return fetchOpenrouterBalance(ctx, config)
  return fetchDeepseekBalance(ctx, config)
}

// ------------------------------------------------------------- apply

export function apply(ctx, config) {
  const cfg = mergeConfig(config)
  const webServer = ctx.webServer ?? ctx.get?.('webServer')
  const warn = (msg) => { try { ctx.logger?.warn?.('dshd-usage: ' + msg) } catch { /* noop */ } }

  if (!webServer || typeof webServer.register !== 'function') {
    warn('webServer 服务不可用，用量路由未注册')
    return
  }

  // ---- 持久化会话访问（session-persistence-jsonl 服务，可选） ----
  // 并发读取 + 单条超时，避免大量会话阻塞；不做总数封顶。
  const PERSISTED_CONCURRENCY = 8
  const PERSISTED_TIMEOUT_MS = 5000

  function liveSessions() {
    try {
      const sessions = ctx.get?.('sessions')
      const list = sessions && typeof sessions.list === 'function' ? sessions.list() : []
      return list || []
    } catch { return [] }
  }

  async function persistedHeaders() {
    try {
      const p = ctx.get?.('session-persistence-jsonl')
      if (!p || typeof p.list !== 'function') return []
      return (await p.list()) || []
    } catch (e) { warn('持久化会话枚举失败：' + (e?.message || e)); return [] }
  }

  /** 读取一个持久化会话为 { id, events }；不存在/失败/超时返回 null。 */
  async function readPersistedSession(id) {
    try {
      const p = ctx.get?.('session-persistence-jsonl')
      if (!p || typeof p.readRaw !== 'function') return null
      const res = await Promise.race([
        p.readRaw(id),
        new Promise((resolve) => setTimeout(() => resolve(null), PERSISTED_TIMEOUT_MS)),
      ])
      if (!res || typeof res.content !== 'string') return null
      return { id: id, events: parseLogEvents(res.content) }
    } catch (e) { warn('读取持久化会话 ' + id + ' 失败：' + (e?.message || e)); return null }
  }

  /** 全部会话（内存 + 持久化，去重；持久化按并发读取，无总数封顶）。 */
  async function allSessions() {
    const live = liveSessions()
    const byId = {}
    live.forEach((s) => { byId[s.id] = s })
    const headers = await persistedHeaders()
    const pending = headers.filter((h) => !byId[h.id])
    let idx = 0
    async function worker() {
      while (idx < pending.length) {
        const h = pending[idx++]
        const ps = await readPersistedSession(h.id)
        if (ps && !byId[ps.id]) byId[ps.id] = ps
      }
    }
    const workers = Math.min(PERSISTED_CONCURRENCY, Math.max(1, pending.length))
    await Promise.all(Array.from({ length: workers }, worker))
    return Object.values(byId)
  }

  /** 单个会话（内存优先，持久化回退）。 */
  async function resolveSession(id) {
    try {
      const sessions = ctx.get?.('sessions')
      const single = sessions && typeof sessions.get === 'function' ? sessions.get(id) : null
      if (single) return single
    } catch { /* fall through to persisted */ }
    return readPersistedSession(id)
  }

  /** 会话列表行（含标题）。 */
  async function sessionRow(s, source) {
    const events = (s.events || []).slice()
    const folded = foldUsage(collectUsage(s), cfg, Date.now(), null, current.pricing)
    const lastTime = events.length ? (events[events.length - 1].time ?? null) : null
    const tokens = folded.totals.uncachedInputTokens + folded.totals.cacheReadTokens +
                   folded.totals.cacheWriteTokens + folded.totals.outputTokens
    const title = sessionTitleOf(events) || s.id
    return { id: s.id, title: title, source: source, eventCount: events.length, lastTime, rounds: folded.rounds.length, tokens }
  }

  // ---- 价格状态：内置 ← 官方在线同步（失败回退，不阻塞） ----
  const current = { pricing: cfg.pricing, source: 'builtin', syncedAt: null }
  async function syncPrices() {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(new Error('价格页请求超时')), 15000)
      let ok = false
      try {
        const response = await fetch(PRICE_SYNC_URL, { signal: controller.signal })
        if (response.ok) {
          const parsed = parsePricingHtml(await response.text())
          if (parsed) {
            const next = {}
            for (const [model, entry] of Object.entries(cfg.pricing)) next[model] = { ...entry }
            for (const [model, entry] of Object.entries(parsed)) next[model] = { ...entry, schedules: cfg.pricing[model]?.schedules }
            current.pricing = next
            current.source = 'online'
            current.syncedAt = Date.now()
            ok = true
            warn('官方单价已同步（' + Object.keys(parsed).length + ' 个模型）')
          }
        }
      } finally { clearTimeout(timer) }
      if (!ok) warn('官方单价同步失败，继续使用' + current.source)
    } catch (e) { warn('官方单价同步异常：' + (e?.message || e)) }
  }
  // 启动即同步一次（后台，不阻塞路由）；之后每 12h
  syncPrices()
  const syncTimer = setInterval(syncPrices, 12 * 60 * 60 * 1000)
  ctx.effect?.(() => () => clearInterval(syncTimer))

  // ---- 余额：?provider=deepseek（默认）| openrouter ----
  try {
    webServer.register({
      kind: 'exact',
      path: '/dsh-usage/balance',
      handler: async (req, res) => {
        if (!cfg.allowRemote && !isLoopbackRequest(req)) {
          sendJson(res, 403, { ok: false, code: 'FORBIDDEN', message: '余额查询仅允许从本机访问' })
          return
        }
        const url = new URL(req.url ?? '/', 'http://localhost')
        const provider = url.searchParams.get('provider') || 'deepseek'
        try {
          const data = await fetchProviderBalance(ctx, cfg, provider)
          sendJson(res, 200, { ok: true, provider: data.provider, isAvailable: data.isAvailable, infos: data.infos, updatedAt: Date.now() })
        } catch (error) {
          sendJson(res, 200, {
            ok: false,
            provider: provider,
            message: error instanceof Error ? error.message : String(error),
          })
        }
      },
    })
  } catch (error) { warn('balance 路由注册失败：' + error) }

  // ---- 会话枚举（内存活跃 + 磁盘持久化，含标题，供 client 下拉选择） ----
  try {
    webServer.register({
      kind: 'exact',
      path: '/dsh-usage/sessions',
      handler: async (req, res) => {
        const rows = []
        const seen = new Set()
        for (const s of liveSessions()) {
          seen.add(s.id)
          rows.push(await sessionRow(s, 'live'))
        }
        const headers = await persistedHeaders()
        let idx = 0
        async function worker() {
          while (idx < headers.length) {
            const h = headers[idx++]
            if (seen.has(h.id)) continue
            const ps = await readPersistedSession(h.id)
            if (ps && !seen.has(ps.id)) { seen.add(ps.id); rows.push(await sessionRow(ps, 'persisted')) }
          }
        }
        const workers = Math.min(PERSISTED_CONCURRENCY, Math.max(1, headers.length))
        await Promise.all(Array.from({ length: workers }, worker))
        rows.sort((a, b) => (b.lastTime ?? 0) - (a.lastTime ?? 0))
        sendJson(res, 200, { ok: true, sessions: rows, count: rows.length })
      },
    })
  } catch (error) { warn('sessions 枚举路由注册失败：' + error) }

  // ---- 会话用量：?sessionId=X 单会话（内存→持久化回退）；无 id = 全部汇总 ----
  try {
    webServer.register({
      kind: 'exact',
      path: '/dsh-usage/session',
      handler: async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const id = url.searchParams.get('sessionId')
        let targets = []
        let scope = 'all'
        if (id) {
          const single = await resolveSession(id)
          if (single) targets = [single]
          scope = 'session'
        } else {
          targets = await allSessions()
        }
        if (targets.length === 0) {
          sendJson(res, 200, {
            ok: true,
            noSession: true,
            message: '暂无可统计的会话（内存与磁盘中均没有带用量数据的会话）。',
          })
          return
        }
        const folded = id ? foldUsage(collectUsage(targets[0]), cfg, Date.now(), targets[0].id, current.pricing) : foldSessions(targets, cfg, Date.now(), current.pricing)
        sendJson(res, 200, { ok: true, scope: scope, sessionId: id || null, ...folded })
      },
    })
  } catch (error) { warn('session 路由注册失败：' + error) }

  // ---- 价格表（含同步来源与峰谷 schedules） ----
  try {
    webServer.register({
      kind: 'exact',
      path: '/dsh-usage/pricing',
      handler: (req, res) => {
        const rows = {}
        for (const [model, rate] of Object.entries(current.pricing)) {
          const { cacheHit, cacheMiss, output } = rate
          rows[model] = { cacheHit, cacheMiss, output, schedules: rate.schedules ?? [] }
        }
        sendJson(res, 200, {
          ok: true,
          currency: 'cny',
          cnyPerUsd: cfg.cnyPerUsd,
          models: rows,
          source: current.source,
          syncedAt: current.syncedAt,
          estimated: true,
          note: '价格为估算值（官方刊例价快照），非精确计费金额。' + (current.source === 'online' ? '已在线同步' : '内置价格'),
        })
      },
    })
  } catch (error) { warn('pricing 路由注册失败：' + error) }

  // ---- 历史明细：?sessionId=X 单会话；无 id = 全部汇总 ----
  try {
    webServer.register({
      kind: 'exact',
      path: '/dsh-usage/history',
      handler: async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const id = url.searchParams.get('sessionId')
        let targets = []
        let scope = 'all'
        if (id) {
          const single = await resolveSession(id)
          if (single) targets = [single]
          scope = 'session'
        } else {
          targets = await allSessions()
        }
        if (targets.length === 0) {
          sendJson(res, 200, { ok: true, rows: [], note: '暂无会话数据' })
          return
        }
        const folded = id ? foldUsage(collectUsage(targets[0]), cfg, Date.now(), targets[0].id, current.pricing) : foldSessions(targets, cfg, Date.now(), current.pricing)
        sendJson(res, 200, {
          ok: true,
          scope: scope,
          rows: folded.rounds,
          totals: folded.totals,
          hitRate: folded.hitRate,
          costCny: folded.costCny,
        })
      },
    })
  } catch (error) { warn('history 路由注册失败：' + error) }
}
