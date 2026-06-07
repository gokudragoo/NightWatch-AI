"use client"

import type { ReactNode } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  BellRing,
  Brain,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Database,
  FileText,
  Gauge,
  History,
  KeyRound,
  LineChart,
  Mail,
  Moon,
  Radio,
  RefreshCw,
  Send,
  Shield,
  Sparkles,
  Target,
  Wallet,
  Zap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import {
  DEFAULT_ALERT_PREFERENCES,
  DEFAULT_STRATEGY,
  readAlertEvents,
  readDryRuns,
  readOrderHistory,
  readSleepSessions,
  readStoredPreference,
  writeAlertEvents,
  writeDryRuns,
  writeOrderHistory,
  writeSleepSessions,
  writeStoredPreference,
} from "@/lib/nightwatch/client-storage"
import type {
  AlertEvent,
  AlertPreferences,
  DryRunReceipt,
  DryRunOrder,
  NightWatchAiBrief,
  NightWatchIntel,
  NightWatchPersistenceState,
  NightWatchStoredSettings,
  ProtectionMode,
  ProtectionOrderRecord,
  ProtectionStrategy,
  SleepSession,
  SodexMarket,
  SodexPerpsMarket,
  SodexTicker,
} from "@/lib/nightwatch/types"
import { VALUECHAIN_TESTNET } from "@/lib/nightwatch/valuechain"

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>
}

type ConsoleView = "risk" | "execution" | "reports"

const TESTNET_ORDER_NOTIONAL_MULTIPLIER = 0.001
const PROTECTION_MODES: ProtectionMode[] = ["safe", "balanced", "aggressive"]
const PROTECTION_STRATEGIES: ProtectionStrategy[] = [
  "capital_preservation",
  "profit_lock",
  "volatility_hedge",
  "narrative_rotation",
]

const modeCopy: Record<ProtectionMode, { label: string; tone: string; hedge: number }> = {
  safe: { label: "Safe", tone: "Fast exits, tight stops", hedge: 35 },
  balanced: { label: "Balanced", tone: "Measured hedges", hedge: 22 },
  aggressive: { label: "Aggressive", tone: "Wider stops, trend room", hedge: 12 },
}

const strategyCopy: Record<ProtectionStrategy, { label: string; brief: string; multiplier: number }> = {
  capital_preservation: {
    label: "Capital preservation",
    brief: "Prioritize stablecoin rotation and earlier exits.",
    multiplier: 1.2,
  },
  profit_lock: {
    label: "Profit lock",
    brief: "Protect gains while leaving the core position open.",
    multiplier: 0.9,
  },
  volatility_hedge: {
    label: "Volatility hedge",
    brief: "Use hedge coverage before spot stops escalate.",
    multiplier: 1,
  },
  narrative_rotation: {
    label: "Narrative rotation",
    brief: "Watch SSI baskets and rotate away from weak themes.",
    multiplier: 0.85,
  },
}

const formatUsd = (value: number) => {
  const safeValue = Number.isFinite(value) ? value : 0
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: safeValue > 100 ? 0 : 2,
  }).format(safeValue)
}

const formatCompact = (value: number) =>
  new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0)

const formatTime = (value?: string) => {
  if (!value) return "Pending"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Pending"
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(date)
}

function isProtectionMode(value: unknown): value is ProtectionMode {
  return typeof value === "string" && PROTECTION_MODES.includes(value as ProtectionMode)
}

function isProtectionStrategy(value: unknown): value is ProtectionStrategy {
  return typeof value === "string" && PROTECTION_STRATEGIES.includes(value as ProtectionStrategy)
}

function isEvmAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value)
}

function isPositiveIntegerString(value: string) {
  return /^\d{1,18}$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0
}

function isApiKeyName(value: string) {
  return !value || (/^[0-9A-Za-z_-]{1,36}$/.test(value) && value !== "default")
}

function decimalPlaces(value: string | undefined) {
  const [, fraction = ""] = String(value || "").split(".")
  return fraction.replace(/0+$/, "").length
}

function roundUpToStep(value: number, step: number) {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return value
  return Math.ceil((value - Number.EPSILON) / step) * step
}

function formatSodexQuantity(ticker: SodexTicker, notionalUsd: number, price: number) {
  const stepSize = Number(ticker.stepSize)
  const quantityStep = Number.isFinite(stepSize) && stepSize > 0 ? stepSize : 10 ** -(ticker.quantityPrecision ?? 6)
  const precision = Number.isInteger(ticker.quantityPrecision)
    ? Math.max(0, Math.min(18, ticker.quantityPrecision || 0))
    : Math.max(0, Math.min(18, decimalPlaces(ticker.stepSize)))
  const minQuantity = Math.max(
    Number(ticker.marketMinQuantity) || 0,
    Number(ticker.minQuantity) || 0,
    price > 0 ? (Number(ticker.minNotional) || 0) / price : 0,
    quantityStep,
  )
  const rawQuantity = Math.max(notionalUsd / Math.max(price, 1), minQuantity)
  return roundUpToStep(rawQuantity, quantityStep).toFixed(precision)
}

function normalizeAlertPreferences(value: unknown): AlertPreferences {
  const input = value as Partial<AlertPreferences> | undefined
  const threshold = Number(input?.threshold)
  return {
    telegram: typeof input?.telegram === "boolean" ? input.telegram : DEFAULT_ALERT_PREFERENCES.telegram,
    email: typeof input?.email === "boolean" ? input.email : DEFAULT_ALERT_PREFERENCES.email,
    browser: typeof input?.browser === "boolean" ? input.browser : DEFAULT_ALERT_PREFERENCES.browser,
    threshold: Number.isFinite(threshold) ? Math.max(38, Math.min(90, Math.round(threshold))) : DEFAULT_ALERT_PREFERENCES.threshold,
  }
}

function normalizeStoredSettings(value: Partial<NightWatchStoredSettings> | undefined): NightWatchStoredSettings {
  const portfolioValue = Number(value?.portfolioValue)
  const accountId = typeof value?.accountId === "string" && /^\d{0,18}$/.test(value.accountId) ? value.accountId : ""
  const apiKeyName = typeof value?.apiKeyName === "string" && isApiKeyName(value.apiKeyName) ? value.apiKeyName : ""
  return {
    mode: isProtectionMode(value?.mode) ? value.mode : "balanced",
    strategy: isProtectionStrategy(value?.strategy) ? value.strategy : DEFAULT_STRATEGY,
    sleepMode: typeof value?.sleepMode === "boolean" ? value.sleepMode : true,
    dryRunMode: true,
    portfolioValue: Number.isFinite(portfolioValue) ? Math.max(2_000, Math.min(250_000, Math.round(portfolioValue))) : 42_000,
    accountId,
    apiKeyName,
    selectedSymbol: typeof value?.selectedSymbol === "string" && value.selectedSymbol.trim() ? value.selectedSymbol : "vBTC_vUSDC",
    alertPreferences: normalizeAlertPreferences(value?.alertPreferences),
  }
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init)
  const json = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error((json as { error?: string } | null)?.error || response.statusText || "Request failed")
  }
  return json as T
}

function getEthereum(): EthereumProvider | null {
  if (typeof window === "undefined") return null
  return (window as Window & { ethereum?: EthereumProvider }).ethereum || null
}

function normalizeWalletSignature(signature: string) {
  const clean = signature.startsWith("0x") ? signature.slice(2) : signature
  const v = Number.parseInt(clean.slice(-2), 16)
  const normalizedV = v >= 27 ? (v - 27).toString(16).padStart(2, "0") : clean.slice(-2)
  return `0x${clean.slice(0, -2)}${normalizedV}`
}

async function requestNightWatchAiBrief(input: {
  intel: NightWatchIntel
  market: SodexMarket
  mode: ProtectionMode
  portfolioValue: number
  sleepMode: boolean
}) {
  return fetchJson<NightWatchAiBrief>("/api/nightwatch/brief", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
}

async function requestAlert(input: {
  title: string
  detail: string
  channels: Array<"telegram" | "email" | "browser" | "console">
}) {
  const json = await fetchJson<{ events?: AlertEvent[]; error?: string }>("/api/nightwatch/alerts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  return json.events || []
}

async function requestDryRunReceipt(dryRun: DryRunOrder) {
  const json = await fetchJson<{ receipt: DryRunReceipt }>("/api/nightwatch/dry-run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      venue: dryRun.venue,
      symbol: dryRun.symbol,
      symbolID: dryRun.symbolID,
      mode: dryRun.mode,
      strategy: dryRun.strategy,
      quantity: dryRun.quantity,
      endpoint: dryRun.endpoint,
    }),
  })
  return json.receipt
}

async function requestPersistenceProfile(wallet: string) {
  return fetchJson<{
    ok: boolean
    sourceStatus: "mongodb" | "local-only"
    state: NightWatchPersistenceState | null
  }>(`/api/nightwatch/persistence?wallet=${encodeURIComponent(wallet)}`)
}

async function savePersistenceProfile(wallet: string, state: NightWatchPersistenceState) {
  return fetchJson<{ ok: boolean; sourceStatus: "mongodb" | "local-only"; persisted: boolean }>(
    "/api/nightwatch/persistence",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet, state }),
    },
  )
}

function statusTone(live: boolean) {
  return live ? "border-green-300/40 bg-green-300/10 text-green-100" : "border-white/15 bg-white/5 text-white/55"
}

function Panel({
  children,
  className = "",
  light = false,
}: {
  children: ReactNode
  className?: string
  light?: boolean
}) {
  return (
    <div
      className={`rounded-2xl border p-5 sm:p-6 ${
        light
          ? "border-slate-200 bg-white text-slate-950 shadow-2xl"
          : "border-white/15 bg-[radial-gradient(35%_128px_at_50%_0%,theme(backgroundColor.white/15%),theme(backgroundColor.white/5%))] text-white backdrop-blur-md"
      } ${className}`}
    >
      {children}
    </div>
  )
}

function PanelHeader({
  eyebrow,
  title,
  icon: Icon,
  light = false,
}: {
  eyebrow: string
  title: string
  icon: typeof Shield
  light?: boolean
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className={light ? "text-sm text-slate-500" : "text-sm text-white/50"}>{eyebrow}</div>
        <h3 className={`text-xl font-bold leading-tight ${light ? "text-slate-950" : "text-white"}`}>{title}</h3>
      </div>
      <Icon className={light ? "h-5 w-5 shrink-0 text-slate-500" : "h-5 w-5 shrink-0 text-white/60"} />
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/55">{label}</div>
}

export function NightWatchConsole({
  initialView = "risk",
  requireWallet = false,
}: {
  initialView?: ConsoleView
  requireWallet?: boolean
}) {
  const [activeView, setActiveView] = useState<ConsoleView>(initialView)
  const [mode, setMode] = useState<ProtectionMode>("balanced")
  const [strategy, setStrategy] = useState<ProtectionStrategy>(DEFAULT_STRATEGY)
  const [sleepMode, setSleepMode] = useState(true)
  const [dryRunMode, setDryRunMode] = useState(true)
  const [portfolioValue, setPortfolioValue] = useState(42_000)
  const [intel, setIntel] = useState<NightWatchIntel | null>(null)
  const [market, setMarket] = useState<SodexMarket | null>(null)
  const [perpsMarket, setPerpsMarket] = useState<SodexPerpsMarket | null>(null)
  const [address, setAddress] = useState("")
  const [accountId, setAccountId] = useState("")
  const [apiKeyName, setApiKeyName] = useState("")
  const [selectedSymbol, setSelectedSymbol] = useState("vBTC_vUSDC")
  const [status, setStatus] = useState("NightWatch is warming up the risk engine.")
  const [aiBrief, setAiBrief] = useState<NightWatchAiBrief | null>(null)
  const [alertPreferences, setAlertPreferences] = useState<AlertPreferences>(DEFAULT_ALERT_PREFERENCES)
  const [sessions, setSessions] = useState<SleepSession[]>([])
  const [alertEvents, setAlertEvents] = useState<AlertEvent[]>([])
  const [dryRuns, setDryRuns] = useState<DryRunOrder[]>([])
  const [orderHistory, setOrderHistory] = useState<ProtectionOrderRecord[]>([])
  const [currentDryRun, setCurrentDryRun] = useState<DryRunOrder | null>(null)
  const [lastAlertKey, setLastAlertKey] = useState("")
  const [isHydrated, setIsHydrated] = useState(false)
  const [hasLoadedRemoteProfile, setHasLoadedRemoteProfile] = useState(false)
  const [persistenceStatus, setPersistenceStatus] = useState<"locked" | "local" | "syncing" | "mongodb" | "error">(
    requireWallet ? "locked" : "local",
  )
  const [isLoading, setIsLoading] = useState(true)
  const [isBriefLoading, setIsBriefLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const briefingContextRef = useRef({ portfolioValue, sleepMode })
  const lastRemoteWriteRef = useRef("")

  useEffect(() => {
    setActiveView(initialView)
  }, [initialView])

  useEffect(() => {
    briefingContextRef.current = { portfolioValue, sleepMode }
  }, [portfolioValue, sleepMode])

  useEffect(() => {
    const settings = normalizeStoredSettings(readStoredPreference<Partial<NightWatchStoredSettings>>("settings", {
      mode: "balanced",
      strategy: DEFAULT_STRATEGY,
      sleepMode: true,
      dryRunMode: true,
      portfolioValue: 42_000,
      accountId: "",
      apiKeyName: "",
      selectedSymbol: "vBTC_vUSDC",
      alertPreferences: DEFAULT_ALERT_PREFERENCES,
    }))

    setMode(settings.mode)
    setStrategy(settings.strategy)
    setSleepMode(settings.sleepMode)
    setDryRunMode(settings.dryRunMode)
    setPortfolioValue(settings.portfolioValue)
    setAccountId(settings.accountId)
    setApiKeyName(settings.apiKeyName)
    setSelectedSymbol(settings.selectedSymbol)
    setAlertPreferences(settings.alertPreferences)
    setSessions(readSleepSessions())
    setAlertEvents(readAlertEvents())
    setDryRuns(readDryRuns())
    setOrderHistory(readOrderHistory())
    setIsHydrated(true)
  }, [])

  useEffect(() => {
    if (!isHydrated) return
    const ethereum = getEthereum()
    if (!ethereum) return

    let cancelled = false
    void ethereum
      .request({ method: "eth_accounts" })
      .then((accounts) => {
        const wallet = Array.isArray(accounts) ? String(accounts[0] || "") : ""
        if (!cancelled && isEvmAddress(wallet)) {
          setAddress(wallet)
        }
      })
      .catch(() => {
        // Silent wallet restoration is best effort; the login button still handles explicit access.
      })

    return () => {
      cancelled = true
    }
  }, [isHydrated])

  useEffect(() => {
    if (!isHydrated) return
    writeStoredPreference<NightWatchStoredSettings>("settings", {
      mode,
      strategy,
      sleepMode,
      dryRunMode,
      portfolioValue,
      accountId,
      apiKeyName,
      selectedSymbol,
      alertPreferences,
    })
  }, [accountId, alertPreferences, apiKeyName, dryRunMode, isHydrated, mode, portfolioValue, selectedSymbol, sleepMode, strategy])

  useEffect(() => {
    if (isHydrated) writeSleepSessions(sessions)
  }, [isHydrated, sessions])

  useEffect(() => {
    if (isHydrated) writeAlertEvents(alertEvents)
  }, [alertEvents, isHydrated])

  useEffect(() => {
    if (isHydrated) writeDryRuns(dryRuns)
  }, [dryRuns, isHydrated])

  useEffect(() => {
    if (isHydrated) writeOrderHistory(orderHistory)
  }, [isHydrated, orderHistory])

  const persistenceState = useMemo<NightWatchPersistenceState>(
    () => ({
      settings: {
        mode,
        strategy,
        sleepMode,
        dryRunMode,
        portfolioValue,
        accountId,
        apiKeyName,
        selectedSymbol,
        alertPreferences,
      },
      sessions: sessions.slice(0, 12),
      alertEvents: alertEvents.slice(0, 20),
      dryRuns: dryRuns.slice(0, 20),
      orderHistory: orderHistory.slice(0, 20),
    }),
    [
      accountId,
      alertEvents,
      alertPreferences,
      apiKeyName,
      dryRunMode,
      dryRuns,
      mode,
      orderHistory,
      portfolioValue,
      selectedSymbol,
      sessions,
      sleepMode,
      strategy,
    ],
  )

  useEffect(() => {
    if (!isHydrated || !address) {
      setHasLoadedRemoteProfile(false)
      setPersistenceStatus(requireWallet ? "locked" : "local")
      return
    }

    let cancelled = false
    setHasLoadedRemoteProfile(false)
    setPersistenceStatus("syncing")

    void requestPersistenceProfile(address)
      .then((profile) => {
        if (cancelled) return

        if (profile.state) {
          const settings = normalizeStoredSettings(profile.state.settings)
          setMode(settings.mode)
          setStrategy(settings.strategy)
          setSleepMode(settings.sleepMode)
          setDryRunMode(settings.dryRunMode)
          setPortfolioValue(settings.portfolioValue)
          setAccountId(settings.accountId)
          setApiKeyName(settings.apiKeyName)
          setSelectedSymbol(settings.selectedSymbol)
          setAlertPreferences(settings.alertPreferences)
          setSessions(profile.state.sessions || [])
          setAlertEvents(profile.state.alertEvents || [])
          setDryRuns(profile.state.dryRuns || [])
          setOrderHistory(profile.state.orderHistory || [])
        }

        lastRemoteWriteRef.current = ""
        setHasLoadedRemoteProfile(true)
        setPersistenceStatus(profile.sourceStatus === "mongodb" ? "mongodb" : "local")
      })
      .catch((error) => {
        if (cancelled) return
        setHasLoadedRemoteProfile(true)
        setPersistenceStatus("error")
        setStatus(error instanceof Error ? error.message : "Server persistence is unavailable; using browser cache.")
      })

    return () => {
      cancelled = true
    }
  }, [address, isHydrated, requireWallet])

  useEffect(() => {
    if (!isHydrated || !address || !hasLoadedRemoteProfile) return

    const serialized = JSON.stringify(persistenceState)
    if (serialized === lastRemoteWriteRef.current) return

    const timeout = window.setTimeout(() => {
      void savePersistenceProfile(address, persistenceState)
        .then((result) => {
          lastRemoteWriteRef.current = serialized
          setPersistenceStatus(result.sourceStatus === "mongodb" ? "mongodb" : "local")
        })
        .catch(() => {
          setPersistenceStatus("error")
        })
    }, 900)

    return () => window.clearTimeout(timeout)
  }, [address, hasLoadedRemoteProfile, isHydrated, persistenceState])

  const selectedTicker = useMemo<SodexTicker | undefined>(
    () => market?.tickers.find((ticker) => ticker.symbol === selectedSymbol) || market?.tickers[0],
    [market, selectedSymbol],
  )

  const hedgePct = Math.round(modeCopy[mode].hedge * strategyCopy[strategy].multiplier)
  const hedgeUsd = Math.round((portfolioValue * hedgePct) / 100)
  const testnetOrderNotional = Math.max(8, Math.round(hedgeUsd * TESTNET_ORDER_NOTIONAL_MULTIPLIER))
  const estimatedProtected = Math.round((portfolioValue * (intel?.score || 40)) / 140)
  const dangerScore = intel?.score || 0
  const activeSession = sessions.find((session) => !session.endedAt)

  const morningReport = useMemo(() => {
    const latestSession = activeSession || sessions[0]
    const latestSnapshots = latestSession?.snapshots.slice(0, 3) || []
    const alertCount = alertEvents.length
    const orderCount = orderHistory.length
    return [
      "NightWatch morning report",
      `Mode: ${modeCopy[mode].label}`,
      `Strategy: ${strategyCopy[strategy].label}`,
      `Latest score: ${intel ? `${intel.score}/100 ${intel.level}` : "pending"}`,
      `Session snapshots: ${latestSnapshots.map((snapshot) => `${snapshot.level} ${snapshot.score}`).join(", ") || "none yet"}`,
      `Alerts prepared: ${alertCount}`,
      `Order records: ${orderCount}`,
      aiBrief ? `AI brief: ${aiBrief.headline}` : "AI brief pending",
    ].join("\n")
  }, [activeSession, aiBrief, alertEvents.length, intel, mode, orderHistory.length, sessions, strategy])

  const loadNightWatchData = useCallback(
    async (options: { withBrief?: boolean; quiet?: boolean } = { withBrief: true }) => {
      if (!options.quiet) setIsLoading(true)
      try {
        const perpsParams = new URLSearchParams()
        if (address) perpsParams.set("address", address)
        if (accountId) perpsParams.set("accountId", accountId)
        const perpsPath = `/api/sodex/perps${perpsParams.toString() ? `?${perpsParams.toString()}` : ""}`
        const [intelResponse, marketResponse, perpsResponse] = await Promise.all([
          fetchJson<NightWatchIntel>(`/api/nightwatch/intel?mode=${mode}`),
          fetchJson<SodexMarket>("/api/sodex/market"),
          fetchJson<SodexPerpsMarket>(perpsPath),
        ])

        setIntel(intelResponse)
        setMarket(marketResponse)
        setPerpsMarket(perpsResponse)
        setStatus(
          `${intelResponse.sourceStatus === "live" ? "Live SoSoValue and SSI" : "Fallback"} intelligence synced with ${
            marketResponse.sourceStatus === "live" ? "SoDEX spot" : "spot unavailable"
          } and ${perpsResponse.sourceStatus === "live" ? "perps" : "perps unavailable"} routes.`,
        )

        if (!marketResponse.tickers.some((ticker) => ticker.symbol === selectedSymbol) && marketResponse.tickers[0]) {
          setSelectedSymbol(marketResponse.tickers[0].symbol)
        }

        if (options.withBrief) {
          setIsBriefLoading(true)
          const context = briefingContextRef.current
          setAiBrief(
            await requestNightWatchAiBrief({
              intel: intelResponse,
              market: marketResponse,
              mode,
              portfolioValue: context.portfolioValue,
              sleepMode: context.sleepMode,
            }),
          )
        }
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Unable to refresh NightWatch data.")
      } finally {
        setIsLoading(false)
        setIsBriefLoading(false)
      }
    },
    [accountId, address, mode, selectedSymbol],
  )

  useEffect(() => {
    if (requireWallet && !address) {
      setIsLoading(false)
      return
    }

    void loadNightWatchData()
    const interval = window.setInterval(() => void loadNightWatchData({ withBrief: false, quiet: true }), 45_000)
    return () => window.clearInterval(interval)
  }, [address, loadNightWatchData, requireWallet])

  useEffect(() => {
    if (!isHydrated || !intel) return

    if (!sleepMode) {
      setSessions((prev) =>
        prev.map((session) => (session.endedAt ? session : { ...session, endedAt: new Date().toISOString() })),
      )
      return
    }

    setSessions((prev) => {
      const activeIndex = prev.findIndex((session) => !session.endedAt)
      const active =
        activeIndex >= 0
          ? prev[activeIndex]
          : {
              id: `session-${Date.now()}`,
              startedAt: new Date().toISOString(),
              mode,
              strategy,
              portfolioValue,
              alertThreshold: alertPreferences.threshold,
              snapshots: [],
            }

      const alreadyCaptured = active.snapshots.some((snapshot) => snapshot.createdAt === intel.generatedAt)
      const snapshots = alreadyCaptured
        ? active.snapshots
        : [
            {
              createdAt: intel.generatedAt,
              score: intel.score,
              level: intel.level,
              summary: intel.summary,
            },
            ...active.snapshots,
          ].slice(0, 12)

      const updated: SleepSession = {
        ...active,
        mode,
        strategy,
        portfolioValue,
        alertThreshold: alertPreferences.threshold,
        snapshots,
      }

      if (activeIndex >= 0) {
        return prev.map((session, index) => (index === activeIndex ? updated : session)).slice(0, 12)
      }

      return [updated, ...prev].slice(0, 12)
    })
  }, [alertPreferences.threshold, intel, isHydrated, mode, portfolioValue, sleepMode, strategy])

  const sendRiskAlert = useCallback(
    async (title: string, detail: string) => {
      const channels: Array<"telegram" | "email" | "browser" | "console"> = ["console"]
      if (alertPreferences.telegram) channels.push("telegram")
      if (alertPreferences.email) channels.push("email")
      if (alertPreferences.browser) channels.push("browser")

      try {
        const events = await requestAlert({ title, detail, channels })
        if (alertPreferences.browser && typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification(title, { body: detail })
        }
        setAlertEvents((prev) => [...events, ...prev].slice(0, 20))
      } catch (error) {
        setAlertEvents((prev) => [
          {
            id: `failed-${Date.now()}`,
            createdAt: new Date().toISOString(),
            channel: "console",
            title,
            detail: error instanceof Error ? error.message : detail,
            status: "failed",
          },
          ...prev,
        ])
      }
    },
    [alertPreferences],
  )

  useEffect(() => {
    if (!intel || !sleepMode || intel.score < alertPreferences.threshold) return
    const key = `${activeSession?.id || "session"}-${intel.level}-${Math.floor(intel.score / 5)}`
    if (key === lastAlertKey) return
    setLastAlertKey(key)
    void sendRiskAlert(
      `${intel.level} risk threshold reached`,
      `${intel.summary} Current score is ${intel.score}/100 with ${modeCopy[mode].label} mode and ${strategyCopy[strategy].label}.`,
    )
  }, [activeSession?.id, alertPreferences.threshold, intel, lastAlertKey, mode, sendRiskAlert, sleepMode, strategy])

  async function refreshAiBrief() {
    if (!intel || !market) return

    setIsBriefLoading(true)
    try {
      setAiBrief(await requestNightWatchAiBrief({ intel, market, mode, portfolioValue, sleepMode }))
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to create NightWatch AI brief.")
    } finally {
      setIsBriefLoading(false)
    }
  }

  async function connectWallet() {
    const ethereum = getEthereum()
    if (!ethereum) {
      setStatus("No injected wallet found. Install MetaMask or open the app in a wallet browser.")
      return
    }

    try {
      const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[]
      const wallet = accounts[0] || ""
      if (!isEvmAddress(wallet)) {
        setStatus("Wallet returned an invalid EVM address.")
        return
      }

      setAddress(wallet)
      setStatus("Wallet connected. Pulling SoDEX account state.")

      const accountResponse = await fetchJson<Record<string, unknown>>(
        `/api/sodex/account?address=${encodeURIComponent(wallet)}`,
      )
      const aid = accountResponse?.aid || accountResponse?.accountID || accountResponse?.accountId
      if (aid && /^\d{1,18}$/.test(String(aid))) setAccountId(String(aid))
      void loadNightWatchData({ withBrief: false, quiet: true })
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Wallet connection failed.")
    }
  }

  async function switchToValueChain() {
    const ethereum = getEthereum()
    if (!ethereum) {
      setStatus("No wallet provider found.")
      return
    }

    try {
      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: VALUECHAIN_TESTNET.chainIdHex }],
      })
      setStatus("Wallet switched to ValueChain testnet.")
    } catch {
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: VALUECHAIN_TESTNET.chainIdHex,
            chainName: VALUECHAIN_TESTNET.chainName,
            nativeCurrency: VALUECHAIN_TESTNET.nativeCurrency,
            rpcUrls: [VALUECHAIN_TESTNET.rpcUrl],
            blockExplorerUrls: ["https://testnet-scan.valuechain.xyz"],
          },
        ],
      })
      setStatus("ValueChain testnet added to wallet.")
    }
  }

  function buildDryRun(venue: DryRunOrder["venue"]): DryRunOrder | null {
    if (venue === "SoDEX spot" && market?.sourceStatus !== "live") return null
    if (venue === "SoDEX perps" && perpsMarket?.sourceStatus !== "live") return null

    const ticker = venue === "SoDEX spot" ? selectedTicker : perpsMarket?.tickers[0]
    if (!ticker || !Number.isFinite(ticker.lastPx)) return null
    if (venue === "SoDEX spot" && (!Number.isSafeInteger(ticker.symbolID) || !ticker.symbolID || ticker.symbolID <= 0)) return null
    const price = Math.max(venue === "SoDEX spot" ? ticker.lastPx : perpsMarket?.tickers[0]?.markPx || ticker.lastPx, 1)
    const quantity = formatSodexQuantity(ticker, testnetOrderNotional, price)

    return {
      id: `dry-run-${Date.now()}`,
      createdAt: new Date().toISOString(),
      venue,
      symbol: ticker.symbol,
      symbolID: ticker.symbolID,
      mode,
      strategy,
      notionalUsd: testnetOrderNotional,
      quantity,
      side: venue === "SoDEX spot" ? "sell" : "hedge",
      endpoint: venue === "SoDEX spot" ? "/trade/orders/batch" : "/trade/orders + /trade/leverage + /trade/tp-sl",
      rationale: `${strategyCopy[strategy].brief} ${modeCopy[mode].tone}. Wallet approval is required before any signed action leaves the app.`,
      estimatedSlippageBps: Math.max(5, Math.round((dangerScore / 100) * 40)),
      guardrails: [
        "Dry-run must be reviewed before signing.",
        "Live SoDEX route is required.",
        "No silent execution is enabled.",
        "Order notional is scaled for ValueChain testnet.",
        "Quantity is rounded to SoDEX step size and min-notional filters.",
        "Missing account or wallet blocks submission.",
      ],
    }
  }

  async function createDryRun(venue: DryRunOrder["venue"]) {
    const dryRun = buildDryRun(venue)
    if (!dryRun) {
      setStatus("No SoDEX route is available for dry-run preview.")
      return
    }

    try {
      const receipt = await requestDryRunReceipt(dryRun)
      const verifiedDryRun = { ...dryRun, receipt }

      setCurrentDryRun(verifiedDryRun)
      setDryRuns((prev) => [verifiedDryRun, ...prev].slice(0, 20))
      setOrderHistory((prev) => [
        {
          id: `record-${dryRun.id}`,
          createdAt: dryRun.createdAt,
          symbol: dryRun.symbol,
          mode: dryRun.mode,
          strategy: dryRun.strategy,
          status: "dry-run",
          detail: `${dryRun.venue} preview created for ${formatUsd(dryRun.notionalUsd)} notional.`,
        },
        ...prev,
      ])
      setStatus(`${dryRun.venue} dry-run preview created for ${dryRun.symbol}.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to issue dry-run receipt.")
    }
  }

  async function signAndSubmitProtectionOrder() {
    const ethereum = getEthereum()
    if (!ethereum || !address || !selectedTicker || !accountId || !currentDryRun?.receipt) {
      setStatus("Create a dry-run preview, connect a wallet, and load a SoDEX account before signing.")
      return
    }

    if (currentDryRun.venue !== "SoDEX spot") {
      setStatus("Perps actions are preview-only in Wave 2 until leverage and TP/SL signing is confirmed.")
      return
    }

    if (currentDryRun.symbol !== selectedTicker.symbol) {
      setStatus("Selected market changed after dry-run. Recreate the preview before signing.")
      return
    }

    if (!isPositiveIntegerString(accountId)) {
      setStatus("Enter a valid SoDEX account ID before signing.")
      return
    }

    if (!apiKeyName.trim() || !isApiKeyName(apiKeyName)) {
      setStatus("Enter the registered SoDEX API key name for the wallet that signs this trading action.")
      return
    }

    if (!Number.isSafeInteger(selectedTicker.symbolID) || !selectedTicker.symbolID || selectedTicker.symbolID <= 0) {
      setStatus("Selected SoDEX market is missing a valid symbol ID. Refresh market data before signing.")
      return
    }

    setIsSubmitting(true)
    try {
      await switchToValueChain()
      const nonce = Date.now()
      const clOrdID = `nightwatch-${nonce}`.slice(0, 36)
      const orderBody = {
        accountID: Number(accountId),
        orders: [
          {
            symbolID: selectedTicker.symbolID,
            clOrdID,
            side: 2,
            type: 2,
            timeInForce: 3,
            quantity: currentDryRun.quantity,
          },
        ],
      }
      const actionPayload = { type: "batchNewOrder", params: orderBody }
      const { keccak256, toHex } = await import("viem")
      const payloadHash = keccak256(toHex(JSON.stringify(actionPayload)))
      const typedData = {
        types: {
          EIP712Domain: [
            { name: "name", type: "string" },
            { name: "version", type: "string" },
            { name: "chainId", type: "uint256" },
            { name: "verifyingContract", type: "address" },
          ],
          ExchangeAction: [
            { name: "payloadHash", type: "bytes32" },
            { name: "nonce", type: "uint64" },
          ],
        },
        domain: {
          name: "spot",
          version: "1",
          chainId: VALUECHAIN_TESTNET.chainId,
          verifyingContract: VALUECHAIN_TESTNET.spotVerifyingContract,
        },
        primaryType: "ExchangeAction",
        message: {
          payloadHash,
          nonce,
        },
      }

      const rawSignature = (await ethereum.request({
        method: "eth_signTypedData_v4",
        params: [address, JSON.stringify(typedData)],
      })) as string
      const signature = `0x01${normalizeWalletSignature(rawSignature).slice(2)}`

      const result = await fetchJson<{ ok: boolean; error?: string; result?: unknown }>("/api/sodex/submit-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: orderBody,
          dryRunReceipt: currentDryRun.receipt,
          nonce,
          signature,
          apiKeyName: apiKeyName.trim() || undefined,
        }),
      })

      const submitted = Boolean(result.ok)
      setOrderHistory((prev) => [
        {
          id: `submitted-${nonce}`,
          createdAt: new Date().toISOString(),
          symbol: selectedTicker.symbol,
          mode,
          strategy,
          status: submitted ? "submitted" : "failed",
          clOrdID,
          detail: submitted ? "Signed SoDEX testnet protection order submitted." : result.error || "SoDEX submission failed.",
        },
        ...prev,
      ])
      setStatus(submitted ? `SoDEX testnet protection order submitted: ${clOrdID}` : result.error || "SoDEX submission failed.")
    } catch (error) {
      setOrderHistory((prev) => [
        {
          id: `failed-${Date.now()}`,
          createdAt: new Date().toISOString(),
          symbol: selectedTicker.symbol,
          mode,
          strategy,
          status: "failed",
          detail: error instanceof Error ? error.message : "Signature or SoDEX submission failed.",
        },
        ...prev,
      ])
      setStatus(error instanceof Error ? error.message : "Signature or SoDEX submission failed.")
    } finally {
      setIsSubmitting(false)
    }
  }

  async function requestBrowserNotifications() {
    if (typeof Notification === "undefined") {
      setStatus("Browser notifications are not available in this environment.")
      return
    }
    const permission = await Notification.requestPermission()
    setStatus(permission === "granted" ? "Browser notifications enabled." : "Browser notification permission was not granted.")
  }

  async function copyMorningReport() {
    await navigator.clipboard.writeText(morningReport)
    setStatus("Morning report copied.")
  }

  if (requireWallet && !address) {
    return (
      <section id="console" className="relative z-10 px-4 py-16 sm:py-24">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur-md">
              <Wallet className="h-4 w-4" />
              Wallet login required
            </div>
            <h1 className="mb-5 text-balance text-4xl font-bold leading-tight text-white md:text-6xl">
              Connect wallet to open NightWatch Dashboard
            </h1>
            <p className="max-w-2xl text-lg leading-relaxed text-white/70">
              Your wallet address is the login key for server-side portfolio persistence. NightWatch stores risk sessions,
              alerts, dry-runs, and audit history in your MongoDB profile without ever storing private keys.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={connectWallet}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-6 font-semibold text-black transition-all hover:bg-slate-100"
              >
                <Wallet className="h-5 w-5" />
                Connect wallet
              </button>
              <button
                onClick={switchToValueChain}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/10 px-6 font-semibold text-white transition-all hover:bg-white/15"
              >
                <KeyRound className="h-5 w-5" />
                Add ValueChain
              </button>
            </div>
          </div>

          <Panel>
            <PanelHeader eyebrow="Access model" title="What unlocks after login" icon={Shield} />
            <div className="space-y-3">
              {[
                "MongoDB-backed Sleep Mode history",
                "Wallet-scoped alert, dry-run, and order audit records",
                "SoDEX account lookup and ValueChain signing controls",
                "Risk, Execution, and Reports pages synced to the same profile",
              ].map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/75">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-green-300" />
                  {item}
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-xl border border-white/10 bg-black/25 p-4 text-sm text-white/55">
              Status: {persistenceStatus === "locked" ? "waiting for wallet login" : "ready"}
            </div>
          </Panel>
        </div>
      </section>
    )
  }

  return (
    <section id="console" className="relative z-10 px-4 py-16 sm:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur-md">
            <Radio className="h-4 w-4" />
            Live NightWatch Console
          </div>
          <h2 className="mb-4 text-balance text-3xl font-bold text-white md:text-5xl">
            AI risk control with{" "}
            <span className="bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
              SoSoValue + SSI + SoDEX
            </span>
          </h2>
          <p className="mx-auto max-w-3xl text-lg leading-relaxed text-white/70">
            Persist Sleep Mode, preview every protection action, monitor SoDEX spot and perps routes, and wake up to an evidence-backed report.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {[
              { label: "SoSoValue", live: intel?.sourceStatus === "live" },
              { label: "SSI indexes", live: Boolean(intel?.indexes.length) },
              { label: "SoDEX spot", live: market?.sourceStatus === "live" },
              { label: "SoDEX perps", live: perpsMarket?.sourceStatus === "live" },
              { label: "OpenAI", live: aiBrief?.sourceStatus === "openai" },
              { label: "MongoDB profile", live: persistenceStatus === "mongodb" },
            ].map((source) => (
              <span key={source.label} className={`rounded-full border px-3 py-1 text-xs font-medium ${statusTone(source.live)}`}>
                {source.label} {source.live ? "live" : "fallback"}
              </span>
            ))}
          </div>
        </div>

        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex rounded-full border border-white/15 bg-white/5 p-1 backdrop-blur-md">
            {[
              { id: "risk", label: "Risk", icon: Gauge },
              { id: "execution", label: "Execution", icon: Zap },
              { id: "reports", label: "Reports", icon: FileText },
            ].map((view) => {
              const Icon = view.icon
              return (
                <button
                  key={view.id}
                  onClick={() => setActiveView(view.id as ConsoleView)}
                  className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium transition-all ${
                    activeView === view.id ? "bg-white text-black" : "text-white/70 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {view.label}
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => void loadNightWatchData({ withBrief: false })}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 text-sm font-medium text-white/80 transition-all hover:bg-white/15"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              Refresh data
            </button>
            <button
              onClick={() => setSleepMode((value) => !value)}
              className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium transition-all ${
                sleepMode ? "bg-white text-black" : "border border-white/20 bg-white/10 text-white"
              }`}
            >
              <Moon className="h-4 w-4" />
              {sleepMode ? "Sleep Mode Active" : "Sleep Mode Off"}
            </button>
          </div>
        </div>

        {activeView === "risk" && (
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
              <Panel>
                <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-sm text-white/60">Market Danger Score</div>
                    <div className="flex items-end gap-3">
                      <span className="text-6xl font-bold text-white">{isLoading ? "--" : dangerScore}</span>
                      <span className="pb-2 text-white/70">{intel?.level || "Syncing"}</span>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/65">
                    Alert threshold: <span className="font-semibold text-white">{alertPreferences.threshold}</span>
                  </div>
                </div>

                <div className="mb-6 h-3 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-white via-slate-300 to-red-300 transition-all duration-700"
                    style={{ width: `${dangerScore}%` }}
                  />
                </div>

                <p className="mb-6 leading-relaxed text-white/75">{intel?.summary || status}</p>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {(intel?.signals || []).map((signal) => (
                    <div key={signal.label} className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <div className="mb-2 text-xs uppercase tracking-wide text-white/40">{signal.label}</div>
                      <div className="font-semibold text-white">{signal.value}</div>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel>
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 font-semibold text-white">
                    <Brain className="h-4 w-4" />
                    OpenAI risk brief
                  </div>
                  <button
                    onClick={refreshAiBrief}
                    disabled={isBriefLoading || !intel || !market}
                    className="inline-flex min-h-9 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 text-xs font-medium text-white/80 transition-all hover:bg-white/15 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isBriefLoading ? "animate-spin" : ""}`} />
                    Refresh brief
                  </button>
                </div>
                <h3 className="mb-2 text-xl font-bold text-white">
                  {isBriefLoading ? "Generating portfolio brief..." : aiBrief?.headline || "Waiting for market context"}
                </h3>
                <p className="mb-4 text-sm leading-relaxed text-white/65">
                  {aiBrief?.briefing || "NightWatch will summarize SoSoValue, SSI, and SoDEX routes once the dashboard syncs."}
                </p>
                <div className="mb-4 rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="mb-1 text-xs uppercase tracking-wide text-white/40">Execution rationale</div>
                  <p className="text-sm leading-relaxed text-white/70">
                    {aiBrief?.tradeRationale || "Wallet approval remains required before any SoDEX testnet order is submitted."}
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {(aiBrief?.nextActions || ["Sync data", "Review policy", "Create dry-run"]).map((action) => (
                    <div key={action} className="rounded-xl bg-white/5 px-3 py-2 text-xs text-white/65">
                      {action}
                    </div>
                  ))}
                </div>
              </Panel>
            </div>

            <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
              <Panel>
                <PanelHeader eyebrow="Score methodology" title="Why the score moved" icon={LineChart} />
                <div className="space-y-3">
                  {(intel?.components || []).map((component) => (
                    <div key={component.label} className="grid gap-3 rounded-xl border border-white/10 bg-black/20 p-4 sm:grid-cols-[auto_1fr]">
                      <div className="flex h-10 w-14 items-center justify-center rounded-full bg-white text-sm font-bold text-black">
                        {component.contribution > 0 ? "+" : ""}
                        {component.contribution}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-white">{component.label}</div>
                        <div className="text-sm text-white/60">{component.weight}</div>
                        <div className="mt-1 text-xs text-white/45">{component.evidence}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel>
                <PanelHeader eyebrow="Source evidence" title="Live references behind the brief" icon={Database} />
                <div className="grid gap-3 sm:grid-cols-2">
                  {(intel?.sourceSnippets.length ? intel.sourceSnippets : aiBrief?.sourceSnippets || []).slice(0, 6).map((snippet) => (
                    <a
                      key={`${snippet.source}-${snippet.title}`}
                      href={snippet.href || undefined}
                      target={snippet.href ? "_blank" : undefined}
                      rel={snippet.href ? "noreferrer" : undefined}
                      className="rounded-xl border border-white/10 bg-white/5 p-4 transition-all hover:bg-white/10"
                    >
                      <div className="mb-2 text-xs uppercase tracking-wide text-white/40">{snippet.source}</div>
                      <div className="line-clamp-2 font-semibold text-white">{snippet.title}</div>
                      <p className="mt-2 text-sm leading-relaxed text-white/60">{snippet.detail}</p>
                    </a>
                  ))}
                  {!intel?.sourceSnippets.length && !aiBrief?.sourceSnippets.length && <EmptyState label="Source snippets will appear after live intelligence syncs." />}
                </div>
              </Panel>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {(intel?.actions || []).map((action) => (
                <Panel key={action.title} className="p-4">
                  <div className="mb-2 flex items-center gap-2 font-semibold text-white">
                    <Shield className="h-4 w-4" />
                    {action.title}
                  </div>
                  <p className="text-sm leading-relaxed text-white/65">{action.description}</p>
                  <div className="mt-3 text-xs uppercase tracking-wide text-white/45">{action.status}</div>
                </Panel>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {intel?.assets.map((asset) => (
                <Panel key={asset.symbol} className="p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-semibold text-white">{asset.symbol}</span>
                    <span className={asset.changePct24h < 0 ? "text-red-300" : "text-green-300"}>{asset.changePct24h.toFixed(2)}%</span>
                  </div>
                  <div className="text-2xl font-bold text-white">{asset.price > 0 ? formatUsd(asset.price) : "Unavailable"}</div>
                  <div className="mt-1 text-xs text-white/45">Vol {asset.volume24h > 0 ? formatCompact(asset.volume24h) : "waiting"}</div>
                </Panel>
              ))}
            </div>
          </div>
        )}

        {activeView === "execution" && (
          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-6">
              <Panel light>
                <PanelHeader eyebrow="Overnight policy" title="Protection mode and strategy" icon={Sparkles} light />
                <div className="mb-6 grid grid-cols-3 gap-2">
                  {(Object.keys(modeCopy) as ProtectionMode[]).map((item) => (
                    <button
                      key={item}
                      onClick={() => setMode(item)}
                      className={`min-h-10 rounded-full px-3 text-sm font-medium transition-all ${
                        mode === item ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {modeCopy[item].label}
                    </button>
                  ))}
                </div>

                <div className="mb-6 grid gap-2 sm:grid-cols-2">
                  {(Object.keys(strategyCopy) as ProtectionStrategy[]).map((item) => (
                    <button
                      key={item}
                      onClick={() => setStrategy(item)}
                      className={`rounded-xl border p-3 text-left transition-all ${
                        strategy === item ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <div className="text-sm font-semibold">{strategyCopy[item].label}</div>
                      <div className={strategy === item ? "mt-1 text-xs text-white/65" : "mt-1 text-xs text-slate-500"}>{strategyCopy[item].brief}</div>
                    </button>
                  ))}
                </div>

                <div className="space-y-5">
                  <div>
                    <div className="mb-3 flex justify-between text-sm">
                      <span className="text-slate-600">Portfolio value</span>
                      <span className="font-semibold">{formatUsd(portfolioValue)}</span>
                    </div>
                    <Slider value={[portfolioValue]} min={2_000} max={250_000} step={1_000} onValueChange={([value]) => setPortfolioValue(value)} />
                  </div>

                  <div>
                    <div className="mb-3 flex justify-between text-sm">
                      <span className="text-slate-600">Alert threshold</span>
                      <span className="font-semibold">{alertPreferences.threshold}/100</span>
                    </div>
                    <Slider
                      value={[alertPreferences.threshold]}
                      min={38}
                      max={90}
                      step={1}
                      onValueChange={([value]) => setAlertPreferences((prev) => ({ ...prev, threshold: value }))}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-slate-100 p-4">
                      <div className="text-sm text-slate-500">Hedge budget</div>
                      <div className="text-2xl font-bold">{formatUsd(hedgeUsd)}</div>
                    </div>
                    <div className="rounded-xl bg-slate-950 p-4 text-white">
                      <div className="text-sm text-white/55">Testnet order</div>
                      <div className="text-2xl font-bold">{formatUsd(testnetOrderNotional)}</div>
                    </div>
                  </div>
                </div>
              </Panel>

              <Panel>
                <PanelHeader eyebrow="Alert delivery" title="Notification controls" icon={BellRing} />
                <div className="space-y-3">
                  {[
                    { key: "telegram", label: "Telegram", icon: Send },
                    { key: "email", label: "Email webhook", icon: Mail },
                    { key: "browser", label: "Browser push", icon: Bell },
                  ].map((channel) => {
                    const Icon = channel.icon
                    const key = channel.key as "telegram" | "email" | "browser"
                    return (
                      <button
                        key={channel.key}
                        onClick={() => setAlertPreferences((prev) => ({ ...prev, [key]: !prev[key] }))}
                        className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left transition-all hover:bg-white/10"
                      >
                        <span className="flex items-center gap-3 text-sm font-medium text-white">
                          <Icon className="h-4 w-4 text-white/60" />
                          {channel.label}
                        </span>
                        <span className={alertPreferences[key] ? "text-green-300" : "text-white/40"}>
                          {alertPreferences[key] ? "On" : "Off"}
                        </span>
                      </button>
                    )
                  })}
                  <button
                    onClick={requestBrowserNotifications}
                    className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-black transition-all hover:bg-slate-100"
                  >
                    <Bell className="h-4 w-4" />
                    Enable browser notifications
                  </button>
                </div>
              </Panel>
            </div>

            <div className="space-y-6">
              <Panel>
                <PanelHeader eyebrow="Wallet-safe dry-run" title="Preview before signing" icon={ClipboardCheck} />
                <div className="mb-5 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => {
                      setDryRunMode(true)
                      setStatus("Dry-run review is mandatory before any wallet signature.")
                    }}
                    className="inline-flex min-h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-medium text-black"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Dry-run required
                  </button>
                  <button
                    onClick={() => void createDryRun("SoDEX spot")}
                    className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 text-sm font-medium text-white transition-all hover:bg-white/15"
                  >
                    <Target className="h-4 w-4" />
                    Preview spot order
                  </button>
                  <button
                    onClick={() => void createDryRun("SoDEX perps")}
                    className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 text-sm font-medium text-white transition-all hover:bg-white/15"
                  >
                    <LineChart className="h-4 w-4" />
                    Preview perps hedge
                  </button>
                </div>

                {currentDryRun ? (
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div className="font-semibold text-white">{currentDryRun.venue} - {currentDryRun.symbol}</div>
                      <div className="text-sm text-white/55">{formatTime(currentDryRun.createdAt)}</div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <div className="text-xs text-white/40">Notional</div>
                        <div className="font-semibold text-white">{formatUsd(currentDryRun.notionalUsd)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-white/40">Quantity</div>
                        <div className="font-semibold text-white">{currentDryRun.quantity}</div>
                      </div>
                      <div>
                        <div className="text-xs text-white/40">Slippage guard</div>
                        <div className="font-semibold text-white">{currentDryRun.estimatedSlippageBps} bps</div>
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-white/65">{currentDryRun.rationale}</p>
                  </div>
                ) : (
                  <EmptyState label="Create a dry-run preview to inspect the signed action before wallet approval." />
                )}
              </Panel>

              <Panel>
                <PanelHeader eyebrow="SoDEX execution" title="ValueChain safety order" icon={Zap} />
                <div className="mb-5 grid gap-3 sm:grid-cols-2">
                  <button
                    onClick={connectWallet}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-white px-5 font-medium text-black transition-all hover:bg-slate-100"
                  >
                    <Wallet className="h-4 w-4" />
                    {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Connect wallet"}
                  </button>
                  <button
                    onClick={switchToValueChain}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/10 px-5 font-medium text-white transition-all hover:bg-white/15"
                  >
                    <KeyRound className="h-4 w-4" />
                    ValueChain
                  </button>
                </div>

                <div className="mb-5 grid gap-3 sm:grid-cols-3">
                  <input
                    value={accountId}
                    onChange={(event) => setAccountId(event.target.value)}
                    placeholder="SoDEX account ID"
                    className="min-h-11 rounded-xl border border-white/10 bg-black/25 px-4 text-white outline-none placeholder:text-white/35 focus:border-white/30"
                  />
                  <input
                    value={apiKeyName}
                    onChange={(event) => setApiKeyName(event.target.value)}
                    placeholder="API key name"
                    className="min-h-11 rounded-xl border border-white/10 bg-black/25 px-4 text-white outline-none placeholder:text-white/35 focus:border-white/30"
                  />
                  <select
                    value={selectedTicker?.symbol || selectedSymbol}
                    onChange={(event) => setSelectedSymbol(event.target.value)}
                    disabled={!market?.tickers.length}
                    className="min-h-11 rounded-xl border border-white/10 bg-black/25 px-4 text-white outline-none focus:border-white/30"
                  >
                    {market?.tickers.map((ticker) => (
                      <option key={ticker.symbol} value={ticker.symbol} className="bg-slate-950">
                        {ticker.displayName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mb-5 rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="mb-2 flex items-center justify-between text-sm text-white/60">
                    <span>{selectedTicker?.displayName || "No live spot route"}</span>
                    <span>{selectedTicker ? `${selectedTicker.changePct.toFixed(2)}%` : "--"}</span>
                  </div>
                  <div className="text-3xl font-bold text-white">{selectedTicker ? formatUsd(selectedTicker.lastPx) : "Syncing"}</div>
                </div>

                <Button
                  onClick={signAndSubmitProtectionOrder}
                  disabled={
                    isSubmitting ||
                    !currentDryRun ||
                    !currentDryRun.receipt ||
                    currentDryRun.venue !== "SoDEX spot" ||
                    !selectedTicker ||
                    currentDryRun.symbol !== selectedTicker.symbol ||
                    !isPositiveIntegerString(accountId) ||
                    !apiKeyName.trim() ||
                    !isApiKeyName(apiKeyName)
                  }
                  className="w-full rounded-full bg-white px-6 py-6 text-base font-semibold text-black transition-all hover:bg-slate-100 disabled:opacity-50"
                >
                  {isSubmitting ? "Submitting to SoDEX..." : "Sign approved dry-run"}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Panel>

              <Panel>
                <PanelHeader eyebrow="SoDEX perps protection" title="Hedge and position monitor" icon={Activity} />
                <div className="mb-4 grid gap-3 sm:grid-cols-3">
                  {(perpsMarket?.tickers || []).slice(0, 3).map((ticker) => (
                    <div key={ticker.symbol} className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-sm font-semibold text-white">{ticker.displayName}</div>
                      <div className="mt-1 text-lg font-bold text-white">{formatUsd(ticker.markPx || ticker.lastPx)}</div>
                      <div className="text-xs text-white/45">Max lev {ticker.maxLeverage || "--"}x</div>
                    </div>
                  ))}
                  {!perpsMarket?.tickers.length && <EmptyState label="Perps tickers will appear when the live SoDEX perps route is available." />}
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="mb-2 text-sm font-semibold text-white">Open positions</div>
                  {perpsMarket?.positions.length ? (
                    <div className="space-y-2">
                      {perpsMarket.positions.map((position) => (
                        <div key={`${position.symbol}-${position.side}`} className="flex items-center justify-between gap-3 text-sm">
                          <span className="text-white/70">{position.symbol} {position.side}</span>
                          <span className="font-semibold text-white">{formatUsd(position.notionalUsd)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-white/55">No perps positions loaded yet. Connect a wallet and account to monitor live exposure.</p>
                  )}
                </div>
              </Panel>
            </div>
          </div>
        )}

        {activeView === "reports" && (
          <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="space-y-6">
              <Panel>
                <PanelHeader eyebrow="Morning report" title="Session summary" icon={FileText} />
                <pre className="mb-4 whitespace-pre-wrap rounded-xl border border-white/10 bg-black/25 p-4 text-sm leading-relaxed text-white/70">{morningReport}</pre>
                <button
                  onClick={copyMorningReport}
                  className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-black transition-all hover:bg-slate-100"
                >
                  <ClipboardCheck className="h-4 w-4" />
                  Copy report
                </button>
              </Panel>

              <Panel>
                <PanelHeader eyebrow="Stress scenarios" title="Validation checks" icon={Gauge} />
                <div className="space-y-3">
                  {(intel?.scenarios || []).map((scenario) => (
                    <div key={scenario.name} className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <div className="font-semibold text-white">{scenario.name}</div>
                        <div className="text-sm text-white/55">{scenario.scoreDelta > 0 ? "+" : ""}{scenario.scoreDelta}</div>
                      </div>
                      <p className="text-sm text-white/60">{scenario.trigger}</p>
                      <p className="mt-2 text-xs text-white/45">{scenario.expectedImpact}</p>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>

            <div className="space-y-6">
              <Panel>
                <PanelHeader eyebrow="Persistent sessions" title="Sleep Mode history" icon={Clock} />
                <div className="space-y-3">
                  {sessions.slice(0, 5).map((session) => (
                    <div key={session.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <div className="font-semibold text-white">{formatTime(session.startedAt)} - {session.endedAt ? formatTime(session.endedAt) : "active"}</div>
                        <div className="text-sm text-white/55">{session.snapshots.length} snapshots</div>
                      </div>
                      <div className="text-sm text-white/65">
                        {modeCopy[session.mode].label} / {strategyCopy[session.strategy].label} / {formatUsd(session.portfolioValue)}
                      </div>
                    </div>
                  ))}
                  {!sessions.length && <EmptyState label="Sleep sessions persist to your wallet-scoped MongoDB profile once Sleep Mode captures market snapshots." />}
                </div>
              </Panel>

              <Panel>
                <PanelHeader eyebrow="Alert history" title="Notifications and channel outcomes" icon={Bell} />
                <div className="space-y-3">
                  {alertEvents.slice(0, 6).map((alert) => (
                    <div key={alert.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <div className="font-semibold text-white">{alert.title}</div>
                        <div className="text-xs uppercase tracking-wide text-white/45">{alert.status}</div>
                      </div>
                      <div className="text-sm text-white/60">{alert.channel} / {formatTime(alert.createdAt)}</div>
                      <p className="mt-2 text-sm text-white/55">{alert.detail}</p>
                    </div>
                  ))}
                  {!alertEvents.length && <EmptyState label="Risk alerts will appear here when the threshold is crossed." />}
                </div>
              </Panel>

              <Panel>
                <PanelHeader eyebrow="Order audit" title="Dry-run and execution history" icon={History} />
                <div className="space-y-3">
                  {orderHistory.slice(0, 6).map((order) => (
                    <div key={order.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <div className="font-semibold text-white">{order.symbol}</div>
                        <div className="text-xs uppercase tracking-wide text-white/45">{order.status}</div>
                      </div>
                      <div className="text-sm text-white/60">{modeCopy[order.mode].label} / {strategyCopy[order.strategy].label} / {formatTime(order.createdAt)}</div>
                      <p className="mt-2 text-sm text-white/55">{order.detail}</p>
                    </div>
                  ))}
                  {!orderHistory.length && <EmptyState label="Dry-runs and signed orders create a wallet-scoped MongoDB audit history." />}
                </div>
              </Panel>
            </div>
          </div>
        )}

        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{status}</span>
        </div>
      </div>
    </section>
  )
}
