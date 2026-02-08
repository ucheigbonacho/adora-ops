"use client";

import { useEffect, useMemo, useState } from "react";
import * as Papa from "papaparse";
import AuthGate from "@/components/AuthWorkspaceGate";
import { supabase } from "@/lib/supabaseClient";

type ParsedRow = Record<string, any>;

type PreviewRow = {
  name: string;
  quantity_on_hand: number;
  valid: boolean;
  error?: string;
};

function normKey(s: any) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function pickField(row: ParsedRow, keys: string[]) {
  const map = new Map<string, any>();
  Object.keys(row || {}).forEach((k) => map.set(normKey(k), row[k]));
  for (const k of keys) {
    const v = map.get(normKey(k));
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return undefined;
}

function toNumber(v: any) {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : NaN;
}

export default function ImportInventoryPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    setWorkspaceId(localStorage.getItem("workspace_id"));
  }, []);

  const validCount = useMemo(() => preview.filter((r) => r.valid).length, [preview]);
  const invalidCount = useMemo(() => preview.filter((r) => !r.valid).length, [preview]);

  function normalize(rows: ParsedRow[]) {
    const normalized: PreviewRow[] = (rows || []).map((r, idx) => {
      const nameRaw = pickField(r, ["name", "product", "product_name", "item", "title"]);
      const qtyRaw = pickField(r, ["quantity_on_hand", "qty", "quantity", "stock", "on_hand"]);

      const name = String(nameRaw ?? "").trim();
      const quantity_on_hand = toNumber(qtyRaw ?? 0);

      if (!name) {
        return {
          name: "",
          quantity_on_hand: 0,
          valid: false,
          error: `Row ${idx + 2}: missing name (header can be name/product/product_name/item)`,
        };
      }
      if (Number.isNaN(quantity_on_hand)) {
        return {
          name,
          quantity_on_hand: 0,
          valid: false,
          error: `Row ${idx + 2}: invalid quantity (header can be quantity_on_hand/qty/quantity/stock)`,
        };
      }

      return { name, quantity_on_hand, valid: true };
    });

    setPreview(normalized);
  }

  function onPickFile(file: File) {
    setFileName(file.name);
    setPreview([]);

    Papa.parse<ParsedRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => String(h || "").trim(),
      complete: (results) => normalize(results.data || []),
      error: (err) => alert("CSV parse error: " + err.message),
    });
  }

  async function importRows() {
    if (!workspaceId) {
      alert("Workspace not set. Please login and complete setup.");
      return;
    }

    const rows = preview.filter((r) => r.valid);
    if (rows.length === 0) {
      alert("No valid rows to import.");
      return;
    }

    setImporting(true);

    try {
      // 1) Load all products in this workspace
      const { data: products, error: prodErr } = await supabase
        .from("products")
        .select("id, name")
        .eq("workspace_id", workspaceId);

      if (prodErr) throw new Error("Failed to load products: " + prodErr.message);

      const productMap = new Map<string, string>();
      (products || []).forEach((p: any) => {
        productMap.set(String(p.name).trim().toLowerCase(), p.id);
      });

      // 2) Apply balances row-by-row (workspace-safe)
      for (const r of rows) {
        const key = r.name.trim().toLowerCase();
        const productId = productMap.get(key);

        if (!productId) {
          throw new Error(
            `Product not found in this workspace: "${r.name}". Add it first or fix spelling in CSV.`
          );
        }

        // read current balance (workspace + product)
        const { data: balRow, error: balErr } = await supabase
          .from("inventory_balances")
          .select("quantity_on_hand")
          .eq("workspace_id", workspaceId)
          .eq("product_id", productId)
          .maybeSingle();

        if (balErr) throw new Error("Failed reading inventory balance: " + balErr.message);

        const current = Number(balRow?.quantity_on_hand ?? 0);
        const next = Number(r.quantity_on_hand);
        const delta = next - current;

        if (balRow) {
          const { error: updErr } = await supabase
            .from("inventory_balances")
            .update({ quantity_on_hand: next })
            .eq("workspace_id", workspaceId)
            .eq("product_id", productId);

          if (updErr) throw new Error("Failed updating inventory balance: " + updErr.message);
        } else {
          const { error: insErr } = await supabase.from("inventory_balances").insert([
            { workspace_id: workspaceId, product_id: productId, quantity_on_hand: next },
          ]);

          if (insErr) throw new Error("Failed creating inventory balance: " + insErr.message);
        }

        // movement log (non-blocking)
        if (delta !== 0) {
          const { error: moveErr } = await supabase.from("inventory_movements").insert([
            {
              workspace_id: workspaceId,
              product_id: productId,
              quantity_change: delta,
              reason: "opening_balance",
            },
          ]);
          if (moveErr) console.warn("Movement insert failed:", moveErr.message);
        }
      }

      // refresh other pages
      window.dispatchEvent(new Event("adora:refresh"));

      alert(`Imported inventory for ${rows.length} products ✅`);
      window.location.href = "/inventory";
    } catch (e: any) {
      alert(e?.message || "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  const box: React.CSSProperties = {
    border: "1px solid #E6E8EE",
    borderRadius: 16,
    padding: 16,
    background: "#fff",
    boxShadow: "0 10px 26px rgba(0,0,0,0.06)",
  };

  const btn: React.CSSProperties = {
    marginTop: 12,
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid #1F6FEB",
    background: "#1F6FEB",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
    fontSize: 15,
  };

  return (
    <AuthGate>
      <div style={{ padding: 16, maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>Import Inventory (CSV)</h1>
        <p style={{ marginTop: 8, color: "#5B6475" }}>
          Headers supported: <b>name</b> (or product/product_name/item),{" "}
          <b>quantity_on_hand</b> (or qty/quantity/stock).
        </p>

        <div style={box}>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPickFile(f);
            }}
          />

          {fileName ? (
            <div style={{ marginTop: 10 }}>
              File: <b>{fileName}</b>
            </div>
          ) : null}

          {preview.length > 0 ? (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 800 }}>
                Valid: {validCount} | Invalid: {invalidCount}
              </div>

              <button onClick={importRows} disabled={importing || validCount === 0} style={btn}>
                {importing ? "Importing..." : `Import ${validCount} rows`}
              </button>
            </div>
          ) : null}
        </div>

        {preview.length > 0 ? (
          <>
            <h2 style={{ marginTop: 18, fontSize: 18 }}>Preview</h2>
            <div style={{ display: "grid", gap: 10 }}>
              {preview.slice(0, 25).map((r, idx) => (
                <div
                  key={idx}
                  style={{
                    border: "1px solid #E6E8EE",
                    borderRadius: 14,
                    padding: 12,
                    background: r.valid ? "#fff" : "#FFF5F5",
                  }}
                >
                  <div style={{ fontWeight: 900 }}>{r.name || "(missing name)"}</div>
                  <div style={{ marginTop: 6 }}>quantity_on_hand: {r.quantity_on_hand}</div>
                  {!r.valid ? (
                    <div style={{ color: "#B91C1C", marginTop: 6, fontWeight: 800 }}>
                      {r.error}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            {preview.length > 25 ? <p style={{ color: "#5B6475" }}>Showing first 25 rows…</p> : null}
          </>
        ) : null}
      </div>
    </AuthGate>
  );
}

