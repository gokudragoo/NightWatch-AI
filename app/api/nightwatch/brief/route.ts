import { NextResponse } from "next/server"
import { getNightWatchAiBrief } from "@/lib/nightwatch/openai-briefing"
import type { NightWatchIntel, ProtectionMode, SodexMarket } from "@/lib/nightwatch/types"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      intel?: NightWatchIntel
      market?: SodexMarket
      mode?: ProtectionMode
      portfolioValue?: number
      sleepMode?: boolean
    }

    if (!payload.intel || !payload.market) {
      return NextResponse.json({ error: "intel and market payloads are required" }, { status: 400 })
    }

    const mode = payload.mode && ["safe", "balanced", "aggressive"].includes(payload.mode) ? payload.mode : "balanced"

    return NextResponse.json(
      await getNightWatchAiBrief({
        intel: payload.intel,
        market: payload.market,
        mode,
        portfolioValue: typeof payload.portfolioValue === "number" && Number.isFinite(payload.portfolioValue) ? payload.portfolioValue : 0,
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
