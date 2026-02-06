// app/api/stripe/webhook/route.ts
import Stripe from "stripe";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// ✅ Don't force apiVersion here (avoids TS underline if your Stripe package doesn't match)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

export async function POST(req: Request) {
  // --- basic env checks ---
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { ok: false, error: "Missing STRIPE_SECRET_KEY" },
      { status: 500 }
    );
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      { ok: false, error: "Missing STRIPE_WEBHOOK_SECRET" },
      { status: 500 }
    );
  }

  if (!supabaseUrl) {
    return NextResponse.json(
      { ok: false, error: "Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL" },
      { status: 500 }
    );
  }

  if (!serviceKey) {
    return NextResponse.json(
      { ok: false, error: "Missing SUPABASE_SERVICE_ROLE_KEY" },
      { status: 500 }
    );
  }

  // ✅ Stripe requires the RAW body string
  const body = await req.text();

  // ✅ Your Next version: headers() is async in your environment
  const h = await headers();
  const sig = h.get("stripe-signature");

  if (!sig) {
    return NextResponse.json(
      { ok: false, error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: `Webhook signature verification failed: ${err?.message || "Unknown error"}`,
      },
      { status: 400 }
    );
  }

  try {
    // =========================================================
    // 1) Checkout completed: store customer/subscription on workspace
    // =========================================================
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      const workspace_id = String(session.metadata?.workspace_id || "");
      const user_id = String(session.metadata?.user_id || "");
      const customer_id = String(session.customer || "");
      const subscription_id = String(session.subscription || "");

      // Update workspace (recommended)
      if (workspace_id) {
        const { error } = await admin
          .from("workspaces")
          .update({
            stripe_customer_id: customer_id || null,
            stripe_subscription_id: subscription_id || null,
          })
          .eq("id", workspace_id);

        if (error) throw new Error(error.message);
      }

      // Optional: store stripe_customer_id on "users" table if you have one
      // ✅ IMPORTANT: No .throwOnError() or .catch() on the query builder (TS underline fix)
      if (user_id) {
        const { error } = await admin
          .from("users")
          .update({ stripe_customer_id: customer_id || null })
          .eq("id", user_id);

        // ignore if users table doesn't exist
        if (error) {
          // console.log("users update skipped:", error.message);
        }
      }
    }

    // =========================================================
    // 2) Subscription updates: keep workspace subscription fields in sync
    // =========================================================
    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const sub = event.data.object as Stripe.Subscription;

      const customer_id = String(sub.customer || "");
      const subscription_id = String(sub.id || "");
      const status = String(sub.status || "");

      const priceId = String(sub.items.data?.[0]?.price?.id || "");

      // ✅ Safer typing: avoids TS underline depending on Stripe typings
      const cpe =
        typeof (sub as any).current_period_end === "number"
          ? new Date((sub as any).current_period_end * 1000).toISOString()
          : null;

      const { error } = await admin
        .from("workspaces")
        .update({
          stripe_customer_id: customer_id || null,
          stripe_subscription_id: subscription_id || null,
          stripe_price_id: priceId || null,
          subscription_status: status || null,
          current_period_end: cpe,
        })
        .eq("stripe_customer_id", customer_id);

      if (error) throw new Error(error.message);
    }

    return NextResponse.json({ ok: true, received: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Webhook handler failed" },
      { status: 500 }
    );
  }
}
