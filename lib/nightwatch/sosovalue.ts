import { computeDangerScore } from "./risk-engine"
import type { MacroEvent, MarketAsset, NewsItem, NightWatchIntel, ProtectionMode, SosovalueIndex } from "./types"
import { requestSignal, SOSOVALUE_BASE_URL } from "./config"

const DEFAULT_TRACKED_SYMBOLS = ["BTC", "ETH", "SOL", "LINK"]
const SOSO_FRESH_TTL_MS = 45_000
const SOSO_STALE_TTL_MS = 5 * 60_000
const INTEL_LIVE_TTL_MS = 45_000
const INTEL_FALLBACK_TTL_MS = 10_000
const MACRO_KEYWORDS = [
  "cpi",
  "inflation",
  "fomc",
  "fed",
  "rate",
  "nonfarm",
  "payroll",
  "pce",
  "jobs",
  "unemployment",
]
const DEFAULT_ETF_COUNTRY_CODES = ["US", "HK"]

type CacheEntry<T> = {
  expiresAt: number
  staleUntil: number
  value?: T
  pending?: Promise<T>
}

const sosoCache = new Map<string, CacheEntry<unknown>>()
const intelCache = new Map<ProtectionMode, CacheEntry<NightWatchIntel>>()

function readListEnv(name: string, fallback: string[]) {
  const values = (process.env[name] || "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => /^[A-Z0-9]{2,16}$/.test(value))

  return values.length ? Array.from(new Set(values)).slice(0, 8) : fallback
}

function readIntegerEnv(name: string, fallback: number, min: number, max: number) {
  const parsed = Number(process.env[name])
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.round(parsed)))
}

function trackedSymbols() {
  return readListEnv("NIGHTWATCH_TRACKED_SYMBOLS", DEFAULT_TRACKED_SYMBOLS)
}

function etfCountryCodes() {
  return readListEnv("NIGHTWATCH_ETF_COUNTRY_CODES", DEFAULT_ETF_COUNTRY_CODES).slice(0, 4)
}

function ssiIndexLimit() {
  return readIntegerEnv("NIGHTWATCH_SSI_INDEX_LIMIT", 2, 1, 4)
}

function macroLookaheadDays() {
  return readIntegerEnv("NIGHTWATCH_MACRO_LOOKAHEAD_DAYS", 7, 1, 30)
}

function cacheTtlFor(path: string) {
  if (path.includes("market-snapshot") || path.includes("/news")) return 30_000
  return SOSO_FRESH_TTL_MS
}

async function fetchSoso<T>(path: string): Promise<T> {
  const apiKey = process.env.SOSOVALUE_API_KEY
  if (!apiKey) {
    throw new Error("Missing SOSOVALUE_API_KEY")
  }

  const now = Date.now()
  const cached = sosoCache.get(path) as CacheEntry<T> | undefined
  if (cached?.value && cached.expiresAt > now) return cached.value
  if (cached?.pending) return cached.pending

  const pending = (async () => {
    const response = await fetch(`${SOSOVALUE_BASE_URL}${path}`, {
      headers: {
        Accept: "application/json",
        "x-soso-api-key": apiKey,
      },
      signal: requestSignal(),
      cache: "no-store",
    })

    const json = await response.json().catch(() => null)

    if (!response.ok || (typeof json?.code === "number" && json.code !== 0)) {
      throw new Error(json?.message || json?.error || response.statusText || `SoSoValue request failed: ${path}`)
    }

    return (json?.data ?? json) as T
  })()

  sosoCache.set(path, {
    value: cached?.value,
    expiresAt: cached?.expiresAt || 0,
    staleUntil: cached?.staleUntil || 0,
    pending,
  })

  try {
    const value = await pending
    const ttl = cacheTtlFor(path)
    sosoCache.set(path, {
      value,
      expiresAt: Date.now() + ttl,
      staleUntil: Date.now() + SOSO_STALE_TTL_MS,
    })
    return value
  } catch (error) {
    if (cached?.value && cached.staleUntil > Date.now()) return cached.value
    sosoCache.delete(path)
    throw error
  }
}

function asNumber(value: unknown, fallback = 0) {
  const num = typeof value === "number" ? value : Number(value)
  return Number.isFinite(num) ? num : fallback
}

function normalizePct(value: unknown) {
  const num = asNumber(value)
  return Math.abs(num) <= 1 ? num * 100 : num
}

function normalizeWeight(value: unknown) {
  const num = asNumber(value)
  return Math.abs(num) > 1 ? num / 100 : num
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}

function trackedFallbackAssets(): MarketAsset[] {
  return trackedSymbols().map((symbol) => ({
    symbol,
    name: symbol,
    price: 0,
    changePct24h: 0,
    volume24h: 0,
  }))
}

function normalizeIndexTickers(payload: unknown) {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { list?: unknown[] })?.list)
      ? (payload as { list: unknown[] }).list
      : Array.isArray((payload as { indices?: unknown[] })?.indices)
        ? (payload as { indices: unknown[] }).indices
        : []

  return list
    .map((item) =>
      typeof item === "string"
        ? item
        : String(
            (item as Record<string, unknown>)?.index_ticker ||
              (item as Record<string, unknown>)?.ticker ||
              (item as Record<string, unknown>)?.symbol ||
              (item as Record<string, unknown>)?.name ||
              "",
          ),
    )
    .map((ticker) => ticker.trim())
    .filter(Boolean)
}

function utcDay(value: Date) {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
}

function parseDateOnly(value: unknown) {
  if (typeof value !== "string") return null
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = Date.UTC(year, month - 1, day)
  return Number.isFinite(date) ? date : null
}

function macroImpact(daysUntil: number, events: string[]): MacroEvent["impact"] {
  const eventText = events.join(" ").toLowerCase()
  const marketMoving = MACRO_KEYWORDS.some((keyword) => eventText.includes(keyword))

  if (daysUntil <= 1 && marketMoving) return "danger"
  if (daysUntil <= 3 || marketMoving) return "warning"
  return "neutral"
}

function normalizeMacroEvents(payload: unknown): MacroEvent[] {
  const today = utcDay(new Date())
  const maxDay = today + macroLookaheadDays() * 86_400_000
  const list = Array.isArray(payload) ? payload : []

  return list
    .map((item) => {
      const record = item as Record<string, unknown>
      const dateValue = parseDateOnly(record.date)
      const events = Array.isArray(record.events)
        ? record.events.map((event) => String(event).trim()).filter(Boolean).slice(0, 8)
        : []

      if (dateValue === null || !events.length || dateValue < today || dateValue > maxDay) return null

      const daysUntil = Math.max(0, Math.round((dateValue - today) / 86_400_000))
      return {
        date: String(record.date),
        events,
        daysUntil,
        impact: macroImpact(daysUntil, events),
      } satisfies MacroEvent
    })
    .filter((event): event is MacroEvent => Boolean(event))
    .sort((a, b) => a.daysUntil - b.daysUntil || a.date.localeCompare(b.date))
    .slice(0, 6)
}

async function getTrackedAssets(): Promise<MarketAsset[]> {
  const currencies = await fetchSoso<Array<Record<string, unknown>>>("/currencies")
  const currencyMap = new Map(currencies.map((currency) => [String(currency.symbol || "").toUpperCase(), currency]))
  const tracked = trackedSymbols().map((symbol) => currencyMap.get(symbol)).filter(Boolean)

  if (!tracked.length) {
    throw new Error("SoSoValue currency discovery returned no tracked assets")
  }

  return Promise.all(
    tracked.map(async (currency) => {
      const currencyId = String(currency?.currency_id || "")
      const snapshot = await fetchSoso<Record<string, unknown>>(`/currencies/${currencyId}/market-snapshot`)
      return {
        symbol: String(currency?.symbol || "").toUpperCase(),
        name: String(currency?.name || currency?.symbol || "Tracked asset"),
        price: asNumber(snapshot.price),
        changePct24h: normalizePct(snapshot.change_pct_24h),
        volume24h: asNumber(snapshot.turnover_24h),
        marketCap: asNumber(snapshot.marketcap),
        rank: asNumber(snapshot.marketcap_rank),
      }
    }),
  )
}

async function getSosovalueIndexes(): Promise<SosovalueIndex[]> {
  const indexTickers = await fetchSoso<unknown>("/indices").catch(() => [])
  const selected = normalizeIndexTickers(indexTickers).slice(0, ssiIndexLimit())

  return Promise.all(
    selected.map(async (ticker) => {
      const [snapshot, constituents] = await Promise.all([
        fetchSoso<Record<string, unknown>>(`/indices/${ticker}/market-snapshot`),
        fetchSoso<Array<Record<string, unknown>>>(`/indices/${ticker}/constituents`).catch(() => []),
      ])

      return {
        ticker,
        price: asNumber(snapshot.price),
        changePct24h: normalizePct(snapshot["24h_change_pct"]),
        roi7d: normalizePct(snapshot["7day_roi"]),
        roi1m: normalizePct(snapshot["1month_roi"]),
        ytd: normalizePct(snapshot.ytd),
        constituents: constituents.slice(0, 8).map((item) => ({
          symbol: String(item.symbol || "").toUpperCase(),
          weight: normalizeWeight(item.weight),
        })),
      }
    }),
  )
}

async function getEtfSummaryHistory(): Promise<Array<Record<string, unknown>>> {
  const histories = await Promise.all(
    etfCountryCodes().map((countryCode) =>
      fetchSoso<Array<Record<string, unknown>>>(
        `/etfs/summary-history?symbol=BTC&country_code=${encodeURIComponent(countryCode)}&limit=7`,
      )
        .then((items) => items.map((item) => ({ ...item, country_code: countryCode })))
        .catch(() => []),
    ),
  )

  return histories.flat()
}

async function loadNightWatchIntel(mode: ProtectionMode): Promise<NightWatchIntel> {
  try {
    const [snapshots, hotNews, etfHistory, sectorSpotlight, indexes, macroResult] = await Promise.all([
      getTrackedAssets(),
      fetchSoso<{ list?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>>(
        "/news/hot?page=1&page_size=8&language=en",
      ),
      getEtfSummaryHistory(),
      fetchSoso<{ sector?: Array<Record<string, unknown>>; spotlight?: Array<Record<string, unknown>> }>(
        "/currencies/sector-spotlight",
      ).catch(() => ({ sector: [], spotlight: [] })),
      getSosovalueIndexes().catch(() => []),
      fetchSoso<unknown>("/macro/events")
        .then((payload) => ({ sourceStatus: "live" as const, events: normalizeMacroEvents(payload) }))
        .catch(() => ({ sourceStatus: "fallback" as const, events: [] })),
    ])

    const newsList = Array.isArray(hotNews) ? hotNews : hotNews.list || []
    const news: NewsItem[] = newsList.slice(0, 6).map((item) => ({
      title: stripHtml(String(item.title || item.content || "Market update")),
      sourceLink: String(item.source_link || ""),
      timestamp: asNumber(item.create_time || item.release_time),
      tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
    }))

    const latestEtfByCountry = etfCountryCodes()
      .map((countryCode) => etfHistory.find((item) => item.country_code === countryCode))
      .filter(Boolean)
    const etfNetFlow = latestEtfByCountry.reduce(
      (sum, latestEtf) => sum + asNumber(latestEtf?.total_net_inflow ?? latestEtf?.net_inflow),
      0,
    )
    const sectorChange = normalizePct(sectorSpotlight.sector?.[0]?.["24h_change_pct"])
    const analysis = computeDangerScore({
      assets: snapshots,
      news,
      etfNetFlow,
      sectorChange,
      indexes,
      macroEvents: macroResult.events,
      mode,
    })

    return {
      ...analysis,
      sourceStatus: "live",
      macroSourceStatus: macroResult.sourceStatus,
      generatedAt: new Date().toISOString(),
      assets: snapshots,
      news,
      indexes,
      macroEvents: macroResult.events,
    }
  } catch (error) {
    const fallbackAssets = trackedFallbackAssets()
    const fallbackReason = error instanceof Error ? error.message : "SoSoValue API temporarily unavailable."
    const fallbackNews = [
      { title: process.env.SOSOVALUE_API_KEY ? `Fallback mode: ${fallbackReason}` : "Fallback mode: add SOSOVALUE_API_KEY to enable live SoSoValue market intelligence." },
      { title: "NightWatch is using deterministic demo-safe market context until the live SoSoValue stream is available." },
    ]
    const analysis = computeDangerScore({
      assets: fallbackAssets,
      news: fallbackNews,
      etfNetFlow: 0,
      sectorChange: 0,
      indexes: [],
      macroEvents: [],
      mode,
    })

    return {
      ...analysis,
      sourceStatus: "fallback",
      macroSourceStatus: "fallback",
      generatedAt: new Date().toISOString(),
      assets: fallbackAssets,
      news: fallbackNews,
      indexes: [],
      macroEvents: [],
    }
  }
}

export async function getNightWatchIntel(mode: ProtectionMode = "balanced"): Promise<NightWatchIntel> {
  const now = Date.now()
  const cached = intelCache.get(mode)
  if (cached?.value && cached.expiresAt > now) return cached.value
  if (cached?.pending) return cached.pending

  const pending = loadNightWatchIntel(mode)
  intelCache.set(mode, {
    value: cached?.value,
    expiresAt: cached?.expiresAt || 0,
    staleUntil: cached?.staleUntil || 0,
    pending,
  })

  const value = await pending
  const ttl = value.sourceStatus === "live" ? INTEL_LIVE_TTL_MS : INTEL_FALLBACK_TTL_MS
  intelCache.set(mode, {
    value,
    expiresAt: Date.now() + ttl,
    staleUntil: Date.now() + SOSO_STALE_TTL_MS,
  })
  return value
}
