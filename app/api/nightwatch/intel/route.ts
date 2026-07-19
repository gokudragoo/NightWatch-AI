import { NextResponse } from "next/server"
import { getNightWatchIntel } from "@/lib/nightwatch/sosovalue"
import { guardRateLimitedRequest } from "@/lib/nightwatch/server-guards"
import type { ProtectionMode } from "@/lib/nightwatch/types"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const guard = guardRateLimitedRequest(request, {
    key: "nightwatch-intel-read",
    maxRequests: 20,
    windowMs: 60_000,
  })
  if (guard) return guard

  const { searchParams } = new URL(request.url)
  const mode = (searchParams.get("mode") || "balanced") as ProtectionMode
  const intel = await getNightWatchIntel(["safe", "balanced", "aggressive"].includes(mode) ? mode : "balanced")

  return NextResponse.json(intel)
}
