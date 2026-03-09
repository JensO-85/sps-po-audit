import { NextRequest, NextResponse } from "next/server"
import { isLoginRateLimited, makeLoginKey } from "@/lib/rate-limit"

export async function GET(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
  const email = request.nextUrl.searchParams.get("email") ?? ""
  const limited = isLoginRateLimited(makeLoginKey(ip, email))
  return NextResponse.json({ limited })
}
