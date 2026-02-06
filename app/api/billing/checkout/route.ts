// app/api/billing/checkout/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { currencyFromCountry, Currency } from "@/lib/geoCurrency";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

type Plan = "starter" | "standard" | "premium";

function isCurrency(v: string): v is Currency {
  return v === "usd" || v === "cad" || v === "gbp" || v === "ngn";
}

function getPriceId(plan: Plan, currency: Currency) {
  const key = `STRIPE_PRICE_${plan.toUpperCase()}_${currency.toUpperCase()}` as const;
  return process.env[key] || null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const plan = (String(body?.plan || "standard").trim().toLowerCase() as Plan) || "standard";
    const workspace_id = String(body?.workspace_id || "").trim();
    const overrideCurrency = String(body?.currency || "").toLowerCase().trim();

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ ok: false, error: "Missing STRIPE_SECRET_KEY" }, { status: 500 });
    }
    if (!workspace_id) {
      return NextResponse.json({ ok: false, error: "Missing workspace_id" }, { status: 400 });
    }

    // ✅ Always includes scheme (http/https). Fixes "Invalid URL" forever.
    const origin =
      process.env.APP_ORIGIN?.trim() ||
      new URL(req.url).origin;

    const headers = new Headers(req.headers);

    const country =
      headers.get("x-vercel-ip-country") ||
      headers.get("cf-ipcountry") ||
      headers.get("x-country") ||
      "";

    const detected = currencyFromCountry(country || null);
    const currency: Currency = isCurrency(overrideCurrency) ? overrideCurrency : detected;

    // Pick price ID, fallback to USD if currency not configured
    let priceId = getPriceId(plan, currency);
    let finalCurrency: Currency = currency;

    if (!priceId) {
      priceId = getPriceId(plan, "usd");
      finalCurrency = "usd";
    }
    if (!priceId) {
      return NextResponse.json(
        { ok: false, error: `Missing Stripe price env vars for plan=${plan}` },
        { status: 500 }
      );
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/billing?success=1`,
      cancel_url: `${origin}/pricing?canceled=1`,
      client_reference_id: workspace_id,
      metadata: {
        workspace_id,
        plan,
        currency: finalCurrency,
        country: country || "",
      },
    });

    return NextResponse.json({ ok: true, url: session.url, currency: finalCurrency });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
