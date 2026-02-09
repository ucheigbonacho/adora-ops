"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import AuthGate from "@/components/AuthWorkspaceGate";

type Product = {
  id: string;
  name: string;
  reorder_threshold: number;
  cost_price: number | null;
  units_per_bulk: number | null;
};

function stripLeadingZeros(s: string) {
  // keep "0" if user typed only zeros
  const cleaned = s.replace(/[^\d.]/g, ""); // allow decimals for cost
  if (!cleaned) return "";
  // handle decimals like 0.5
  if (cleaned.includes(".")) {
    const [a, b] = cleaned.split(".");
    const a2 = a.replace(/^0+(?=\d)/, "");
    return `${a2 || "0"}.${(b ?? "").replace(/[^\d]/g, "")}`;
  }
  return cleaned.replace(/^0+(?=\d)/, "");
}

function toNumberSafe(v: string, fallback = 0) {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : fallback;
}

export default function ProductsPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const [products, setProducts] = useState<Product[]>([]);

  // create form as strings (prevents "030" UI issue)
  const [name, setName] = useState("");
  const [reorderStr, setReorderStr] = useState("0");
  const [costStr, setCostStr] = useState("0");
  const [unitsStr, setUnitsStr] = useState("1");

  const [loading, setLoading] = useState(false);

  // editing row
  const [editId, setEditId] = useState<string | null>(null);
  const [editReorder, setEditReorder] = useState("0");
  const [editCost, setEditCost] = useState("0");
  const [editUnits, setEditUnits] = useState("1");

  useEffect(() => {
    setWorkspaceId(localStorage.getItem("workspace_id"));
  }, []);

  async function loadProducts() {
    if (!workspaceId) return;

    const { data, error } = await supabase
      .from("products")
      .select("id, name, reorder_threshold, cost_price, units_per_bulk")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (error) {
      alert("Failed to load products: " + error.message);
      return;
    }

    setProducts((data as Product[]) || []);
  }

  useEffect(() => {
    if (workspaceId) loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  // 🔄 AUTO REFRESH WHEN ASSISTANT UPDATES DATA
  useEffect(() => {
    const onRefresh = () => loadProducts();
    window.addEventListener("adora:refresh", onRefresh);
    return () => window.removeEventListener("adora:refresh", onRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  async function addProduct() {
    if (!workspaceId) return;

    const nm = name.trim();
    if (!nm) {
      alert("Enter product name");
      return;
    }

    const reorder = Math.max(0, Math.floor(toNumberSafe(reorderStr, 0)));
    const cost_price = Math.max(0, toNumberSafe(costStr, 0));
    const units_per_bulk = Math.max(1, Math.floor(toNumberSafe(unitsStr, 1)));

    setLoading(true);

    const { error } = await supabase.from("products").insert([
      {
        workspace_id: workspaceId,
        name: nm,
        reorder_threshold: reorder,
        cost_price,
        units_per_bulk,
      },
    ]);

    if (error) {
      setLoading(false);
      alert("Failed to add product: " + error.message);
      return;
    }

    setName("");
    setReorderStr("0");
    setCostStr("0");
    setUnitsStr("1");

    await loadProducts();
    window.dispatchEvent(new Event("adora:refresh"));
    setLoading(false);
  }

  function startEdit(p: Product) {
    setEditId(p.id);
    setEditReorder(String(p.reorder_threshold ?? 0));
    setEditCost(String(p.cost_price ?? 0));
    setEditUnits(String(p.units_per_bulk ?? 1));
  }

  function cancelEdit() {
    setEditId(null);
    setEditReorder("0");
    setEditCost("0");
    setEditUnits("1");
  }

  async function saveEdit(p: Product) {
    if (!workspaceId) return;

    const reorder_threshold = Math.max(0, Math.floor(toNumberSafe(editReorder, 0)));
    const cost_price = Math.max(0, toNumberSafe(editCost, 0));
    const units_per_bulk = Math.max(1, Math.floor(toNumberSafe(editUnits, 1)));

    setLoading(true);

    const { error } = await supabase
      .from("products")
      .update({ reorder_threshold, cost_price, units_per_bulk })
      .eq("workspace_id", workspaceId)
      .eq("id", p.id);

    setLoading(false);

    if (error) {
      alert("Failed to save: " + error.message);
      return;
    }

    cancelEdit();
    await loadProducts();
    window.dispatchEvent(new Event("adora:refresh"));
  }

  const card: React.CSSProperties = {
    border: "1px solid #E6E8EE",
    borderRadius: 18,
    padding: 16,
    background: "#fff",
    boxShadow: "0 10px 26px rgba(0,0,0,0.06)",
  };

  const input: React.CSSProperties = {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid #E6E8EE",
    fontSize: 16,
    outline: "none",
  };

  const btn: React.CSSProperties = {
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid #0B1220",
    background: "#0B1220",
    color: "#fff",
    fontWeight: 900,
    fontSize: 15,
    cursor: "pointer",
  };

  const btnGhost: React.CSSProperties = {
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid #E6E8EE",
    background: "#fff",
    color: "#0B1220",
    fontWeight: 900,
    fontSize: 15,
    cursor: "pointer",
  };

  const helper = useMemo(() => {
    return `Bulk → units example: cost_price=30, units_per_bulk=40 → unit cost = 0.75`;
  }, []);

  return (
    <AuthGate>
      <div style={{ padding: 16, maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>Products</h1>
        <p style={{ marginTop: 8, color: "#5B6475" }}>
          Add products with <b>bulk cost</b> + <b>units per bulk</b> (carton/crate/bag).
          Inventory is tracked in <b>selling units</b>.
        </p>
        <p style={{ marginTop: 0, color: "#5B6475" }}>{helper}</p>

        {/* Add product */}
        <div style={{ ...card, marginTop: 10 }}>
          <div style={{ display: "grid", gap: 12, maxWidth: 560 }}>
            <label style={{ fontWeight: 900 }}>
              Product name
              <input
                style={input}
                placeholder="e.g., Indomie"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>

            <label style={{ fontWeight: 900 }}>
              Reorder threshold (selling units)
              <input
                style={input}
                inputMode="numeric"
                value={reorderStr}
                onChange={(e) => setReorderStr(stripLeadingZeros(e.target.value))}
              />
            </label>

            <label style={{ fontWeight: 900 }}>
              Cost per bulk package (cost_price)
              <input
                style={input}
                inputMode="decimal"
                value={costStr}
                onChange={(e) => setCostStr(stripLeadingZeros(e.target.value))}
              />
            </label>

            <label style={{ fontWeight: 900 }}>
              Units per bulk package (units_per_bulk)
              <input
                style={input}
                inputMode="numeric"
                value={unitsStr}
                onChange={(e) => {
                  const v = stripLeadingZeros(e.target.value);
                  setUnitsStr(v === "" ? "" : String(Math.max(1, Math.floor(toNumberSafe(v, 1)))));
                }}
              />
            </label>

            <button onClick={addProduct} disabled={loading} style={btn}>
              {loading ? "Saving..." : "Add Product"}
            </button>
          </div>
        </div>

        <hr style={{ margin: "18px 0", borderColor: "#E6E8EE" }} />

        <h2 style={{ margin: 0, fontSize: 20 }}>Product List</h2>

        {products.length === 0 ? (
          <p style={{ color: "#5B6475" }}>No products yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
            {products.map((p) => {
              const isEditing = editId === p.id;
              const units = Math.max(1, Number(p.units_per_bulk ?? 1));
              const bulkCost = Number(p.cost_price ?? 0);
              const unitCost = units ? bulkCost / units : 0;

              return (
                <div key={p.id} style={card}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontWeight: 1000, fontSize: 16 }}>{p.name}</div>
                      <div style={{ marginTop: 6, color: "#5B6475", fontSize: 13 }}>
                        Reorder: <b>{p.reorder_threshold}</b> • Bulk cost: <b>{bulkCost}</b> • Units/bulk:{" "}
                        <b>{units}</b> • Unit cost: <b>{unitCost.toFixed(4)}</b>
                      </div>
                    </div>

                    {!isEditing ? (
                      <button style={btnGhost} onClick={() => startEdit(p)}>
                        Edit
                      </button>
                    ) : null}
                  </div>

                  {isEditing ? (
                    <div style={{ display: "grid", gap: 12, marginTop: 12, maxWidth: 560 }}>
                      <label style={{ fontWeight: 900 }}>
                        Reorder threshold
                        <input
                          style={input}
                          inputMode="numeric"
                          value={editReorder}
                          onChange={(e) => setEditReorder(stripLeadingZeros(e.target.value))}
                        />
                      </label>

                      <label style={{ fontWeight: 900 }}>
                        Cost per bulk package (cost_price)
                        <input
                          style={input}
                          inputMode="decimal"
                          value={editCost}
                          onChange={(e) => setEditCost(stripLeadingZeros(e.target.value))}
                        />
                      </label>

                      <label style={{ fontWeight: 900 }}>
                        Units per bulk package (units_per_bulk)
                        <input
                          style={input}
                          inputMode="numeric"
                          value={editUnits}
                          onChange={(e) => {
                            const v = stripLeadingZeros(e.target.value);
                            setEditUnits(v === "" ? "" : String(Math.max(1, Math.floor(toNumberSafe(v, 1)))));
                          }}
                        />
                      </label>

                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button style={btn} onClick={() => saveEdit(p)} disabled={loading}>
                          {loading ? "Saving..." : "Save"}
                        </button>
                        <button style={btnGhost} onClick={cancelEdit} disabled={loading}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AuthGate>
  );
}

