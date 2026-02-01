// app/api/chat/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * ENV REQUIRED in .env.local
 * - OPENAI_API_KEY=...
 * - SUPABASE_URL=...   (or NEXT_PUBLIC_SUPABASE_URL)
 * - SUPABASE_SERVICE_ROLE_KEY=...
 *
 * Optional:
 * - OPENAI_MODEL=gpt-4o-mini
 * - DEFAULT_REORDER_THRESHOLD=5
 */

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

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

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const DEFAULT_REORDER_THRESHOLD = Number(
  process.env.DEFAULT_REORDER_THRESHOLD || 5
);

type ProfitPeriod = "today" | "week" | "month" | "all";

type Action =
  | "record_sale"
  | "record_expense"
  | "add_stock"
  | "remove_stock"
  | "create_product"
  | "get_analytics"
  | "unknown";

type Command =
  | {
      action: "record_sale";
      product_name?: string;
      quantity?: number;
      unit_price?: number;
      payment_status?: "paid" | "unpaid";
    }
  | {
      action: "record_expense";
      expense_name?: string;
      amount?: number;
      category?: string;
    }
  | {
      action: "add_stock" | "remove_stock";
      product_name?: string;
      quantity?: number;
    }
  | {
      action: "create_product";
      product_name?: string;
      reorder_threshold?: number;
    }
  | {
      action: "get_analytics";
      period?: ProfitPeriod;
      metric?:
        | "profit"
        | "profit_after_inventory"
        | "profit_without_inventory"
        | "revenue_split"
        | "top_products";
    }
  | { action: "unknown"; ask?: string }
  | Record<string, any>;

function safeStr(v: any) {
  return String(v ?? "").trim();
}
function asNumber(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}
function money(n: any) {
  const x = Number(n || 0);
  return x.toFixed(2);
}

function startOfTodayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function startOfWeekISO() {
  const d = new Date();
  const day = d.getDay(); // 0=Sun
  const diff = (day + 6) % 7; // Monday start
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

function detectAnalyticsQuestion(text: string) {
  const t = text.toLowerCase();

  // Profit / did I make profit
  if (t.includes("profit") || t.includes("made money") || t.includes("make money")) {
    return { action: "get_analytics", period: "today", metric: "profit" } as Command;
  }

  // Paid vs unpaid
  if (t.includes("paid") && t.includes("unpaid")) {
    return { action: "get_analytics", period: "today", metric: "revenue_split" } as Command;
  }

  // Top selling
  if (
    t.includes("top selling") ||
    t.includes("best selling") ||
    (t.includes("top") && t.includes("products"))
  ) {
    return { action: "get_analytics", period: "today", metric: "top_products" } as Command;
  }

  // Revenue split keywords
  if (t.includes("revenue") && (t.includes("paid") || t.includes("unpaid"))) {
    return { action: "get_analytics", period: "today", metric: "revenue_split" } as Command;
  }

  return null;
}

/**
 * OpenAI extraction:
 * Returns an ARRAY so one sentence can produce multiple operations.
 */
async function extractCommands(text: string): Promise<Command[]> {
  const system = `
You are an assistant that extracts small-business operations from a user's message.

Return ONLY JSON (no markdown, no extra commentary).

Output MUST be:
{
  "actions": [
    { "action": "...", ... },
    ...
  ]
}

Allowed actions:
- record_sale: { action, product_name, quantity, unit_price, payment_status }
- record_expense: { action, expense_name, amount, category }
- add_stock: { action, product_name, quantity }
- remove_stock: { action, product_name, quantity }
- create_product: { action, product_name, reorder_threshold }
- get_analytics: { action, period, metric }
- unknown: { action, ask }

Rules:
- If user says they "bought" items, interpret it as add_stock (inventory increases).
- If user says they "sold" items, interpret it as record_sale (inventory decreases handled by app).
- If sale price missing, set unit_price=0 (still record).
- If payment status not mentioned, default payment_status="paid".
- Expenses: if category not mentioned, set category="general".
- If user asks a question about profit/revenue/top products/paid vs unpaid, use get_analytics.
- If anything is unclear, use action="unknown" and ask ONE short question.
- Product names must be short: "rice", "beans", "maggie", "sugar".
`;

  const r = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0,
    messages: [
      { role: "system", content: system },
      { role: "user", content: text },
    ],
    response_format: { type: "json_object" },
  });

  const raw = r.choices?.[0]?.message?.content || "{}";
  let parsed: any = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [{ action: "unknown", ask: "I couldn’t parse that. Please rephrase." }];
  }

  const actions = Array.isArray(parsed?.actions) ? parsed.actions : [];
  if (!actions.length) {
    return [{ action: "unknown", ask: "Tell me what happened (sold/bought/paid)." }];
  }
  return actions as Command[];
}

async function findProduct(workspace_id: string, product_name: string) {
  const q = `%${product_name}%`;
  const { data, error } = await admin
    .from("products")
    .select("id, name, reorder_threshold")
    .eq("workspace_id", workspace_id)
    .ilike("name", q)
    .order("name", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as { id: string; name: string; reorder_threshold: number | null } | null;
}

async function createProduct(
  workspace_id: string,
  product_name: string,
  reorder_threshold?: number
) {
  const name = safeStr(product_name);
  if (!name) throw new Error("Missing product_name for create_product.");

  const rt =
    Number.isFinite(Number(reorder_threshold)) && Number(reorder_threshold) >= 0
      ? Number(reorder_threshold)
      : DEFAULT_REORDER_THRESHOLD;

  const { data, error } = await admin
    .from("products")
    .insert([{ workspace_id, name, reorder_threshold: rt }])
    .select("id, name, reorder_threshold")
    .single();

  if (error) throw new Error(error.message);
  return data as { id: string; name: string; reorder_threshold: number | null };
}

/**
 * Inventory update that does NOT require inventory_balances.id
 * Select/update by workspace_id + product_id.
 */
async function adjustInventory(workspace_id: string, product_id: string, delta: number) {
  const { data: inv, error: invErr } = await admin
    .from("inventory_balances")
    .select("quantity_on_hand")
    .eq("workspace_id", workspace_id)
    .eq("product_id", product_id)
    .maybeSingle();

  if (invErr) throw new Error(invErr.message);

  if (!inv) {
    const { error: insErr } = await admin.from("inventory_balances").insert([
      { workspace_id, product_id, quantity_on_hand: delta },
    ]);
    if (insErr) throw new Error(insErr.message);
    return delta;
  }

  const newQty = Number((inv as any).quantity_on_hand || 0) + delta;

  const { error: updErr } = await admin
    .from("inventory_balances")
    .update({ quantity_on_hand: newQty })
    .eq("workspace_id", workspace_id)
    .eq("product_id", product_id);

  if (updErr) throw new Error(updErr.message);
  return newQty;
}

/**
 * Insert expense safely: some schemas use `description` instead of `name`.
 * We'll try description-first, and fallback to name if needed.
 */
async function insertExpenseRow(args: {
  workspace_id: string;
  category: string;
  expense_name: string;
  amount: number;
}) {
  const { workspace_id, category, expense_name, amount } = args;

  // Try: description
  const try1 = await admin.from("expenses").insert([
    { workspace_id, category, description: expense_name, amount },
  ]);

  if (!try1.error) return;

  // Fallback: name
  const msg = try1.error.message || "";
  if (msg.includes("description") || msg.includes("schema cache") || msg.includes("column")) {
    const try2 = await admin.from("expenses").insert([
      { workspace_id, category, name: expense_name, amount },
    ]);
    if (try2.error) throw new Error(try2.error.message);
    return;
  }

  throw new Error(try1.error.message);
}

async function getAnalytics(workspace_id: string, period: ProfitPeriod) {
  let gteISO: string | null = null;
  if (period === "today") gteISO = startOfTodayISO();
  else if (period === "week") gteISO = startOfWeekISO();
  else if (period === "month") gteISO = startOfMonthISO();
  else gteISO = null;

  // SALES
  let salesQ = admin
    .from("sales")
    .select("product_id, quantity_sold, unit_price, payment_status, created_at")
    .eq("workspace_id", workspace_id);

  if (gteISO) salesQ = salesQ.gte("created_at", gteISO);

  const { data: salesRows, error: salesErr } = await salesQ;
  if (salesErr) throw new Error(salesErr.message);

  // EXPENSES
  let expQ = admin
    .from("expenses")
    .select("amount, category, created_at")
    .eq("workspace_id", workspace_id);

  if (gteISO) expQ = expQ.gte("created_at", gteISO);

  const { data: expRows, error: expErr } = await expQ;
  if (expErr) throw new Error(expErr.message);

  let revenueTotal = 0;
  let revenuePaid = 0;
  let revenueUnpaid = 0;

  const byProduct: Record<string, { product_id: string; qtySold: number; revenue: number }> = {};

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
      if (!byProduct[pid]) byProduct[pid] = { product_id: pid, qtySold: 0, revenue: 0 };
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
    if (cat === "inventory" || cat === "inventory_purchase") {
      inventoryPurchases += amt;
    }
  }

  const profitAfterInventoryPurchases = revenueTotal - expensesTotal;
  const profitWithoutInventoryPurchases =
    revenueTotal - (expensesTotal - inventoryPurchases);

  // Resolve product names
  const productIds = Object.keys(byProduct);
  const nameMap: Record<string, string> = {};
  if (productIds.length > 0) {
    const { data: prodRows, error: prodErr } = await admin
      .from("products")
      .select("id, name")
      .eq("workspace_id", workspace_id)
      .in("id", productIds);

    if (prodErr) throw new Error(prodErr.message);
    for (const p of prodRows || []) nameMap[String((p as any).id)] = String((p as any).name || "");
  }

  const topProducts = Object.values(byProduct)
    .map((x) => ({ ...x, name: nameMap[x.product_id] || "Unknown" }))
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
    const text = safeStr(body?.text);
    const user_name = safeStr(body?.user_name) || "there";

    if (!workspace_id) {
      return NextResponse.json({ ok: false, error: "Missing workspace_id." }, { status: 400 });
    }
    if (!text) {
      return NextResponse.json({ ok: false, error: "No message provided." }, { status: 400 });
    }

    // 0) Quick keyword route for analytics questions (fast + reliable)
    const quick = detectAnalyticsQuestion(text);
    if (quick) {
      const period = (quick as any).period || "today";
      const a = await getAnalytics(workspace_id, period);

      const metric = (quick as any).metric;

      if (metric === "top_products") {
        const lines =
          a.topProducts.length === 0
            ? ["No sales yet today."]
            : a.topProducts.map(
                (p: any, i: number) =>
                  `${i + 1}. ${p.name} — ${p.qtySold} sold ($${money(p.revenue)})`
              );

        return NextResponse.json({
          ok: true,
          reply: `Hi ${user_name} 👋\n\nTop selling products today:\n${lines.join("\n")}`,
          analytics: a,
        });
      }

      if (metric === "revenue_split") {
        return NextResponse.json({
          ok: true,
          reply:
            `Hi ${user_name} 👋\n\nToday’s revenue split:\n` +
            `• Paid: $${money(a.revenuePaid)}\n` +
            `• Unpaid: $${money(a.revenueUnpaid)}\n` +
            `• Total: $${money(a.revenueTotal)}`,
          analytics: a,
        });
      }

      // profit default
      return NextResponse.json({
        ok: true,
        reply:
          `Hi ${user_name} 👋\n\nHere’s today so far:\n` +
          `• Profit (after inventory purchases): $${money(a.profitAfterInventoryPurchases)}\n` +
          `• Profit (operational only): $${money(a.profitWithoutInventoryPurchases)}\n` +
          `• Revenue: $${money(a.revenueTotal)}\n` +
          `• Expenses: $${money(a.expensesTotal)}`,
        analytics: a,
      });
    }

    // 1) Extract actions from AI (multi-action supported)
    const actions = await extractCommands(text);

    const results: string[] = [];

    // 2) Execute each action in order
    for (const cmd of actions) {
      const action = safeStr((cmd as any)?.action) as Action;

      if (!action || action === "unknown") {
        const ask =
          safeStr((cmd as any)?.ask) ||
          "I didn’t understand. Try: “I sold 2 rice for $4 each and spent $15 on gas.”";
        results.push(`• ${ask}`);
        continue;
      }

      // --- ANALYTICS (when AI chooses it) ---
      if (action === "get_analytics") {
        const period = (safeStr((cmd as any)?.period) as ProfitPeriod) || "today";
        const metric = safeStr((cmd as any)?.metric) || "profit";
        const a = await getAnalytics(workspace_id, period);

        if (metric === "top_products") {
          const lines =
            a.topProducts.length === 0
              ? ["No sales yet in this period."]
              : a.topProducts.map(
                  (p: any, i: number) =>
                    `${i + 1}. ${p.name} — ${p.qtySold} sold ($${money(p.revenue)})`
                );
          results.push(`• Top products (${period}):\n${lines.join("\n")}`);
          continue;
        }

        if (metric === "revenue_split") {
          results.push(
            `• Revenue split (${period}): Paid $${money(a.revenuePaid)} | Unpaid $${money(
              a.revenueUnpaid
            )} | Total $${money(a.revenueTotal)}`
          );
          continue;
        }

        results.push(
          `• Profit (${period}): after inventory $${money(
            a.profitAfterInventoryPurchases
          )} | operational $${money(a.profitWithoutInventoryPurchases)}`
        );
        continue;
      }

      // --- CREATE PRODUCT ---
      if (action === "create_product") {
        const product_name = safeStr((cmd as any)?.product_name);
        if (!product_name) {
          results.push(`• Create product skipped: missing product name`);
          continue;
        }
        const p = await createProduct(
          workspace_id,
          product_name,
          (cmd as any)?.reorder_threshold
        );
        results.push(
          `• Product created ✅ ${p.name} (reorder: ${p.reorder_threshold ?? DEFAULT_REORDER_THRESHOLD})`
        );
        continue;
      }

      // --- EXPENSE ---
      if (action === "record_expense") {
        const expense_name =
          safeStr((cmd as any)?.expense_name) || safeStr((cmd as any)?.name);
        const amount = asNumber((cmd as any)?.amount);
        const category = safeStr((cmd as any)?.category) || "general";

        if (!expense_name) {
          results.push(`• Expense skipped: missing expense name`);
          continue;
        }
        if (!Number.isFinite(amount) || amount <= 0) {
          results.push(`• Expense skipped: invalid amount`);
          continue;
        }

        await insertExpenseRow({ workspace_id, category, expense_name, amount });

        results.push(`• Expense ✅ ${category}: ${expense_name} — $${money(amount)}`);
        continue;
      }

      // --- SALE / STOCK require product ---
      const product_name = safeStr((cmd as any)?.product_name);
      if (!product_name) {
        results.push(`• ${action} skipped: missing product name`);
        continue;
      }

      let prod = await findProduct(workspace_id, product_name);

      // Auto-create if missing
      if (!prod) {
        prod = await createProduct(workspace_id, product_name, DEFAULT_REORDER_THRESHOLD);
        results.push(`• Product auto-created ✅ ${prod.name}`);
      }

      // --- RECORD SALE ---
      if (action === "record_sale") {
        const quantity = asNumber((cmd as any)?.quantity);
        const unit_price = Number.isFinite(asNumber((cmd as any)?.unit_price))
          ? asNumber((cmd as any)?.unit_price)
          : 0;

        const payment_status =
          ((cmd as any)?.payment_status as "paid" | "unpaid") || "paid";

        if (!Number.isFinite(quantity) || quantity <= 0) {
          results.push(`• Sale skipped: invalid quantity`);
          continue;
        }

        const { error: saleErr } = await admin.from("sales").insert([
          {
            workspace_id,
            product_id: prod.id,
            quantity_sold: quantity,
            unit_price,
            payment_status,
          },
        ]);
        if (saleErr) throw new Error(saleErr.message);

        const newQty = await adjustInventory(workspace_id, prod.id, -quantity);

        results.push(
          `• Sale ✅ ${quantity} x ${prod.name} @ $${money(unit_price)} (stock: ${newQty})`
        );
        continue;
      }

      // --- STOCK ADJUSTMENTS ---
      if (action === "add_stock" || action === "remove_stock") {
        const quantity = asNumber((cmd as any)?.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          results.push(`• Stock ${action} skipped: invalid quantity`);
          continue;
        }

        const delta = action === "add_stock" ? quantity : -quantity;
        const newQty = await adjustInventory(workspace_id, prod.id, delta);

        results.push(
          action === "add_stock"
            ? `• Stock ✅ added ${quantity} ${prod.name} (stock: ${newQty})`
            : `• Stock ✅ removed ${quantity} ${prod.name} (stock: ${newQty})`
        );
        continue;
      }

      results.push(`• I can’t run action: ${action}`);
    }

    const reply =
      `Hi ${user_name} 👋\n\nDone ✅\n\n` + (results.length ? results.join("\n") : "No actions.");

    return NextResponse.json({
  ok: true,
  reply: `Done ✅\n\n${results.join("\n")}`,
  results,
  suggestions: [
    "did i make profit today",
    "top selling products today",
    "paid vs unpaid revenue"
  ],
});

  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}





