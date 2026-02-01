import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

function num(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function str(v: any): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function normalizeOne(raw: any) {
  const action = str(raw?.action) || "unknown";

  const product_name =
    str(raw?.product_name) || str(raw?.product) || str(raw?.item) || null;

  const quantity = num(raw?.quantity) ?? num(raw?.qty) ?? num(raw?.count) ?? null;

  const unit_price =
    num(raw?.unit_price) ?? num(raw?.price) ?? num(raw?.unitCost) ?? null;

  const expense_name =
    str(raw?.expense_name) || str(raw?.name) || str(raw?.expense) || null;

  const amount = num(raw?.amount) ?? num(raw?.cost) ?? num(raw?.total) ?? null;

  const payment_status = raw?.payment_status === "unpaid" ? "unpaid" : "paid";

  const category = str(raw?.category) || null;

  const ask = str(raw?.ask);

  return {
    action,
    product_name,
    quantity,
    unit_price,
    expense_name,
    amount,
    payment_status,
    category,
    ask,
  };
}

function normalizeMany(raw: any) {
  // Accept either:
  // { commands: [...] }  OR  [ ... ]  OR single object
  let arr: any[] = [];

  if (Array.isArray(raw)) arr = raw;
  else if (Array.isArray(raw?.commands)) arr = raw.commands;
  else arr = [raw];

  return arr.map(normalizeOne);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const text = String(body?.text || "").trim();

    if (!text) {
      return NextResponse.json({ ok: false, error: "No message provided" }, { status: 400 });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Extract ALL actions from the user's message for a small business ops app.\n\n" +
            "Return ONLY JSON in this exact shape:\n" +
            '{ "commands": [ ... ] }\n\n' +
            "Each command must have these keys:\n" +
            "- action: record_sale | record_expense | add_stock | remove_stock | unknown\n" +
            "- product_name (string) when relevant\n" +
            "- quantity (number) when relevant\n" +
            "- unit_price (number) for record_sale\n" +
            "- expense_name (string) for record_expense\n" +
            "- amount (number) for record_expense\n" +
            "- category (string) optional for expenses\n" +
            "- payment_status: paid | unpaid (optional; default paid)\n" +
            "- ask (string) if action=unknown\n\n" +
            "Rules:\n" +
            "- If user sells something: record_sale.\n" +
            "- If user paid/spent money: record_expense.\n" +
            "- If user bought/restocked/received items: add_stock.\n" +
            "- If user removed stock without a sale: remove_stock.\n" +
            "- If info missing, set action=unknown and ask what’s missing.\n" +
            "- Split multiple actions into multiple commands.\n",
        },
        { role: "user", content: text },
      ],
    });

    const rawText = response.choices[0].message.content || "{}";

    let rawJson: any = {};
    try {
      rawJson = JSON.parse(rawText);
    } catch {
      return NextResponse.json(
        { ok: false, error: "AI returned invalid JSON", raw: rawText },
        { status: 500 }
      );
    }

    const commands = normalizeMany(rawJson);

    return NextResponse.json({ ok: true, commands });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}


