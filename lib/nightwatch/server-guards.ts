import { timingSafeEqual } from "crypto"
import { NextResponse } from "next/server"

type RateLimitOptions = {
  key: string
  maxRequests: number
  windowMs: number
}

const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>()

function errorResponse(error: string, status: number, headers?: HeadersInit) {
  return NextResponse.json({ ok: false, error }, { status, headers })
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function readBearerToken(value: string | null) {
  if (!value) return ""
  const match = value.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || ""
}

function hasValidApiToken(request: Request) {
  const expected = process.env.NIGHTWATCH_API_TOKEN
  if (!expected) return false

  const provided =
    readBearerToken(request.headers.get("authorization")) || request.headers.get("x-nightwatch-token")?.trim() || ""

  return provided ? safeEqual(provided, expected) : false
}

function normalizeOrigin(value: string | null) {
  if (!value) return ""
  try {
    return new URL(value).origin
  } catch {
    return ""
  }
}

function isLocalhost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
}

function allowedOrigins(request: Request) {
  const requestOrigin = new URL(request.url).origin
  const configured = (process.env.NIGHTWATCH_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean)

  return new Set([requestOrigin, ...configured])
}

function hasTrustedOrigin(request: Request) {
  const requestUrl = new URL(request.url)
  const allowed = allowedOrigins(request)
  const origin = normalizeOrigin(request.headers.get("origin"))
  const refererOrigin = normalizeOrigin(request.headers.get("referer"))
  const localRuntime = process.env.VERCEL_ENV !== "production"

  if (origin) {
    const originUrl = new URL(origin)
    return allowed.has(origin) || (localRuntime && isLocalhost(originUrl.hostname))
  }

  if (refererOrigin) {
    const refererUrl = new URL(refererOrigin)
    return allowed.has(refererOrigin) || (localRuntime && isLocalhost(refererUrl.hostname))
  }

  return localRuntime || isLocalhost(requestUrl.hostname)
}

function clientKey(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return forwardedFor || request.headers.get("x-real-ip") || "unknown-client"
}

function checkRateLimit(request: Request, options: RateLimitOptions) {
  const now = Date.now()
  const key = `${options.key}:${clientKey(request)}`
  const bucket = rateLimitBuckets.get(key)

  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + options.windowMs })
    return null
  }

  if (bucket.count >= options.maxRequests) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
    return errorResponse("rate limit exceeded", 429, { "Retry-After": String(retryAfterSeconds) })
  }

  bucket.count += 1
  return null
}

export function guardMutatingRequest(request: Request, options: RateLimitOptions) {
  if (!hasValidApiToken(request) && !hasTrustedOrigin(request)) {
    return errorResponse("untrusted request origin", 403)
  }

  return checkRateLimit(request, options)
}
