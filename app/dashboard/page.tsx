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

export default function DashboardPage() {
  const [workspaceId, setWorkspaceId] = useState<string>("");

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);

  const [analytics, setAnalytics] = useState<any>(null);

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

    if (error) {
      alert("Failed to load products: " + error.message);
      return;
    }
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

    if (error) {
      alert("Failed to load sales: " + error.message);
      return;
    }
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

    if (error) {
      alert("Failed to load expenses: " + error.message);
      return;
    }
    setExpenses((data as any) || []);
  }

  async function loadAnalytics() {
    if (!workspaceId) return;

    const res = await fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspace_id: workspaceId,
        period: "today",
      }),
    });

    const json = await res.json();
    if (json.ok) setAnalytics(json.data);
  }

  async function loadDashboard() {
    await Promise.all([loadProducts(), loadSales(), loadExpenses(), loadAnalytics()]);
  }

  useEffect(() => {
    if (!workspaceId) return;
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  // AUTO REFRESH WHEN ASSISTANT UPDATES DATA
  useEffect(() => {
    const onRefresh = () => {
      loadDashboard();
    };
    window.addEventListener("adora:refresh", onRefresh);
    return () => window.removeEventListener("adora:refresh", onRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

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

  return (
    <AuthGate>
      <div style={{ padding: 16 }}>
        <h1 style={{ fontSize: 42, marginBottom: 18 }}>Dashboard</h1>

        {/* Analytics Cards */}
        {analytics && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 16,
              marginBottom: 24,
            }}
          >
            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: 16,
                padding: 16,
              }}
            >
              <h3 style={{ margin: 0, marginBottom: 8 }}>Today's Revenue</h3>
              <div style={{ fontSize: 28, fontWeight: 800 }}>
                ${fmt(analytics.revenueTotal)}
              </div>
              <div style={{ marginTop: 6, opacity: 0.85 }}>
                Paid: ${fmt(analytics.revenuePaid)} | Unpaid: $
                {fmt(analytics.revenueUnpaid)}
              </div>
            </div>

            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: 16,
                padding: 16,
              }}
            >
              <h3 style={{ margin: 0, marginBottom: 8 }}>Today's Expenses</h3>
              <div style={{ fontSize: 28, fontWeight: 800 }}>
                ${fmt(analytics.expensesTotal)}
              </div>
              <div style={{ marginTop: 6, opacity: 0.85 }}>
                Inventory purchases: ${fmt(analytics.inventoryPurchases)}
              </div>
            </div>

            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: 16,
                padding: 16,
              }}
            >
              <h3 style={{ margin: 0, marginBottom: 8 }}>
                Profit (after inventory purchases)
              </h3>
              <div style={{ fontSize: 28, fontWeight: 800 }}>
                ${fmt(analytics.profitAfterInventoryPurchases)}
              </div>
            </div>

            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: 16,
                padding: 16,
              }}
            >
              <h3 style={{ margin: 0, marginBottom: 8 }}>
                Profit (operational only)
              </h3>
              <div style={{ fontSize: 28, fontWeight: 800 }}>
                ${fmt(analytics.profitWithoutInventoryPurchases)}
              </div>
              <div style={{ marginTop: 6, opacity: 0.85 }}>
                Excludes inventory purchases
              </div>
            </div>
          </div>
        )}

        {/* Top Products */}
        {analytics?.topProducts?.length > 0 && (
          <div
            style={{
              border: "1px solid #ddd",
              borderRadius: 16,
              padding: 16,
              marginBottom: 24,
            }}
          >
            <h3 style={{ margin: 0, marginBottom: 12 }}>
              Top Selling Products Today
            </h3>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {analytics.topProducts.map((p: any) => (
                <li key={p.product_id} style={{ marginBottom: 6 }}>
                  <b>{p.name}</b> — {p.qtySold} sold (${fmt(p.revenue)})
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Low Stock */}
        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: 16,
            padding: 16,
            marginBottom: 24,
          }}
        >
          <h3 style={{ margin: 0, marginBottom: 12 }}>Low Stock Alerts</h3>
          {lowStock.length === 0 ? (
            <div>✅ No low stock items</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {lowStock.map((p: any) => (
                <li key={p.id}>
                  {p.name} — stock: {p.onHand} (reorder: {p.reorder})
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent Sales + Expenses */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ border: "1px solid #ddd", borderRadius: 16, padding: 16 }}>
            <h3 style={{ margin: 0, marginBottom: 12 }}>Recent Sales</h3>
            {sales.length === 0 ? (
              <div>No sales yet</div>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {sales.slice(0, 10).map((s) => (
                  <li key={s.id}>
                    product_id: {s.product_id} — {s.quantity_sold} x ${s.unit_price} (
                    {s.payment_status})
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div style={{ border: "1px solid #ddd", borderRadius: 16, padding: 16 }}>
            <h3 style={{ margin: 0, marginBottom: 12 }}>Recent Expenses</h3>
            {expenses.length === 0 ? (
              <div>No expenses yet</div>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {expenses.slice(0, 10).map((e) => (
                  <li key={e.id}>
                    {e.category} — ${(e.amount || 0).toFixed(2)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </AuthGate>
  );
}

