// app/api/stripe/portal/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const stripe_customer_id = String(body?.stripe_customer_id || "").trim();

    if (!stripe_customer_id) {
      return NextResponse.json(
        { ok: false, error: "Missing stripe_customer_id" },
        { status: 400 }
      );
    }

    const origin = req.headers.get("origin") || process.env.APP_ORIGIN || "http://localhost:3000";
    const returnPath = process.env.STRIPE_CUSTOMER_PORTAL_RETURN_URL || "/billing";

    const session = await stripe.billingPortal.sessions.create({
      customer: stripe_customer_id,
      return_url: `${origin}${returnPath.startsWith("/") ? "" : "/"}${returnPath}`,
    });

    return NextResponse.json({ ok: true, url: session.url });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
