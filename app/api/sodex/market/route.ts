import { NextResponse } from "next/server"
import { getSodexMarket } from "@/lib/nightwatch/sodex"

export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json(await getSodexMarket())
}
