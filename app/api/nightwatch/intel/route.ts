import { NextResponse } from "next/server"
import { getNightWatchIntel } from "@/lib/nightwatch/sosovalue"
import type { ProtectionMode } from "@/lib/nightwatch/types"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const mode = (searchParams.get("mode") || "balanced") as ProtectionMode
  const intel = await getNightWatchIntel(["safe", "balanced", "aggressive"].includes(mode) ? mode : "balanced")

  return NextResponse.json(intel)
}
