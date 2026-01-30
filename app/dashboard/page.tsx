"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import AuthGate from "@/components/AuthGate";

type ProductRow = {
  id: string;
  name: string;
  reorder_threshold: number;
  inventory_balances?: { quantity_on_hand: number }[];
};

type SaleRow = {
  id: string;
  workspace_id: string;
  unit_price: number;
  quantity_sold: number;
};

type ExpenseRow = {
  id: string;
  workspace_id: string;
  amount: number;
};

export default function DashboardPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [salesTotal, setSalesTotal] = useState<number>(0);
  const [expensesTotal, setExpensesTotal] = useState<number>(0);

  // Get workspace_id from localStorage safely (client-only)
  useEffect(() => {
    setWorkspaceId(localStorage.getItem("workspace_id"));
  }, []);

  async function loadDashboard() {
    if (!workspaceId) return;
    setLoading(true);

    // 1) Products + Inventory (joined)
    const { data: prodData, error: prodErr } = await supabase
      .from("products")
      .select(
        `
        id,
        name,
        reorder_threshold,
        inventory_balances(quantity_on_hand)
      `
      )
      .eq("workspace_id", workspaceId)
      .order("name", { ascending: true });

    if (prodErr) console.warn("Products load error:", prodErr.message);
    setProducts((prodData as ProductRow[]) || []);

    // 2) Sales total (sum quantity_sold * unit_price)
    const { data: salesData, error: salesErr } = await supabase
      .from("sales")
      .select("id, workspace_id, unit_price, quantity_sold")
      .eq("workspace_id", workspaceId);

    if (salesErr) console.warn("Sales load error:", salesErr.message);

    const sTotal =
      (salesData as SaleRow[] | null)?.reduce((sum, s) => {
        const qty = Number(s.quantity_sold || 0);
        const price = Number(s.unit_price || 0);
        return sum + qty * price;
      }, 0) ?? 0;

    setSalesTotal(sTotal);

    // 3) Expenses total (sum amount)
    const { data: expData, error: expErr } = await supabase
      .from("expenses")
      .select("id, workspace_id, amount")
      .eq("workspace_id", workspaceId);

    if (expErr) console.warn("Expenses load error:", expErr.message);

    const eTotal =
      (expData as ExpenseRow[] | null)?.reduce(
        (sum, e) => sum + Number(e.amount || 0),
        0
      ) ?? 0;

    setExpensesTotal(eTotal);

    setLoading(false);
  }

  useEffect(() => {
    if (!workspaceId) return;
    loadDashboard();
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

  const profit = useMemo(() => salesTotal - expensesTotal, [salesTotal, expensesTotal]);

  return (
    <AuthGate>
      <div style={{ padding: 24, maxWidth: 900 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h1 style={{ margin: 0 }}>Dashboard</h1>
            <div style={{ marginTop: 6, opacity: 0.75 }}>
              Workspace: {workspaceId ? workspaceId : "—"}
            </div>
          </div>

          <button onClick={loadDashboard} disabled={loading || !workspaceId}>
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {/* Summary cards */}
        <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
          <div style={cardStyle}>
            <div style={labelStyle}>Total Sales</div>
            <div style={valueStyle}>${salesTotal.toFixed(2)}</div>
          </div>

          <div style={cardStyle}>
            <div style={labelStyle}>Total Expenses</div>
            <div style={valueStyle}>${expensesTotal.toFixed(2)}</div>
          </div>

          <div style={cardStyle}>
            <div style={labelStyle}>Profit</div>
            <div style={valueStyle}>${profit.toFixed(2)}</div>
          </div>
        </div>

        {/* Low Stock Widget */}
        <h2 style={{ marginTop: 22 }}>Low Stock</h2>

        {loading ? (
          <div style={{ padding: 12 }}>Loading...</div>
        ) : lowStock.length === 0 ? (
          <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 10 }}>
            ✅ No low-stock items
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {lowStock.map((p) => (
              <div key={p.id} style={cardStyle}>
                <div style={{ fontWeight: 700 }}>{p.name}</div>
                <div style={{ marginTop: 6 }}>
                  On hand:{" "}
                  <span style={{ color: p.onHand <= p.reorder ? "crimson" : "inherit" }}>
                    {p.onHand}
                  </span>
                </div>
                <div>Reorder level: {p.reorder}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AuthGate>
  );
}

const cardStyle: React.CSSProperties = {
  border: "1px solid #eee",
  borderRadius: 12,
  padding: 14,
  background: "white",
};

const labelStyle: React.CSSProperties = {
  fontSize: 14,
  opacity: 0.7,
};

const valueStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  marginTop: 6,
};
