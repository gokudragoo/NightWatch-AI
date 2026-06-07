import { computeDangerScore } from "./risk-engine"
import type { MarketAsset, NewsItem, NightWatchIntel, ProtectionMode, SosovalueIndex } from "./types"
import { requestSignal, SOSOVALUE_BASE_URL } from "./config"

const TRACKED_SYMBOLS = ["BTC", "ETH", "SOL", "LINK"]
const SOSO_FRESH_TTL_MS = 45_000
const SOSO_STALE_TTL_MS = 5 * 60_000
const INTEL_LIVE_TTL_MS = 45_000
const INTEL_FALLBACK_TTL_MS = 10_000

type CacheEntry<T> = {
  expiresAt: number
  staleUntil: number
  value?: T
  pending?: Promise<T>
}

const sosoCache = new Map<string, CacheEntry<unknown>>()
const intelCache = new Map<ProtectionMode, CacheEntry<NightWatchIntel>>()

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
  return TRACKED_SYMBOLS.map((symbol) => ({
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

async function getTrackedAssets(): Promise<MarketAsset[]> {
  const currencies = await fetchSoso<Array<Record<string, unknown>>>("/currencies")
  const currencyMap = new Map(currencies.map((currency) => [String(currency.symbol || "").toUpperCase(), currency]))
  const tracked = TRACKED_SYMBOLS.map((symbol) => currencyMap.get(symbol)).filter(Boolean)

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
  const selected = normalizeIndexTickers(indexTickers).slice(0, 4)

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

async function loadNightWatchIntel(mode: ProtectionMode): Promise<NightWatchIntel> {
  try {
    const [snapshots, hotNews, etfHistory, sectorSpotlight, indexes] = await Promise.all([
      getTrackedAssets(),
      fetchSoso<{ list?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>>(
        "/news/hot?page=1&page_size=8&language=en",
      ),
      fetchSoso<Array<Record<string, unknown>>>("/etfs/summary-history?symbol=BTC&country_code=US&limit=7").catch(() => []),
      fetchSoso<{ sector?: Array<Record<string, unknown>>; spotlight?: Array<Record<string, unknown>> }>(
        "/currencies/sector-spotlight",
      ).catch(() => ({ sector: [], spotlight: [] })),
      getSosovalueIndexes().catch(() => []),
    ])

    const newsList = Array.isArray(hotNews) ? hotNews : hotNews.list || []
    const news: NewsItem[] = newsList.slice(0, 6).map((item) => ({
      title: stripHtml(String(item.title || item.content || "Market update")),
      sourceLink: String(item.source_link || ""),
      timestamp: asNumber(item.create_time || item.release_time),
      tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
    }))

    const latestEtf = Array.isArray(etfHistory) ? etfHistory[0] : undefined
    const etfNetFlow = asNumber(latestEtf?.total_net_inflow ?? latestEtf?.net_inflow)
    const sectorChange = normalizePct(sectorSpotlight.sector?.[0]?.["24h_change_pct"])
    const analysis = computeDangerScore({ assets: snapshots, news, etfNetFlow, sectorChange, indexes, mode })

    return {
      ...analysis,
      sourceStatus: "live",
      generatedAt: new Date().toISOString(),
      assets: snapshots,
      news,
      indexes,
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
      mode,
    })

    return {
      ...analysis,
      sourceStatus: "fallback",
      generatedAt: new Date().toISOString(),
      assets: fallbackAssets,
      news: fallbackNews,
      indexes: [],
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
