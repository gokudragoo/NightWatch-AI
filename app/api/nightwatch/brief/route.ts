import { NextResponse } from "next/server"
import { getNightWatchAiBrief } from "@/lib/nightwatch/openai-briefing"
import { guardMutatingRequest } from "@/lib/nightwatch/server-guards"
import type { NightWatchIntel, ProtectionMode, SodexMarket } from "@/lib/nightwatch/types"

export const dynamic = "force-dynamic"

const PROTECTION_MODES = ["safe", "balanced", "aggressive"] as const

function isProtectionMode(value: unknown): value is ProtectionMode {
  return typeof value === "string" && PROTECTION_MODES.includes(value as ProtectionMode)
}

function isUsableIntel(value: unknown): value is NightWatchIntel {
  const intel = value as NightWatchIntel
  return (
    typeof intel === "object" &&
    intel !== null &&
    Number.isFinite(intel.score) &&
    typeof intel.level === "string" &&
    Array.isArray(intel.assets) &&
    Array.isArray(intel.signals) &&
    Array.isArray(intel.actions)
  )
}

function isUsableMarket(value: unknown): value is SodexMarket {
  const market = value as SodexMarket
  return typeof market === "object" && market !== null && Array.isArray(market.tickers)
}

export async function POST(request: Request) {
  const guard = guardMutatingRequest(request, {
    key: "nightwatch-brief",
    maxRequests: 12,
    windowMs: 60_000,
  })
  if (guard) return guard

  try {
    const contentLength = Number(request.headers.get("content-length") || 0)
    if (contentLength > 120_000) {
      return NextResponse.json({ error: "brief payload is too large" }, { status: 413 })
    }

    const payload = (await request.json()) as {
      intel?: NightWatchIntel
      market?: SodexMarket
      mode?: ProtectionMode
      portfolioValue?: number
      sleepMode?: boolean
    }

    if (!isUsableIntel(payload.intel) || !isUsableMarket(payload.market)) {
      return NextResponse.json({ error: "intel and market payloads are required" }, { status: 400 })
    }

    const mode = isProtectionMode(payload.mode) ? payload.mode : "balanced"

    return NextResponse.json(
      await getNightWatchAiBrief({
        intel: payload.intel,
        market: payload.market,
        mode,
        portfolioValue:
          typeof payload.portfolioValue === "number" && Number.isFinite(payload.portfolioValue)
            ? Math.max(0, Math.min(10_000_000, payload.portfolioValue))
            : 0,
        sleepMode: Boolean(payload.sleepMode),
      }),
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create NightWatch AI brief" },
      { status: 400 },
    )
  }
}
