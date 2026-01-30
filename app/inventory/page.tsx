"use client";

import { useEffect, useState } from "react";
import AuthGate from "@/components/AuthWorkspaceGate";
import { supabase } from "@/lib/supabaseClient";

type InventoryRow = {
  id: string;
  name: string;
  reorder_threshold: number;
  inventory_balances?: { quantity_on_hand: number }[];
};

export default function InventoryPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [items, setItems] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setWorkspaceId(localStorage.getItem("workspace_id"));
  }, []);

  async function loadInventory() {
    if (!workspaceId) return;

    const { data, error } = await supabase
      .from("products")
      .select("id, name, reorder_threshold, inventory_balances(quantity_on_hand)")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (error) {
      alert("Failed to load inventory: " + error.message);
      return;
    }

    setItems((data as InventoryRow[]) || []);
  }

  async function changeStock(productId: string, delta: number) {
    if (!workspaceId) return;
    if (!delta || delta === 0) return;

    setLoading(true);

    // 1) Read current balance (if any)
    const { data: balRow, error: balErr } = await supabase
      .from("inventory_balances")
      .select("quantity_on_hand")
      .eq("product_id", productId)
      .maybeSingle();

    if (balErr) {
      setLoading(false);
      alert("Failed reading inventory balance: " + balErr.message);
      return;
    }

    const current = Number(balRow?.quantity_on_hand ?? 0);
    const next = current + delta;

    // 2) Upsert balance
    if (balRow) {
      const { error: updErr } = await supabase
        .from("inventory_balances")
        .update({ quantity_on_hand: next })
        .eq("product_id", productId);

      if (updErr) {
        setLoading(false);
        alert("Failed updating inventory: " + updErr.message);
        return;
      }
    } else {
      const { error: insErr } = await supabase
        .from("inventory_balances")
        .insert([{ product_id: productId, quantity_on_hand: next }]);

      if (insErr) {
        setLoading(false);
        alert("Failed creating inventory balance: " + insErr.message);
        return;
      }
    }

    // 3) Log movement (optional but recommended)
    const reason = delta > 0 ? "stock_add" : "stock_remove";
    const { error: moveErr } = await supabase.from("inventory_movements").insert([
      {
        workspace_id: workspaceId,
        product_id: productId,
        quantity_change: delta,
        reason,
      },
    ]);

    if (moveErr) {
      // don't block user if movement table differs
      console.warn("Movement insert failed:", moveErr.message);
    }

    await loadInventory();
    setLoading(false);
  }

  useEffect(() => {
    if (workspaceId) loadInventory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  return (
    <AuthGate>
      <div style={{ padding: 24, maxWidth: 900 }}>
        <h1>Inventory</h1>

        {items.length === 0 ? (
          <p>No products yet. Add products first.</p>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {items.map((p) => {
              const onHand = p.inventory_balances?.[0]?.quantity_on_hand ?? 0;
              const low = onHand <= (p.reorder_threshold ?? 0);

              return (
                <div
                  key={p.id}
                  style={{ border: "1px solid #ddd", padding: 14, borderRadius: 10 }}
                >
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{p.name}</div>

                  <div style={{ marginTop: 6 }}>
                    On hand:{" "}
                    <span style={{ color: low ? "red" : "inherit", fontWeight: 700 }}>
                      {onHand}
                    </span>{" "}
                    {low ? "(Low stock)" : ""}
                  </div>

                  <div>Reorder level: {p.reorder_threshold}</div>

                  <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                    <button
                      onClick={() => changeStock(p.id, 1)}
                      disabled={loading}
                      style={{ padding: "6px 10px" }}
                    >
                      Add Stock (+1)
                    </button>

                    <button
                      onClick={() => changeStock(p.id, -1)}
                      disabled={loading}
                      style={{ padding: "6px 10px" }}
                    >
                      Remove Stock (-1)
                    </button>

                    <button
                      onClick={() => changeStock(p.id, 5)}
                      disabled={loading}
                      style={{ padding: "6px 10px" }}
                    >
                      Add (+5)
                    </button>

                    <button
                      onClick={() => changeStock(p.id, -5)}
                      disabled={loading}
                      style={{ padding: "6px 10px" }}
                    >
                      Remove (-5)
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AuthGate>
  );
}
