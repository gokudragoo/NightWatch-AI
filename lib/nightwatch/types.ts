export type ProtectionMode = "safe" | "balanced" | "aggressive"

export type ProtectionStrategy = "capital_preservation" | "profit_lock" | "volatility_hedge" | "narrative_rotation"

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

export interface RiskComponent {
  label: string
  contribution: number
  weight: string
  evidence: string
}

export interface RiskScenario {
  name: string
  trigger: string
  expectedImpact: string
  scoreDelta: number
}

export interface SourceSnippet {
  title: string
  source: "SoSoValue" | "SoSoValue Indexes" | "SoSoValue Macro" | "SoDEX" | "NightWatch"
  detail: string
  href?: string
}

export interface ProtectionAction {
  title: string
  description: string
  status: "ready" | "armed" | "executed" | "simulated"
}

export interface SosovalueIndex {
  ticker: string
  price: number
  changePct24h: number
  roi7d?: number
  roi1m?: number
  ytd?: number
  constituents: Array<{
    symbol: string
    weight: number
  }>
}

export interface MacroEvent {
  date: string
  events: string[]
  daysUntil: number
  impact: "neutral" | "warning" | "danger"
}

export interface NightWatchIntel {
  score: number
  level: RiskLevel
  sourceStatus: "live" | "fallback"
  macroSourceStatus: "live" | "fallback"
  generatedAt: string
  summary: string
  assets: MarketAsset[]
  signals: RiskSignal[]
  components: RiskComponent[]
  scenarios: RiskScenario[]
  sourceSnippets: SourceSnippet[]
  actions: ProtectionAction[]
  news: NewsItem[]
  indexes: SosovalueIndex[]
  macroEvents: MacroEvent[]
}

export interface NightWatchAiBrief {
  sourceStatus: "openai" | "fallback"
  model: string
  generatedAt: string
  headline: string
  briefing: string
  tradeRationale: string
  nextActions: string[]
  sourceSnippets: SourceSnippet[]
  confidence: "high" | "medium" | "low"
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
  baseCoin?: string
  quoteCoin?: string
  quantityPrecision?: number
  stepSize?: string
  minQuantity?: string
  marketMinQuantity?: string
  minNotional?: string
  status?: string
}

export interface SodexMarket {
  sourceStatus: "live" | "fallback"
  generatedAt: string
  tickers: SodexTicker[]
  liquidityNotes: RiskSignal[]
}

export interface SodexPerpsTicker extends SodexTicker {
  markPx?: number
  maxLeverage?: number
}

export interface SodexPerpsPosition {
  symbol: string
  side: "long" | "short" | "flat"
  notionalUsd: number
  entryPx?: number
  markPx?: number
  leverage?: number
  unrealizedPnl?: number
}

export interface SodexPerpsMarket {
  sourceStatus: "live" | "fallback"
  generatedAt: string
  tickers: SodexPerpsTicker[]
  positions: SodexPerpsPosition[]
  protectionNotes: RiskSignal[]
}

export interface AlertPreferences {
  telegram: boolean
  email: boolean
  browser: boolean
  threshold: number
}

export interface NightWatchStoredSettings {
  mode: ProtectionMode
  strategy: ProtectionStrategy
  sleepMode: boolean
  dryRunMode: boolean
  portfolioValue: number
  accountId: string
  apiKeyName: string
  selectedSymbol: string
  alertPreferences: AlertPreferences
}

export interface AlertEvent {
  id: string
  createdAt: string
  channel: "telegram" | "email" | "browser" | "console"
  title: string
  detail: string
  status: "sent" | "queued" | "preview" | "failed"
}

export interface DryRunOrder {
  id: string
  createdAt: string
  venue: "SoDEX spot" | "SoDEX perps"
  symbol: string
  symbolID?: number
  mode: ProtectionMode
  strategy: ProtectionStrategy
  notionalUsd: number
  quantity: string
  side: "sell" | "buy" | "reduce" | "hedge"
  endpoint: string
  rationale: string
  estimatedSlippageBps: number
  guardrails: string[]
  receipt?: DryRunReceipt
}

export interface DryRunReceipt {
  id: string
  issuedAt: string
  expiresAt: string
  venue: "SoDEX spot" | "SoDEX perps"
  symbol: string
  symbolID?: number
  mode: ProtectionMode
  strategy: ProtectionStrategy
  quantity: string
  endpoint: string
  signature: string
}

export interface ProtectionOrderRecord {
  id: string
  createdAt: string
  symbol: string
  mode: ProtectionMode
  strategy: ProtectionStrategy
  status: "dry-run" | "signed" | "submitted" | "failed"
  clOrdID?: string
  txReference?: string
  detail: string
}

export interface SleepSessionSnapshot {
  createdAt: string
  score: number
  level: RiskLevel
  summary: string
}

export interface SleepSession {
  id: string
  startedAt: string
  endedAt?: string
  mode: ProtectionMode
  strategy: ProtectionStrategy
  portfolioValue: number
  alertThreshold: number
  snapshots: SleepSessionSnapshot[]
}

export interface NightWatchPersistenceState {
  settings: NightWatchStoredSettings
  sessions: SleepSession[]
  alertEvents: AlertEvent[]
  dryRuns: DryRunOrder[]
  orderHistory: ProtectionOrderRecord[]
  updatedAt?: string
}
