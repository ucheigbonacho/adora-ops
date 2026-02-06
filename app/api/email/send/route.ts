// app/api/email/send/route.ts
import { NextResponse } from "next/server";
import { Resend } from "resend";

export const runtime = "nodejs";

const resendKey = process.env.RESEND_API_KEY || "";
const FROM = process.env.RESEND_FROM || "support@adoraops.com";

const resend = resendKey ? new Resend(resendKey) : null;

function safeStr(v: any) {
  return String(v ?? "").trim();
}

function isEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export async function POST(req: Request) {
  try {
    if (!resend) {
      return NextResponse.json(
        { ok: false, error: "Missing RESEND_API_KEY" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const to = safeStr(body?.to);
    const subject = safeStr(body?.subject) || "Message from Adora Ops";
    const html = safeStr(body?.html);
    const text = safeStr(body?.text);

    if (!to || !isEmail(to)) {
      return NextResponse.json(
        { ok: false, error: "Invalid or missing recipient email (to)" },
        { status: 400 }
      );
    }

    if (!html && !text) {
      return NextResponse.json(
        { ok: false, error: "Provide html or text content" },
        { status: 400 }
      );
    }

    const payload: any = {
      from: FROM,
      to: [to], // ✅ Resend accepts string[] safely
      subject,
    };

    // Only attach fields if present (avoids TS/SDK mismatch issues)
    if (html) payload.html = html;
    if (text) payload.text = text;

    const sent = await resend.emails.send(payload);

    return NextResponse.json({ ok: true, id: sent?.data?.id || null });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Email send failed" },
      { status: 500 }
    );
  }
}
