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

export default function SalesPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);

  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState<number>(1);
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [paymentStatus, setPaymentStatus] = useState<string>("paid");

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setWorkspaceId(localStorage.getItem("workspace_id"));
  }, []);
    useEffect(() => {
    loadSales();
  }, []);

  // 🔄 AUTO REFRESH WHEN ASSISTANT UPDATES DATA
  useEffect(() => {
    const onRefresh = () => loadSales();
    window.addEventListener("adora:refresh", onRefresh);
    return () => window.removeEventListener("adora:refresh", onRefresh);
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

    // auto-select first product if none selected
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

  // Get product reorder level
  const { data: prod, error: prodErr } = await supabase
    .from("products")
    .select("name, reorder_threshold")
    .eq("id", productId)
    .single();

  if (prodErr) {
    console.warn("Low-stock check: product fetch failed:", prodErr.message);
    return;
  }

  // Get current on-hand
  const { data: bal, error: balErr } = await supabase
    .from("inventory_balances")
    .select("quantity_on_hand")
    .eq("product_id", productId)
    .maybeSingle();

  if (balErr) {
    console.warn("Low-stock check: balance fetch failed:", balErr.message);
    return;
  }

  const onHand = Number(bal?.quantity_on_hand ?? 0);
  const reorder = Number(prod?.reorder_threshold ?? 0);

  if (onHand <= reorder) {
    // Call your server endpoint that forwards to Make (keeps secrets safe)
    console.log("LOW STOCK TRIGGERING MAKE...", {
  productId,
  productName: prod.name,
  onHand,
  reorder: prod.reorder_threshold,
});

    console.log("LOW STOCK TRIGGERING MAKE...", {
  productId,
  productName: prod.name,
  onHand,
  reorder: prod.reorder_threshold,
});

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
    if (!qty || qty <= 0) {
      alert("Quantity must be at least 1");
      return;
    }

    setLoading(true);

    const totalAmount = Number(unitPrice || 0) * Number(qty || 0);

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

    if (saleErr) {
      setLoading(false);
      alert("Failed to record sale: " + saleErr.message);
      return;
    }

    // 2) Update inventory balance (deduct)
    const { data: balRow, error: balErr } = await supabase
      .from("inventory_balances")
      .select("quantity_on_hand")
      .eq("product_id", productId)
      .maybeSingle();

    if (balErr) {
      setLoading(false);
      alert("Sale saved, but failed reading inventory: " + balErr.message);
      return;
    }

    const currentOnHand = Number(balRow?.quantity_on_hand ?? 0);
    const newOnHand = currentOnHand - qty;

    if (balRow) {
      const { error: updErr } = await supabase
        .from("inventory_balances")
        .update({ quantity_on_hand: newOnHand })
        .eq("product_id", productId);

      if (updErr) {
        setLoading(false);
        alert("Sale saved, but failed updating inventory: " + updErr.message);
        return;
      }
    } else {
      // if no balance row exists yet, create one (will be negative if they sell without stock)
      const { error: insErr } = await supabase
        .from("inventory_balances")
        .insert([{ product_id: productId, quantity_on_hand: newOnHand }]);

      if (insErr) {
        setLoading(false);
        alert("Sale saved, but failed creating inventory balance: " + insErr.message);
        return;
      }
    }

    // 3) Log inventory movement (optional but recommended)
    // Keep it minimal (these columns usually exist)
    const { error: moveErr } = await supabase.from("inventory_movements").insert([
      {
        workspace_id: workspaceId,
        product_id: productId,
        quantity_change: -qty,
        reason: "sale",
      },
    ]);

    if (moveErr) {
      // Don’t block the user—sale already recorded and inventory updated
      console.warn("Movement insert failed:", moveErr.message);
    }

    await loadSales();
    await sendLowStockAlertIfNeeded(productId);
    setLoading(false);
    alert("Sale recorded successfully ✅");
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
      <div style={{ padding: 24, maxWidth: 900 }}>
        <h1>Sales</h1>

        <div style={{ display: "grid", gap: 10, maxWidth: 520 }}>
          <label>
            Product
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              style={{ width: "100%", padding: 8, marginTop: 6 }}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Quantity sold
            <input
              type="number"
              value={qty}
              min={1}
              onChange={(e) => setQty(Number(e.target.value))}
              style={{ width: "100%", padding: 8, marginTop: 6 }}
            />
          </label>

          <label>
            Unit price
            <input
              type="number"
              value={unitPrice}
              min={0}
              onChange={(e) => setUnitPrice(Number(e.target.value))}
              style={{ width: "100%", padding: 8, marginTop: 6 }}
            />
          </label>

          <label>
            Payment status
            <select
              value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value)}
              style={{ width: "100%", padding: 8, marginTop: 6 }}
            >
              <option value="paid">paid</option>
              <option value="unpaid">unpaid</option>
              <option value="partial">partial</option>
            </select>
          </label>

          <button onClick={recordSale} disabled={loading}>
            {loading ? "Recording..." : "Record Sale"}
          </button>
        </div>

        <hr style={{ margin: "20px 0" }} />

        <h2>Sales History</h2>
        {sales.length === 0 ? (
          <p>No sales yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {sales.map((s) => (
              <div key={s.id} style={{ border: "1px solid #ddd", padding: 12, borderRadius: 8 }}>
                <b>{productName(s.product_id)}</b>
                <div>Qty sold: {s.quantity_sold}</div>
                <div>Unit price: {s.unit_price ?? 0}</div>
                <div>Total: {s.total_amount ?? 0}</div>
                <div>Status: {s.payment_status ?? "—"}</div>
                <small>{new Date(s.created_at).toLocaleString()}</small>
              </div>
            ))}
          </div>
        )}
      </div>
    </AuthGate>
  );
}

