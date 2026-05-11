import { NextResponse } from "next/server"
import { getSodexAccount } from "@/lib/nightwatch/sodex"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const address = searchParams.get("address")

  if (!address) {
    return NextResponse.json({ error: "address is required" }, { status: 400 })
  }

  try {
    return NextResponse.json(await getSodexAccount(address))
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load SoDEX account" },
      { status: 400 },
    )
  }
}
