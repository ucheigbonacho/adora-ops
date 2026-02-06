// app/api/geo/route.ts
import { NextResponse } from "next/server";
import { currencyFromCountry } from "@/lib/geoCurrency";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const headers = new Headers(req.headers);
  const country =
    headers.get("x-vercel-ip-country") ||
    headers.get("cf-ipcountry") ||
    headers.get("x-country") ||
    null;

  const currency = currencyFromCountry(country);
  return NextResponse.json({ ok: true, country, currency });
}
