import { NextResponse } from "next/server"
import { submitSignedSpotOrder } from "@/lib/nightwatch/sodex"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const result = await submitSignedSpotOrder({
      body: body.body,
      nonce: body.nonce,
      signature: body.signature,
      apiKeyName: body.apiKeyName,
    })

    return NextResponse.json({ ok: true, result })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to submit signed SoDEX order" },
      { status: 400 },
    )
  }
}
