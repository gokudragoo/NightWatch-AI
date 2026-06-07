function readBoundedNumber(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

export const NIGHTWATCH_REQUEST_TIMEOUT_MS = readBoundedNumber(
  process.env.NIGHTWATCH_REQUEST_TIMEOUT_MS,
  12_000,
  1_000,
  30_000,
)

export const SOSOVALUE_BASE_URL = process.env.SOSOVALUE_BASE_URL || "https://openapi.sosovalue.com/openapi/v1"

export const SODEX_SPOT_BASE_URL =
  process.env.SODEX_SPOT_BASE_URL || "https://testnet-gw.sodex.dev/api/v1/spot"

export const SODEX_PERPS_BASE_URL =
  process.env.SODEX_PERPS_BASE_URL || "https://testnet-gw.sodex.dev/api/v1/perps"

export const OPENAI_RESPONSES_URL = process.env.OPENAI_RESPONSES_URL || "https://api.openai.com/v1/responses"

export const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini"

export function requestSignal(timeoutMs = NIGHTWATCH_REQUEST_TIMEOUT_MS) {
  return AbortSignal.timeout(readBoundedNumber(String(timeoutMs), NIGHTWATCH_REQUEST_TIMEOUT_MS, 1_000, 30_000))
}
