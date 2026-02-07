import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const customerId = String(body?.stripe_customer_id || "").trim();
    const workspaceId = String(body?.workspace_id || "").trim();

    if (!customerId) {
      return NextResponse.json(
        { ok: false, error: "Missing stripe_customer_id" },
        { status: 400 }
      );
    }

    const origin =
      req.headers.get("origin") ||
      process.env.APP_ORIGIN ||
      "http://localhost:3000";

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/billing`,
      // optional reference for your own tracking
      ...(workspaceId ? { metadata: { workspace_id: workspaceId } } : {}),
    });

    return NextResponse.json({ ok: true, url: session.url });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
