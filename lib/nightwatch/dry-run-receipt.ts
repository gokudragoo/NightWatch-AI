import { createHmac, randomUUID, timingSafeEqual } from "crypto"
import type { DryRunReceipt, ProtectionMode, ProtectionStrategy } from "./types"

const RECEIPT_TTL_MS = 10 * 60 * 1000
const LOCAL_DEV_SECRET = "nightwatch-local-dry-run-receipt"

type DryRunReceiptInput = {
  venue: "SoDEX spot" | "SoDEX perps"
  symbol: string
  symbolID?: number
  mode: ProtectionMode
  strategy: ProtectionStrategy
  quantity: string
  endpoint: string
}

function readSecret() {
  if (process.env.NIGHTWATCH_DRY_RUN_SECRET) return process.env.NIGHTWATCH_DRY_RUN_SECRET
  if (process.env.VERCEL_ENV !== "production") return LOCAL_DEV_SECRET
  return ""
}

function unsignedReceipt(receipt: Omit<DryRunReceipt, "signature">) {
  return JSON.stringify({
    id: receipt.id,
    issuedAt: receipt.issuedAt,
    expiresAt: receipt.expiresAt,
    venue: receipt.venue,
    symbol: receipt.symbol,
    symbolID: receipt.symbolID,
    mode: receipt.mode,
    strategy: receipt.strategy,
    quantity: receipt.quantity,
    endpoint: receipt.endpoint,
  })
}

function sign(receipt: Omit<DryRunReceipt, "signature">) {
  const secret = readSecret()
  if (!secret) {
    throw new Error("NIGHTWATCH_DRY_RUN_SECRET is required to issue dry-run receipts")
  }

  return createHmac("sha256", secret).update(unsignedReceipt(receipt)).digest("hex")
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex")
  const rightBuffer = Buffer.from(right, "hex")
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

export function issueDryRunReceipt(input: DryRunReceiptInput): DryRunReceipt {
  const issuedAt = new Date()
  const receipt = {
    id: `receipt-${randomUUID()}`,
    issuedAt: issuedAt.toISOString(),
    expiresAt: new Date(issuedAt.getTime() + RECEIPT_TTL_MS).toISOString(),
    venue: input.venue,
    symbol: input.symbol,
    symbolID: input.symbolID,
    mode: input.mode,
    strategy: input.strategy,
    quantity: input.quantity,
    endpoint: input.endpoint,
  }

  return { ...receipt, signature: sign(receipt) }
}

export function verifyDryRunReceipt(receipt: DryRunReceipt) {
  const expiresAt = new Date(receipt.expiresAt).getTime()
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return { ok: false, error: "dry-run receipt expired" }
  }

  if (!/^[a-f0-9]{64}$/i.test(receipt.signature)) {
    return { ok: false, error: "dry-run receipt signature is invalid" }
  }

  const unsigned = {
    id: receipt.id,
    issuedAt: receipt.issuedAt,
    expiresAt: receipt.expiresAt,
    venue: receipt.venue,
    symbol: receipt.symbol,
    symbolID: receipt.symbolID,
    mode: receipt.mode,
    strategy: receipt.strategy,
    quantity: receipt.quantity,
    endpoint: receipt.endpoint,
  }
  const expected = sign(unsigned)
  if (!safeEqual(receipt.signature, expected)) {
    return { ok: false, error: "dry-run receipt does not match the signed preview" }
  }

  return { ok: true as const }
}
