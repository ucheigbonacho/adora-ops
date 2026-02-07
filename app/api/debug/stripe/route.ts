import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

export async function GET() {
  const key = process.env.STRIPE_SECRET_KEY || "";

  const info = {
    hasKey: !!key,
    keyPrefix: key ? key.slice(0, 7) : null,
    keyLength: key ? key.length : 0,
  };

  if (!key) {
    return NextResponse.json({ ok: false, reason: "No key found", ...info }, { status: 500 });
  }

  try {
    const stripe = new Stripe(key, {
      apiVersion: "2026-01-28.clover",
    });

    const acct = await stripe.accounts.retrieve();

    return NextResponse.json({
      ok: true,
      ...info,
      stripeAccountId: acct.id,
      chargesEnabled: acct.charges_enabled,
      payoutsEnabled: acct.payouts_enabled,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, stripeError: e?.message || "Stripe error", ...info },
      { status: 500 }
    );
  }
}
