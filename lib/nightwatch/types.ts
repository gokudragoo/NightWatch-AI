export type ProtectionMode = "safe" | "balanced" | "aggressive"

export type RiskLevel = "Calm" | "Guarded" | "High Alert" | "Critical"

export interface MarketAsset {
  symbol: string
  name: string
  price: number
  changePct24h: number
  volume24h: number
  marketCap?: number
  rank?: number
}

export interface NewsItem {
  title: string
  sourceLink?: string
  timestamp?: number
  tags?: string[]
}

export interface RiskSignal {
  label: string
  value: string
  impact: "positive" | "neutral" | "warning" | "danger"
}

export interface ProtectionAction {
  title: string
  description: string
  status: "ready" | "armed" | "executed" | "simulated"
}

export interface NightWatchIntel {
  score: number
  level: RiskLevel
  sourceStatus: "live" | "fallback"
  generatedAt: string
  summary: string
  assets: MarketAsset[]
  signals: RiskSignal[]
  actions: ProtectionAction[]
  news: NewsItem[]
}

export interface SodexTicker {
  symbol: string
  displayName: string
  lastPx: number
  changePct: number
  volume: number
  quoteVolume: number
  bidPx?: number
  askPx?: number
  symbolID?: number
}

export interface SodexMarket {
  sourceStatus: "live" | "fallback"
  generatedAt: string
  tickers: SodexTicker[]
  liquidityNotes: RiskSignal[]
}
