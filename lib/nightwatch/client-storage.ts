import type {
  AlertEvent,
  AlertPreferences,
  DryRunOrder,
  ProtectionOrderRecord,
  ProtectionStrategy,
  SleepSession,
} from "./types"

export const DEFAULT_ALERT_PREFERENCES: AlertPreferences = {
  telegram: true,
  email: false,
  browser: true,
  threshold: 65,
}

export const DEFAULT_STRATEGY: ProtectionStrategy = "volatility_hedge"

const STORAGE_PREFIX = "nightwatch.wave2"

function key(name: string) {
  return `${STORAGE_PREFIX}.${name}`
}

function readJson<T>(name: string, fallback: T): T {
  if (typeof window === "undefined") return fallback
  try {
    const raw = window.localStorage.getItem(key(name))
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson<T>(name: string, value: T) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(key(name), JSON.stringify(value))
  } catch {
    // Local persistence is a convenience layer; quota/private-mode failures should not break risk monitoring.
  }
}

export function readStoredPreference<T>(name: string, fallback: T): T {
  return readJson(name, fallback)
}

export function writeStoredPreference<T>(name: string, value: T) {
  writeJson(name, value)
}

export function readSleepSessions() {
  return readJson<SleepSession[]>("sleepSessions", [])
}

export function writeSleepSessions(sessions: SleepSession[]) {
  writeJson("sleepSessions", sessions.slice(0, 12))
}

export function readAlertEvents() {
  return readJson<AlertEvent[]>("alertEvents", [])
}

export function writeAlertEvents(events: AlertEvent[]) {
  writeJson("alertEvents", events.slice(0, 20))
}

export function readDryRuns() {
  return readJson<DryRunOrder[]>("dryRuns", [])
}

export function writeDryRuns(orders: DryRunOrder[]) {
  writeJson("dryRuns", orders.slice(0, 20))
}

export function readOrderHistory() {
  return readJson<ProtectionOrderRecord[]>("orderHistory", [])
}

export function writeOrderHistory(orders: ProtectionOrderRecord[]) {
  writeJson("orderHistory", orders.slice(0, 20))
}
