"use client";

import { useEffect, useState } from "react";
import AuthGate from "@/components/AuthWorkspaceGate";
import { supabase } from "@/lib/supabaseClient";

type InventoryRow = {
  id: string;
  name: string;
  reorder_threshold: number | null;
  inventory_balances?: { quantity_on_hand: number | null }[];
};

export default function InventoryPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [items, setItems] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Brand-ish colors
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
  };

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

  // 🔄 AUTO REFRESH WHEN ASSISTANT UPDATES DATA
  useEffect(() => {
    const onRefresh = () => loadInventory();
    window.addEventListener("adora:refresh", onRefresh);
    return () => window.removeEventListener("adora:refresh", onRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  async function changeStock(productId: string, delta: number) {
    if (!workspaceId) return;
    if (!delta || delta === 0) return;

    setLoading(true);

    try {
      // 1) Read current balance (scoped to workspace + product)
      const { data: balRow, error: balErr } = await supabase
        .from("inventory_balances")
        .select("quantity_on_hand")
        .eq("workspace_id", workspaceId)
        .eq("product_id", productId)
        .maybeSingle();

      if (balErr) throw new Error("Failed reading inventory balance: " + balErr.message);

      const current = Number(balRow?.quantity_on_hand ?? 0);
      const next = current + delta;

      // 2) Upsert balance (workspace + product)
      if (balRow) {
        const { error: updErr } = await supabase
          .from("inventory_balances")
          .update({ quantity_on_hand: next })
          .eq("workspace_id", workspaceId)
          .eq("product_id", productId);

        if (updErr) throw new Error("Failed updating inventory: " + updErr.message);
      } else {
        const { error: insErr } = await supabase.from("inventory_balances").insert([
          { workspace_id: workspaceId, product_id: productId, quantity_on_hand: next },
        ]);

        if (insErr) throw new Error("Failed creating inventory balance: " + insErr.message);
      }

      // 3) Log movement (optional; non-blocking)
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
        console.warn("Movement insert failed:", moveErr.message);
      }

      await loadInventory();
    } catch (e: any) {
      alert(e?.message || "Stock update failed.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (workspaceId) loadInventory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  return (
    <AuthGate>
      <div
        style={{
          padding: 16,
          maxWidth: 980,
          margin: "0 auto",
          color: brand.text,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 14,
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 26, lineHeight: 1.15 }}>Inventory</h1>
            <p style={{ margin: "6px 0 0", color: brand.muted }}>
              Adjust stock quickly and see what’s running low.
            </p>
          </div>

          <button
            onClick={() => loadInventory()}
            disabled={loading}
            style={{
              padding: "10px 12px",
              borderRadius: 14,
              border: `1px solid ${brand.border}`,
              background: "#fff",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 800,
            }}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {items.length === 0 ? (
          <div
            style={{
              border: `1px solid ${brand.border}`,
              background: brand.card,
              borderRadius: 18,
              padding: 16,
            }}
          >
            <p style={{ margin: 0, color: brand.muted }}>
              No products yet. Add products first.
            </p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {items.map((p) => {
              const onHand = Number(p.inventory_balances?.[0]?.quantity_on_hand ?? 0);
              const reorder = Number(p.reorder_threshold ?? 0);
              const low = onHand <= reorder;

              return (
                <div
                  key={p.id}
                  style={{
                    border: `1px solid ${brand.border}`,
                    background: brand.card,
                    borderRadius: 18,
                    padding: 14,
                    boxShadow: "0 10px 26px rgba(0,0,0,0.06)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ fontWeight: 900, fontSize: 16 }}>{p.name}</div>

                    {low ? (
                      <span
                        style={{
                          padding: "6px 10px",
                          borderRadius: 999,
                          background: brand.dangerSoft,
                          color: brand.danger,
                          fontWeight: 900,
                          border: `1px solid ${brand.border}`,
                        }}
                      >
                        Low stock
                      </span>
                    ) : (
                      <span
                        style={{
                          padding: "6px 10px",
                          borderRadius: 999,
                          background: "#ECFDF3",
                          color: brand.success,
                          fontWeight: 900,
                          border: `1px solid ${brand.border}`,
                        }}
                      >
                        OK
                      </span>
                    )}
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: 10,
                      marginTop: 10,
                      background: brand.cardSoft,
                      border: `1px solid ${brand.border}`,
                      borderRadius: 14,
                      padding: 12,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, color: brand.muted, fontWeight: 800 }}>
                        On hand
                      </div>
                      <div
                        style={{
                          marginTop: 2,
                          fontSize: 18,
                          fontWeight: 900,
                          color: low ? brand.danger : brand.text,
                        }}
                      >
                        {onHand}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: 12, color: brand.muted, fontWeight: 800 }}>
                        Reorder level
                      </div>
                      <div style={{ marginTop: 2, fontSize: 18, fontWeight: 900 }}>
                        {reorder}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: 12, color: brand.muted, fontWeight: 800 }}>
                        Status
                      </div>
                      <div style={{ marginTop: 2, fontSize: 14, fontWeight: 900 }}>
                        {low ? (
                          <span style={{ color: brand.danger }}>
                            Below / at reorder point
                          </span>
                        ) : (
                          <span style={{ color: brand.success }}>Healthy stock</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      marginTop: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      onClick={() => changeStock(p.id, 1)}
                      disabled={loading}
                      style={btn(brand, "primary")}
                    >
                      +1
                    </button>

                    <button
                      onClick={() => changeStock(p.id, -1)}
                      disabled={loading}
                      style={btn(brand, "ghost")}
                    >
                      -1
                    </button>

                    <button
                      onClick={() => changeStock(p.id, 5)}
                      disabled={loading}
                      style={btn(brand, "primarySoft")}
                    >
                      +5
                    </button>

                    <button
                      onClick={() => changeStock(p.id, -5)}
                      disabled={loading}
                      style={btn(brand, "dangerSoft")}
                    >
                      -5
                    </button>
                  </div>

                  <div style={{ marginTop: 10, fontSize: 12, color: brand.muted }}>
                    Tip: You can also update inventory from the Assistant (chat/voice).
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

function btn(
  brand: {
    border: string;
    primary: string;
    primarySoft: string;
    danger: string;
    dangerSoft: string;
    text: string;
  },
  kind: "primary" | "primarySoft" | "ghost" | "dangerSoft"
): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 14,
    border: `1px solid ${brand.border}`,
    cursor: "pointer",
    fontWeight: 900,
    minWidth: 72,
  };

  if (kind === "primary")
    return {
      ...base,
      background: brand.primary,
      color: "#fff",
      border: `1px solid ${brand.primary}`,
    };

  if (kind === "primarySoft")
    return {
      ...base,
      background: brand.primarySoft,
      color: brand.primary,
    };

  if (kind === "dangerSoft")
    return {
      ...base,
      background: brand.dangerSoft,
      color: brand.danger,
    };

  // ghost
  return {
    ...base,
    background: "#fff",
    color: brand.text,
  };
}

