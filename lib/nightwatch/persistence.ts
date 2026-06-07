import { z } from "zod"
import { getPersistenceCollection, isPersistenceConfigured } from "./mongodb"
import type { NightWatchPersistenceState } from "./types"

const protectionModeSchema = z.enum(["safe", "balanced", "aggressive"])
const protectionStrategySchema = z.enum(["capital_preservation", "profit_lock", "volatility_hedge", "narrative_rotation"])
const isoStringSchema = z.string().trim().min(1).max(64)
const decimalStringSchema = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/)

export const walletAddressSchema = z.string().trim().regex(/^0x[a-fA-F0-9]{40}$/)

const alertPreferencesSchema = z
  .object({
    telegram: z.boolean(),
    email: z.boolean(),
    browser: z.boolean(),
    threshold: z.number().finite().int().min(38).max(90),
  })
  .strict()

const settingsSchema = z
  .object({
    mode: protectionModeSchema,
    strategy: protectionStrategySchema,
    sleepMode: z.boolean(),
    dryRunMode: z.boolean(),
    portfolioValue: z.number().finite().int().min(2_000).max(250_000),
    accountId: z.string().regex(/^\d{0,18}$/),
    apiKeyName: z.string().regex(/^(?:|[0-9A-Za-z_-]{1,36})$/),
    selectedSymbol: z.string().trim().min(1).max(64),
    alertPreferences: alertPreferencesSchema,
  })
  .strict()

const alertEventSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    createdAt: isoStringSchema,
    channel: z.enum(["telegram", "email", "browser", "console"]),
    title: z.string().trim().min(1).max(160),
    detail: z.string().trim().min(1).max(1_000),
    status: z.enum(["sent", "queued", "preview", "failed"]),
  })
  .strict()

const dryRunReceiptSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    issuedAt: isoStringSchema,
    expiresAt: isoStringSchema,
    venue: z.enum(["SoDEX spot", "SoDEX perps"]),
    symbol: z.string().trim().min(1).max(64),
    symbolID: z.number().int().positive().safe().optional(),
    mode: protectionModeSchema,
    strategy: protectionStrategySchema,
    quantity: decimalStringSchema,
    endpoint: z.string().trim().min(1).max(128),
    signature: z.string().trim().min(32).max(256),
  })
  .strict()

const dryRunSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    createdAt: isoStringSchema,
    venue: z.enum(["SoDEX spot", "SoDEX perps"]),
    symbol: z.string().trim().min(1).max(64),
    symbolID: z.number().int().positive().safe().optional(),
    mode: protectionModeSchema,
    strategy: protectionStrategySchema,
    notionalUsd: z.number().finite().min(0).max(1_000_000),
    quantity: decimalStringSchema,
    side: z.enum(["sell", "buy", "reduce", "hedge"]),
    endpoint: z.string().trim().min(1).max(128),
    rationale: z.string().trim().min(1).max(1_000),
    estimatedSlippageBps: z.number().finite().int().min(0).max(10_000),
    guardrails: z.array(z.string().trim().min(1).max(180)).max(12),
    receipt: dryRunReceiptSchema.optional(),
  })
  .strict()

const protectionOrderRecordSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    createdAt: isoStringSchema,
    symbol: z.string().trim().min(1).max(64),
    mode: protectionModeSchema,
    strategy: protectionStrategySchema,
    status: z.enum(["dry-run", "signed", "submitted", "failed"]),
    clOrdID: z.string().trim().min(1).max(48).optional(),
    txReference: z.string().trim().min(1).max(160).optional(),
    detail: z.string().trim().min(1).max(1_000),
  })
  .strict()

const sleepSessionSnapshotSchema = z
  .object({
    createdAt: isoStringSchema,
    score: z.number().finite().int().min(0).max(100),
    level: z.enum(["Calm", "Guarded", "High Alert", "Critical"]),
    summary: z.string().trim().min(1).max(1_000),
  })
  .strict()

const sleepSessionSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    startedAt: isoStringSchema,
    endedAt: isoStringSchema.optional(),
    mode: protectionModeSchema,
    strategy: protectionStrategySchema,
    portfolioValue: z.number().finite().int().min(0).max(10_000_000),
    alertThreshold: z.number().finite().int().min(0).max(100),
    snapshots: z.array(sleepSessionSnapshotSchema).max(12),
  })
  .strict()

export const persistenceStateSchema = z
  .object({
    settings: settingsSchema,
    sessions: z.array(sleepSessionSchema).max(12),
    alertEvents: z.array(alertEventSchema).max(20),
    dryRuns: z.array(dryRunSchema).max(20),
    orderHistory: z.array(protectionOrderRecordSchema).max(20),
    updatedAt: isoStringSchema.optional(),
  })
  .strict()

export const persistenceWriteSchema = z
  .object({
    wallet: walletAddressSchema,
    state: persistenceStateSchema,
  })
  .strict()

export function sanitizeWallet(wallet: string) {
  return walletAddressSchema.parse(wallet).toLowerCase()
}

export function sanitizePersistenceState(state: unknown): NightWatchPersistenceState {
  return {
    ...persistenceStateSchema.parse(state),
    updatedAt: new Date().toISOString(),
  }
}

export async function readPersistenceState(wallet: string) {
  if (!isPersistenceConfigured()) return null
  const collection = await getPersistenceCollection()
  const document = await collection.findOne(
    { wallet: sanitizeWallet(wallet) },
    { projection: { _id: 0, state: 1, updatedAt: 1 } },
  )
  return document?.state || null
}

export async function writePersistenceState(wallet: string, state: NightWatchPersistenceState) {
  if (!isPersistenceConfigured()) return null
  const collection = await getPersistenceCollection()
  const sanitizedWallet = sanitizeWallet(wallet)
  const sanitizedState = sanitizePersistenceState(state)
  const now = new Date()
  await collection.updateOne(
    { wallet: sanitizedWallet },
    {
      $set: {
        wallet: sanitizedWallet,
        state: sanitizedState,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  )
  return sanitizedState
}
