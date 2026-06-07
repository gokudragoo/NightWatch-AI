import { NextResponse } from "next/server"
import { z } from "zod"
import type { AlertEvent } from "@/lib/nightwatch/types"
import { requestSignal } from "@/lib/nightwatch/config"
import { guardMutatingRequest } from "@/lib/nightwatch/server-guards"

export const dynamic = "force-dynamic"

const channelSchema = z.enum(["telegram", "email", "browser", "console"])

const alertSchema = z
  .object({
    title: z.string().trim().min(1).max(140).optional(),
    detail: z.string().trim().min(1).max(1200).optional(),
    channels: z.array(channelSchema).max(4).optional(),
  })
  .strict()

function event(channel: AlertEvent["channel"], title: string, detail: string, status: AlertEvent["status"]): AlertEvent {
  return {
    id: `${channel}-${Date.now()}-${crypto.randomUUID()}`,
    createdAt: new Date().toISOString(),
    channel,
    title,
    detail,
    status,
  }
}

async function sendTelegram(title: string, detail: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return false

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: `${title}\n\n${detail}`,
      disable_web_page_preview: true,
    }),
    signal: requestSignal(),
  })

  return response.ok
}

async function sendEmailWebhook(title: string, detail: string) {
  const webhookUrl = process.env.EMAIL_ALERT_WEBHOOK_URL || process.env.ALERT_WEBHOOK_URL
  if (!webhookUrl) return false

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, detail, product: "NightWatch AI" }),
    signal: requestSignal(),
  })

  return response.ok
}

export async function POST(request: Request) {
  const guard = guardMutatingRequest(request, {
    key: "nightwatch-alerts",
    maxRequests: 8,
    windowMs: 60_000,
  })
  if (guard) return guard

  try {
    const contentLength = Number(request.headers.get("content-length") || 0)
    if (contentLength > 8_000) {
      return NextResponse.json({ ok: false, error: "alert payload is too large" }, { status: 413 })
    }

    const payload = alertSchema.parse(await request.json())
    const title = payload.title || "NightWatch risk alert"
    const detail = payload.detail || "Risk threshold reached."
    const channels = [...new Set(payload.channels?.length ? payload.channels : ["console"])]
    const events: AlertEvent[] = []

    for (const channel of channels) {
      if (channel === "telegram") {
        const sent = await sendTelegram(title, detail)
        events.push(event("telegram", title, detail, sent ? "sent" : "queued"))
      } else if (channel === "email") {
        const sent = await sendEmailWebhook(title, detail)
        events.push(event("email", title, detail, sent ? "sent" : "queued"))
      } else if (channel === "browser") {
        events.push(event("browser", title, detail, "preview"))
      } else {
        events.push(event("console", title, detail, "preview"))
      }
    }

    return NextResponse.json({ ok: true, events })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: error.issues[0]?.message || "invalid alert payload" }, { status: 400 })
    }

    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to process alert" },
      { status: 400 },
    )
  }
}
