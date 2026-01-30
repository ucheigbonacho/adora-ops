import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const webhookUrl = process.env.MAKE_WEBHOOK_URL;
    const apiKey = process.env.MAKE_WEBHOOK_API_KEY; // optional

    if (!webhookUrl) {
      return NextResponse.json(
        { ok: false, error: "Missing MAKE_WEBHOOK_URL in .env.local" },
        { status: 500 }
      );
    }

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { "x-make-apikey": apiKey } : {}),
      },
      body: JSON.stringify(body),
    });

    const text = await res.text().catch(() => "");

    return NextResponse.json(
      { ok: res.ok, make_status: res.status, make_body: text },
      { status: res.ok ? 200 : 500 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
