"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import AuthGate from "@/components/AuthWorkspaceGate";

type PurchaseType = "single" | "bulk";

type Product = {
  id: string;
  name: string;
  reorder_threshold: number;
  cost_price: number | null; // stored as COST PER SELLING UNIT (unit cost)
  units_per_bulk: number | null; // for bulk products only; single products always 1
};

function stripLeadingZeros(s: string) {
  const cleaned = String(s ?? "").replace(/[^\d.]/g, "");
  if (!cleaned) return "";
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

  // create form
  const [purchaseType, setPurchaseType] = useState<PurchaseType>("bulk");
  const [name, setName] = useState("");
  const [reorderStr, setReorderStr] = useState("0");

  // SINGLE: cost per item (stored directly into cost_price, units_per_bulk=1)
  const [singleCostStr, setSingleCostStr] = useState("0");

  // BULK: cost per carton + units in carton (we store unit cost into cost_price)
  const [bulkCostStr, setBulkCostStr] = useState("0");
  const [unitsStr, setUnitsStr] = useState("40");

  const [loading, setLoading] = useState(false);

  // editing row
  const [editId, setEditId] = useState<string | null>(null);
  const [editPurchaseType, setEditPurchaseType] = useState<PurchaseType>("bulk");
  const [editReorder, setEditReorder] = useState("0");
  const [editSingleCost, setEditSingleCost] = useState("0");
  const [editBulkCost, setEditBulkCost] = useState("0");
  const [editUnits, setEditUnits] = useState("40");

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

  useEffect(() => {
    const onRefresh = () => loadProducts();
    window.addEventListener("adora:refresh", onRefresh);
    return () => window.removeEventListener("adora:refresh", onRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const bulkUnitCostPreview = useMemo(() => {
    const bulkCost = Math.max(0, toNumberSafe(bulkCostStr, 0));
    const units = Math.max(1, Math.floor(toNumberSafe(unitsStr, 1)));
    return units ? bulkCost / units : 0;
  }, [bulkCostStr, unitsStr]);

  async function addProduct() {
    if (!workspaceId) return;

    const nm = name.trim();
    if (!nm) return alert("Enter product name");

    const reorder_threshold = Math.max(0, Math.floor(toNumberSafe(reorderStr, 0)));

    let cost_price = 0;
    let units_per_bulk = 1;

    if (purchaseType === "single") {
      cost_price = Math.max(0, toNumberSafe(singleCostStr, 0));
      units_per_bulk = 1;
    } else {
      const bulkCost = Math.max(0, toNumberSafe(bulkCostStr, 0));
      units_per_bulk = Math.max(1, Math.floor(toNumberSafe(unitsStr, 1)));
      cost_price = units_per_bulk ? bulkCost / units_per_bulk : 0; // ✅ store unit cost
    }

    setLoading(true);

    const { error } = await supabase.from("products").insert([
      { workspace_id: workspaceId, name: nm, reorder_threshold, cost_price, units_per_bulk },
    ]);

    setLoading(false);

    if (error) return alert("Failed to add product: " + error.message);

    // reset
    setName("");
    setReorderStr("0");
    setSingleCostStr("0");
    setBulkCostStr("0");
    setUnitsStr("40");

    await loadProducts();
    window.dispatchEvent(new Event("adora:refresh"));
  }

  function startEdit(p: Product) {
    const units = Math.max(1, Number(p.units_per_bulk ?? 1));
    const isSingle = units === 1;

    setEditId(p.id);
    setEditPurchaseType(isSingle ? "single" : "bulk");
    setEditReorder(String(p.reorder_threshold ?? 0));

    // cost_price is stored per unit.
    const unitCost = Number(p.cost_price ?? 0);

    if (isSingle) {
      setEditSingleCost(String(unitCost));
      setEditBulkCost("0");
      setEditUnits("40");
    } else {
      // for bulk edit, we reconstruct bulkCost ≈ unitCost * units
      setEditSingleCost("0");
      setEditUnits(String(units));
      setEditBulkCost(String(unitCost * units));
    }
  }

  function cancelEdit() {
    setEditId(null);
    setEditPurchaseType("bulk");
    setEditReorder("0");
    setEditSingleCost("0");
    setEditBulkCost("0");
    setEditUnits("40");
  }

  const editBulkUnitCostPreview = useMemo(() => {
    const bulkCost = Math.max(0, toNumberSafe(editBulkCost, 0));
    const units = Math.max(1, Math.floor(toNumberSafe(editUnits, 1)));
    return units ? bulkCost / units : 0;
  }, [editBulkCost, editUnits]);

  async function saveEdit(p: Product) {
    if (!workspaceId) return;

    const reorder_threshold = Math.max(0, Math.floor(toNumberSafe(editReorder, 0)));

    let cost_price = 0;
    let units_per_bulk = 1;

    if (editPurchaseType === "single") {
      cost_price = Math.max(0, toNumberSafe(editSingleCost, 0));
      units_per_bulk = 1;
    } else {
      const bulkCost = Math.max(0, toNumberSafe(editBulkCost, 0));
      units_per_bulk = Math.max(1, Math.floor(toNumberSafe(editUnits, 1)));
      cost_price = units_per_bulk ? bulkCost / units_per_bulk : 0;
    }

    setLoading(true);

    const { error } = await supabase
      .from("products")
      .update({ reorder_threshold, cost_price, units_per_bulk })
      .eq("workspace_id", workspaceId)
      .eq("id", p.id);

    setLoading(false);

    if (error) return alert("Failed to save: " + error.message);

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

  function fmt(n: number) {
    if (!Number.isFinite(n)) return "0";
    // keep it readable
    return n % 1 === 0 ? String(n) : n.toFixed(4);
  }

  return (
    <AuthGate>
      <div style={{ padding: 16, maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>Products</h1>
        <p style={{ marginTop: 8, color: "#5B6475" }}>
          Choose how you <b>buy</b> a product (single vs carton). Inventory is always tracked in{" "}
          <b>selling units</b>.
        </p>

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

            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 900 }}>How do you buy this product?</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  style={{
                    ...btnGhost,
                    borderColor: purchaseType === "single" ? "#1F6FEB" : "#E6E8EE",
                    color: purchaseType === "single" ? "#1F6FEB" : "#0B1220",
                    background: purchaseType === "single" ? "#E9F2FF" : "#fff",
                  }}
                  onClick={() => setPurchaseType("single")}
                >
                  Single item
                </button>
                <button
                  type="button"
                  style={{
                    ...btnGhost,
                    borderColor: purchaseType === "bulk" ? "#1F6FEB" : "#E6E8EE",
                    color: purchaseType === "bulk" ? "#1F6FEB" : "#0B1220",
                    background: purchaseType === "bulk" ? "#E9F2FF" : "#fff",
                  }}
                  onClick={() => setPurchaseType("bulk")}
                >
                  Carton / Pack (bulk)
                </button>
              </div>
              <div style={{ color: "#5B6475", fontSize: 13 }}>
                {purchaseType === "single"
                  ? "Example: Bread, Coke bottle — you buy 1 and sell 1."
                  : "Example: Indomie carton — you buy 1 carton but sell in pieces."}
              </div>
            </div>

            {purchaseType === "single" ? (
              <label style={{ fontWeight: 900 }}>
                Cost per item (₦ / $)
                <input
                  style={input}
                  inputMode="decimal"
                  value={singleCostStr}
                  onChange={(e) => setSingleCostStr(stripLeadingZeros(e.target.value))}
                />
              </label>
            ) : (
              <>
                <label style={{ fontWeight: 900 }}>
                  Cost per carton/pack (total)
                  <input
                    style={input}
                    inputMode="decimal"
                    value={bulkCostStr}
                    onChange={(e) => setBulkCostStr(stripLeadingZeros(e.target.value))}
                  />
                </label>

                <label style={{ fontWeight: 900 }}>
                  Units inside the carton/pack
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

                <div style={{ color: "#5B6475", fontSize: 13, fontWeight: 800 }}>
                  Unit cost preview: {fmt(toNumberSafe(bulkCostStr, 0))} ÷{" "}
                  {Math.max(1, Math.floor(toNumberSafe(unitsStr, 1)))} ={" "}
                  <span style={{ color: "#0B1220" }}>{fmt(bulkUnitCostPreview)}</span>
                </div>
              </>
            )}

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
              const unitCostStored = Number(p.cost_price ?? 0);
              const purchase = units === 1 ? "Single" : "Bulk";
              const approxBulkCost = unitCostStored * units;

              return (
                <div key={p.id} style={card}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 1000, fontSize: 16 }}>{p.name}</div>
                      <div style={{ marginTop: 6, color: "#5B6475", fontSize: 13 }}>
                        Type: <b>{purchase}</b> • Reorder: <b>{p.reorder_threshold}</b> •{" "}
                        Unit cost: <b>{fmt(unitCostStored)}</b>
                        {units > 1 ? (
                          <>
                            {" "}
                            • Units/carton: <b>{units}</b> • Carton cost (approx):{" "}
                            <b>{fmt(approxBulkCost)}</b>
                          </>
                        ) : null}
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

                      <div style={{ display: "grid", gap: 8 }}>
                        <div style={{ fontWeight: 900 }}>How do you buy this product?</div>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            style={{
                              ...btnGhost,
                              borderColor: editPurchaseType === "single" ? "#1F6FEB" : "#E6E8EE",
                              color: editPurchaseType === "single" ? "#1F6FEB" : "#0B1220",
                              background: editPurchaseType === "single" ? "#E9F2FF" : "#fff",
                            }}
                            onClick={() => setEditPurchaseType("single")}
                          >
                            Single item
                          </button>
                          <button
                            type="button"
                            style={{
                              ...btnGhost,
                              borderColor: editPurchaseType === "bulk" ? "#1F6FEB" : "#E6E8EE",
                              color: editPurchaseType === "bulk" ? "#1F6FEB" : "#0B1220",
                              background: editPurchaseType === "bulk" ? "#E9F2FF" : "#fff",
                            }}
                            onClick={() => setEditPurchaseType("bulk")}
                          >
                            Carton / Pack (bulk)
                          </button>
                        </div>
                      </div>

                      {editPurchaseType === "single" ? (
                        <label style={{ fontWeight: 900 }}>
                          Cost per item
                          <input
                            style={input}
                            inputMode="decimal"
                            value={editSingleCost}
                            onChange={(e) => setEditSingleCost(stripLeadingZeros(e.target.value))}
                          />
                        </label>
                      ) : (
                        <>
                          <label style={{ fontWeight: 900 }}>
                            Cost per carton/pack (total)
                            <input
                              style={input}
                              inputMode="decimal"
                              value={editBulkCost}
                              onChange={(e) => setEditBulkCost(stripLeadingZeros(e.target.value))}
                            />
                          </label>

                          <label style={{ fontWeight: 900 }}>
                            Units inside carton/pack
                            <input
                              style={input}
                              inputMode="numeric"
                              value={editUnits}
                              onChange={(e) => {
                                const v = stripLeadingZeros(e.target.value);
                                setEditUnits(
                                  v === "" ? "" : String(Math.max(1, Math.floor(toNumberSafe(v, 1))))
                                );
                              }}
                            />
                          </label>

                          <div style={{ color: "#5B6475", fontSize: 13, fontWeight: 800 }}>
                            Unit cost preview: {fmt(toNumberSafe(editBulkCost, 0))} ÷{" "}
                            {Math.max(1, Math.floor(toNumberSafe(editUnits, 1)))} ={" "}
                            <span style={{ color: "#0B1220" }}>
                              {fmt(editBulkUnitCostPreview)}
                            </span>
                          </div>
                        </>
                      )}

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
