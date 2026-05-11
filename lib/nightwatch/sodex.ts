import type { SodexMarket, SodexTicker } from "./types"

export const VALUECHAIN_TESTNET = {
  chainId: 138565,
  chainIdHex: "0x21d45",
  chainName: "ValueChain Testnet",
  rpcUrl: "https://testnet.valuechain.xyz",
  nativeCurrency: {
    name: "SOSO",
    symbol: "SOSO",
    decimals: 18,
  },
}

const SODEX_BASE_URL = "https://testnet-gw.sodex.dev/api/v1/spot"

async function fetchSodex<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${SODEX_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers || {}),
    },
    next: { revalidate: 20 },
  })

  const json = await response.json()
  if (!response.ok || (typeof json?.code === "number" && json.code !== 0)) {
    throw new Error(json?.message || json?.error || `SoDEX request failed: ${path}`)
  }

  return (json?.data ?? json) as T
}

function asNumber(value: unknown, fallback = 0) {
  const num = typeof value === "number" ? value : Number(value)
  return Number.isFinite(num) ? num : fallback
}

export async function getSodexMarket(): Promise<SodexMarket> {
  try {
    const [symbols, tickers] = await Promise.all([
      fetchSodex<Array<Record<string, unknown>>>("/markets/symbols"),
      fetchSodex<Array<Record<string, unknown>>>("/markets/tickers"),
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
        }
      })

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
      tickers: [
        { symbol: "vBTC_vUSDC", displayName: "BTC/USDC", lastPx: 96622, changePct: 7.35, volume: 0.00412, quoteVolume: 12448, symbolID: 1 },
        { symbol: "vETH_vUSDC", displayName: "ETH/USDC", lastPx: 2332.6, changePct: -0.71, volume: 382, quoteVolume: 895433, symbolID: 2 },
        { symbol: "WSOSO_vUSDC", displayName: "SOSO/USDC", lastPx: 0.3675, changePct: -6.96, volume: 3707567, quoteVolume: 1464657, symbolID: 4 },
      ],
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
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error("Invalid EVM address")
  }

  return fetchSodex<Record<string, unknown>>(`/accounts/${address}/state`)
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

  return fetchSodex<Array<Record<string, unknown>>>("/trade/orders/batch", {
    method: "POST",
    headers,
    body: JSON.stringify(input.body),
  })
}
