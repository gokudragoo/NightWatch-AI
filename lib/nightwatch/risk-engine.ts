import type {
  MacroEvent,
  MarketAsset,
  NewsItem,
  NightWatchIntel,
  ProtectionAction,
  ProtectionMode,
  RiskComponent,
  RiskLevel,
  RiskScenario,
  RiskSignal,
  SosovalueIndex,
  SourceSnippet,
} from "./types"

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
  indexes?: SosovalueIndex[]
  macroEvents?: MacroEvent[]
  mode?: ProtectionMode
}): Pick<NightWatchIntel, "score" | "level" | "summary" | "signals" | "components" | "scenarios" | "sourceSnippets" | "actions"> {
  const assets = input.assets
  const negativeMove = assets.reduce((sum, asset) => sum + Math.max(0, -asset.changePct24h), 0)
  const positiveMove = assets.reduce((sum, asset) => sum + Math.max(0, asset.changePct24h), 0)
  const volumePressure = assets.reduce((sum, asset) => {
    const volRatio = asset.marketCap ? asset.volume24h / asset.marketCap : 0
    return sum + clamp(volRatio * 100, 0, 10)
  }, 0)

  const newsText = input.news.map((item) => `${item.title} ${(item.tags || []).join(" ")}`).join(" ").toLowerCase()
  const keywordHits = dangerKeywords.filter((keyword) => newsText.includes(keyword)).length
  const etfPressure = typeof input.etfNetFlow === "number" && input.etfNetFlow < 0 ? clamp(Math.abs(input.etfNetFlow) / 50_000_000, 0, 18) : 0
  const sectorPressure = typeof input.sectorChange === "number" && input.sectorChange < 0 ? clamp(Math.abs(input.sectorChange) * 15, 0, 12) : 0
  const indexPressure = (input.indexes || []).reduce((sum, index) => sum + Math.max(0, -index.changePct24h), 0)
  const cappedIndexPressure = clamp(indexPressure, 0, 12)
  const macroPressure = clamp(
    (input.macroEvents || []).reduce((sum, event) => {
      if (event.impact === "danger") return sum + 6
      if (event.impact === "warning") return sum + 3
      return sum + (event.daysUntil <= 1 ? 1 : 0)
    }, 0),
    0,
    10,
  )

  const score = Math.round(
    clamp(
      24 +
        negativeMove * 5.5 +
        volumePressure * 1.4 +
        keywordHits * 7 +
        etfPressure +
        sectorPressure +
        cappedIndexPressure +
        macroPressure -
        positiveMove * 1.8,
    ),
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
      impact: typeof input.etfNetFlow === "number" && input.etfNetFlow < 0 ? "warning" : "neutral",
    },
    {
      label: "Narrative rotation",
      value: typeof input.sectorChange === "number" ? `${input.sectorChange.toFixed(2)}% sector change` : "Sector stream online",
      impact: typeof input.sectorChange === "number" && input.sectorChange < 0 ? "warning" : "positive",
    },
    {
      label: "News shock detector",
      value: keywordHits > 0 ? `${keywordHits} danger keywords detected` : "No urgent shock terms",
      impact: keywordHits > 1 ? "danger" : keywordHits === 1 ? "warning" : "positive",
    },
    {
      label: "SSI index breadth",
      value: input.indexes?.length ? `${input.indexes.length} index snapshots` : "Index stream pending",
      impact: cappedIndexPressure > 6 ? "warning" : input.indexes?.length ? "positive" : "neutral",
    },
    {
      label: "Macro calendar",
      value: input.macroEvents?.length ? `${input.macroEvents.length} events in watch window` : "No near-term catalysts",
      impact: macroPressure >= 6 ? "warning" : input.macroEvents?.length ? "neutral" : "positive",
    },
  ]

  const components: RiskComponent[] = [
    {
      label: "Spot drawdown pressure",
      contribution: Math.round(clamp(negativeMove * 5.5 - positiveMove * 1.8, -18, 36)),
      weight: "24h price change across tracked majors",
      evidence: `${assets.length} assets, ${negativeMove.toFixed(2)}% aggregate downside, ${positiveMove.toFixed(2)}% aggregate upside`,
    },
    {
      label: "Liquidity stress",
      contribution: Math.round(clamp(volumePressure * 1.4, 0, 14)),
      weight: "Volume-to-market-cap pressure",
      evidence: `Volume pressure contribution ${volumePressure.toFixed(2)}`,
    },
    {
      label: "News shock terms",
      contribution: keywordHits * 7,
      weight: "Danger keyword detector over SoSoValue hot news",
      evidence: keywordHits > 0 ? `${keywordHits} matched stress terms` : "No urgent stress terms matched",
    },
    {
      label: "ETF flow pressure",
      contribution: Math.round(etfPressure),
      weight: "Negative aggregate ETF net flow",
      evidence: typeof input.etfNetFlow === "number" ? `${formatUsd(input.etfNetFlow)} latest aggregate flow` : "ETF flow unavailable",
    },
    {
      label: "Sector and SSI breadth",
      contribution: Math.round(sectorPressure + cappedIndexPressure),
      weight: "SoSoValue sector rotation plus SSI index 24h changes",
      evidence:
        input.indexes?.length || typeof input.sectorChange === "number"
          ? `${typeof input.sectorChange === "number" ? `${input.sectorChange.toFixed(2)}% sector change` : "sector pending"}, ${input.indexes?.length || 0} SSI indexes`
          : "Sector and SSI breadth unavailable",
    },
    {
      label: "Macro catalyst window",
      contribution: Math.round(macroPressure),
      weight: "Upcoming SoSoValue macro events by proximity and catalyst type",
      evidence: input.macroEvents?.length
        ? input.macroEvents
            .slice(0, 2)
            .map((event) => `${event.date}: ${event.events.slice(0, 2).join(", ")}`)
            .join(" / ")
        : "No high-proximity macro events in the lookahead window",
    },
  ]

  const scenarios: RiskScenario[] = [
    {
      name: "ETF outflow cascade",
      trigger: "Aggregate ETF net flow turns sharply negative while majors fade.",
      expectedImpact: "Safe and Balanced policies arm hedges before stop exits.",
      scoreDelta: Math.round(clamp(etfPressure + negativeMove * 2.5, 4, 24)),
    },
    {
      name: "Narrative rotation break",
      trigger: "SSI or sector baskets roll over faster than BTC/ETH spot.",
      expectedImpact: "Narrative-heavy exposure is reduced before majors confirm.",
      scoreDelta: Math.round(clamp(cappedIndexPressure + sectorPressure, 3, 18)),
    },
    {
      name: "News shock false positive",
      trigger: "News terms look severe but price and flow confirmation stay calm.",
      expectedImpact: "Orders remain in dry-run/ready state instead of auto-submitting.",
      scoreDelta: keywordHits > 0 ? -Math.min(keywordHits * 4, 10) : 0,
    },
    {
      name: "Macro catalyst gap",
      trigger: "A high-impact macro event lands inside the overnight protection window.",
      expectedImpact: "NightWatch raises alert sensitivity while keeping SoDEX execution wallet-approved.",
      scoreDelta: Math.round(clamp(macroPressure, 0, 10)),
    },
  ]

  const sourceSnippets: SourceSnippet[] = [
    ...input.news.slice(0, 3).map((item) => ({
      title: item.title,
      source: "SoSoValue" as const,
      detail: item.tags?.length ? `Tags: ${item.tags.slice(0, 3).join(", ")}` : "Hot news cluster",
      href: item.sourceLink || undefined,
    })),
    ...(input.indexes || []).slice(0, 2).map((index) => ({
      title: index.ticker.toUpperCase(),
      source: "SoSoValue Indexes" as const,
      detail: `${index.changePct24h.toFixed(2)}% 24h, top weights ${index.constituents
        .slice(0, 3)
        .map((item) => `${item.symbol.toUpperCase()} ${formatWeight(item.weight)}`)
        .join(", ")}`,
    })),
    ...(input.macroEvents || []).slice(0, 2).map((event) => ({
      title: event.events.slice(0, 2).join(", "),
      source: "SoSoValue Macro" as const,
      detail: `${event.date}, ${event.daysUntil === 0 ? "today" : `${event.daysUntil} day${event.daysUntil === 1 ? "" : "s"} out`} (${event.impact})`,
    })),
  ]

  const macroSummary =
    macroPressure >= 6 ? " Macro catalysts are inside the protection window, so alert sensitivity is elevated." : ""
  const summary =
    score >= 82
      ? `Crash probability is elevated. NightWatch recommends hedging immediately and tightening exits.${macroSummary}`
      : score >= 65
        ? `Market stress is building. NightWatch is ready to reduce exposure and protect the overnight book.${macroSummary}`
        : score >= 38
          ? `Conditions are mixed. NightWatch will keep stops ready and wait for confirmation before acting.${macroSummary}`
          : `Market conditions are calm. NightWatch is monitoring and keeping the protection plan warm.${macroSummary}`

  return {
    score,
    level,
    summary,
    signals,
    components,
    scenarios,
    sourceSnippets,
    actions: buildProtectionActions(score, input.mode || "balanced"),
  }
}

export function formatUsd(value: number) {
  if (!Number.isFinite(value)) return "$0"
  const sign = value < 0 ? "-" : ""
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`
  return `${sign}$${abs.toFixed(0)}`
}

function formatWeight(value: number) {
  const pct = Math.abs(value) <= 1 ? value * 100 : value
  return `${pct.toFixed(1)}%`
}
