"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import AuthGate from "@/components/AuthWorkspaceGate";

type ProductRow = {
  id: string;
  name: string;
  reorder_threshold: number;
  inventory_balances?: { quantity_on_hand: number }[];
};

type SaleRow = {
  id: string;
  product_id: string;
  quantity_sold: number;
  unit_price: number;
  payment_status: "paid" | "unpaid";
  created_at: string;
};

type ExpenseRow = {
  id: string;
  category: string;
  name?: string;
  description?: string;
  amount: number;
  created_at: string;
};

type Period = "today" | "this_month";

const BRAND = "#1F6FEB";
const BORDER = "#E6E8EE";
const TEXT = "#0B1220";
const MUTED = "#5B6475";
const SOFT = "#F7F9FC";
const RED = "#D92D20";

export default function DashboardPage() {
  const [workspaceId, setWorkspaceId] = useState<string>("");

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);

  const [analytics, setAnalytics] = useState<any>(null);
  const [period, setPeriod] = useState<Period>("today"); // ✅ daily default

  useEffect(() => {
    const ws = localStorage.getItem("workspace_id") || "";
    setWorkspaceId(ws);
  }, []);

  async function loadProducts() {
    if (!workspaceId) return;
    const { data, error } = await supabase
      .from("products")
      .select("id, name, reorder_threshold, inventory_balances(quantity_on_hand)")
      .eq("workspace_id", workspaceId)
      .order("name", { ascending: true });

    if (error) return alert("Failed to load products: " + error.message);
    setProducts((data as any) || []);
  }

  async function loadSales() {
    if (!workspaceId) return;
    const { data, error } = await supabase
      .from("sales")
      .select("id, product_id, quantity_sold, unit_price, payment_status, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return alert("Failed to load sales: " + error.message);
    setSales((data as any) || []);
  }

  async function loadExpenses() {
    if (!workspaceId) return;
    const { data, error } = await supabase
      .from("expenses")
      .select("id, category, name, description, amount, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return alert("Failed to load expenses: " + error.message);
    setExpenses((data as any) || []);
  }

  async function loadAnalytics(p: Period) {
    if (!workspaceId) return;

    const res = await fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace_id: workspaceId, period: p }),
    });

    const json = await res.json().catch(() => ({}));
    if (json?.ok) setAnalytics(json.data);
  }

  async function loadDashboard(p: Period) {
    await Promise.all([loadProducts(), loadSales(), loadExpenses(), loadAnalytics(p)]);
  }

  useEffect(() => {
    if (!workspaceId) return;
    loadDashboard(period);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  // re-load analytics when period changes
  useEffect(() => {
    if (!workspaceId) return;
    loadAnalytics(period);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, workspaceId]);

  // AUTO REFRESH WHEN ASSISTANT UPDATES DATA
  useEffect(() => {
    const onRefresh = () => loadDashboard(period);
    window.addEventListener("adora:refresh", onRefresh);
    return () => window.removeEventListener("adora:refresh", onRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, period]);

  const productNameById = useMemo(() => {
    return Object.fromEntries(products.map((p) => [p.id, p.name]));
  }, [products]);

  const lowStock = useMemo(() => {
    return products
      .map((p) => {
        const onHand = Number(p.inventory_balances?.[0]?.quantity_on_hand ?? 0);
        const reorder = Number(p.reorder_threshold ?? 0);
        return { ...p, onHand, reorder };
      })
      .filter((p) => p.onHand <= p.reorder)
      .sort((a, b) => a.onHand - b.onHand);
  }, [products]);

  function fmt(n: any) {
    const x = Number(n || 0);
    return x.toFixed(2);
  }

  const periodLabel = period === "today" ? "Today" : "This Month";

  const cardStyle: React.CSSProperties = {
    border: `1px solid ${BORDER}`,
    borderRadius: 18,
    padding: 16,
    background: "#fff",
    boxShadow: "0 12px 28px rgba(0,0,0,0.06)",
  };

  return (
    <AuthGate>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            marginBottom: 14,
          }}
        >
          <h1 style={{ fontSize: 34, margin: 0, color: TEXT }}>Dashboard</h1>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ fontSize: 12, color: MUTED, fontWeight: 800 }}>
              Summary period
            </div>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period)}
              style={{
                padding: "10px 12px",
                borderRadius: 14,
                border: `1px solid ${BORDER}`,
                background: SOFT,
                fontWeight: 800,
                color: TEXT,
                outline: "none",
              }}
            >
              <option value="today">Today</option>
              <option value="this_month">This Month</option>
            </select>
          </div>
        </div>

        {/* Analytics Cards */}
        {analytics && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 14,
              marginBottom: 18,
            }}
          >
            <div style={cardStyle}>
              <div style={{ color: MUTED, fontWeight: 900, fontSize: 12 }}>
                {periodLabel} Revenue
              </div>
              <div style={{ fontSize: 28, fontWeight: 950, marginTop: 6 }}>
                ${fmt(analytics.revenueTotal)}
              </div>
              <div style={{ marginTop: 8, color: MUTED, fontWeight: 800 }}>
                Paid: ${fmt(analytics.revenuePaid)} • Unpaid: ${fmt(analytics.revenueUnpaid)}
              </div>
            </div>

            <div style={cardStyle}>
              <div style={{ color: MUTED, fontWeight: 900, fontSize: 12 }}>
                {periodLabel} Expenses
              </div>
              <div style={{ fontSize: 28, fontWeight: 950, marginTop: 6 }}>
                ${fmt(analytics.expensesTotal)}
              </div>
              <div style={{ marginTop: 8, color: MUTED, fontWeight: 800 }}>
                Inventory purchases: ${fmt(analytics.inventoryPurchases)}
              </div>
            </div>

            <div style={cardStyle}>
              <div style={{ color: MUTED, fontWeight: 900, fontSize: 12 }}>
                Profit (after inventory purchases)
              </div>
              <div style={{ fontSize: 28, fontWeight: 950, marginTop: 6 }}>
                ${fmt(analytics.profitAfterInventoryPurchases)}
              </div>
            </div>

            <div style={cardStyle}>
              <div style={{ color: MUTED, fontWeight: 900, fontSize: 12 }}>
                Profit (operational only)
              </div>
              <div style={{ fontSize: 28, fontWeight: 950, marginTop: 6 }}>
                ${fmt(analytics.profitWithoutInventoryPurchases)}
              </div>
              <div style={{ marginTop: 8, color: MUTED, fontWeight: 800 }}>
                Excludes inventory purchases
              </div>
            </div>
          </div>
        )}

        {/* Top Products */}
        {analytics?.topProducts?.length > 0 && (
          <div style={{ ...cardStyle, marginBottom: 14 }}>
            <div style={{ fontWeight: 950, marginBottom: 10, color: TEXT }}>
              Top Selling Products ({periodLabel})
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {analytics.topProducts.map((p: any) => (
                <div
                  key={p.product_id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "10px 12px",
                    borderRadius: 14,
                    border: `1px solid ${BORDER}`,
                    background: SOFT,
                  }}
                >
                  <div style={{ fontWeight: 900, color: TEXT }}>{p.name}</div>
                  <div style={{ color: MUTED, fontWeight: 800 }}>
                    {p.qtySold} sold • ${fmt(p.revenue)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Low Stock */}
        <div style={{ ...cardStyle, marginBottom: 14 }}>
          <div style={{ fontWeight: 950, marginBottom: 10, color: TEXT }}>
            Low Stock Alerts
          </div>

          {lowStock.length === 0 ? (
            <div style={{ color: MUTED, fontWeight: 800 }}>✅ No low stock items</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {lowStock.map((p: any) => (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "10px 12px",
                    borderRadius: 14,
                    border: `1px solid ${BORDER}`,
                    background: "#fff",
                  }}
                >
                  <div style={{ fontWeight: 900, color: TEXT }}>{p.name}</div>
                  <div style={{ fontWeight: 950, color: RED }}>
                    stock: {p.onHand} (reorder: {p.reorder})
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Sales + Expenses */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 14,
          }}
        >
          <div style={cardStyle}>
            <div style={{ fontWeight: 950, marginBottom: 10, color: TEXT }}>
              Recent Sales
            </div>
            {sales.length === 0 ? (
              <div style={{ color: MUTED, fontWeight: 800 }}>No sales yet</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {sales.slice(0, 10).map((s) => {
                  const name = productNameById[s.product_id] || s.product_id;
                  return (
                    <div
                      key={s.id}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 14,
                        border: `1px solid ${BORDER}`,
                        background: SOFT,
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                      }}
                    >
                      <div style={{ fontWeight: 900, color: TEXT }}>{name}</div>
                      <div style={{ color: MUTED, fontWeight: 800 }}>
                        {s.quantity_sold} × ${fmt(s.unit_price)} • {s.payment_status}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={cardStyle}>
            <div style={{ fontWeight: 950, marginBottom: 10, color: TEXT }}>
              Recent Expenses
            </div>
            {expenses.length === 0 ? (
              <div style={{ color: MUTED, fontWeight: 800 }}>No expenses yet</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {expenses.slice(0, 10).map((e) => (
                  <div
                    key={e.id}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 14,
                      border: `1px solid ${BORDER}`,
                      background: SOFT,
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <div style={{ fontWeight: 900, color: TEXT }}>
                      {e.name || e.category || "expense"}
                    </div>
                    <div style={{ color: MUTED, fontWeight: 900 }}>
                      ${fmt(e.amount)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AuthGate>
  );
}
