"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import AuthGate from "@/components/AuthWorkspaceGate";

type Product = {
  id: string;
  name: string;
  reorder_threshold: number | null;
  cost_price: number | null;
  created_at?: string;
};

function safeStr(v: any) {
  return String(v ?? "").trim();
}

/**
 * Strips leading zeros for "integer-like" typing while preserving decimals:
 * "030" -> "30"
 * "0005" -> "5"
 * "0.50" stays "0.50"
 * "" stays ""
 * "." -> "0."
 */
function stripLeadingZeros(input: string) {
  let s = String(input ?? "");

  if (s === "") return "";
  s = s.trim();

  if (s === ".") return "0.";

  // allow 0.xxx
  if (/^0\.\d*$/.test(s)) return s;

  // 00012 -> 12  (keep single 0 if all zeros)
  if (/^0+\d+$/.test(s)) {
    const n = s.replace(/^0+/, "");
    return n === "" ? "0" : n;
  }

  // 00012.34 -> 12.34
  if (/^0+\d+\.\d*$/.test(s)) {
    s = s.replace(/^0+/, "");
    if (s.startsWith(".")) s = "0" + s;
    return s;
  }

  return s;
}

/** "" => null, otherwise number or null if invalid */
function toNumberOrNull(v: string) {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export default function ProductsPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const [products, setProducts] = useState<Product[]>([]);

  // Add product form (strings to control leading zeros nicely)
  const [name, setName] = useState("");
  const [reorderStr, setReorderStr] = useState<string>(""); // empty => 0
  const [costStr, setCostStr] = useState<string>(""); // empty => 0

  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 12px",
    marginTop: 8,
    borderRadius: 12,
    border: `1px solid ${brand.border}`,
    fontSize: 16,
    outline: "none",
    background: "#fff",
  };

  const buttonPrimary: React.CSSProperties = {
    padding: "12px 14px",
    borderRadius: 14,
    border: `1px solid ${brand.primary}`,
    background: brand.primary,
    color: "#fff",
    fontWeight: 900,
    fontSize: 16,
    cursor: "pointer",
  };

  const buttonGhost: React.CSSProperties = {
    padding: "12px 14px",
    borderRadius: 14,
    border: `1px solid ${brand.border}`,
    background: "#fff",
    color: brand.text,
    fontWeight: 900,
    fontSize: 16,
    cursor: "pointer",
  };

  useEffect(() => {
    setWorkspaceId(localStorage.getItem("workspace_id"));
  }, []);

  async function loadProducts() {
    if (!workspaceId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, reorder_threshold, cost_price, created_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message);

      setProducts((data as Product[]) || []);
    } catch (e: any) {
      alert("Failed to load products: " + (e?.message || "unknown error"));
    } finally {
      setLoading(false);
    }
  }

  // 🔄 AUTO REFRESH WHEN ASSISTANT UPDATES DATA
  useEffect(() => {
    const onRefresh = () => loadProducts();
    window.addEventListener("adora:refresh", onRefresh);
    return () => window.removeEventListener("adora:refresh", onRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  useEffect(() => {
    if (workspaceId) loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  async function addProduct() {
    if (!workspaceId) return;

    const n = safeStr(name);
    if (!n) {
      alert("Enter product name");
      return;
    }

    const reorder = toNumberOrNull(reorderStr) ?? 0;
    const cost_price = toNumberOrNull(costStr) ?? 0;

    if (reorder < 0) return alert("Reorder threshold must be >= 0");
    if (cost_price < 0) return alert("Cost price must be >= 0");

    setLoading(true);
    try {
      const { error } = await supabase.from("products").insert([
        {
          workspace_id: workspaceId,
          name: n,
          reorder_threshold: Math.round(reorder),
          cost_price,
        },
      ]);

      if (error) throw new Error(error.message);

      setName("");
      setReorderStr("");
      setCostStr("");

      await loadProducts();
      window.dispatchEvent(new Event("adora:refresh"));
    } catch (e: any) {
      alert("Failed to add product: " + (e?.message || "unknown error"));
    } finally {
      setLoading(false);
    }
  }

  async function updateProduct(p: Product, next: Partial<Product>) {
    if (!workspaceId) return;

    setSavingId(p.id);
    try {
      const patch: any = {};
      if (next.reorder_threshold !== undefined) patch.reorder_threshold = next.reorder_threshold;
      if (next.cost_price !== undefined) patch.cost_price = next.cost_price;

      const { error } = await supabase
        .from("products")
        .update(patch)
        .eq("workspace_id", workspaceId)
        .eq("id", p.id);

      if (error) throw new Error(error.message);

      setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...next } : x)));
      window.dispatchEvent(new Event("adora:refresh"));
    } catch (e: any) {
      alert("Update failed: " + (e?.message || "unknown error"));
    } finally {
      setSavingId(null);
    }
  }

  async function deleteProduct(p: Product) {
    if (!workspaceId) return;

    const ok = confirm(`Delete "${p.name}"? This cannot be undone.`);
    if (!ok) return;

    setDeletingId(p.id);
    try {
      const { error } = await supabase
        .from("products")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("id", p.id);

      if (error) throw new Error(error.message);

      setProducts((prev) => prev.filter((x) => x.id !== p.id));
      window.dispatchEvent(new Event("adora:refresh"));
    } catch (e: any) {
      alert("Delete failed: " + (e?.message || "unknown error"));
    } finally {
      setDeletingId(null);
    }
  }

  const count = useMemo(() => products.length, [products]);

  return (
    <AuthGate>
      <div style={{ padding: 16, maxWidth: 980, margin: "0 auto", color: brand.text }}>
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
            <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.1 }}>Products</h1>
            <p style={{ margin: "8px 0 0", color: brand.muted }}>
              Add products and set <b>reorder level</b> + <b>cost price</b>.
            </p>
          </div>

          <button onClick={loadProducts} disabled={loading} style={buttonGhost}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {/* Add Product */}
        <div
          style={{
            border: `1px solid ${brand.border}`,
            background: brand.card,
            borderRadius: 18,
            padding: 16,
            boxShadow: "0 10px 26px rgba(0,0,0,0.06)",
          }}
        >
          <div style={{ fontWeight: 1000, fontSize: 16 }}>Add product</div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
              marginTop: 12,
            }}
          >
            <label style={{ fontWeight: 800 }}>
              Product name
              <input
                style={inputStyle}
                placeholder="e.g. Rice"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>

            <label style={{ fontWeight: 800 }}>
              Reorder threshold
              <input
                style={inputStyle}
                inputMode="numeric"
                placeholder="e.g. 5"
                value={reorderStr}
                onFocus={() => {
                  if (reorderStr === "0") setReorderStr("");
                }}
                onChange={(e) => setReorderStr(stripLeadingZeros(e.target.value))}
              />
            </label>

            <label style={{ fontWeight: 800 }}>
              Cost price (purchase cost)
              <input
                style={inputStyle}
                inputMode="decimal"
                placeholder="e.g. 2.50"
                value={costStr}
                onFocus={() => {
                  if (costStr === "0") setCostStr("");
                }}
                onChange={(e) => setCostStr(stripLeadingZeros(e.target.value))}
              />
            </label>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
            <button onClick={addProduct} disabled={loading} style={buttonPrimary}>
              {loading ? "Saving…" : "Add Product"}
            </button>
            <a
              href="/import"
              style={{
                ...buttonGhost,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              Import Products →
            </a>
          </div>
        </div>

        {/* List */}
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Product List</h2>
            <div style={{ color: brand.muted, fontWeight: 800 }}>{count} products</div>
          </div>

          {products.length === 0 ? (
            <div
              style={{
                marginTop: 10,
                border: `1px solid ${brand.border}`,
                background: brand.card,
                borderRadius: 18,
                padding: 16,
              }}
            >
              <p style={{ margin: 0, color: brand.muted }}>No products yet.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12, marginTop: 10 }}>
              {products.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  brand={brand}
                  saving={savingId === p.id}
                  deleting={deletingId === p.id}
                  onSave={(next) => updateProduct(p, next)}
                  onDelete={() => deleteProduct(p)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </AuthGate>
  );
}

function ProductCard({
  product,
  brand,
  saving,
  deleting,
  onSave,
  onDelete,
}: {
  product: Product;
  brand: any;
  saving: boolean;
  deleting: boolean;
  onSave: (next: Partial<Product>) => Promise<void>;
  onDelete: () => void;
}) {
  const [reorderStr, setReorderStr] = useState<string>(
    product.reorder_threshold && product.reorder_threshold !== 0 ? String(product.reorder_threshold) : ""
  );

  const [costStr, setCostStr] = useState<string>(
    product.cost_price && Number(product.cost_price) !== 0 ? String(product.cost_price) : ""
  );

  useEffect(() => {
    setReorderStr(product.reorder_threshold && product.reorder_threshold !== 0 ? String(product.reorder_threshold) : "");
    setCostStr(product.cost_price && Number(product.cost_price) !== 0 ? String(product.cost_price) : "");
  }, [product.id, product.reorder_threshold, product.cost_price]);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 12px",
    marginTop: 8,
    borderRadius: 12,
    border: `1px solid ${brand.border}`,
    fontSize: 16,
    outline: "none",
    background: "#fff",
  };

  const saveBtn: React.CSSProperties = {
    padding: "12px 14px",
    borderRadius: 14,
    border: `1px solid ${brand.primary}`,
    background: brand.primary,
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
    minWidth: 120,
  };

  const ghostBtn: React.CSSProperties = {
    padding: "12px 14px",
    borderRadius: 14,
    border: `1px solid ${brand.border}`,
    background: "#fff",
    color: brand.text,
    fontWeight: 900,
    cursor: "pointer",
    minWidth: 120,
  };

  async function save() {
    const reorder = toNumberOrNull(reorderStr) ?? 0;
    const cost_price = toNumberOrNull(costStr) ?? 0;

    if (reorder < 0) return alert("Reorder threshold must be >= 0");
    if (cost_price < 0) return alert("Cost price must be >= 0");

    await onSave({
      reorder_threshold: Math.round(reorder),
      cost_price,
    });
  }

  return (
    <div
      style={{
        border: `1px solid ${brand.border}`,
        background: "#fff",
        borderRadius: 18,
        padding: 14,
        boxShadow: "0 10px 26px rgba(0,0,0,0.06)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 1000, fontSize: 16 }}>{product.name}</div>

        <button
          onClick={onDelete}
          disabled={deleting || saving}
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: `1px solid ${brand.border}`,
            background: brand.dangerSoft,
            color: brand.danger,
            fontWeight: 900,
            cursor: deleting || saving ? "not-allowed" : "pointer",
          }}
        >
          {deleting ? "Deleting…" : "Delete"}
        </button>
      </div>

      <div
        style={{
          marginTop: 12,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
          background: brand.cardSoft,
          border: `1px solid ${brand.border}`,
          borderRadius: 14,
          padding: 12,
        }}
      >
        <label style={{ fontWeight: 800 }}>
          Reorder threshold
          <input
            style={inputStyle}
            inputMode="numeric"
            placeholder="e.g. 5"
            value={reorderStr}
            onFocus={() => {
              if (reorderStr === "0") setReorderStr("");
            }}
            onChange={(e) => setReorderStr(stripLeadingZeros(e.target.value))}
          />
        </label>

        <label style={{ fontWeight: 800 }}>
          Cost price (purchase cost)
          <input
            style={inputStyle}
            inputMode="decimal"
            placeholder="e.g. 2.50"
            value={costStr}
            onFocus={() => {
              if (costStr === "0") setCostStr("");
            }}
            onChange={(e) => setCostStr(stripLeadingZeros(e.target.value))}
          />
        </label>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
        <button onClick={save} disabled={saving || deleting} style={saveBtn}>
          {saving ? "Saving…" : "Save"}
        </button>

        <button
          onClick={() => {
            setReorderStr(product.reorder_threshold && product.reorder_threshold !== 0 ? String(product.reorder_threshold) : "");
            setCostStr(product.cost_price && Number(product.cost_price) !== 0 ? String(product.cost_price) : "");
          }}
          disabled={saving || deleting}
          style={ghostBtn}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

