import { NextResponse } from "next/server";
import Stripe from "stripe";
import { currencyFromCountry, Currency } from "@/lib/geoCurrency";

export const runtime = "nodejs";

// 🚫 DO NOT set apiVersion here — Stripe SDK types handle it automatically
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

    const plan = String(body?.plan || "standard") as Plan;
    const workspace_id = String(body?.workspace_id || "").trim();
    const overrideCurrency = String(body?.currency || "").toLowerCase().trim();

    if (!workspace_id) {
      return NextResponse.json(
        { ok: false, error: "Missing workspace_id" },
        { status: 400 }
      );
    }

    const headers = new Headers(req.headers);
    const origin =
      headers.get("origin") ||
      process.env.APP_ORIGIN ||
      "http://localhost:3000";

    // 🌍 Detect user country → choose currency
    const country =
      headers.get("x-vercel-ip-country") ||
      headers.get("cf-ipcountry") ||
      headers.get("x-country") ||
      null;

    const detectedCurrency = currencyFromCountry(country);
    const currency: Currency = isCurrency(overrideCurrency)
      ? overrideCurrency
      : detectedCurrency;

    // 💰 Get Stripe Price ID for plan + currency
    let priceId = getPriceId(plan, currency);
    let finalCurrency = currency;

    // Fallback to USD if not configured
    if (!priceId) {
      priceId = getPriceId(plan, "usd");
      finalCurrency = "usd";
    }

    if (!priceId) {
      throw new Error(`Missing Stripe price env vars for plan=${plan}`);
    }

    // 🚀 Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],

      // 🎁 7-day free trial
      subscription_data: {
        trial_period_days: 7,
        metadata: {
          workspace_id,
          plan,
        },
      },

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

    return NextResponse.json({
      ok: true,
      url: session.url,
      currency: finalCurrency,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
