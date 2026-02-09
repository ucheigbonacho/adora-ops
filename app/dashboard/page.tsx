"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthWorkspaceGate";
import { supabase } from "@/lib/supabaseClient";

type ProductRow = {
  id: string;
  name: string;
  reorder_threshold: number | null;
  cost_price: number | null;
  inventory_balances?: { quantity_on_hand: number | null }[];
};

type SaleRow = {
  id: string;
  product_id: string;
  quantity_sold: number;
  unit_price: number | null;
  total_amount: number | null;
  payment_status: string | null;
  created_at: string;
};

type ExpenseRow = {
  id: string;
  name: string;
  amount: number | null;
  category: string | null;
  created_at: string;
};

type Period = "today" | "month";

function money(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function todayStartISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function monthStartISO() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export default function DashboardPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("month");

  const [loading, setLoading] = useState(false);

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);

  const brand = {
    text: "#0B1220",
    muted: "#5B6475",
    border: "#E6E8EE",
    card: "#FFFFFF",
    cardSoft: "#F7F9FC",
    primary: "#1F6FEB",
    primarySoft: "#E9F2FF",
    danger: "#DC2626",
    dangerSoft: "#FEE2E2",
    success: "#16A34A",
    successSoft: "#ECFDF3",
  };

  useEffect(() => {
    setWorkspaceId(localStorage.getItem("workspace_id"));
  }, []);

  // 🔄 Auto refresh when assistant updates data
  useEffect(() => {
    const onRefresh = () => loadAll();
    window.addEventListener("adora:refresh", onRefresh);
    return () => window.removeEventListener("adora:refresh", onRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, period]);

  async function loadAll() {
    if (!workspaceId) return;
    setLoading(true);

    try {
      const start = period === "today" ? todayStartISO() : monthStartISO();

      // Products + inventory
      const { data: prodData, error: prodErr } = await supabase
        .from("products")
        .select("id, name, reorder_threshold, cost_price, inventory_balances(quantity_on_hand)")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });

      if (prodErr) throw new Error("Failed loading products: " + prodErr.message);

      // Sales
      const { data: salesData, error: salesErr } = await supabase
        .from("sales")
        .select("id, product_id, quantity_sold, unit_price, total_amount, payment_status, created_at")
        .eq("workspace_id", workspaceId)
        .gte("created_at", start)
        .order("created_at", { ascending: false });

      if (salesErr) throw new Error("Failed loading sales: " + salesErr.message);

      // Expenses
      const { data: expData, error: expErr } = await supabase
        .from("expenses")
        .select("id, name, amount, category, created_at")
        .eq("workspace_id", workspaceId)
        .gte("created_at", start)
        .order("created_at", { ascending: false });

      if (expErr) throw new Error("Failed loading expenses: " + expErr.message);

      setProducts((prodData as ProductRow[]) || []);
      setSales((salesData as SaleRow[]) || []);
      setExpenses((expData as ExpenseRow[]) || []);
    } catch (e: any) {
      alert(e?.message || "Failed loading dashboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (workspaceId) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, period]);

  const productById = useMemo(() => {
    const m = new Map<string, ProductRow>();
    (products || []).forEach((p) => m.set(p.id, p));
    return m;
  }, [products]);

  const kpis = useMemo(() => {
    const revenuePaid = (sales || [])
      .filter((s) => String(s.payment_status || "").toLowerCase() === "paid")
      .reduce((sum, s) => sum + Number(s.total_amount ?? (Number(s.unit_price || 0) * Number(s.quantity_sold || 0))), 0);

    const revenueUnpaid = (sales || [])
      .filter((s) => String(s.payment_status || "").toLowerCase() !== "paid")
      .reduce((sum, s) => sum + Number(s.total_amount ?? (Number(s.unit_price || 0) * Number(s.quantity_sold || 0))), 0);

    const revenueTotal = revenuePaid + revenueUnpaid;

    const expensesTotal = (expenses || []).reduce((sum, e) => sum + Number(e.amount || 0), 0);

    const inventoryExpenses = (expenses || [])
      .filter((e) => String(e.category || "").toLowerCase() === "inventory")
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);

    // COGS = sum(qty_sold * products.cost_price)
    const cogs = (sales || []).reduce((sum, s) => {
      const p = productById.get(s.product_id);
      const cost = Number(p?.cost_price ?? 0);
      const qty = Number(s.quantity_sold ?? 0);
      return sum + cost * qty;
    }, 0);

    const profit = revenueTotal - expensesTotal - cogs;

    return {
      revenueTotal,
      revenuePaid,
      revenueUnpaid,
      expensesTotal,
      inventoryExpenses,
      cogs,
      profit,
    };
  }, [sales, expenses, productById]);

  const lowStock = useMemo(() => {
    return (products || [])
      .map((p) => {
        const onHand = Number(p.inventory_balances?.[0]?.quantity_on_hand ?? 0);
        const reorder = Number(p.reorder_threshold ?? 0);
        return { ...p, onHand, reorder, low: onHand <= reorder };
      })
      .filter((p) => p.low)
      .sort((a, b) => a.onHand - b.onHand)
      .slice(0, 10);
  }, [products]);

  const recentSales = useMemo(() => (sales || []).slice(0, 6), [sales]);
  const recentExpenses = useMemo(() => (expenses || []).slice(0, 6), [expenses]);

  function productName(id: string) {
    return productById.get(id)?.name ?? id;
  }

  return (
    <AuthGate>
      <div style={{ padding: 16, maxWidth: 1100, margin: "0 auto", color: brand.text }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.1 }}>Dashboard</h1>
            <p style={{ margin: "8px 0 0", color: brand.muted }}>
              Revenue, profit, expenses, COGS, and low stock — all in one place.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={pillBox(brand)}>
              <button
                onClick={() => setPeriod("today")}
                style={pillBtn(brand, period === "today")}
              >
                Today
              </button>
              <button
                onClick={() => setPeriod("month")}
                style={pillBtn(brand, period === "month")}
              >
                This Month
              </button>
            </div>

            <button onClick={loadAll} disabled={loading} style={btn(brand, "primary")}>
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        {/* KPI Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 14 }}>
          <KpiCard title="Profit" value={`$${money(kpis.profit)}`} tone={kpis.profit >= 0 ? "success" : "danger"} brand={brand} />
          <KpiCard title="Revenue (total)" value={`$${money(kpis.revenueTotal)}`} tone="primary" brand={brand} />
          <KpiCard title="Revenue (paid)" value={`$${money(kpis.revenuePaid)}`} tone="success" brand={brand} />
          <KpiCard title="Revenue (unpaid/other)" value={`$${money(kpis.revenueUnpaid)}`} tone="danger" brand={brand} />
          <KpiCard title="Expenses (total)" value={`$${money(kpis.expensesTotal)}`} tone="danger" brand={brand} />
          <KpiCard title="COGS (from cost_price)" value={`$${money(kpis.cogs)}`} tone="primary" brand={brand} />
        </div>

        {/* 2-column sections */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, marginTop: 12 }}>
          {/* Low Stock */}
          <div style={card(brand)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16 }}>Low Stock</div>
                <div style={{ color: brand.muted, fontSize: 12, marginTop: 4 }}>
                  Products at or below reorder level
                </div>
              </div>
              <div style={{ fontWeight: 900, color: lowStock.length ? brand.danger : brand.success }}>
                {lowStock.length ? `${lowStock.length} items` : "All good ✅"}
              </div>
            </div>

            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {lowStock.length === 0 ? (
                <div style={{ color: brand.muted }}>No low stock items right now.</div>
              ) : (
                lowStock.map((p) => (
                  <div key={p.id} style={row(brand)}>
                    <div style={{ fontWeight: 900 }}>{p.name}</div>
                    <div style={{ color: brand.muted, fontWeight: 800 }}>
                      {p.onHand} / reorder {p.reorder}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={{ marginTop: 10 }}>
              <a href="/inventory" style={linkStyle(brand)}>
                Go to Inventory →
              </a>
            </div>
          </div>

          {/* Recent Sales */}
          <div style={card(brand)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16 }}>Recent Sales</div>
                <div style={{ color: brand.muted, fontSize: 12, marginTop: 4 }}>
                  Latest activity ({period === "today" ? "today" : "this month"})
                </div>
              </div>
              <a href="/sales" style={linkStyle(brand)}>
                View all →
              </a>
            </div>

            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {recentSales.length === 0 ? (
                <div style={{ color: brand.muted }}>No sales in this period.</div>
              ) : (
                recentSales.map((s) => (
                  <div key={s.id} style={row(brand)}>
                    <div style={{ fontWeight: 900 }}>
                      {productName(s.product_id)} • x{Number(s.quantity_sold || 0)}
                    </div>
                    <div style={{ color: brand.muted, fontWeight: 800 }}>
                      ${money(Number(s.total_amount ?? (Number(s.unit_price || 0) * Number(s.quantity_sold || 0))))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent Expenses */}
          <div style={card(brand)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16 }}>Recent Expenses</div>
                <div style={{ color: brand.muted, fontSize: 12, marginTop: 4 }}>
                  Latest spend ({period === "today" ? "today" : "this month"})
                </div>
              </div>
              <a href="/expenses" style={linkStyle(brand)}>
                View all →
              </a>
            </div>

            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {recentExpenses.length === 0 ? (
                <div style={{ color: brand.muted }}>No expenses in this period.</div>
              ) : (
                recentExpenses.map((e) => (
                  <div key={e.id} style={row(brand)}>
                    <div style={{ fontWeight: 900 }}>
                      {e.name}{" "}
                      <span style={{ color: brand.muted, fontWeight: 800 }}>
                        ({String(e.category || "general")})
                      </span>
                    </div>
                    <div style={{ color: brand.muted, fontWeight: 800 }}>
                      ${money(Number(e.amount || 0))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Notes / Quick tips */}
          <div style={card(brand)}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>Quick tips</div>
            <ul style={{ margin: "10px 0 0", color: brand.muted, lineHeight: 1.6 }}>
              <li>
                Profit uses <b>COGS</b> computed from <b>products.cost_price × quantity_sold</b>.
              </li>
              <li>
                If cost price is empty, it’s treated as <b>$0</b> (so profit may look too high).
              </li>
              <li>
                Low-stock is calculated from <b>inventory_balances</b> vs <b>reorder_threshold</b>.
              </li>
            </ul>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
              <a href="/products" style={linkButton(brand)}>
                Update cost prices →
              </a>
              <a href="/import-smart" style={linkButton(brand)}>
                Smart Import →
              </a>
            </div>
          </div>
        </div>
      </div>
    </AuthGate>
  );
}

/* ---------------- UI helpers ---------------- */

function card(brand: any): React.CSSProperties {
  return {
    border: `1px solid ${brand.border}`,
    background: brand.card,
    borderRadius: 18,
    padding: 14,
    boxShadow: "0 10px 26px rgba(0,0,0,0.06)",
  };
}

function row(brand: any): React.CSSProperties {
  return {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    border: `1px solid ${brand.border}`,
    background: brand.cardSoft,
    borderRadius: 14,
    padding: "10px 12px",
  };
}

function btn(brand: any, kind: "primary" | "ghost"): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: "12px 14px",
    borderRadius: 14,
    border: `1px solid ${brand.border}`,
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 14,
  };

  if (kind === "primary") {
    return {
      ...base,
      background: brand.primary,
      border: `1px solid ${brand.primary}`,
      color: "#fff",
    };
  }

  return {
    ...base,
    background: "#fff",
    color: brand.text,
  };
}

function pillBox(brand: any): React.CSSProperties {
  return {
    display: "flex",
    gap: 6,
    padding: 6,
    borderRadius: 16,
    border: `1px solid ${brand.border}`,
    background: "#fff",
  };
}

function pillBtn(brand: any, active: boolean): React.CSSProperties {
  return {
    padding: "10px 12px",
    borderRadius: 12,
    border: `1px solid ${active ? brand.primary : brand.border}`,
    background: active ? brand.primarySoft : "#fff",
    color: active ? brand.primary : brand.text,
    fontWeight: 900,
    cursor: "pointer",
    minWidth: 110,
  };
}

function linkStyle(brand: any): React.CSSProperties {
  return {
    color: brand.primary,
    fontWeight: 900,
    textDecoration: "none",
  };
}

function linkButton(brand: any): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "12px 14px",
    borderRadius: 14,
    border: `1px solid ${brand.border}`,
    background: "#fff",
    color: brand.text,
    fontWeight: 900,
    textDecoration: "none",
  };
}

function KpiCard({
  title,
  value,
  tone,
  brand,
}: {
  title: string;
  value: string;
  tone: "primary" | "success" | "danger";
  brand: any;
}) {
  const bg =
    tone === "success"
      ? brand.successSoft
      : tone === "danger"
      ? brand.dangerSoft
      : brand.primarySoft;

  const color =
    tone === "success"
      ? brand.success
      : tone === "danger"
      ? brand.danger
      : brand.primary;

  return (
    <div
      style={{
        border: `1px solid ${brand.border}`,
        borderRadius: 18,
        padding: 14,
        background: "#fff",
        boxShadow: "0 10px 26px rgba(0,0,0,0.06)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontSize: 12, color: brand.muted, fontWeight: 900 }}>{title}</div>
        <span style={{ padding: "6px 10px", borderRadius: 999, background: bg, color, fontWeight: 900 }}>
          {tone.toUpperCase()}
        </span>
      </div>

      <div style={{ marginTop: 10, fontSize: 24, fontWeight: 1000, letterSpacing: -0.2 }}>
        {value}
      </div>
    </div>
  );
}
