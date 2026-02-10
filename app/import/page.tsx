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
  units_per_bulk: number;
  valid: boolean;
  error?: string;

  // Debug info (helps you see what got detected)
  _detected_from?: {
    name?: string;
    reorder_threshold?: string;
    cost_price?: string;
    units_per_bulk?: string;
    ignored?: string[];
  };
};

function normKey(s: any) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\uFEFF/g, "") // remove BOM
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, "_");
}

function toNumber(v: any, fallback = 0) {
  const raw = String(v ?? "").trim();
  if (!raw) return fallback;

  // Remove currency symbols/commas
  const cleaned = raw.replace(/[$₦£€,\s]/g, "");

  // If still not number, fallback
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : fallback;
}

function toInt(v: any, fallback = 0) {
  const n = toNumber(v, NaN);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function getHeaderKeys(row: ParsedRow) {
  return Object.keys(row || {});
}

function valueLooksLikeMoney(v: any) {
  const s = String(v ?? "").trim();
  if (!s) return false;
  if (/[₦$£€]/.test(s)) return true;
  const n = toNumber(s, NaN);
  return Number.isFinite(n) && n > 0 && n < 1000000; // reasonable bounds
}

function valueLooksLikeText(v: any) {
  const s = String(v ?? "").trim();
  if (!s) return false;
  // Has letters and length > 2
  return /[a-zA-Z]/.test(s) && s.length >= 3;
}

function valueLooksLikePositiveInt(v: any) {
  const n = toNumber(v, NaN);
  return Number.isFinite(n) && n > 0 && Number.isInteger(n);
}

/**
 * Pick a field by checking many possible keys.
 * Accepts exact matches and "contains" matches for messy headers.
 */
function pickBySynonyms(row: ParsedRow, synonyms: string[]) {
  const keys = getHeaderKeys(row).map((k) => ({ raw: k, norm: normKey(k) }));
  const rowMap = new Map<string, any>();
  keys.forEach((k) => rowMap.set(k.norm, row[k.raw]));

  // 1) exact match (normalized)
  for (const s of synonyms) {
    const hit = rowMap.get(normKey(s));
    if (hit !== undefined && hit !== null && String(hit).trim() !== "") {
      return { value: hit, from: s };
    }
  }

  // 2) contains match (normalized)
  for (const { raw, norm } of keys) {
    for (const s of synonyms) {
      const ns = normKey(s);
      if (norm.includes(ns) || ns.includes(norm)) {
        const v = row[raw];
        if (v !== undefined && v !== null && String(v).trim() !== "") {
          return { value: v, from: raw };
        }
      }
    }
  }

  return { value: undefined, from: undefined as string | undefined };
}

/**
 * Fallback detection when headers are not clearly mapped:
 * - Name: most text-like column
 * - Cost: most money-like column (excluding name)
 * - Units/bulk: most positive-int-like column (excluding reorder)
 * - Reorder: if any column name looks like reorder/min, else 0
 */
function fallbackDetectColumns(rows: ParsedRow[]) {
  const sample = rows.slice(0, 25);
  const allKeys = Array.from(
    new Set(sample.flatMap((r) => Object.keys(r || {})))
  );

  const score: Record<
    string,
    { text: number; money: number; posInt: number; nonEmpty: number }
  > = {};

  for (const k of allKeys) {
    score[k] = { text: 0, money: 0, posInt: 0, nonEmpty: 0 };
    for (const r of sample) {
      const v = r?.[k];
      const s = String(v ?? "").trim();
      if (!s) continue;
      score[k].nonEmpty += 1;
      if (valueLooksLikeText(v)) score[k].text += 1;
      if (valueLooksLikeMoney(v)) score[k].money += 1;
      if (valueLooksLikePositiveInt(v)) score[k].posInt += 1;
    }
  }

  const sortBy = (field: keyof (typeof score)[string]) =>
    [...allKeys].sort((a, b) => (score[b][field] || 0) - (score[a][field] || 0));

  const bestText = sortBy("text")[0];
  const bestMoney = sortBy("money").find((k) => k !== bestText);
  const bestPosInt = sortBy("posInt").find((k) => k !== bestText);

  // reorder field guess by header name
  const reorderKey = allKeys.find((k) => {
    const nk = normKey(k);
    return nk.includes("reorder") || nk.includes("min") || nk.includes("threshold");
  });

  // units per bulk guess by header name
  const unitsKey = allKeys.find((k) => {
    const nk = normKey(k);
    return (
      nk.includes("units_per_bulk") ||
      nk.includes("units") && nk.includes("bulk") ||
      nk.includes("pack") ||
      nk.includes("carton") ||
      nk.includes("case") ||
      nk.includes("box") ||
      nk.includes("qty_per")
    );
  });

  // cost guess by header name
  const costKey = allKeys.find((k) => {
    const nk = normKey(k);
    return (
      nk.includes("cost") ||
      nk.includes("wholesale") ||
      nk.includes("purchase") ||
      nk.includes("buy") ||
      nk.includes("unit_cost")
    );
  });

  return {
    nameKey: bestText,
    costKey: costKey || bestMoney,
    unitsKey: unitsKey || bestPosInt,
    reorderKey: reorderKey,
  };
}

export default function ImportProductsPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    setWorkspaceId(localStorage.getItem("workspace_id"));
  }, []);

  const validCount = useMemo(
    () => preview.filter((r) => r.valid).length,
    [preview]
  );
  const invalidCount = useMemo(
    () => preview.filter((r) => !r.valid).length,
    [preview]
  );

  function normalize(rows: ParsedRow[]) {
    const fb = fallbackDetectColumns(rows || []);

    const normalized: PreviewRow[] = (rows || []).map((r, idx) => {
      // Strong synonym lists (handles "Product Name", "Item Name", etc.)
      const namePick = pickBySynonyms(r, [
        "name",
        "product_name",
        "product name",
        "item_name",
        "item name",
        "product",
        "item",
        "title",
        "sku_name",
        "stock_name",
      ]);

      const reorderPick = pickBySynonyms(r, [
        "reorder_threshold",
        "reorder threshold",
        "reorder",
        "reorder_level",
        "reorder level",
        "min_stock",
        "minimum_stock",
        "threshold",
        "min",
      ]);

      // Cost (we store to cost_price)
      const costPick = pickBySynonyms(r, [
        "cost_price",
        "cost price",
        "cost",
        "unit_cost",
        "unit cost",
        "wholesale",
        "wholesale_price",
        "purchase_price",
        "purchase price",
        "buy_price",
        "buy price",
        "purchase_unit_cost",
      ]);

      const unitsPick = pickBySynonyms(r, [
        "units_per_bulk",
        "units per bulk",
        "bulk_units",
        "pack_size",
        "pack size",
        "carton_qty",
        "carton qty",
        "case_qty",
        "case qty",
        "qty_per_pack",
        "qty per pack",
        "units_per_carton",
      ]);

      // Fallback values (if headers are messy)
      const nameRaw =
        namePick.value ?? (fb.nameKey ? r[fb.nameKey] : undefined);
      const reorderRaw =
        reorderPick.value ?? (fb.reorderKey ? r[fb.reorderKey] : undefined);
      const costRaw =
        costPick.value ?? (fb.costKey ? r[fb.costKey] : undefined);
      const unitsRaw =
        unitsPick.value ?? (fb.unitsKey ? r[fb.unitsKey] : undefined);

      const name = String(nameRaw ?? "").trim();
      const reorder_threshold = Math.max(0, toInt(reorderRaw, 0));
      const cost_price = Math.max(0, toNumber(costRaw, 0));
      const units_per_bulk = Math.max(1, toInt(unitsRaw, 1));

      // “Ignored” fields we detect but don’t store (Option B)
      const ignored: string[] = [];
      const descriptionKey = getHeaderKeys(r).find((k) =>
        normKey(k).includes("description")
      );
      const priceKey = getHeaderKeys(r).find((k) => {
        const nk = normKey(k);
        return nk === "price" || nk.includes("selling_price") || nk.includes("retail");
      });
      if (descriptionKey) ignored.push(descriptionKey);
      if (priceKey) ignored.push(priceKey);

      if (!name) {
        return {
          name: "",
          reorder_threshold: 0,
          cost_price: 0,
          units_per_bulk: 1,
          valid: false,
          error: `Row ${idx + 2}: missing product name`,
          _detected_from: {
            name: namePick.from || fb.nameKey,
            reorder_threshold: reorderPick.from || fb.reorderKey,
            cost_price: costPick.from || fb.costKey,
            units_per_bulk: unitsPick.from || fb.unitsKey,
            ignored,
          },
        };
      }

      return {
        name,
        reorder_threshold,
        cost_price,
        units_per_bulk,
        valid: true,
        _detected_from: {
          name: namePick.from || fb.nameKey,
          reorder_threshold: reorderPick.from || fb.reorderKey,
          cost_price: costPick.from || fb.costKey,
          units_per_bulk: unitsPick.from || fb.unitsKey,
          ignored,
        },
      };
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
      const payload = rows.map((r) => ({
        workspace_id: workspaceId,
        name: r.name,
        reorder_threshold: r.reorder_threshold,
        cost_price: r.cost_price,
        units_per_bulk: r.units_per_bulk,
      }));

      // IMPORTANT:
      // Your unique index is on (workspace_id, lower(name))
      // Supabase upsert must reference an actual unique constraint/columns.
      // Use "workspace_id,name" and duplicates will be prevented by your DB unique index (lower(name)).
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

  const pill: React.CSSProperties = {
    display: "inline-block",
    padding: "3px 8px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    border: "1px solid #E6E8EE",
    color: "#5B6475",
    marginRight: 6,
  };

  return (
    <AuthGate>
      <div style={{ padding: 16, maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>Import Products (CSV)</h1>

        <p style={{ marginTop: 8, color: "#5B6475" }}>
          This importer is “smart”: it recognizes headers like{" "}
          <b>Product Name</b>, <b>Item</b>, <b>Wholesale</b>, <b>Unit Cost</b>,{" "}
          <b>Pack Size</b>, etc.
          <br />
          <span style={{ color: "#9AA3B2" }}>
            Note: Description/Price can be detected but won’t be saved (Option B).
          </span>
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

              <button
                onClick={importRows}
                disabled={importing || validCount === 0}
                style={btn}
              >
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
                  <div style={{ fontWeight: 900 }}>
                    {r.name || "(missing name)"}
                  </div>

                  <div style={{ marginTop: 6 }}>
                    reorder_threshold: <b>{r.reorder_threshold}</b>
                  </div>
                  <div>
                    cost_price: <b>{r.cost_price}</b>
                  </div>
                  <div>
                    units_per_bulk: <b>{r.units_per_bulk}</b>
                  </div>

                  {/* show detected mapping (helps you debug why it chose it) */}
                  {r._detected_from ? (
                    <div style={{ marginTop: 10 }}>
                      <span style={pill}>name ← {r._detected_from.name || "?"}</span>
                      <span style={pill}>
                        reorder ← {r._detected_from.reorder_threshold || "default 0"}
                      </span>
                      <span style={pill}>cost ← {r._detected_from.cost_price || "default 0"}</span>
                      <span style={pill}>
                        units ← {r._detected_from.units_per_bulk || "default 1"}
                      </span>
                      {r._detected_from.ignored?.length ? (
                        <span style={pill}>
                          ignored: {r._detected_from.ignored.join(", ")}
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  {!r.valid ? (
                    <div style={{ color: "#B91C1C", marginTop: 8, fontWeight: 800 }}>
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
