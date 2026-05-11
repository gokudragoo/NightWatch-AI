import { computeDangerScore } from "./risk-engine"
import type { MarketAsset, NewsItem, NightWatchIntel, ProtectionMode } from "./types"

const SOSO_BASE_URL = "https://openapi.sosovalue.com/openapi/v1"

const TRACKED_CURRENCIES = [
  { symbol: "BTC", name: "Bitcoin", id: "1673723677362319866" },
  { symbol: "ETH", name: "Ethereum", id: "1673723677362319867" },
  { symbol: "SOL", name: "Solana", id: "1673723677362319875" },
  { symbol: "LINK", name: "Chainlink", id: "1673723677362319887" },
]

async function fetchSoso<T>(path: string): Promise<T> {
  const apiKey = process.env.SOSOVALUE_API_KEY
  if (!apiKey) {
    throw new Error("Missing SOSOVALUE_API_KEY")
  }

  const response = await fetch(`${SOSO_BASE_URL}${path}`, {
    headers: {
      Accept: "application/json",
      "x-soso-api-key": apiKey,
    },
    next: { revalidate: 30 },
  })

  const json = await response.json()

  if (!response.ok || (typeof json?.code === "number" && json.code !== 0)) {
    throw new Error(json?.message || json?.error || `SoSoValue request failed: ${path}`)
  }

  return (json?.data ?? json) as T
}

function asNumber(value: unknown, fallback = 0) {
  const num = typeof value === "number" ? value : Number(value)
  return Number.isFinite(num) ? num : fallback
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}

export async function getNightWatchIntel(mode: ProtectionMode = "balanced"): Promise<NightWatchIntel> {
  try {
    const [snapshots, hotNews, etfHistory, sectorSpotlight] = await Promise.all([
      Promise.all(
        TRACKED_CURRENCIES.map(async (currency) => {
          const snapshot = await fetchSoso<Record<string, unknown>>(`/currencies/${currency.id}/market-snapshot`)
          return {
            symbol: currency.symbol,
            name: currency.name,
            price: asNumber(snapshot.price),
            changePct24h: asNumber(snapshot.change_pct_24h),
            volume24h: asNumber(snapshot.turnover_24h),
            marketCap: asNumber(snapshot.marketcap),
            rank: asNumber(snapshot.marketcap_rank),
          }
        }),
      ),
      fetchSoso<{ list?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>>(
        "/news/hot?page=1&page_size=8&language=en",
      ),
      fetchSoso<Array<Record<string, unknown>>>("/etfs/summary-history?limit=7").catch(() => []),
      fetchSoso<{ sector?: Array<Record<string, unknown>>; spotlight?: Array<Record<string, unknown>> }>(
        "/currencies/sector-spotlight",
      ).catch(() => ({ sector: [], spotlight: [] })),
    ])

    const newsList = Array.isArray(hotNews) ? hotNews : hotNews.list || []
    const news: NewsItem[] = newsList.slice(0, 6).map((item) => ({
      title: stripHtml(String(item.title || item.content || "Market update")),
      sourceLink: String(item.source_link || ""),
      timestamp: asNumber(item.create_time || item.release_time),
      tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
    }))

    const latestEtf = Array.isArray(etfHistory) ? etfHistory.at(-1) : undefined
    const etfNetFlow = asNumber(latestEtf?.net_inflow)
    const sectorChange = asNumber(sectorSpotlight.sector?.[0]?.["24h_change_pct"]) * 100
    const analysis = computeDangerScore({ assets: snapshots, news, etfNetFlow, sectorChange, mode })

    return {
      ...analysis,
      sourceStatus: "live",
      generatedAt: new Date().toISOString(),
      assets: snapshots,
      news,
    }
  } catch (error) {
    const fallbackAssets: MarketAsset[] = [
      { symbol: "BTC", name: "Bitcoin", price: 96622, changePct24h: 7.35, volume24h: 12_448_082 },
      { symbol: "ETH", name: "Ethereum", price: 2332.6, changePct24h: -0.71, volume24h: 895_433_556 },
      { symbol: "SOL", name: "Solana", price: 140, changePct24h: 0, volume24h: 5_040 },
      { symbol: "LINK", name: "Chainlink", price: 15.53, changePct24h: 0, volume24h: 194_125 },
    ]
    const fallbackNews = [
      { title: "Fallback mode: add SOSOVALUE_API_KEY to enable live SoSoValue market intelligence." },
      { title: error instanceof Error ? error.message : "SoSoValue API temporarily unavailable." },
    ]
    const analysis = computeDangerScore({
      assets: fallbackAssets,
      news: fallbackNews,
      etfNetFlow: 0,
      sectorChange: 0,
      mode,
    })

    return {
      ...analysis,
      sourceStatus: "fallback",
      generatedAt: new Date().toISOString(),
      assets: fallbackAssets,
      news: fallbackNews,
    }
  }
}
