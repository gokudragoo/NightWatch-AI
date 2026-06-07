import { NextResponse } from "next/server"
import { z } from "zod"
import { issueDryRunReceipt } from "@/lib/nightwatch/dry-run-receipt"
import { guardMutatingRequest } from "@/lib/nightwatch/server-guards"

export const dynamic = "force-dynamic"

const decimalStringSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/, "quantity must be a positive decimal string")
  .refine((value) => Number(value) > 0, "quantity must be greater than zero")

const dryRunSchema = z
  .object({
    venue: z.enum(["SoDEX spot", "SoDEX perps"]),
    symbol: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/),
    symbolID: z.number().int().positive().safe().optional(),
    mode: z.enum(["safe", "balanced", "aggressive"]),
    strategy: z.enum(["capital_preservation", "profit_lock", "volatility_hedge", "narrative_rotation"]),
    quantity: decimalStringSchema,
    endpoint: z.string().trim().min(1).max(128),
  })
  .strict()
  .refine((value) => value.venue !== "SoDEX spot" || Number.isSafeInteger(value.symbolID), {
    message: "spot dry-runs require a symbolID",
    path: ["symbolID"],
  })

export async function POST(request: Request) {
  const guard = guardMutatingRequest(request, {
    key: "nightwatch-dry-run",
    maxRequests: 30,
    windowMs: 60_000,
  })
  if (guard) return guard

  try {
    const contentLength = Number(request.headers.get("content-length") || 0)
    if (contentLength > 12_000) {
      return NextResponse.json({ ok: false, error: "dry-run payload is too large" }, { status: 413 })
    }

    const payload = dryRunSchema.parse(await request.json())
    return NextResponse.json({ ok: true, receipt: issueDryRunReceipt(payload) })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: error.issues[0]?.message || "invalid dry-run payload" }, { status: 400 })
    }

    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to issue dry-run receipt" },
      { status: 400 },
    )
  }
}
