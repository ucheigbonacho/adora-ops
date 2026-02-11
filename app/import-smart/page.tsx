"use client";

import { useEffect, useMemo, useState } from "react";
import * as Papa from "papaparse";
import AuthGate from "@/components/AuthWorkspaceGate";
import { supabase } from "@/lib/supabaseClient";

/**
 * Smart Import (AI-ish mapping without calling AI)
 * - Tries very hard to map messy headers to:
 *   name, cost_price, units_per_bulk, reorder_threshold
 * - Works even if headers are like:
 *   "Item Desc", "Product Name", "Cost (₦)", "Pack Qty", "Min Stock", etc.
 * - Lets user override mapping via dropdowns.
 */

type ParsedRow = Record<string, any>;

type FieldKey = "name" | "cost_price" | "units_per_bulk" | "reorder_threshold";

type MappedRow = {
  name: string;
  cost_price: number;
  units_per_bulk: number;
  reorder_threshold: number;
  valid: boolean;
  error?: string;
};

type Mapping = Record<FieldKey, string | "">;

function normKey(s: any) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toNumber(v: any, fallback = 0) {
  const raw = String(v ?? "")
    .replace(/,/g, "")
    .replace(/[^\d.-]/g, "")
    .trim();
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** header scoring */
function scoreHeader(header: string, target: FieldKey): number {
  const h = normKey(header);

  const has = (kw: string) => h.includes(kw);

  // Strong positives
  const score = (() => {
    if (target === "name") {
      let s = 0;
      if (has("name")) s += 50;
      if (has("product")) s += 45;
      if (has("item")) s += 35;
      if (has("title")) s += 25;
      if (has("desc") || has("description")) s += 18;
      if (has("sku")) s += 6;
      // negatives
      if (has("cost") || has("price") || has("qty") || has("quantity")) s -= 25;
      return s;
    }

    if (target === "cost_price") {
      let s = 0;
      if (has("cost")) s += 50;
      if (has("unit cost")) s += 50;
      if (has("buy")) s += 25;
      if (has("purchase")) s += 25;
      if (has("wholesale")) s += 15;
      if (has("cogs")) s += 15;
      // sometimes people label cost as "price" - but price could also be selling price
      if (has("price")) s += 10;
      // negatives
      if (has("reorder") || has("min stock")) s -= 25;
      if (has("qty") || has("quantity") || has("units")) s -= 10;
      return s;
    }

    if (target === "units_per_bulk") {
      let s = 0;
      if (has("units per")) s += 55;
      if (has("pack")) s += 45;
      if (has("case")) s += 40;
      if (has("carton")) s += 40;
      if (has("box")) s += 30;
      if (has("crate")) s += 30;
      if (has("bulk")) s += 25;
      if (has("pack size")) s += 45;
      if (has("qty per")) s += 45;
      if (has("per carton")) s += 55;
      if (has("per case")) s += 55;
      if (has("count")) s += 10;
      // negatives
      if (has("reorder") || has("min stock")) s -= 20;
      if (has("cost") || has("price")) s -= 20;
      return s;
    }

    // reorder_threshold
    let s = 0;
    if (has("reorder")) s += 60;
    if (has("min stock")) s += 55;
    if (has("minimum stock")) s += 55;
    if (has("low stock")) s += 45;
    if (has("threshold")) s += 45;
    if (has("restock")) s += 30;
    if (has("safety stock")) s += 25;
    if (has("stock level")) s += 20;
    if (has("level")) s += 10;
    // negatives
    if (has("cost") || has("price")) s -= 25;
    if (has("pack") || has("carton") || has("case")) s -= 10;
    return s;
  })();

  return score;
}

function detectMapping(headers: string[]): Mapping {
  const mapping: Mapping = {
    name: "",
    cost_price: "",
    units_per_bulk: "",
    reorder_threshold: "",
  };

  const remaining = new Set(headers);

  // Pick best header per field, avoiding reusing the same header
  (["name", "cost_price", "units_per_bulk", "reorder_threshold"] as FieldKey[]).forEach((field) => {
    let best: { h: string; s: number } | null = null;

    for (const h of remaining) {
      const s = scoreHeader(h, field);
      if (!best || s > best.s) best = { h, s };
    }

    // Only accept if score is decent
    if (best && best.s >= 20) {
      mapping[field] = best.h;
      remaining.delete(best.h);
    }
  });

  return mapping;
}

function getRowValue(row: ParsedRow, header: string | ""): any {
  if (!header) return undefined;

  // exact match first
  if (row[header] !== undefined) return row[header];

  // try normalized match
  const want = normKey(header);
  for (const k of Object.keys(row)) {
    if (normKey(k) === want) return row[k];
  }

  return undefined;
}

function buildPreview(rows: ParsedRow[], mapping: Mapping): MappedRow[] {
  return (rows || []).map((r, idx) => {
    const nameRaw = getRowValue(r, mapping.name);
    const costRaw = getRowValue(r, mapping.cost_price);
    const unitsRaw = getRowValue(r, mapping.units_per_bulk);
    const reorderRaw = getRowValue(r, mapping.reorder_threshold);

    const name = String(nameRaw ?? "").trim();
    const cost_price = Math.max(0, toNumber(costRaw, 0));
    const units_per_bulk = Math.max(1, Math.floor(toNumber(unitsRaw, 1)));
    const reorder_threshold = Math.max(0, Math.floor(toNumber(reorderRaw, 0)));

    if (!name) {
      return {
        name: "",
        cost_price,
        units_per_bulk,
        reorder_threshold,
        valid: false,
        error: `Row ${idx + 2}: missing product name`,
      };
    }

    return {
      name,
      cost_price,
      units_per_bulk,
      reorder_threshold,
      valid: true,
    };
  });
}

export default function ImportSmartPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<ParsedRow[]>([]);
  const [mapping, setMapping] = useState<Mapping>({
    name: "",
    cost_price: "",
    units_per_bulk: "",
    reorder_threshold: "",
  });

  const [preview, setPreview] = useState<MappedRow[]>([]);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    setWorkspaceId(localStorage.getItem("workspace_id"));
  }, []);

  // recompute preview when rows/mapping change
  useEffect(() => {
    if (!rawRows.length) {
      setPreview([]);
      return;
    }
    setPreview(buildPreview(rawRows, mapping));
  }, [rawRows, mapping]);

  const validCount = useMemo(() => preview.filter((r) => r.valid).length, [preview]);
  const invalidCount = useMemo(() => preview.filter((r) => !r.valid).length, [preview]);

  function onPickFile(file: File) {
    setFileName(file.name);
    setHeaders([]);
    setRawRows([]);
    setPreview([]);

    Papa.parse<ParsedRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => String(h || "").trim(),
      complete: (results) => {
        const rows = (results.data || []) as ParsedRow[];
        const hs = Object.keys(rows?.[0] || {}).filter(Boolean);

        setHeaders(hs);
        setRawRows(rows);

        // smart detect mapping
        const auto = detectMapping(hs);
        setMapping(auto);
      },
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
      const payload = rows.map((r) => ({
        workspace_id: workspaceId,
        name: r.name,
        reorder_threshold: r.reorder_threshold,
        cost_price: r.cost_price,
        units_per_bulk: r.units_per_bulk,
      }));

      // NOTE:
      // If your unique index is (workspace_id, lower(name)),
      // upsert needs ON CONFLICT using the *constraint columns*.
      // Many setups use "workspace_id,name" (case-sensitive).
      // If you want true case-insensitive upsert, create a UNIQUE constraint
      // on (workspace_id, lower(name)) and then use a dedicated constraint name.
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

  const select: React.CSSProperties = {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid #E6E8EE",
    fontSize: 15,
    background: "#fff",
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

  const pill = (ok: boolean): React.CSSProperties => ({
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: 999,
    fontWeight: 900,
    fontSize: 12,
    background: ok ? "#ECFDF3" : "#FFF5F5",
    color: ok ? "#16A34A" : "#B91C1C",
    border: "1px solid #E6E8EE",
  });

  return (
    <AuthGate>
      <div style={{ padding: 16, maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>Smart Import Products (CSV)</h1>
        <p style={{ marginTop: 8, color: "#5B6475" }}>
          Upload any CSV — Smart Import will try to auto-map columns (even messy headers). You can
          adjust mapping below.
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

          {headers.length > 0 ? (
            <>
              <hr style={{ margin: "14px 0", borderColor: "#E6E8EE" }} />

              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                <div>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Product name</div>
                  <select
                    style={select}
                    value={mapping.name}
                    onChange={(e) => setMapping((m) => ({ ...m, name: e.target.value }))}
                  >
                    <option value="">— Select column —</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Cost price</div>
                  <select
                    style={select}
                    value={mapping.cost_price}
                    onChange={(e) => setMapping((m) => ({ ...m, cost_price: e.target.value }))}
                  >
                    <option value="">— (optional) —</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Units per bulk (carton/case)</div>
                  <select
                    style={select}
                    value={mapping.units_per_bulk}
                    onChange={(e) => setMapping((m) => ({ ...m, units_per_bulk: e.target.value }))}
                  >
                    <option value="">— (optional) —</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Reorder threshold</div>
                  <select
                    style={select}
                    value={mapping.reorder_threshold}
                    onChange={(e) => setMapping((m) => ({ ...m, reorder_threshold: e.target.value }))}
                  >
                    <option value="">— (optional) —</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {preview.length > 0 ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 900 }}>
                    Valid: {validCount} | Invalid: {invalidCount}
                  </div>

                  <button onClick={importRows} disabled={importing || validCount === 0} style={btn}>
                    {importing ? "Importing..." : `Import ${validCount} products`}
                  </button>
                </div>
              ) : null}
            </>
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
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 1000 }}>{r.name || "(missing name)"}</div>
                    <span style={pill(r.valid)}>{r.valid ? "OK" : "Fix"}</span>
                  </div>

                  <div style={{ marginTop: 6, color: "#5B6475", fontSize: 13 }}>
                    cost_price: <b>{r.cost_price}</b> • units_per_bulk: <b>{r.units_per_bulk}</b> • reorder_threshold:{" "}
                    <b>{r.reorder_threshold}</b>
                  </div>

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
