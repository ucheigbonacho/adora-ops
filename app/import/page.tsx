"use client";

import { useEffect, useMemo, useState } from "react";
import * as Papa from "papaparse";
import AuthGate from "@/components/AuthWorkspaceGate";
import { supabase } from "@/lib/supabaseClient";

type ParsedRow = Record<string, any>;

type PreviewRow = {
  name: string;
  reorder_threshold: number;
  cost_price: number;
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

function toNumber(v: any, fallback = 0) {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : fallback;
}

export default function ImportProductsPage() {
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
      const reorderRaw = pickField(r, ["reorder_threshold", "reorder", "reorder_level"]);

      // ✅ Accept lots of names for cost; store into `cost_price` column
      const costRaw = pickField(r, [
        "cost_price",
        "costprice",
        "cost",
        "purchase_price",
        "purchase_unit_cost",
        "unit_cost",
      ]);

      const name = String(nameRaw ?? "").trim();
      const reorder_threshold = toNumber(reorderRaw ?? 0, 0);
      const cost_price = toNumber(costRaw ?? 0, 0);

      if (!name) {
        return {
          name: "",
          reorder_threshold: 0,
          cost_price: 0,
          valid: false,
          error: `Row ${idx + 2}: missing name`,
        };
      }
      if (reorder_threshold < 0) {
        return {
          name,
          reorder_threshold: 0,
          cost_price,
          valid: false,
          error: `Row ${idx + 2}: reorder_threshold must be >= 0`,
        };
      }
      if (cost_price < 0) {
        return {
          name,
          reorder_threshold,
          cost_price: 0,
          valid: false,
          error: `Row ${idx + 2}: cost_price must be >= 0`,
        };
      }

      return { name, reorder_threshold, cost_price, valid: true };
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
      // ✅ Upsert by unique index (workspace_id, lower(name))
      // This prevents duplicates and "missing name row" confusion due to repeats.
      const payload = rows.map((r) => ({
        workspace_id: workspaceId,
        name: r.name,
        reorder_threshold: r.reorder_threshold,
        cost_price: r.cost_price,
      }));

      const { error } = await supabase
        .from("products")
        .upsert(payload, { onConflict: "workspace_id,name" });

      if (error) throw new Error(error.message);

      window.dispatchEvent(new Event("adora:refresh"));
      alert(`Imported ${rows.length} products ✅`);
      window.location.href = "/products";
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
        <h1 style={{ margin: 0, fontSize: 28 }}>Import Products (CSV)</h1>
        <p style={{ marginTop: 8, color: "#5B6475" }}>
          Headers supported: <b>name</b>, <b>reorder_threshold</b>, <b>cost_price</b>
          (also accepts reorder/reorder_level and cost/costprice/purchase_price/purchase_unit_cost).
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
                {importing ? "Importing..." : `Import ${validCount} products`}
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
                  <div style={{ marginTop: 6 }}>reorder_threshold: {r.reorder_threshold}</div>
                  <div>cost_price: {r.cost_price}</div>
                  {!r.valid ? (
                    <div style={{ color: "#B91C1C", marginTop: 6, fontWeight: 800 }}>
                      {r.error}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            {preview.length > 25 ? (
              <p style={{ color: "#5B6475" }}>Showing first 25 rows…</p>
            ) : null}
          </>
        ) : null}
      </div>
    </AuthGate>
  );
}
