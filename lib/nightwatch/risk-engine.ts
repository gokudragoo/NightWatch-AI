import type { MarketAsset, NewsItem, NightWatchIntel, ProtectionAction, ProtectionMode, RiskLevel, RiskSignal } from "./types"

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value))

const dangerKeywords = [
  "liquidation",
  "outflow",
  "hack",
  "exploit",
  "crash",
  "sell-off",
  "lawsuit",
  "withdrawal",
  "bankruptcy",
  "depeg",
]

export function riskLevel(score: number): RiskLevel {
  if (score >= 82) return "Critical"
  if (score >= 65) return "High Alert"
  if (score >= 38) return "Guarded"
  return "Calm"
}

export function buildProtectionActions(score: number, mode: ProtectionMode): ProtectionAction[] {
  const modeCopy = {
    safe: {
      hedge: "Hedge 35% of volatile exposure",
      stop: "Place tight SoDEX stop-market exits",
      profit: "Move recent gains to vUSDC",
    },
    balanced: {
      hedge: "Hedge 22% of volatile exposure",
      stop: "Place balanced SoDEX stop-loss ladder",
      profit: "Lock profit on overheated positions",
    },
    aggressive: {
      hedge: "Hedge 12% only on confirmed danger",
      stop: "Use wider SoDEX stops to avoid noise",
      profit: "Trail winners until momentum fades",
    },
  }[mode]

  const status = score >= 65 ? "armed" : score >= 38 ? "ready" : "simulated"

  return [
    {
      title: "Exposure Shield",
      description: modeCopy.hedge,
      status,
    },
    {
      title: "On-chain Stop Layer",
      description: modeCopy.stop,
      status: score >= 65 ? "armed" : "ready",
    },
    {
      title: "Profit Lock",
      description: modeCopy.profit,
      status: score >= 48 ? "armed" : "ready",
    },
  ]
}

export function computeDangerScore(input: {
  assets: MarketAsset[]
  news: NewsItem[]
  etfNetFlow?: number
  sectorChange?: number
  mode?: ProtectionMode
}): Pick<NightWatchIntel, "score" | "level" | "summary" | "signals" | "actions"> {
  const assets = input.assets
  const negativeMove = assets.reduce((sum, asset) => sum + Math.max(0, -asset.changePct24h), 0)
  const positiveMove = assets.reduce((sum, asset) => sum + Math.max(0, asset.changePct24h), 0)
  const volumePressure = assets.reduce((sum, asset) => {
    const volRatio = asset.marketCap ? asset.volume24h / asset.marketCap : 0
    return sum + clamp(volRatio * 100, 0, 10)
  }, 0)

  const newsText = input.news.map((item) => `${item.title} ${(item.tags || []).join(" ")}`).join(" ").toLowerCase()
  const keywordHits = dangerKeywords.filter((keyword) => newsText.includes(keyword)).length
  const etfPressure = input.etfNetFlow && input.etfNetFlow < 0 ? clamp(Math.abs(input.etfNetFlow) / 50_000_000, 0, 18) : 0
  const sectorPressure = input.sectorChange && input.sectorChange < 0 ? clamp(Math.abs(input.sectorChange) * 15, 0, 12) : 0

  const score = Math.round(
    clamp(24 + negativeMove * 5.5 + volumePressure * 1.4 + keywordHits * 7 + etfPressure + sectorPressure - positiveMove * 1.8),
  )
  const level = riskLevel(score)

  const signals: RiskSignal[] = [
    {
      label: "SoSoValue market pulse",
      value: `${assets.length} tracked majors`,
      impact: score >= 65 ? "danger" : score >= 38 ? "warning" : "positive",
    },
    {
      label: "ETF flow pressure",
      value: typeof input.etfNetFlow === "number" ? formatUsd(input.etfNetFlow) : "Waiting for latest print",
      impact: input.etfNetFlow && input.etfNetFlow < 0 ? "warning" : "neutral",
    },
    {
      label: "Narrative rotation",
      value: typeof input.sectorChange === "number" ? `${input.sectorChange.toFixed(2)}% sector change` : "Sector stream online",
      impact: input.sectorChange && input.sectorChange < 0 ? "warning" : "positive",
    },
    {
      label: "News shock detector",
      value: keywordHits > 0 ? `${keywordHits} danger keywords detected` : "No urgent shock terms",
      impact: keywordHits > 1 ? "danger" : keywordHits === 1 ? "warning" : "positive",
    },
  ]

  const summary =
    score >= 82
      ? "Crash probability is elevated. NightWatch recommends hedging immediately and tightening exits."
      : score >= 65
        ? "Market stress is building. NightWatch is ready to reduce exposure and protect the overnight book."
        : score >= 38
          ? "Conditions are mixed. NightWatch will keep stops ready and wait for confirmation before acting."
          : "Market conditions are calm. NightWatch is monitoring and keeping the protection plan warm."

  return {
    score,
    level,
    summary,
    signals,
    actions: buildProtectionActions(score, input.mode || "balanced"),
  }
}

export function formatUsd(value: number) {
  const sign = value < 0 ? "-" : ""
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`
  return `${sign}$${abs.toFixed(0)}`
}
