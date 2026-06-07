import { NextResponse } from "next/server"
import { getSodexPerpsMarket, isEvmAddress } from "@/lib/nightwatch/sodex"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const address = searchParams.get("address") || undefined
  const accountId = searchParams.get("accountId") || undefined

  if (address && !isEvmAddress(address)) {
    return NextResponse.json({ error: "valid EVM address is required" }, { status: 400 })
  }

  if (accountId && !/^\d{1,18}$/.test(accountId)) {
    return NextResponse.json({ error: "valid SoDEX account ID is required" }, { status: 400 })
  }

  return NextResponse.json(await getSodexPerpsMarket({ address, accountId }))
}
