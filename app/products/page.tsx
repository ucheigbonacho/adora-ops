"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import AuthGate from "@/components/AuthWorkspaceGate";

type Product = {
  id: string;
  name: string;
  reorder_threshold: number;
  cost_price: number | null;
};

export default function ProductsPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [name, setName] = useState("");
  const [reorder, setReorder] = useState<number>(0);
  const [costPrice, setCostPrice] = useState<number>(0);

  const [loading, setLoading] = useState(false);

  // Bigger UI
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid #E6E8EE",
    fontSize: 16,
    outline: "none",
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
    const onRefresh = () => loadProducts();
    window.addEventListener("adora:refresh", onRefresh);
    return () => window.removeEventListener("adora:refresh", onRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  async function loadProducts() {
    if (!workspaceId) return;

    const { data, error } = await supabase
      .from("products")
      .select("id, name, reorder_threshold, cost_price")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (error) {
      alert("Failed to load products: " + error.message);
      return;
    }

    setProducts((data as Product[]) || []);
  }

  async function addProduct() {
    if (!workspaceId) return;

    const trimmed = name.trim();
    if (!trimmed) {
      alert("Enter product name");
      return;
    }
    if (reorder < 0) {
      alert("Reorder threshold must be 0 or more");
      return;
    }
    if (costPrice < 0) {
      alert("Cost price must be 0 or more");
      return;
    }

    setLoading(true);

    // Because you have unique index (workspace_id, lower(name)), this may error on duplicate names.
    // That’s fine—tell the user.
    const { error } = await supabase.from("products").insert([
      {
        workspace_id: workspaceId,
        name: trimmed,
        reorder_threshold: reorder,
        cost_price: costPrice,
      },
    ]);

    if (error) {
      setLoading(false);
      if (error.message?.toLowerCase().includes("duplicate")) {
        alert("Product already exists in this workspace. Try a different name.");
      } else {
        alert("Failed to add product: " + error.message);
      }
      return;
    }

    setName("");
    setReorder(0);
    setCostPrice(0);

    await loadProducts();
    window.dispatchEvent(new Event("adora:refresh"));
    setLoading(false);
  }

  useEffect(() => {
    if (workspaceId) loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  return (
    <AuthGate>
      <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
        <h1 style={{ fontSize: 28, marginBottom: 12 }}>Products</h1>

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
            Product name
            <input
              placeholder="e.g., Rice"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ ...inputStyle, marginTop: 8 }}
            />
          </label>

          <label style={{ fontWeight: 800 }}>
            Reorder threshold
            <input
              type="number"
              placeholder="e.g., 5"
              value={reorder}
              min={0}
              onChange={(e) => setReorder(Number(e.target.value))}
              style={{ ...inputStyle, marginTop: 8 }}
            />
          </label>

          <label style={{ fontWeight: 800 }}>
            Cost price (per unit)
            <input
              type="number"
              placeholder="e.g., 2.50"
              value={costPrice}
              min={0}
              step="0.01"
              onChange={(e) => setCostPrice(Number(e.target.value))}
              style={{ ...inputStyle, marginTop: 8 }}
            />
          </label>

          <button onClick={addProduct} disabled={loading} style={buttonStyle}>
            {loading ? "Saving..." : "Add Product"}
          </button>
        </div>

        <hr style={{ margin: "22px 0", borderColor: "#E6E8EE" }} />

        <h2 style={{ fontSize: 20, marginBottom: 10 }}>Product List</h2>

        {products.length === 0 ? (
          <p>No products yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {products.map((p) => (
              <div
                key={p.id}
                style={{
                  border: "1px solid #E6E8EE",
                  padding: 14,
                  borderRadius: 14,
                  background: "#fff",
                  boxShadow: "0 10px 26px rgba(0,0,0,0.06)",
                }}
              >
                <b style={{ fontSize: 16 }}>{p.name}</b>
                <div style={{ marginTop: 6 }}>Reorder threshold: {p.reorder_threshold}</div>
                <div>Cost price: {Number(p.cost_price ?? 0).toFixed(2)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AuthGate>
  );
}
