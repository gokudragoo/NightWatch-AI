import { NextResponse } from "next/server"
import { z } from "zod"
import { verifyDryRunReceipt } from "@/lib/nightwatch/dry-run-receipt"
import { guardMutatingRequest } from "@/lib/nightwatch/server-guards"
import { submitSignedSpotOrder } from "@/lib/nightwatch/sodex"

export const dynamic = "force-dynamic"

const decimalStringSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/, "quantity must be a positive decimal string")
  .refine((value) => Number(value) > 0, "quantity must be greater than zero")

const orderBodySchema = z
  .object({
    accountID: z.number().int().positive().safe(),
    orders: z
      .array(
        z
          .object({
            symbolID: z.number().int().positive().safe(),
            clOrdID: z.string().trim().min(1).max(36).regex(/^[0-9A-Za-z_-]+$/),
            side: z.number().int().min(1).max(2),
            type: z.number().int().min(1).max(5),
            timeInForce: z.number().int().min(1).max(5),
            quantity: decimalStringSchema,
          })
          .strict(),
      )
      .length(1),
  })
  .strict()

const dryRunReceiptSchema = z
  .object({
    id: z.string().trim().min(1).max(96),
    issuedAt: z.string().trim().min(1).max(64),
    expiresAt: z.string().trim().min(1).max(64),
    venue: z.enum(["SoDEX spot", "SoDEX perps"]),
    symbol: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/),
    symbolID: z.number().int().positive().safe().optional(),
    mode: z.enum(["safe", "balanced", "aggressive"]),
    strategy: z.enum(["capital_preservation", "profit_lock", "volatility_hedge", "narrative_rotation"]),
    quantity: decimalStringSchema,
    endpoint: z.string().trim().min(1).max(128),
    signature: z.string().regex(/^[a-f0-9]{64}$/i),
  })
  .strict()

const submitSchema = z
  .object({
    body: orderBodySchema,
    dryRunReceipt: dryRunReceiptSchema,
    nonce: z.number().int().positive().safe(),
    signature: z.string().regex(/^0x(?:01)?[0-9a-fA-F]{130}$/, "signature must be a 65-byte hex signature, optionally prefixed with the SoDEX version byte"),
    apiKeyName: z
      .string()
      .trim()
      .min(1)
      .max(36)
      .regex(/^[0-9A-Za-z_-]+$/)
      .refine((value) => value !== "default", "apiKeyName cannot be default"),
  })
  .strict()

export async function POST(request: Request) {
  const guard = guardMutatingRequest(request, {
    key: "sodex-submit-order",
    maxRequests: 10,
    windowMs: 60_000,
  })
  if (guard) return guard

  try {
    const contentLength = Number(request.headers.get("content-length") || 0)
    if (contentLength > 32_000) {
      return NextResponse.json({ ok: false, error: "order payload is too large" }, { status: 413 })
    }

    const body = submitSchema.parse(await request.json())
    const order = body.body.orders[0]
    const receiptStatus = verifyDryRunReceipt(body.dryRunReceipt)

    if (!receiptStatus.ok) {
      return NextResponse.json({ ok: false, error: receiptStatus.error }, { status: 400 })
    }

    if (
      body.dryRunReceipt.venue !== "SoDEX spot" ||
      body.dryRunReceipt.endpoint !== "/trade/orders/batch" ||
      body.dryRunReceipt.quantity !== order.quantity ||
      body.dryRunReceipt.symbolID !== order.symbolID
    ) {
      return NextResponse.json({ ok: false, error: "signed order does not match the dry-run receipt" }, { status: 400 })
    }

    const result = await submitSignedSpotOrder({
      body: body.body,
      nonce: body.nonce,
      signature: body.signature,
      apiKeyName: body.apiKeyName,
    })

    return NextResponse.json({ ok: true, result })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: error.issues[0]?.message || "invalid order payload" }, { status: 400 })
    }

    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to submit signed SoDEX order" },
      { status: 400 },
    )
  }
}
