// app/api/billing/status/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.warn(
    "Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and/or SUPABASE_SERVICE_ROLE_KEY"
  );
}

const admin = createClient(supabaseUrl!, serviceKey!, {
  auth: { persistSession: false },
});

// ✅ Stripe USD price IDs you created
const PRICE_STARTER = "price_1SwbCxEZh5HgtazOhQPMcWhz";
const PRICE_STANDARD = "price_1SwlhvEZh5HgtazOlmK5uFdQ";
const PRICE_PRO = "price_1SwlnFEZh5HgtazOtRF3fCwk";

function planFromPriceId(priceId: any) {
  const id = String(priceId || "").trim();
  if (!id) return "standard"; // default
  if (id === PRICE_STARTER) return "starter";
  if (id === PRICE_STANDARD) return "standard";
  if (id === PRICE_PRO) return "pro";
  return "standard";
}

function safeStr(v: any) {
  return String(v ?? "").trim();
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const workspace_id = safeStr(body?.workspace_id);

    if (!workspace_id) {
      return NextResponse.json(
        { ok: false, error: "Missing workspace_id" },
        { status: 400 }
      );
    }

    // ✅ Select * to avoid TS/schema-cache underline issues
    const { data: wsRaw, error: wsErr } = await admin
      .from("workspaces")
      .select("*")
      .eq("id", workspace_id)
      .single();

    if (wsErr) throw new Error(wsErr.message);
    const ws: any = wsRaw || {};

    // infer plan using stripe_price_id (webhook writes this)
    const inferredPlan = planFromPriceId(ws?.stripe_price_id);
    const workspacePlan = safeStr(ws?.plan) || inferredPlan || "standard";

    // Optional subscriptions table (won’t crash if it doesn't exist)
    let sub: any = null;

    const stripeSubId = safeStr(ws?.stripe_subscription_id);
    if (stripeSubId) {
      try {
        const { data: subRow, error: subErr } = await admin
          .from("subscriptions")
          .select("*")
          .eq("stripe_subscription_id", stripeSubId)
          .maybeSingle();

        if (!subErr && subRow) sub = subRow;
      } catch {
        // ignore if table doesn't exist
      }
    }

    // fallback subscription payload from workspace columns
    if (!sub) {
      const status = safeStr(ws?.subscription_status) || "no_subscription";
      sub = stripeSubId
        ? {
            status,
            plan: inferredPlan,
            currency: ws?.currency ?? null,
            current_period_end: ws?.current_period_end ?? null,
            cancel_at_period_end: ws?.cancel_at_period_end ?? null,
            stripe_subscription_id: stripeSubId,
          }
        : null;
    }

    return NextResponse.json({
      ok: true,
      data: {
        workspace: {
          id: safeStr(ws?.id),
          plan: workspacePlan,
          stripe_customer_id: ws?.stripe_customer_id ?? null,
          stripe_subscription_id: stripeSubId || null,
          stripe_price_id: ws?.stripe_price_id ?? null,
          subscription_status: ws?.subscription_status ?? null,
          current_period_end: ws?.current_period_end ?? null,
          currency: ws?.currency ?? null,
        },
        subscription: sub,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}

