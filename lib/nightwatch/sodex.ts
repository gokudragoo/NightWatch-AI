import type { SodexMarket, SodexPerpsMarket, SodexPerpsPosition, SodexPerpsTicker, SodexTicker } from "./types"
import { requestSignal, SODEX_PERPS_BASE_URL, SODEX_SPOT_BASE_URL } from "./config"
import { VALUECHAIN_TESTNET } from "./valuechain"

async function fetchSodex<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers || {}),
    },
    signal: init?.signal || requestSignal(),
    cache: "no-store",
  })

  const json = await response.json().catch(() => null)
  if (!response.ok || (typeof json?.code === "number" && json.code !== 0)) {
    throw new Error(json?.message || json?.error || response.statusText || `SoDEX request failed: ${path}`)
  }

  return (json?.data ?? json) as T
}

function asNumber(value: unknown, fallback = 0) {
  const num = typeof value === "number" ? value : Number(value)
  return Number.isFinite(num) ? num : fallback
}

function queryString(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") search.set(key, String(value))
  })
  const value = search.toString()
  return value ? `?${value}` : ""
}

export function isEvmAddress(address: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(address)
}

export async function getSodexMarket(): Promise<SodexMarket> {
  try {
    const [symbols, tickers] = await Promise.all([
      fetchSodex<Array<Record<string, unknown>>>(SODEX_SPOT_BASE_URL, "/markets/symbols"),
      fetchSodex<Array<Record<string, unknown>>>(SODEX_SPOT_BASE_URL, "/markets/tickers"),
    ])

    const symbolMap = new Map(symbols.map((symbol) => [String(symbol.name), symbol]))
    const preferred = ["vBTC_vUSDC", "vETH_vUSDC", "vSOL_vUSDC", "WSOSO_vUSDC", "vDEFIssi_vUSDC", "vMEMEssi_vUSDC"]
    const ordered = tickers
      .filter((ticker) => preferred.includes(String(ticker.symbol)))
      .sort((a, b) => preferred.indexOf(String(a.symbol)) - preferred.indexOf(String(b.symbol)))
      .map<SodexTicker>((ticker) => {
        const symbol = symbolMap.get(String(ticker.symbol))
        return {
          symbol: String(ticker.symbol),
          displayName: String(symbol?.displayName || ticker.symbol || "Unknown"),
          lastPx: asNumber(ticker.lastPx),
          changePct: asNumber(ticker.changePct),
          volume: asNumber(ticker.volume),
          quoteVolume: asNumber(ticker.quoteVolume),
          bidPx: asNumber(ticker.bidPx),
          askPx: asNumber(ticker.askPx),
          symbolID: asNumber(symbol?.id),
          baseCoin: typeof symbol?.baseCoin === "string" ? symbol.baseCoin : undefined,
          quoteCoin: typeof symbol?.quoteCoin === "string" ? symbol.quoteCoin : undefined,
          quantityPrecision: asNumber(symbol?.quantityPrecision),
          stepSize: typeof symbol?.stepSize === "string" ? symbol.stepSize : undefined,
          minQuantity: typeof symbol?.minQuantity === "string" ? symbol.minQuantity : undefined,
          marketMinQuantity: typeof symbol?.marketMinQuantity === "string" ? symbol.marketMinQuantity : undefined,
          minNotional: typeof symbol?.minNotional === "string" ? symbol.minNotional : undefined,
          status: typeof symbol?.status === "string" ? symbol.status : undefined,
        }
      })
      .filter((ticker) => !ticker.status || ticker.status === "TRADING")

    return {
      sourceStatus: "live",
      generatedAt: new Date().toISOString(),
      tickers: ordered,
      liquidityNotes: [
        { label: "SoDEX venue", value: "ValueChain testnet spot order book", impact: "positive" },
        { label: "Settlement", value: "Transparent on-chain order workflow", impact: "positive" },
        { label: "Protection route", value: "Signed EIP-712 order payloads", impact: "neutral" },
      ],
    }
  } catch (error) {
    return {
      sourceStatus: "fallback",
      generatedAt: new Date().toISOString(),
      tickers: [],
      liquidityNotes: [
        {
          label: "SoDEX stream",
          value: error instanceof Error ? error.message : "Gateway fallback active",
          impact: "warning",
        },
      ],
    }
  }
}

export async function getSodexAccount(address: string) {
  if (!isEvmAddress(address)) {
    throw new Error("Invalid EVM address")
  }

  return fetchSodex<Record<string, unknown>>(SODEX_SPOT_BASE_URL, `/accounts/${address}/state`)
}

function toPerpsPosition(position: Record<string, unknown>): SodexPerpsPosition {
  const quantity = asNumber(position.quantity ?? position.positionAmt ?? position.size ?? position.qty)
  const side = quantity > 0 ? "long" : quantity < 0 ? "short" : "flat"
  return {
    symbol: String(position.symbol || position.symbolName || "PERP"),
    side,
    notionalUsd: Math.abs(asNumber(position.notionalUsd ?? position.notional ?? position.positionValue)),
    entryPx: asNumber(position.entryPx ?? position.entryPrice),
    markPx: asNumber(position.markPx ?? position.markPrice),
    leverage: asNumber(position.leverage),
    unrealizedPnl: asNumber(position.unrealizedPnl ?? position.pnl),
  }
}

export async function getSodexPerpsMarket(input: { address?: string; accountId?: string } = {}): Promise<SodexPerpsMarket> {
  try {
    const [symbols, tickers, markPrices] = await Promise.all([
      fetchSodex<Array<Record<string, unknown>>>(SODEX_PERPS_BASE_URL, "/markets/symbols"),
      fetchSodex<Array<Record<string, unknown>>>(SODEX_PERPS_BASE_URL, "/markets/tickers"),
      fetchSodex<Array<Record<string, unknown>>>(SODEX_PERPS_BASE_URL, "/markets/mark-prices").catch(() => []),
    ])

    const symbolMap = new Map(symbols.map((symbol) => [String(symbol.name || symbol.symbol), symbol]))
    const markMap = new Map(markPrices.map((mark) => [String(mark.symbol), mark]))
    const ordered = tickers
      .map<SodexPerpsTicker>((ticker) => {
        const symbol = String(ticker.symbol || ticker.name)
        const symbolRules = symbolMap.get(symbol)
        const mark = markMap.get(symbol)
        return {
          symbol,
          displayName: String(symbolRules?.displayName || symbol),
          lastPx: asNumber(ticker.lastPx ?? ticker.price),
          changePct: asNumber(ticker.changePct ?? ticker.priceChangePercent),
          volume: asNumber(ticker.volume),
          quoteVolume: asNumber(ticker.quoteVolume),
          bidPx: asNumber(ticker.bidPx),
          askPx: asNumber(ticker.askPx),
          symbolID: asNumber(symbolRules?.id),
          markPx: asNumber(mark?.markPx ?? mark?.markPrice ?? mark?.price),
          maxLeverage: asNumber(symbolRules?.maxLeverage),
          quantityPrecision: asNumber(symbolRules?.quantityPrecision),
          stepSize: typeof symbolRules?.stepSize === "string" ? symbolRules.stepSize : undefined,
          minQuantity: typeof symbolRules?.minQuantity === "string" ? symbolRules.minQuantity : undefined,
          marketMinQuantity: typeof symbolRules?.marketMinQuantity === "string" ? symbolRules.marketMinQuantity : undefined,
          minNotional: typeof symbolRules?.minNotional === "string" ? symbolRules.minNotional : undefined,
          status: typeof symbolRules?.status === "string" ? symbolRules.status : undefined,
        }
      })
      .filter((ticker) => !ticker.status || ticker.status === "TRADING")
      .sort((a, b) => Math.abs(b.quoteVolume) - Math.abs(a.quoteVolume))
      .slice(0, 6)

    const canLoadPositions = input.address && isEvmAddress(input.address)
    const positions = canLoadPositions
      ? await fetchSodex<Array<Record<string, unknown>>>(
          SODEX_PERPS_BASE_URL,
          `/accounts/${input.address}/positions${queryString({ accountID: input.accountId })}`,
        )
          .then((items) => items.map(toPerpsPosition))
          .catch(() => [])
      : []

    return {
      sourceStatus: "live",
      generatedAt: new Date().toISOString(),
      tickers: ordered,
      positions,
      protectionNotes: [
        { label: "Perps market", value: "Live SoDEX testnet perps tickers and mark prices", impact: "positive" },
        { label: "Hedge route", value: "Dry-run prepares futures domain payloads before any signature", impact: "neutral" },
        { label: "Leverage guard", value: "Leverage reduction and TP/SL edits remain explicit signed actions", impact: "positive" },
      ],
    }
  } catch (error) {
    return {
      sourceStatus: "fallback",
      generatedAt: new Date().toISOString(),
      tickers: [],
      positions: [],
      protectionNotes: [
        {
          label: "Perps stream",
          value: error instanceof Error ? error.message : "Perps gateway fallback active",
          impact: "warning",
        },
      ],
    }
  }
}

export async function submitSignedSpotOrder(input: {
  body: Record<string, unknown>
  nonce: number
  signature: string
  apiKeyName?: string
}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-API-Sign": input.signature,
    "X-API-Nonce": String(input.nonce),
    "X-API-Chain": String(VALUECHAIN_TESTNET.chainId),
  }

  if (input.apiKeyName) {
    headers["X-API-Key"] = input.apiKeyName
  }

  return fetchSodex<Array<Record<string, unknown>>>(SODEX_SPOT_BASE_URL, "/trade/orders/batch", {
    method: "POST",
    headers,
    body: JSON.stringify(input.body),
  })
}
