// app/api/analytics/route.ts
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

type Period = "today" | "this_month";

function safeStr(v: any) {
  return String(v ?? "").trim();
}

function startOfTodayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfThisMonthISO() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function periodStart(period: Period) {
  if (period === "this_month") return startOfThisMonthISO();
  return startOfTodayISO();
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const workspace_id = safeStr(body?.workspace_id);
    const period = (safeStr(body?.period) as Period) || "today";

    if (!workspace_id) {
      return NextResponse.json(
        { ok: false, error: "Missing workspace_id." },
        { status: 400 }
      );
    }

    const since = periodStart(period);

    // -------- SALES (for period) ----------
    const { data: salesRows, error: salesErr } = await admin
      .from("sales")
      .select("product_id, quantity_sold, unit_price, payment_status, created_at")
      .eq("workspace_id", workspace_id)
      .gte("created_at", since);

    if (salesErr) throw new Error(salesErr.message);

    // -------- EXPENSES (for period) ----------
    const { data: expRows, error: expErr } = await admin
      .from("expenses")
      .select("amount, category, created_at")
      .eq("workspace_id", workspace_id)
      .gte("created_at", since);

    if (expErr) throw new Error(expErr.message);

    // Totals
    let revenueTotal = 0;
    let revenuePaid = 0;
    let revenueUnpaid = 0;

    // group by product for top products
    const byProduct: Record<
      string,
      { product_id: string; qtySold: number; revenue: number }
    > = {};

    for (const s of salesRows || []) {
      const qty = Number((s as any).quantity_sold || 0);
      const unit = Number((s as any).unit_price || 0);
      const rev = qty * unit;

      revenueTotal += rev;

      const st = ((s as any).payment_status || "paid") as "paid" | "unpaid";
      if (st === "unpaid") revenueUnpaid += rev;
      else revenuePaid += rev;

      const pid = String((s as any).product_id || "");
      if (!pid) continue;

      if (!byProduct[pid]) byProduct[pid] = { product_id: pid, qtySold: 0, revenue: 0 };
      byProduct[pid].qtySold += qty;
      byProduct[pid].revenue += rev;
    }

    let expensesTotal = 0;
    let inventoryPurchases = 0;

    for (const e of expRows || []) {
      const amt = Number((e as any).amount || 0);
      expensesTotal += amt;

      const cat = String((e as any).category || "").toLowerCase();
      if (cat === "inventory" || cat === "inventory_purchase") {
        inventoryPurchases += amt;
      }
    }

    const profitAfterInventoryPurchases = revenueTotal - expensesTotal;
    const profitWithoutInventoryPurchases =
      revenueTotal - (expensesTotal - inventoryPurchases);

    // -------- Enrich top products with product names ----------
    const topList = Object.values(byProduct)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);

    let productNameMap: Record<string, string> = {};
    const productIds = topList.map((x) => x.product_id).filter(Boolean);

    if (productIds.length) {
      const { data: prodRows, error: prodErr } = await admin
        .from("products")
        .select("id, name")
        .eq("workspace_id", workspace_id)
        .in("id", productIds);

      if (prodErr) throw new Error(prodErr.message);

      productNameMap = Object.fromEntries(
        (prodRows || []).map((p: any) => [String(p.id), String(p.name)])
      );
    }

    const topProducts = topList.map((p) => ({
      product_id: p.product_id,
      name: productNameMap[p.product_id] || p.product_id,
      qtySold: p.qtySold,
      revenue: p.revenue,
    }));

    return NextResponse.json({
      ok: true,
      data: {
        period,
        since,
        revenueTotal,
        revenuePaid,
        revenueUnpaid,
        expensesTotal,
        inventoryPurchases,
        profitAfterInventoryPurchases,
        profitWithoutInventoryPurchases,
        topProducts,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}

