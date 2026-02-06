// app/api/stripe/checkout/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { currencyFromCountry, Currency } from "@/lib/geoCurrency";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

type Plan = "starter" | "standard" | "premium";

function isCurrency(v: string): v is Currency {
  return v === "usd" || v === "cad" || v === "gbp" || v === "ngn";
}

function isPlan(v: string): v is Plan {
  return v === "starter" || v === "standard" || v === "premium";
}

function getPriceId(plan: Plan, currency: Currency) {
  const key =
    `STRIPE_PRICE_${plan.toUpperCase()}_${currency.toUpperCase()}` as const;
  const priceId = process.env[key];
  return priceId || null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const planRaw = String(body?.plan || "standard").toLowerCase().trim();
    const plan: Plan = isPlan(planRaw) ? planRaw : "standard";

    const workspace_id = String(body?.workspace_id || "").trim();
    const overrideCurrency = String(body?.currency || "").toLowerCase().trim();

    if (!workspace_id) {
      return NextResponse.json(
        { ok: false, error: "Missing workspace_id" },
        { status: 400 }
      );
    }

    // Must be absolute URL (scheme included)
    const headersObj = new Headers(req.headers);
    const origin =
      headersObj.get("origin") ||
      process.env.NEXT_PUBLIC_APP_ORIGIN ||
      process.env.APP_ORIGIN ||
      "http://localhost:3000";

    // geo headers (Vercel/Cloudflare/etc.)
    const country =
      headersObj.get("x-vercel-ip-country") ||
      headersObj.get("cf-ipcountry") ||
      headersObj.get("x-country") ||
      null;

    const detected = currencyFromCountry(country);
    const currency: Currency = isCurrency(overrideCurrency)
      ? overrideCurrency
      : detected;

    // pick priceId, fallback to USD if missing
    let priceId = getPriceId(plan, currency);
    let finalCurrency: Currency = currency;

    if (!priceId) {
      priceId = getPriceId(plan, "usd");
      finalCurrency = "usd";
    }
    if (!priceId) {
      throw new Error(
        `Missing Stripe price env vars for plan=${plan}. Expected STRIPE_PRICE_${plan.toUpperCase()}_${finalCurrency.toUpperCase()}`
      );
    }

    // ✅ 7-day trial (card required by Stripe Checkout)
    // If you want to disable trial for a plan, remove subscription_data for that plan.
    const trialDays =
      plan === "starter" ? 0 : 7; // starter: no trial, standard/premium: 7 days

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],

      ...(trialDays > 0
        ? { subscription_data: { trial_period_days: trialDays } }
        : {}),

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
      trial_days: trialDays,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
