// app/api/analytics/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.warn(
    "Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and/or SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
}

const admin = createClient(supabaseUrl!, serviceKey!, {
  auth: { persistSession: false },
});

type ProfitPeriod = "today" | "week" | "month" | "all";

function safeStr(v: any) {
  return String(v ?? "").trim();
}

function startOfTodayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function startOfWeekISO() {
  const d = new Date();
  const day = d.getDay(); // 0=Sun
  const diff = (day + 6) % 7; // make Monday start
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function startOfMonthISO() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

async function getAnalytics(workspace_id: string, period: ProfitPeriod) {
  // Decide date filter
  let gteISO: string | null = null;
  if (period === "today") gteISO = startOfTodayISO();
  else if (period === "week") gteISO = startOfWeekISO();
  else if (period === "month") gteISO = startOfMonthISO();
  else gteISO = null;

  // --- SALES ---
  let salesQ = admin
    .from("sales")
    .select("product_id, quantity_sold, unit_price, payment_status, created_at")
    .eq("workspace_id", workspace_id);

  if (gteISO) salesQ = salesQ.gte("created_at", gteISO);

  const { data: salesRows, error: salesErr } = await salesQ;
  if (salesErr) throw new Error(salesErr.message);

  // --- EXPENSES ---
  let expQ = admin
    .from("expenses")
    .select("amount, category, created_at")
    .eq("workspace_id", workspace_id);

  if (gteISO) expQ = expQ.gte("created_at", gteISO);

  const { data: expRows, error: expErr } = await expQ;
  if (expErr) throw new Error(expErr.message);

  // Totals
  let revenueTotal = 0;
  let revenuePaid = 0;
  let revenueUnpaid = 0;

  const byProduct: Record<
    string,
    { product_id: string; qtySold: number; revenue: number }
  > = {};

  for (const s of salesRows || []) {
    const qty = Number((s as any).quantity_sold || 0);
    const unit = Number((s as any).unit_price || 0);
    const rev = qty * unit;

    revenueTotal += rev;

    const pay = String((s as any).payment_status || "paid").toLowerCase();
    if (pay === "unpaid") revenueUnpaid += rev;
    else revenuePaid += rev;

    const pid = String((s as any).product_id || "");
    if (pid) {
      if (!byProduct[pid]) {
        byProduct[pid] = { product_id: pid, qtySold: 0, revenue: 0 };
      }
      byProduct[pid].qtySold += qty;
      byProduct[pid].revenue += rev;
    }
  }

  let expensesTotal = 0;
  let inventoryPurchases = 0;

  for (const e of expRows || []) {
    const amt = Number((e as any).amount || 0);
    expensesTotal += amt;

    const cat = String((e as any).category || "").toLowerCase();
    // Inventory purchase detection by category
    if (cat === "inventory" || cat === "inventory_purchase") {
      inventoryPurchases += amt;
    }
  }

  // Profit views
  const profitAfterInventoryPurchases = revenueTotal - expensesTotal;
  const profitWithoutInventoryPurchases =
    revenueTotal - (expensesTotal - inventoryPurchases);

  // --- Resolve product names for top products ---
  const productIds = Object.keys(byProduct);
  let productNameMap: Record<string, string> = {};

  if (productIds.length > 0) {
    const { data: prodRows, error: prodErr } = await admin
      .from("products")
      .select("id, name")
      .eq("workspace_id", workspace_id)
      .in("id", productIds);

    if (prodErr) throw new Error(prodErr.message);

    for (const p of prodRows || []) {
      productNameMap[String((p as any).id)] = String((p as any).name || "");
    }
  }

  const topProducts = Object.values(byProduct)
    .map((x) => ({
      ...x,
      name: productNameMap[x.product_id] || "Unknown",
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  return {
    period,
    revenueTotal,
    revenuePaid,
    revenueUnpaid,
    expensesTotal,
    inventoryPurchases,
    profitAfterInventoryPurchases,
    profitWithoutInventoryPurchases,
    topProducts,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const workspace_id = safeStr(body?.workspace_id);
    const period = (safeStr(body?.period) || "today") as ProfitPeriod;

    if (!workspace_id) {
      return NextResponse.json(
        { ok: false, error: "Missing workspace_id." },
        { status: 400 }
      );
    }

    const data = await getAnalytics(workspace_id, period);

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
