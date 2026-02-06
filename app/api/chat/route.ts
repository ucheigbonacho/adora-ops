// app/api/chat/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/adminSupabase";

export const runtime = "nodejs";

/**
 * ENV (.env.local)
 * OPENAI_API_KEY=... (optional)
 * SUPABASE_URL=... (or NEXT_PUBLIC_SUPABASE_URL)
 * SUPABASE_SERVICE_ROLE_KEY=...
 * RESEND_API_KEY=... (required for premium email/invoice sending)
 * RESEND_FROM="Adora Ops <support@adoraops.com>"
 */

const openaiApiKey = process.env.OPENAI_API_KEY || "";
const openai = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const DEFAULT_REORDER_THRESHOLD = Number(
  process.env.DEFAULT_REORDER_THRESHOLD || 5
);

type Action =
  | "record_sale"
  | "record_expense"
  | "add_stock"
  | "remove_stock"
  | "create_product"
  | "analytics"
  | "send_email" // premium
  | "create_invoice" // premium
  | "create_receipt" // premium
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
      action: "analytics";
      metric?: "profit" | "revenue" | "expenses" | "top_products";
      period?: "today" | "month";
      payment_split?: boolean;
    }
  | {
      action: "send_email";
      to?: string;
      subject?: string;
      message?: string;
    }
  | {
      action: "create_invoice" | "create_receipt";
      to?: string;
      items?: Array<{ name: string; qty: number; unit_price: number }>;
      note?: string;
      send_email?: boolean;
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
function isEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());
}

/* -------------------------------------------------------
   PREMIUM CHECK (workspace plan + subscription status)
-------------------------------------------------------- */
async function getWorkspacePlan(workspace_id: string) {
  const { data, error } = await supabaseAdmin
    .from("workspaces")
    .select("id, plan, subscription_status")
    .eq("id", workspace_id)
    .single();

  if (error) throw new Error(error.message);

  const plan = String(data?.plan || "standard").toLowerCase();
  const status = String(data?.subscription_status || "").toLowerCase();

  // Treat active/trialing as paid
  const isPaid = status === "active" || status === "trialing" || plan === "premium";

  return { plan, status, isPaid };
}

function requiresPremium(action: Action) {
  return action === "send_email" || action === "create_invoice" || action === "create_receipt";
}

/* ----------------------------
   Local parsing
-----------------------------*/

function splitStatements(text: string) {
  return text
    .split(/\n|•/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function extractAmount(s: string) {
  const m = s.match(/(?:\$)?(\d+(?:\.\d+)?)/);
  return m ? asNumber(m[1]) : NaN;
}

function extractFirstEmail(s: string) {
  const m = s.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0] : "";
}

// "Email john@example.com subject: Hello message: Thanks!"
function parseEmailSentence(s: string): Command | null {
  const lower = s.toLowerCase();
  if (!(lower.includes("email") || lower.includes("send email") || lower.includes("mail "))) return null;

  const to = extractFirstEmail(s);
  if (!to) return null;

  // subject:
  const subjectMatch = s.match(/subject\s*:\s*([^]+?)(?:\s+message\s*:|$)/i);
  const subject = subjectMatch ? subjectMatch[1].trim() : "";

  // message:
  const messageMatch = s.match(/message\s*:\s*([^]+)$/i);
  let message = messageMatch ? messageMatch[1].trim() : "";

  // fallback: remove "email <to>" part
  if (!message) {
    message = s
      .replace(/send\s+email/i, "")
      .replace(/\bemail\b/i, "")
      .replace(to, "")
      .replace(/subject\s*:\s*[^]+$/i, "")
      .trim();
  }

  return {
    action: "send_email",
    to,
    subject: subject || "Message from Adora Ops",
    message: message || "Hello! (no message content provided)",
  };
}

// "Create invoice for john@example.com for 2 rice at $4 each"
function parseInvoiceOrReceiptSentence(s: string): Command | null {
  const lower = s.toLowerCase();
  const wantsInvoice = lower.includes("invoice");
  const wantsReceipt = lower.includes("receipt");
  if (!wantsInvoice && !wantsReceipt) return null;

  const to = extractFirstEmail(s);
  if (!to) return null;

  // Try to parse ONE line item like: "2 rice for 4 dollars each" or "2 rice at 4"
  const qtyMatch = s.match(/(\d+(?:\.\d+)?)\s+([a-zA-Z][\w\s-]+)/i);
  const priceMatch = s.match(/(?:\$)?(\d+(?:\.\d+)?)(?:\s*(?:dollars?)?)\s*(?:each)?/i);

  let items: Array<{ name: string; qty: number; unit_price: number }> = [];

  if (qtyMatch && priceMatch) {
    const qty = Math.max(1, Math.round(asNumber(qtyMatch[1]) || 1));
    const name = String(qtyMatch[2] || "")
      .split(/\s+for\s+|\s+at\s+/i)[0]
      .trim();
    const unit_price = Math.max(0, asNumber(priceMatch[1]) || 0);

    if (name && unit_price >= 0) {
      items = [{ name, qty, unit_price }];
    }
  }

  // note:
  const noteMatch = s.match(/note\s*:\s*([^]+)$/i);
  const note = noteMatch ? noteMatch[1].trim() : "";

  return {
    action: wantsInvoice ? "create_invoice" : "create_receipt",
    to,
    items: items.length ? items : undefined,
    note: note || undefined,
    send_email: true, // default: send it
  };
}

function parseSaleSentence(s: string): Command | null {
  const lower = s.toLowerCase();
  if (!lower.includes("sold")) return null;

  const qtyMatch = s.match(/sold\s+(\d+(?:\.\d+)?)\s+/i);
  const quantity = qtyMatch ? asNumber(qtyMatch[1]) : NaN;

  let product_name = "";
  if (qtyMatch) {
    const afterQty = s.slice(qtyMatch.index! + qtyMatch[0].length);
    product_name = afterQty.split(/\s+for\s+|\s+@\s+|\s+at\s+/i)[0].trim();
  } else {
    const m = s.match(/sold\s+([a-zA-Z][\w\s-]+)/i);
    product_name = m ? m[1].split(/\s+for\s+/i)[0].trim() : "";
  }

  let unit_price = NaN;
  const eachMatch = s.match(/for\s+\$?(\d+(?:\.\d+)?)\s*(?:dollars?)?\s*(?:each)?/i);
  if (eachMatch) unit_price = asNumber(eachMatch[1]);

  return {
    action: "record_sale",
    product_name: product_name || undefined,
    quantity: Number.isFinite(quantity) ? quantity : undefined,
    unit_price: Number.isFinite(unit_price) ? unit_price : 0,
    payment_status: "paid",
  };
}

function parseExpenseSentence(s: string): Command | null {
  const lower = s.toLowerCase();
  const looksExpense =
    lower.includes("paid") || lower.includes("spent") || lower.includes("expense");
  if (!looksExpense) return null;

  const amount = extractAmount(s);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  let name = s
    .replace(/(?:\$)?\d+(?:\.\d+)?/g, "")
    .replace(/\b(i|we)\b/gi, "")
    .replace(/\b(paid|spent|expense|for|on)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!name) name = "expense";

  return {
    action: "record_expense",
    expense_name: name,
    amount,
    category: lower.includes("inventory") || lower.includes("stock") ? "inventory" : "general",
  };
}

function parseBuySentence(s: string): Command | null {
  const lower = s.toLowerCase();
  if (!lower.includes("bought") && !lower.includes("purchased")) return null;

  const qtyMatch = s.match(/\b(bought|purchased)\s+(\d+(?:\.\d+)?)\s+/i);
  const quantity = qtyMatch ? asNumber(qtyMatch[2]) : NaN;

  let product_name = "";
  if (qtyMatch) {
    const after = s.slice(qtyMatch.index! + qtyMatch[0].length);
    product_name = after.trim();
  } else {
    const m = s.match(/\b(bought|purchased)\s+(.+)$/i);
    product_name = m ? m[2].trim() : "";
  }

  product_name = product_name.replace(/\b(bags?|pcs?|pieces?)\b\s*(of)?\s*/i, "").trim();

  return {
    action: "add_stock",
    product_name: product_name || undefined,
    quantity: Number.isFinite(quantity) ? quantity : 1,
  };
}

function parseAnalyticsSentence(s: string): Command | null {
  const lower = s.toLowerCase();
  const asksProfit = lower.includes("profit");
  const asksTop = lower.includes("top") && lower.includes("selling");
  const asksRevenue = lower.includes("revenue");
  const asksExpenses = lower.includes("expenses");

  if (!(asksProfit || asksTop || asksRevenue || asksExpenses)) return null;

  const period: "today" | "month" = lower.includes("month") ? "month" : "today";

  if (asksTop) return { action: "analytics", metric: "top_products", period };
  if (asksRevenue) return { action: "analytics", metric: "revenue", period, payment_split: true };
  if (asksExpenses) return { action: "analytics", metric: "expenses", period };
  return { action: "analytics", metric: "profit", period, payment_split: true };
}

function localExtract(text: string): Command[] {
  const statements = splitStatements(text);
  const actions: Command[] = [];

  for (const s of statements) {
    const a =
      parseEmailSentence(s) ||
      parseInvoiceOrReceiptSentence(s) ||
      parseAnalyticsSentence(s) ||
      parseSaleSentence(s) ||
      parseExpenseSentence(s) ||
      parseBuySentence(s);

    if (a) actions.push(a);
    else {
      actions.push({
        action: "unknown",
        ask:
          "Try: “I sold 2 rice for $4 each”, “I paid gas bill $15”, “profit this month”, “email john@example.com subject: Hello message: …”, or “create invoice for john@example.com for 2 rice at $4 each”.",
      });
    }
  }

  if (actions.every((x) => safeStr((x as any).action) === "unknown")) return [actions[0]];

  const real = actions.filter((x) => safeStr((x as any).action) !== "unknown");
  return real.length ? real : actions;
}

/* ----------------------------
   DB helpers
-----------------------------*/

async function findProduct(workspace_id: string, product_name: string) {
  const q = `%${product_name}%`;
  const { data, error } = await supabaseAdmin
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

async function createProduct(workspace_id: string, product_name: string, reorder_threshold?: number) {
  const name = safeStr(product_name);
  const rt =
    Number.isFinite(Number(reorder_threshold)) && Number(reorder_threshold) >= 0
      ? Number(reorder_threshold)
      : DEFAULT_REORDER_THRESHOLD;

  const { data, error } = await supabaseAdmin
    .from("products")
    .insert([{ workspace_id, name, reorder_threshold: rt }])
    .select("id, name, reorder_threshold")
    .single();

  if (error) throw new Error(error.message);
  return data as { id: string; name: string; reorder_threshold: number | null };
}

async function adjustInventory(workspace_id: string, product_id: string, delta: number) {
  const { data: inv, error: invErr } = await supabaseAdmin
    .from("inventory_balances")
    .select("quantity_on_hand")
    .eq("workspace_id", workspace_id)
    .eq("product_id", product_id)
    .maybeSingle();

  if (invErr) throw new Error(invErr.message);

  if (!inv) {
    const { error: insErr } = await supabaseAdmin
      .from("inventory_balances")
      .insert([{ workspace_id, product_id, quantity_on_hand: delta }]);
    if (insErr) throw new Error(insErr.message);
    return delta;
  }

  const newQty = Number(inv.quantity_on_hand || 0) + delta;

  const { error: updErr } = await supabaseAdmin
    .from("inventory_balances")
    .update({ quantity_on_hand: newQty })
    .eq("workspace_id", workspace_id)
    .eq("product_id", product_id);

  if (updErr) throw new Error(updErr.message);
  return newQty;
}

function monthStartISO() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function todayStartISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

async function runAnalytics(workspace_id: string, period: "today" | "month") {
  const start = period === "month" ? monthStartISO() : todayStartISO();

  const { data: sales, error: sErr } = await supabaseAdmin
    .from("sales")
    .select("product_id, quantity_sold, unit_price, payment_status, created_at")
    .eq("workspace_id", workspace_id)
    .gte("created_at", start);

  if (sErr) throw new Error(sErr.message);

  const { data: expenses, error: eErr } = await supabaseAdmin
    .from("expenses")
    .select("amount, category, created_at")
    .eq("workspace_id", workspace_id)
    .gte("created_at", start);

  if (eErr) throw new Error(eErr.message);

  const revenuePaid = (sales || [])
    .filter((x: any) => x.payment_status === "paid")
    .reduce((sum: number, x: any) => sum + Number(x.quantity_sold || 0) * Number(x.unit_price || 0), 0);

  const revenueUnpaid = (sales || [])
    .filter((x: any) => x.payment_status === "unpaid")
    .reduce((sum: number, x: any) => sum + Number(x.quantity_sold || 0) * Number(x.unit_price || 0), 0);

  const revenueTotal = revenuePaid + revenueUnpaid;

  const expensesTotal = (expenses || []).reduce((sum: number, x: any) => sum + Number(x.amount || 0), 0);

  const inventoryPurchases = (expenses || [])
    .filter((x: any) => String(x.category || "").toLowerCase() === "inventory")
    .reduce((sum: number, x: any) => sum + Number(x.amount || 0), 0);

  const profitAfterInventoryPurchases = revenueTotal - expensesTotal;
  const profitWithoutInventoryPurchases = revenueTotal - (expensesTotal - inventoryPurchases);

  return {
    period,
    revenueTotal,
    revenuePaid,
    revenueUnpaid,
    expensesTotal,
    inventoryPurchases,
    profitAfterInventoryPurchases,
    profitWithoutInventoryPurchases,
  };
}

/* ----------------------------
   OpenAI extraction (optional)
-----------------------------*/
async function aiExtract(text: string): Promise<Command[]> {
  if (!openai) throw new Error("OpenAI not configured.");

  const system = `
Return ONLY JSON (no markdown).
Output format:
{ "actions": [ { "action": "...", ... } ] }

Allowed actions:
record_sale { product_name, quantity, unit_price, payment_status }
record_expense { expense_name, amount, category }
add_stock { product_name, quantity }
remove_stock { product_name, quantity }
create_product { product_name, reorder_threshold }
analytics { metric, period }
send_email { to, subject, message }
create_invoice { to, items, note, send_email }
create_receipt { to, items, note, send_email }
unknown { ask }

Rules:
- "bought/purchased" => add_stock
- "sold" => record_sale
- default payment_status="paid"
- analytics period: if "month" => month, else today
- invoices/receipts: if user asks invoice/receipt/email => map to premium actions.
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
  const parsed = JSON.parse(raw);
  const actions = Array.isArray(parsed?.actions) ? parsed.actions : [];
  return actions.length ? (actions as Command[]) : [{ action: "unknown", ask: "Tell me what happened." }];
}

/* ----------------------------
   Route
-----------------------------*/
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const workspace_id = safeStr(body?.workspace_id);
    const text = safeStr(body?.text);

    if (!workspace_id) {
      return NextResponse.json({ ok: false, error: "Missing workspace_id." }, { status: 400 });
    }
    if (!text) {
      return NextResponse.json({ ok: false, error: "No message provided." }, { status: 400 });
    }

    const planInfo = await getWorkspacePlan(workspace_id);

    // 1) local parse first
    let actions: Command[] = localExtract(text);

    const localOnlyUnknown =
      actions.length === 1 && safeStr((actions[0] as any).action) === "unknown";

    // 2) if local can’t parse and OpenAI exists, try it
    if (localOnlyUnknown) {
      try {
        actions = await aiExtract(text);
      } catch {
        // keep local
      }
    }

    const results: string[] = [];
    let analyticsReply: any = null;

    for (const cmd of actions) {
      const action = safeStr((cmd as any)?.action) as Action;

      if (!action || action === "unknown") {
        results.push(`• ${safeStr((cmd as any)?.ask) || "I didn’t understand."}`);
        continue;
      }

      // Premium gating
      if (requiresPremium(action) && !planInfo.isPaid) {
        results.push(`• 🔒 Premium feature. Upgrade to Premium to use: ${action.replaceAll("_", " ")}.`);
        continue;
      }

      // ✅ PREMIUM: EMAIL (calls your API route)
      if (action === "send_email") {
        const to = safeStr((cmd as any)?.to);
        const subject = safeStr((cmd as any)?.subject) || "Message from Adora Ops";
        const message = safeStr((cmd as any)?.message);

        if (!to || !isEmail(to)) {
          results.push("• Email skipped: invalid recipient email");
          continue;
        }
        if (!message) {
          results.push("• Email skipped: missing message");
          continue;
        }

        // Call internal route (same server) using APP_ORIGIN
        const origin = process.env.APP_ORIGIN || "http://localhost:3000";
        const res = await fetch(`${origin}/api/email/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to,
            subject,
            html: `<div style="font-family:system-ui,Segoe UI,Roboto,Arial;line-height:1.5;color:#0B1220;">
                    <p>${message.replaceAll("\n", "<br/>")}</p>
                    <hr style="border:none;border-top:1px solid #E6E8EE;margin:16px 0;" />
                    <p style="color:#5B6475;font-size:12px;">Sent via Adora Ops • support@adoraops.com</p>
                  </div>`,
            text: message,
          }),
        });

        const json = await res.json().catch(() => ({}));
        if (!res.ok || json?.ok === false) {
          results.push(`• Email failed: ${json?.error || `(${res.status})`}`);
          continue;
        }

        results.push(`• Email sent ✅ to ${to} (subject: ${subject})`);
        continue;
      }

      // ✅ PREMIUM: INVOICE / RECEIPT
      if (action === "create_invoice" || action === "create_receipt") {
        const to = safeStr((cmd as any)?.to);
        const items = Array.isArray((cmd as any)?.items) ? (cmd as any).items : [];
        const note = safeStr((cmd as any)?.note);
        const send_email = (cmd as any)?.send_email !== false; // default true

        if (!to || !isEmail(to)) {
          results.push("• Invoice/receipt skipped: invalid email");
          continue;
        }
        if (!items.length) {
          results.push("• Invoice/receipt skipped: I need items like “2 rice at $4 each”.");
          continue;
        }

        const origin = process.env.APP_ORIGIN || "http://localhost:3000";
        const res = await fetch(`${origin}/api/invoice/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: action === "create_invoice" ? "invoice" : "receipt",
            to,
            items,
            note: note || undefined,
            send_email,
          }),
        });

        const json = await res.json().catch(() => ({}));
        if (!res.ok || json?.ok === false) {
          results.push(`• ${action === "create_invoice" ? "Invoice" : "Receipt"} failed: ${json?.error || `(${res.status})`}`);
          continue;
        }

        results.push(
          `• ${action === "create_invoice" ? "Invoice" : "Receipt"} created ✅ (#${json.docNo}) total: $${Number(json.total || 0).toFixed(2)}`
        );
        if (json.sent) results.push(`• Sent ✅ to ${to}`);
        continue;
      }

      // -------- ANALYTICS --------
      if (action === "analytics") {
        const metric = (cmd as any)?.metric || "profit";
        const period: "today" | "month" = (cmd as any)?.period === "month" ? "month" : "today";

        analyticsReply = await runAnalytics(workspace_id, period);

        if (metric === "profit") {
          results.push(
            `• Profit (${period}) ✅ after inventory: $${analyticsReply.profitAfterInventoryPurchases.toFixed(
              2
            )} | operational only: $${analyticsReply.profitWithoutInventoryPurchases.toFixed(2)}`
          );
          results.push(
            `• Revenue (${period}): $${analyticsReply.revenueTotal.toFixed(
              2
            )} (paid: $${analyticsReply.revenuePaid.toFixed(2)}, unpaid: $${analyticsReply.revenueUnpaid.toFixed(2)})`
          );
        } else if (metric === "revenue") {
          results.push(
            `• Revenue (${period}) ✅ $${analyticsReply.revenueTotal.toFixed(
              2
            )} (paid: $${analyticsReply.revenuePaid.toFixed(2)}, unpaid: $${analyticsReply.revenueUnpaid.toFixed(2)})`
          );
        } else if (metric === "expenses") {
          results.push(
            `• Expenses (${period}) ✅ $${analyticsReply.expensesTotal.toFixed(
              2
            )} (inventory purchases: $${analyticsReply.inventoryPurchases.toFixed(2)})`
          );
        } else {
          results.push(`• Analytics ✅ (${metric}, ${period}) computed.`);
        }
        continue;
      }

      // -------- EXPENSE --------
      if (action === "record_expense") {
        const expense_name = safeStr((cmd as any)?.expense_name);
        const amount = asNumber((cmd as any)?.amount);
        const category = safeStr((cmd as any)?.category) || "general";

        if (!expense_name) {
          results.push("• Expense skipped: missing expense name");
          continue;
        }
        if (!Number.isFinite(amount) || amount <= 0) {
          results.push("• Expense skipped: invalid amount");
          continue;
        }

        const { error: expErr } = await supabaseAdmin.from("expenses").insert([
          { workspace_id, name: expense_name, amount, category },
        ]);
        if (expErr) throw new Error(expErr.message);

        results.push(`• Expense ✅ ${expense_name}: $${amount.toFixed(2)}`);
        continue;
      }

      // -------- SALE / STOCK need product --------
      const product_name = safeStr((cmd as any)?.product_name);
      if (!product_name) {
        results.push(`• ${action} skipped: missing product name`);
        continue;
      }

      let prod = await findProduct(workspace_id, product_name);
      if (!prod) {
        prod = await createProduct(workspace_id, product_name, DEFAULT_REORDER_THRESHOLD);
        results.push(`• Product auto-created ✅ ${prod.name}`);
      }

      // -------- SALE --------
      if (action === "record_sale") {
        const quantity = asNumber((cmd as any)?.quantity);
        const unit_price = Number.isFinite(asNumber((cmd as any)?.unit_price))
          ? asNumber((cmd as any)?.unit_price)
          : 0;
        const payment_status =
          ((cmd as any)?.payment_status as "paid" | "unpaid") || "paid";

        if (!Number.isFinite(quantity) || quantity <= 0) {
          results.push("• Sale skipped: invalid quantity");
          continue;
        }

        const { error: saleErr } = await supabaseAdmin.from("sales").insert([
          { workspace_id, product_id: prod.id, quantity_sold: quantity, unit_price, payment_status },
        ]);
        if (saleErr) throw new Error(saleErr.message);

        const newQty = await adjustInventory(workspace_id, prod.id, -quantity);
        results.push(`• Sale ✅ ${quantity} x ${prod.name} @ $${unit_price.toFixed(2)} (stock: ${newQty})`);
        continue;
      }

      // -------- STOCK --------
      if (action === "add_stock" || action === "remove_stock") {
        const quantity = asNumber((cmd as any)?.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          results.push("• Stock skipped: invalid quantity");
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

    return NextResponse.json({
      ok: true,
      reply: `Done ✅\n\n${results.join("\n")}`,
      results,
      analytics: analyticsReply,
      suggestions: [
        "profit today",
        "profit this month",
        "top selling products today",
        "paid vs unpaid revenue",
        "email customer@domain.com subject: ... message: ...",
        "create invoice for customer@domain.com for 2 rice at $4 each",
      ],
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}






