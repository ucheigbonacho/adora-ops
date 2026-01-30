"use client";

import { useEffect, useMemo, useState } from "react";
import * as Papa from "papaparse";
import AuthGate from "@/components/AuthWorkspaceGate";
import { supabase } from "@/lib/supabaseClient";

type ParsedRow = {
  name?: string;
  quantity_on_hand?: string | number;
};

type PreviewRow = {
  name: string;
  quantity_on_hand: number;
  valid: boolean;
  error?: string;
};

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
    const normalized: PreviewRow[] = rows.map((r, idx) => {
      const name = (r.name ?? "").toString().trim();
      const qRaw = r.quantity_on_hand ?? 0;
      const quantity_on_hand = Number(qRaw);

      if (!name) {
        return {
          name: "",
          quantity_on_hand: 0,
          valid: false,
          error: `Row ${idx + 2}: missing name`,
        };
      }
      if (Number.isNaN(quantity_on_hand)) {
        return {
          name,
          quantity_on_hand: 0,
          valid: false,
          error: `Row ${idx + 2}: invalid quantity_on_hand`,
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
      transformHeader: (h) => h.trim().toLowerCase(),
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

    // 1) Get all products in this workspace (id + name)
    const { data: products, error: prodErr } = await supabase
      .from("products")
      .select("id, name")
      .eq("workspace_id", workspaceId);

    if (prodErr) {
      setImporting(false);
      alert("Failed to load products: " + prodErr.message);
      return;
    }

    const productMap = new Map<string, string>();
    (products || []).forEach((p: any) => {
      productMap.set(String(p.name).trim().toLowerCase(), p.id);
    });

    // 2) For each row, upsert inventory balance
    for (const r of rows) {
      const key = r.name.trim().toLowerCase();
      const productId = productMap.get(key);

      if (!productId) {
        setImporting(false);
        alert(`Product not found in workspace: "${r.name}". Add it first or fix spelling in CSV.`);
        return;
      }

      // read current balance (if exists)
      const { data: balRow, error: balErr } = await supabase
        .from("inventory_balances")
        .select("quantity_on_hand")
        .eq("product_id", productId)
        .maybeSingle();

      if (balErr) {
        setImporting(false);
        alert("Failed reading inventory balance: " + balErr.message);
        return;
      }

      const current = Number(balRow?.quantity_on_hand ?? 0);
      const next = Number(r.quantity_on_hand);

      // update or insert balance
      if (balRow) {
        const { error: updErr } = await supabase
          .from("inventory_balances")
          .update({ quantity_on_hand: next })
          .eq("product_id", productId);

        if (updErr) {
          setImporting(false);
          alert("Failed updating inventory balance: " + updErr.message);
          return;
        }
      } else {
        const { error: insErr } = await supabase
          .from("inventory_balances")
          .insert([{ product_id: productId, quantity_on_hand: next }]);

        if (insErr) {
          setImporting(false);
          alert("Failed creating inventory balance: " + insErr.message);
          return;
        }
      }

      // 3) Log movement as opening balance difference (optional)
      const delta = next - current;
      if (delta !== 0) {
        const { error: moveErr } = await supabase.from("inventory_movements").insert([
          {
            workspace_id: workspaceId,
            product_id: productId,
            quantity_change: delta,
            reason: "opening_balance",
          },
        ]);

        // don't block if movement schema differs
        if (moveErr) console.warn("Movement insert failed:", moveErr.message);
      }
    }

    setImporting(false);
    alert(`Imported inventory for ${rows.length} products ✅`);
    window.location.href = "/inventory";
  }

  return (
    <AuthGate>
      <div style={{ padding: 24, maxWidth: 900 }}>
        <h1>Import Inventory (CSV)</h1>

        <p>
          CSV must have headers: <b>name</b>, <b>quantity_on_hand</b>
        </p>

        <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 14 }}>
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
              <div>
                Valid rows: <b>{validCount}</b> | Invalid rows: <b>{invalidCount}</b>
              </div>

              <button
                onClick={importRows}
                disabled={importing || validCount === 0}
                style={{ marginTop: 10, padding: "8px 12px" }}
              >
                {importing ? "Importing..." : `Import ${validCount} inventory rows`}
              </button>
            </div>
          ) : null}
        </div>

        {preview.length > 0 ? (
          <>
            <h2 style={{ marginTop: 20 }}>Preview</h2>

            <div style={{ display: "grid", gap: 10 }}>
              {preview.slice(0, 25).map((r, idx) => (
                <div
                  key={idx}
                  style={{
                    border: "1px solid #eee",
                    borderRadius: 10,
                    padding: 12,
                    background: r.valid ? "white" : "#fff5f5",
                  }}
                >
                  <div>
                    <b>{r.name || "(missing name)"}</b>
                  </div>
                  <div>quantity_on_hand: {r.quantity_on_hand}</div>
                  {!r.valid ? <div style={{ color: "crimson" }}>{r.error}</div> : null}
                </div>
              ))}
            </div>

            {preview.length > 25 ? <p style={{ marginTop: 10 }}>Showing first 25 rows…</p> : null}
          </>
        ) : null}
      </div>
    </AuthGate>
  );
}
