"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type PlanKey = "starter" | "standard" | "premium";

const PRICE_IDS: Record<PlanKey, string> = {
  starter: "price_1SwbCxEZh5HgtazOhQPMcWhz",
  standard: "price_1SwlhvEZh5HgtazOlmK5uFdQ",
  premium: "price_1SwlnFEZh5HgtazOtRF3fCwk",
};

export default function PricingPage() {
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [loadingPlan, setLoadingPlan] = useState<PlanKey | "">("");

  // Default currency display only (you said USD for now)
  const currency = "USD";

  useEffect(() => {
    const ws = localStorage.getItem("workspace_id") || "";
    setWorkspaceId(ws);

    (async () => {
      const { data } = await supabase.auth.getUser();
      setEmail(data?.user?.email || "");
    })();
  }, []);

  const plans = useMemo(
    () => [
      {
        key: "starter" as const,
        name: "Starter",
        price: "$19",
        period: "/mo",
        description: "For solo operators and small shops.",
        features: [
          "Products + inventory tracking",
          "Sales + expenses logging",
          "Dashboard (daily view)",
          "Chat logging (text)",
          "Email low-stock alerts (basic)",
        ],
      },
      {
        key: "standard" as const,
        name: "Standard",
        price: "$39",
        period: "/mo",
        description: "Best for most businesses.",
        features: [
          "Everything in Starter",
          "Voice logging (hands-free + push-to-talk)",
          "Imports (products + inventory)",
          "Paid vs unpaid revenue split",
          "Top sellers + profit views",
          "Priority support",
        ],
        recommended: true,
      },
      {
        key: "premium" as const,
        name: "Premium",
        price: "$79",
        period: "/mo",
        description: "Automation + customer messaging tools.",
        features: [
          "Everything in Standard",
          "Customer email assistant (Premium)",
          "Invoice + receipt generator (Premium)",
          "Send invoices/receipts by email (Premium)",
          "Advanced automations + integrations",
        ],
      },
    ],
    []
  );

  async function subscribe(plan: PlanKey) {
    try {
      if (!workspaceId) {
        alert("Workspace not found. Please login and create a workspace first.");
        window.location.href = "/login";
        return;
      }
      if (!email) {
        alert("Please login first so we can attach your subscription to your account.");
        window.location.href = "/login";
        return;
      }

      setLoadingPlan(plan);

      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          workspace_id: workspaceId,
          email,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.url) {
        throw new Error(json?.error || "Failed to start checkout session");
      }

      window.location.href = json.url;
    } catch (e: any) {
      alert(e?.message || "Something went wrong");
    } finally {
      setLoadingPlan("");
    }
  }

  return (
    <main
      style={{
        padding: 18,
        maxWidth: 1050,
        margin: "0 auto",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 34, lineHeight: 1.1 }}>
          Pricing
        </h1>
        <p style={{ margin: "10px 0 0", color: "#5B6475" }}>
          Choose a plan. Billing is currently in <b>{currency}</b>.
          <br />
          If you’re outside the US, we’ll add automatic currency switching soon.
        </p>
      </div>

      {/* Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 14,
        }}
      >
        {plans.map((p) => (
          <div
            key={p.key}
            style={{
              border: p.recommended ? "2px solid #1F6FEB" : "1px solid #E6E8EE",
              borderRadius: 18,
              padding: 16,
              background: "#fff",
              boxShadow: p.recommended
                ? "0 14px 28px rgba(31,111,235,0.15)"
                : "0 10px 24px rgba(0,0,0,0.05)",
              position: "relative",
            }}
          >
            {p.recommended && (
              <div
                style={{
                  position: "absolute",
                  top: 12,
                  right: 12,
                  background: "#1F6FEB",
                  color: "#fff",
                  padding: "6px 10px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 900,
                }}
              >
                Recommended
              </div>
            )}

            <div style={{ fontWeight: 900, fontSize: 18 }}>{p.name}</div>
            <div style={{ marginTop: 8 }}>
              <span style={{ fontSize: 34, fontWeight: 900 }}>{p.price}</span>{" "}
              <span style={{ color: "#5B6475" }}>
                {p.period}
              </span>
            </div>
            <div style={{ marginTop: 6, color: "#5B6475" }}>{p.description}</div>

            <div style={{ marginTop: 12 }}>
              <ul style={{ margin: 0, paddingLeft: 18, color: "#0B1220" }}>
                {p.features.map((f) => (
                  <li key={f} style={{ marginBottom: 6, lineHeight: 1.3 }}>
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            <button
              onClick={() => subscribe(p.key)}
              disabled={!!loadingPlan}
              style={{
                marginTop: 14,
                width: "100%",
                padding: "12px 14px",
                borderRadius: 14,
                border: p.recommended ? "1px solid #1F6FEB" : "1px solid #0B1220",
                background: p.recommended ? "#1F6FEB" : "#0B1220",
                color: "#fff",
                fontWeight: 900,
                cursor: loadingPlan ? "not-allowed" : "pointer",
                opacity: loadingPlan && loadingPlan !== p.key ? 0.7 : 1,
              }}
            >
              {loadingPlan === p.key ? "Redirecting…" : "Choose plan"}
            </button>

            {/* Debug info (optional, safe to delete) */}
            <div style={{ marginTop: 10, fontSize: 12, color: "#5B6475" }}>
              Price ID: <code>{PRICE_IDS[p.key]}</code>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ marginTop: 16, color: "#5B6475", fontSize: 13 }}>
        <div>
          Logged in as: <b>{email || "Not logged in"}</b>
        </div>
        <div>
          Workspace: <b>{workspaceId || "Not set"}</b>
        </div>
      </div>
    </main>
  );
}
