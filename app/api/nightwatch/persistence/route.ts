import { NextResponse } from "next/server"
import { z } from "zod"
import { isPersistenceConfigured } from "@/lib/nightwatch/mongodb"
import {
  persistenceWriteSchema,
  readPersistenceState,
  sanitizeWallet,
  writePersistenceState,
} from "@/lib/nightwatch/persistence"
import { guardMutatingRequest } from "@/lib/nightwatch/server-guards"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const guard = guardMutatingRequest(request, {
    key: "nightwatch-persistence-read",
    maxRequests: 60,
    windowMs: 60_000,
  })
  if (guard) return guard

  try {
    const { searchParams } = new URL(request.url)
    const wallet = sanitizeWallet(searchParams.get("wallet") || "")
    const state = await readPersistenceState(wallet)
    return NextResponse.json({
      ok: true,
      sourceStatus: isPersistenceConfigured() ? "mongodb" : "local-only",
      state,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "valid wallet address is required" }, { status: 400 })
    }
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load persistence profile" },
      { status: 500 },
    )
  }
}

export async function PUT(request: Request) {
  const guard = guardMutatingRequest(request, {
    key: "nightwatch-persistence-write",
    maxRequests: 40,
    windowMs: 60_000,
  })
  if (guard) return guard

  try {
    const contentLength = Number(request.headers.get("content-length") || 0)
    if (contentLength > 180_000) {
      return NextResponse.json({ ok: false, error: "persistence payload is too large" }, { status: 413 })
    }

    const payload = persistenceWriteSchema.parse(await request.json())
    const state = await writePersistenceState(payload.wallet, payload.state)
    return NextResponse.json({
      ok: true,
      sourceStatus: isPersistenceConfigured() ? "mongodb" : "local-only",
      persisted: Boolean(state),
      state,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: error.issues[0]?.message || "invalid persistence payload" },
        { status: 400 },
      )
    }
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to save persistence profile" },
      { status: 500 },
    )
  }
}
