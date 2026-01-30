"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import AuthGate from "@/components/AuthWorkspaceGate";

type Product = {
  id: string;
  name: string;
  reorder_threshold: number;
};

export default function ProductsPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [name, setName] = useState("");
  const [reorder, setReorder] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setWorkspaceId(localStorage.getItem("workspace_id"));
  }, []);

  async function loadProducts() {
    if (!workspaceId) return;

    const { data, error } = await supabase
      .from("products")
      .select("id, name, reorder_threshold")
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

    if (!name) {
      alert("Enter product name");
      return;
    }

    setLoading(true);

    const { error } = await supabase.from("products").insert([
      {
        workspace_id: workspaceId,
        name,
        reorder_threshold: reorder,
      },
    ]);

    if (error) {
      setLoading(false);
      alert("Failed to add product: " + error.message);
      return;
    }

    setName("");
    setReorder(0);
    await loadProducts();
    setLoading(false);
  }

  useEffect(() => {
    if (workspaceId) loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  return (
    <AuthGate>
      <div style={{ padding: 24, maxWidth: 800 }}>
        <h1>Products</h1>

        <div style={{ display: "grid", gap: 10, maxWidth: 420 }}>
          <input
            placeholder="Product name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <input
            type="number"
            placeholder="Reorder threshold"
            value={reorder}
            onChange={(e) => setReorder(Number(e.target.value))}
          />

          <button onClick={addProduct} disabled={loading}>
            {loading ? "Saving..." : "Add Product"}
          </button>
        </div>

        <hr style={{ margin: "20px 0" }} />

        <h2>Product List</h2>
        {products.length === 0 ? (
          <p>No products yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {products.map((p) => (
              <div
                key={p.id}
                style={{ border: "1px solid #ddd", padding: 12, borderRadius: 8 }}
              >
                <b>{p.name}</b>
                <div>Reorder threshold: {p.reorder_threshold}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AuthGate>
  );
}
