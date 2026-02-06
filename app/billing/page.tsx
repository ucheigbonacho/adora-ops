"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthWorkspaceGate";

type BillingData = {
  workspace: {
    id: string;
    plan: string | null;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    stripe_price_id?: string | null;
    subscription_status?: string | null;
    current_period_end?: string | null;
    currency?: string | null;
  };
  subscription:
    | {
        status: string;
        plan: string;
        currency: string | null;
        current_period_end: string | null;
        cancel_at_period_end: boolean | null;
        stripe_subscription_id: string;
      }
    | null;
};

function cap(s: string) {
  const x = String(s || "").trim();
  if (!x) return "";
  return x.charAt(0).toUpperCase() + x.slice(1);
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function statusPill(status: string) {
  const s = String(status || "").toLowerCase();

  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 999,
    fontWeight: 900,
    fontSize: 12,
    border: "1px solid #E6E8EE",
    background: "#F7F9FC",
    color: "#0B1220",
    width: "fit-content",
  };

  if (s === "active" || s === "trialing") {
    return {
      ...base,
      background: "#ECFDF3",
      border: "1px solid #B7F0C8",
      color: "#0F5132",
    };
  }
  if (s === "past_due" || s === "unpaid") {
    return {
      ...base,
      background: "#FFF8E1",
      border: "1px solid #FFE6A6",
      color: "#6B4E00",
    };
  }
  if (s === "canceled" || s === "incomplete_expired") {
    return {
      ...base,
      background: "#FEE2E2",
      border: "1px solid #FECACA",
      color: "#7F1D1D",
    };
  }

  if (s === "no_subscription" || s === "none") {
    return {
      ...base,
      background: "#EEF2FF",
      border: "1px solid #C7D2FE",
      color: "#1E3A8A",
    };
  }

  return base;
}

export default function BillingPage() {
  const [workspaceId, setWorkspaceId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyPortal, setBusyPortal] = useState(false);
  const [err, setErr] = useState("");

  const [data, setData] = useState<BillingData | null>(null);

  useEffect(() => {
    setWorkspaceId(localStorage.getItem("workspace_id") || "");
  }, []);

  async function loadBilling() {
    if (!workspaceId) return;

    setLoading(true);
    setErr("");

    try {
      const res = await fetch("/api/billing/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_id: workspaceId }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || `Failed (${res.status})`);
      }

      setData(json.data as BillingData);
    } catch (e: any) {
      setErr(e?.message || "Failed to load billing info.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!workspaceId) return;
    loadBilling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  // Optional: refresh when Adora updates data
  useEffect(() => {
    const onRefresh = () => loadBilling();
    window.addEventListener("adora:refresh", onRefresh);
    return () => window.removeEventListener("adora:refresh", onRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const plan = useMemo(() => {
    const p = data?.workspace?.plan || data?.subscription?.plan || "standard";
    return cap(p);
  }, [data]);

  const subscriptionStatus = useMemo(() => {
    // prefer subscription.status if API provides it
    const s =
      data?.subscription?.status ||
      data?.workspace?.subscription_status ||
      "no_subscription";
    return String(s || "no_subscription");
  }, [data]);

  const pillStyle = statusPill(subscriptionStatus);

  const currency = useMemo(() => {
    const c =
      data?.subscription?.currency ||
      data?.workspace?.currency ||
      null;
    return c ? String(c).toUpperCase() : "—";
  }, [data]);

  const renewDate = useMemo(() => {
    return (
      data?.subscription?.current_period_end ||
      data?.workspace?.current_period_end ||
      null
    );
  }, [data]);

  const hasCustomer = !!data?.workspace?.stripe_customer_id;
  const hasSub = !!data?.workspace?.stripe_subscription_id || !!data?.subscription;

  async function openPortal() {
    const customerId = data?.workspace?.stripe_customer_id;
    if (!customerId) {
      setErr("No Stripe customer found yet. Subscribe first on the Pricing page.");
      return;
    }

    setBusyPortal(true);
    setErr("");

    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stripe_customer_id: customerId }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || `Portal failed (${res.status})`);
      }

      window.location.href = json.url;
    } catch (e: any) {
      setErr(e?.message || "Could not open billing portal.");
    } finally {
      setBusyPortal(false);
    }
  }

  return (
    <AuthGate>
      <main style={wrap()}>
        <div style={topRow()}>
          <div>
            <h1 style={h1()}>Billing</h1>
            <p style={sub()}>
              View plan status and manage subscription for your workspace.
            </p>
          </div>

          <div style={actions()}>
            <a href="/pricing" style={btnGhost()}>
              Pricing
            </a>

            <button
              onClick={openPortal}
              disabled={!hasCustomer || busyPortal}
              style={{
                ...btnPrimary(),
                opacity: !hasCustomer ? 0.6 : 1,
              }}
              title={!hasCustomer ? "Subscribe first to enable the portal" : "Open Stripe portal"}
            >
              {busyPortal ? "Opening..." : "Manage subscription"}
            </button>
          </div>
        </div>

        {err ? <div style={errBox()}>{err}</div> : null}

        <div style={grid()}>
          <div style={card()}>
            <div style={cardTitle()}>Current plan</div>
            <div style={bigValue()}>{plan}</div>
            <div style={hint()}>
              {hasSub ? (
                <>
                  You’re on <b>{plan}</b>. Use Stripe portal to upgrade, downgrade, or cancel.
                </>
              ) : (
                <>
                  You don’t have an active subscription yet. Visit <b>Pricing</b> to subscribe.
                </>
              )}
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a href="/pricing" style={btnSoft()}>
                Choose plan
              </a>
              <button
                onClick={openPortal}
                disabled={!hasCustomer || busyPortal}
                style={{
                  ...btnSoft(),
                  borderColor: "#C7D2FE",
                  background: "#EEF2FF",
                  color: "#1E3A8A",
                  opacity: !hasCustomer ? 0.6 : 1,
                  cursor: !hasCustomer ? "not-allowed" : "pointer",
                }}
              >
                Manage in Stripe
              </button>
            </div>
          </div>

          <div style={card()}>
            <div style={cardTitle()}>Subscription</div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={pillStyle}>{cap(subscriptionStatus)}</span>
            </div>

            <div style={kv()}>
              <div style={k()}>Renews / ends</div>
              <div style={v()}>{fmtDate(renewDate)}</div>
            </div>

            <div style={kv()}>
              <div style={k()}>Currency</div>
              <div style={v()}>{currency}</div>
            </div>

            <div style={kv()}>
              <div style={k()}>Cancel at period end</div>
              <div style={v()}>
                {data?.subscription?.cancel_at_period_end ? "Yes" : "No"}
              </div>
            </div>

            <div style={note()}>
              Currency is auto-detected at checkout, but users can change it manually on the Pricing page if needed.
            </div>
          </div>
        </div>

        <div style={cardWide()}>
          <div style={cardTitle()}>Premium features (Pro)</div>

          <div style={list()}>
            <div style={listItem()}>
              <div style={dot()} />
              <div>
                <div style={liTitle()}>Customer emails</div>
                <div style={liBody()}>
                  Describe the email and Adora drafts it for you (and can send it in Pro).
                </div>
              </div>
            </div>

            <div style={listItem()}>
              <div style={dot()} />
              <div>
                <div style={liTitle()}>Invoices & receipts</div>
                <div style={liBody()}>
                  Generate invoices/receipts from chat and export/send to customer email.
                </div>
              </div>
            </div>

            <div style={listItem()}>
              <div style={dot()} />
              <div>
                <div style={liTitle()}>Priority support</div>
                <div style={liBody()}>
                  Faster response times and onboarding help for your team.
                </div>
              </div>
            </div>
          </div>

          <div style={finePrint()}>
            {loading
              ? "Loading billing details..."
              : "Tip: If status doesn’t update immediately after checkout, wait a minute and refresh."}
          </div>
        </div>
      </main>
    </AuthGate>
  );
}

/* -------- styles (mobile-friendly) -------- */
function wrap(): React.CSSProperties {
  return { padding: 16, maxWidth: 980, margin: "0 auto" };
}
function topRow(): React.CSSProperties {
  return {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 12,
  };
}
function actions(): React.CSSProperties {
  return { display: "flex", gap: 10, flexWrap: "wrap" };
}
function h1(): React.CSSProperties {
  return { margin: 0, fontSize: 34, lineHeight: 1.1 };
}
function sub(): React.CSSProperties {
  return { margin: "8px 0 0", color: "#5B6475", maxWidth: 620 };
}
function grid(): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 14,
    marginTop: 12,
  };
}
function card(): React.CSSProperties {
  return {
    border: "1px solid #E6E8EE",
    borderRadius: 18,
    padding: 16,
    background: "#fff",
    boxShadow: "0 10px 22px rgba(0,0,0,0.06)",
  };
}
function cardWide(): React.CSSProperties {
  return {
    border: "1px solid #E6E8EE",
    borderRadius: 18,
    padding: 16,
    background: "#F7F9FC",
    marginTop: 14,
  };
}
function cardTitle(): React.CSSProperties {
  return { fontWeight: 950, marginBottom: 10, color: "#0B1220" };
}
function bigValue(): React.CSSProperties {
  return { fontSize: 28, fontWeight: 950, marginBottom: 10, color: "#0B1220" };
}
function hint(): React.CSSProperties {
  return { color: "#5B6475", lineHeight: 1.35 };
}
function kv(): React.CSSProperties {
  return { display: "flex", justifyContent: "space-between", gap: 12, marginTop: 10 };
}
function k(): React.CSSProperties {
  return { color: "#5B6475", fontWeight: 800 };
}
function v(): React.CSSProperties {
  return { color: "#0B1220", fontWeight: 900 };
}
function btnPrimary(): React.CSSProperties {
  return {
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid #1F6FEB",
    background: "#1F6FEB",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
  };
}
function btnGhost(): React.CSSProperties {
  return {
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid #E6E8EE",
    background: "#fff",
    color: "#0B1220",
    fontWeight: 900,
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    cursor: "pointer",
  };
}
function btnSoft(): React.CSSProperties {
  return {
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid #E6E8EE",
    background: "#F7F9FC",
    color: "#0B1220",
    fontWeight: 900,
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    cursor: "pointer",
  };
}
function errBox(): React.CSSProperties {
  return {
    border: "1px solid #FECACA",
    background: "#FEE2E2",
    color: "#7F1D1D",
    padding: 12,
    borderRadius: 14,
    marginTop: 10,
    fontWeight: 800,
  };
}
function list(): React.CSSProperties {
  return { display: "grid", gap: 12 };
}
function listItem(): React.CSSProperties {
  return { display: "flex", gap: 10, alignItems: "flex-start" };
}
function dot(): React.CSSProperties {
  return {
    width: 10,
    height: 10,
    borderRadius: 999,
    background: "#1F6FEB",
    marginTop: 6,
    flex: "0 0 auto",
  };
}
function liTitle(): React.CSSProperties {
  return { fontWeight: 950, color: "#0B1220" };
}
function liBody(): React.CSSProperties {
  return { color: "#5B6475", lineHeight: 1.35, marginTop: 2 };
}
function finePrint(): React.CSSProperties {
  return { marginTop: 12, fontSize: 12, color: "#5B6475" };
}
function note(): React.CSSProperties {
  return {
    marginTop: 12,
    fontSize: 12,
    color: "#5B6475",
    lineHeight: 1.35,
    borderTop: "1px dashed #E6E8EE",
    paddingTop: 10,
  };
}
