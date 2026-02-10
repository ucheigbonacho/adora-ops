"use client";

import { useEffect, useState } from "react";
import AuthGate from "@/components/AuthWorkspaceGate";
import { supabase } from "@/lib/supabaseClient";

type Product = {
  id: string;
  name: string;
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

function stripLeadingZeros(s: string) {
  // allow decimals for price
  const cleaned = String(s ?? "").replace(/[^\d.]/g, "");
  if (!cleaned) return "";

  const parts = cleaned.split(".");
  const intPart = parts[0] ?? "";
  const decPart = parts.length > 1 ? parts.slice(1).join("") : "";

  const intNoZeros = intPart.replace(/^0+(?=\d)/, "");
  if (parts.length > 1) return `${intNoZeros || "0"}.${decPart.replace(/[^\d]/g, "")}`;

  return (intNoZeros || "0").replace(/[^\d]/g, "");
}

function toNumberSafe(v: string, fallback = 0) {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : fallback;
}

export default function SalesPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);

  const [productId, setProductId] = useState("");
  const [qtyStr, setQtyStr] = useState("1"); // ✅ string
  const [unitPriceStr, setUnitPriceStr] = useState("0"); // ✅ string
  const [paymentStatus, setPaymentStatus] = useState<string>("paid");

  const [loading, setLoading] = useState(false);

  // UI sizing (bigger + friendlier)
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 12px",
    marginTop: 8,
    borderRadius: 12,
    border: "1px solid #E6E8EE",
    fontSize: 16,
    outline: "none",
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    appearance: "auto",
    background: "#fff",
  };

  const buttonStyle: React.CSSProperties = {
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid #0B1220",
    background: "#0B1220",
    color: "#fff",
    fontWeight: 900,
    fontSize: 16,
    cursor: "pointer",
  };

  useEffect(() => {
    setWorkspaceId(localStorage.getItem("workspace_id"));
  }, []);

  // 🔄 AUTO REFRESH WHEN ASSISTANT UPDATES DATA
  useEffect(() => {
    const onRefresh = () => loadSales();
    window.addEventListener("adora:refresh", onRefresh);
    return () => window.removeEventListener("adora:refresh", onRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  async function loadProducts() {
    if (!workspaceId) return;

    const { data, error } = await supabase
      .from("products")
      .select("id, name")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (error) {
      alert("Failed to load products: " + error.message);
      return;
    }

    const rows = (data as Product[]) || [];
    setProducts(rows);

    if (!productId && rows.length > 0) setProductId(rows[0].id);
  }

  async function loadSales() {
    if (!workspaceId) return;

    const { data, error } = await supabase
      .from("sales")
      .select("id, product_id, quantity_sold, unit_price, total_amount, payment_status, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (error) {
      alert("Failed to load sales: " + error.message);
      return;
    }

    setSales((data as SaleRow[]) || []);
  }

  async function sendLowStockAlertIfNeeded(productId: string) {
    if (!workspaceId) return;

    const { data: prod, error: prodErr } = await supabase
      .from("products")
      .select("name, reorder_threshold")
      .eq("workspace_id", workspaceId)
      .eq("id", productId)
      .single();

    if (prodErr) {
      console.warn("Low-stock check: product fetch failed:", prodErr.message);
      return;
    }

    const { data: bal, error: balErr } = await supabase
      .from("inventory_balances")
      .select("quantity_on_hand")
      .eq("workspace_id", workspaceId)
      .eq("product_id", productId)
      .maybeSingle();

    if (balErr) {
      console.warn("Low-stock check: balance fetch failed:", balErr.message);
      return;
    }

    const onHand = Number(bal?.quantity_on_hand ?? 0);
    const reorder = Number(prod?.reorder_threshold ?? 0);

    if (onHand <= reorder) {
      const res = await fetch("/api/make", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          event: "low_stock",
          product_name: prod.name,
          quantity_on_hand: onHand,
          reorder_threshold: prod.reorder_threshold,
        }),
      });

      console.log("MAKE RESPONSE STATUS:", res.status);
    }
  }

  async function recordSale() {
    if (!workspaceId) return;

    if (!productId) {
      alert("Select a product");
      return;
    }

    const qty = Math.max(1, Math.floor(toNumberSafe(qtyStr, 1)));
    const unitPrice = Math.max(0, toNumberSafe(unitPriceStr, 0));

    setLoading(true);

    try {
      const totalAmount = unitPrice * qty;

      // 1) Insert sale record
      const { error: saleErr } = await supabase.from("sales").insert([
        {
          workspace_id: workspaceId,
          product_id: productId,
          quantity_sold: qty,
          unit_price: unitPrice,
          total_amount: totalAmount,
          payment_status: paymentStatus,
        },
      ]);

      if (saleErr) throw new Error("Failed to record sale: " + saleErr.message);

      // 2) Update inventory balance (deduct) — scope by workspace_id
      const { data: balRow, error: balErr } = await supabase
        .from("inventory_balances")
        .select("quantity_on_hand")
        .eq("workspace_id", workspaceId)
        .eq("product_id", productId)
        .maybeSingle();

      if (balErr) throw new Error("Sale saved, but failed reading inventory: " + balErr.message);

      const currentOnHand = Number(balRow?.quantity_on_hand ?? 0);
      const newOnHand = currentOnHand - qty;

      if (balRow) {
        const { error: updErr } = await supabase
          .from("inventory_balances")
          .update({ quantity_on_hand: newOnHand })
          .eq("workspace_id", workspaceId)
          .eq("product_id", productId);

        if (updErr) throw new Error("Sale saved, but failed updating inventory: " + updErr.message);
      } else {
        const { error: insErr } = await supabase.from("inventory_balances").insert([
          { workspace_id: workspaceId, product_id: productId, quantity_on_hand: newOnHand },
        ]);

        if (insErr) throw new Error("Sale saved, but failed creating inventory: " + insErr.message);
      }

      // 3) Log inventory movement (optional)
      const { error: moveErr } = await supabase.from("inventory_movements").insert([
        {
          workspace_id: workspaceId,
          product_id: productId,
          quantity_change: -qty,
          reason: "sale",
        },
      ]);

      if (moveErr) console.warn("Movement insert failed:", moveErr.message);

      await loadSales();
      await sendLowStockAlertIfNeeded(productId);

      window.dispatchEvent(new Event("adora:refresh"));
      alert("Sale recorded successfully ✅");
    } catch (e: any) {
      alert(e?.message || "Failed to record sale.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (workspaceId) {
      loadProducts();
      loadSales();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  function productName(id: string) {
    return products.find((p) => p.id === id)?.name ?? id;
  }

  return (
    <AuthGate>
      <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
        <h1 style={{ fontSize: 28, marginBottom: 12 }}>Sales</h1>

        <div
          style={{
            display: "grid",
            gap: 12,
            maxWidth: 560,
            padding: 16,
            borderRadius: 18,
            border: "1px solid #E6E8EE",
            background: "#fff",
            boxShadow: "0 10px 26px rgba(0,0,0,0.06)",
          }}
        >
          <label style={{ fontWeight: 800 }}>
            Product
            <select value={productId} onChange={(e) => setProductId(e.target.value)} style={selectStyle}>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label style={{ fontWeight: 800 }}>
            Quantity sold
            <input
              type="text"
              inputMode="numeric"
              value={qtyStr}
              onChange={(e) => setQtyStr(stripLeadingZeros(e.target.value))}
              style={inputStyle}
            />
          </label>

          <label style={{ fontWeight: 800 }}>
            Unit price
            <input
              type="text"
              inputMode="decimal"
              value={unitPriceStr}
              onChange={(e) => setUnitPriceStr(stripLeadingZeros(e.target.value))}
              style={inputStyle}
            />
          </label>

          <label style={{ fontWeight: 800 }}>
            Payment status
            <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)} style={selectStyle}>
              <option value="paid">paid</option>
              <option value="unpaid">unpaid</option>
              <option value="partial">partial</option>
            </select>
          </label>

          <button onClick={recordSale} disabled={loading} style={buttonStyle}>
            {loading ? "Recording..." : "Record Sale"}
          </button>
        </div>

        <hr style={{ margin: "22px 0", borderColor: "#E6E8EE" }} />

        <h2 style={{ fontSize: 20, marginBottom: 10 }}>Sales History</h2>

        {sales.length === 0 ? (
          <p>No sales yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {sales.map((s) => (
              <div
                key={s.id}
                style={{
                  border: "1px solid #E6E8EE",
                  padding: 14,
                  borderRadius: 14,
                  background: "#fff",
                  boxShadow: "0 10px 26px rgba(0,0,0,0.06)",
                }}
              >
                <b style={{ fontSize: 16 }}>{productName(s.product_id)}</b>
                <div style={{ marginTop: 6 }}>Qty sold: {s.quantity_sold}</div>
                <div>Unit price: {s.unit_price ?? 0}</div>
                <div>Total: {s.total_amount ?? 0}</div>
                <div>Status: {s.payment_status ?? "—"}</div>
                <small style={{ color: "#5B6475" }}>{new Date(s.created_at).toLocaleString()}</small>
              </div>
            ))}
          </div>
        )}
      </div>
    </AuthGate>
  );
}
