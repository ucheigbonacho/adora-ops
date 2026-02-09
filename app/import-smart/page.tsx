// app/import-smart/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import * as Papa from "papaparse";
import AuthGate from "@/components/AuthWorkspaceGate";
import { supabase } from "@/lib/supabaseClient";

type AnyRow = Record<string, any>;

type Role = "name" | "quantity_on_hand" | "cost_price" | "reorder_threshold";
type Mapping = Record<Role, string>; // role -> columnKey (or "" for none)

type PreviewRow = {
  raw: AnyRow;
  name: string;
  quantity_on_hand: number | null;
  cost_price: number | null;
  reorder_threshold: number | null;
  validName: boolean;
  notes: string[];
};

function normKey(s: any) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w_]/g, "");
}

function toNumber(v: any): number | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function isMostlyNumber(values: any[]) {
  const cleaned = values
    .map((v) => String(v ?? "").trim())
    .filter((x) => x.length > 0);
  if (cleaned.length === 0) return false;
  const nums = cleaned.map((x) => Number(x.replace(/,/g, ""))).filter((n) => Number.isFinite(n));
  return nums.length / cleaned.length >= 0.7;
}

function isMostlyInteger(values: any[]) {
  const cleaned = values
    .map((v) => String(v ?? "").trim())
    .filter((x) => x.length > 0);
  if (cleaned.length === 0) return false;
  const ints = cleaned
    .map((x) => Number(x.replace(/,/g, "")))
    .filter((n) => Number.isFinite(n) && Number.isInteger(n));
  return ints.length / cleaned.length >= 0.7;
}

function isMostlyText(values: any[]) {
  const cleaned = values
    .map((v) => String(v ?? "").trim())
    .filter((x) => x.length > 0);
  if (cleaned.length === 0) return false;
  const texty = cleaned.filter((x) => Number.isNaN(Number(x.replace(/,/g, ""))));
  return texty.length / cleaned.length >= 0.6;
}

function headerScore(role: Role, header: string) {
  const h = normKey(header);

  const hasAny = (...needles: string[]) => needles.some((n) => h.includes(n));

  if (role === "name") {
    if (hasAny("name", "product", "item", "title", "description")) return 10;
    if (hasAny("sku", "code")) return 4;
    return 0;
  }

  if (role === "quantity_on_hand") {
    if (hasAny("quantity_on_hand", "onhand", "on_hand", "qty", "quantity", "stock", "balance", "available"))
      return 10;
    if (hasAny("units", "count")) return 6;
    return 0;
  }

  if (role === "cost_price") {
    if (hasAny("cost_price", "cost", "unit_cost", "unitcost", "purchase", "buy", "wholesale", "cogs"))
      return 10;
    if (hasAny("price")) return 5; // ambiguous (could be selling price)
    return 0;
  }

  // reorder_threshold
  if (hasAny("reorder", "threshold", "min", "minimum", "par", "low_stock", "restock")) return 10;
  return 0;
}

function bestGuessMapping(rows: AnyRow[], columns: string[]): Mapping {
  // Use both header hints + value-type hints
  const colValues = new Map<string, any[]>();
  for (const c of columns) {
    colValues.set(c, rows.map((r) => r?.[c]));
  }

  // Score candidates per role
  const scoreColForRole = (role: Role, col: string) => {
    const headerHint = headerScore(role, col);
    const values = colValues.get(col) || [];

    let typeHint = 0;

    if (role === "name") {
      if (isMostlyText(values)) typeHint += 6;
    } else if (role === "quantity_on_hand") {
      if (isMostlyInteger(values)) typeHint += 6;
      else if (isMostlyNumber(values)) typeHint += 3;
    } else if (role === "cost_price") {
      // cost often decimal
      if (isMostlyNumber(values)) typeHint += 6;
    } else if (role === "reorder_threshold") {
      if (isMostlyInteger(values)) typeHint += 6;
      else if (isMostlyNumber(values)) typeHint += 2;
    }

    // penalty: extremely long text columns are unlikely numeric
    if (role !== "name" && isMostlyText(values)) typeHint -= 3;

    return headerHint + typeHint;
  };

  const pickBest = (role: Role, used: Set<string>) => {
    let best = "";
    let bestScore = -Infinity;
    for (const c of columns) {
      if (used.has(c)) continue;
      const s = scoreColForRole(role, c);
      if (s > bestScore) {
        bestScore = s;
        best = c;
      }
    }
    // require a minimum confidence
    if (bestScore < 6) return "";
    used.add(best);
    return best;
  };

  const used = new Set<string>();
  const name = pickBest("name", used);
  const quantity_on_hand = pickBest("quantity_on_hand", used);
  const cost_price = pickBest("cost_price", used);
  const reorder_threshold = pickBest("reorder_threshold", used);

  return { name, quantity_on_hand, cost_price, reorder_threshold };
}

function toHeaderlessRows(rows: any[][]): AnyRow[] {
  // Build col keys: col_0, col_1...
  const maxLen = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const cols = Array.from({ length: maxLen }, (_, i) => `col_${i + 1}`);
  return rows.map((r) => {
    const obj: AnyRow = {};
    cols.forEach((c, i) => (obj[c] = r[i]));
    return obj;
  });
}

function looksLikeJunkRow(row: AnyRow) {
  // Ignore rows that are completely empty or single-cell title lines like "Inventory Report"
  const values = Object.values(row || {}).map((v) => String(v ?? "").trim());
  const nonEmpty = values.filter(Boolean);
  if (nonEmpty.length === 0) return true;
  if (nonEmpty.length === 1 && nonEmpty[0].length > 0 && nonEmpty[0].length < 60) {
    // could be a title row, but we can keep it out of data
    return true;
  }
  return false;
}

export default function ImportSmartPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const [fileName, setFileName] = useState("");
  const [rawRows, setRawRows] = useState<AnyRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Mapping>({
    name: "",
    quantity_on_hand: "",
    cost_price: "",
    reorder_threshold: "",
  });

  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    setWorkspaceId(localStorage.getItem("workspace_id"));
  }, []);

  const validNameCount = useMemo(() => preview.filter((p) => p.validName).length, [preview]);

  const willImportProducts = useMemo(() => {
    return mapping.name !== "" && (mapping.cost_price !== "" || mapping.reorder_threshold !== "");
  }, [mapping]);

  const willImportInventory = useMemo(() => {
    return mapping.name !== "" && mapping.quantity_on_hand !== "";
  }, [mapping]);

  function buildPreview(rows: AnyRow[], m: Mapping) {
    const out: PreviewRow[] = rows.slice(0, 200).map((r) => {
      const notes: string[] = [];

      const name = String(r?.[m.name] ?? "").trim();
      const validName = !!name;

      const qty = m.quantity_on_hand ? toNumber(r?.[m.quantity_on_hand]) : null;
      const cost = m.cost_price ? toNumber(r?.[m.cost_price]) : null;
      const reorder = m.reorder_threshold ? toNumber(r?.[m.reorder_threshold]) : null;

      if (!validName) notes.push("Missing product name");
      if (m.quantity_on_hand && qty === null) notes.push("Qty is missing/invalid");
      if (m.cost_price && cost === null) notes.push("Cost is missing/invalid");
      if (m.reorder_threshold && reorder === null) notes.push("Reorder is missing/invalid");

      return {
        raw: r,
        name,
        quantity_on_hand: qty,
        cost_price: cost,
        reorder_threshold: reorder,
        validName,
        notes,
      };
    });

    setPreview(out);
  }

  function setAutoMapping(rows: AnyRow[], cols: string[]) {
    const guess = bestGuessMapping(rows, cols);
    setMapping(guess);
    buildPreview(rows, guess);
  }

  function parseFile(file: File) {
    setFileName(file.name);
    setRawRows([]);
    setColumns([]);
    setPreview([]);
    setMapping({ name: "", quantity_on_hand: "", cost_price: "", reorder_threshold: "" });

    // Parse twice:
    // 1) header:true
    // 2) header:false (positional)
    // Choose the one that yields a better confident mapping and more non-junk rows.

    let headerRows: AnyRow[] = [];
    let headerCols: string[] = [];

    let noHeaderRows: AnyRow[] = [];
    let noHeaderCols: string[] = [];

    const doneIfBoth = () => {
      if (!headerRows.length && !noHeaderRows.length) return;

      const scoreDataset = (rows: AnyRow[], cols: string[]) => {
        if (rows.length === 0 || cols.length === 0) return -Infinity;
        const guess = bestGuessMapping(rows, cols);
        // score = number of mapped roles + name mapped bonus + dataset size bonus
        const mapped = Object.values(guess).filter(Boolean).length;
        const nameBonus = guess.name ? 2 : 0;
        return mapped + nameBonus + Math.min(3, rows.length / 20);
      };

      const headerScore = scoreDataset(headerRows, headerCols);
      const noHeaderScore = scoreDataset(noHeaderRows, noHeaderCols);

      const pickHeader = headerScore >= noHeaderScore;

      const finalRows = pickHeader ? headerRows : noHeaderRows;
      const finalCols = pickHeader ? headerCols : noHeaderCols;

      setRawRows(finalRows);
      setColumns(finalCols);
      setAutoMapping(finalRows, finalCols);
    };

    Papa.parse<AnyRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => String(h || "").trim(),
      complete: (results) => {
        const rows = (results.data || []).filter((r: any) => !looksLikeJunkRow(r));
        headerRows = rows as AnyRow[];
        headerCols = Array.from(
          new Set(
            Object.keys((headerRows[0] || {}) as AnyRow).filter((k) => String(k).trim().length > 0)
          )
        );
        doneIfBoth();
      },
      error: (err) => alert("CSV parse error: " + err.message),
    });

    Papa.parse<any[]>(file, {
      header: false,
      skipEmptyLines: true,
      complete: (results) => {
        const arrRows = (results.data || []).filter((r: any[]) => Array.isArray(r) && r.some((x) => String(x ?? "").trim()));
        const objRows = toHeaderlessRows(arrRows);
        const cleaned = objRows.filter((r) => !looksLikeJunkRow(r));
        noHeaderRows = cleaned;
        noHeaderCols = Array.from(new Set(Object.keys((noHeaderRows[0] || {}) as AnyRow)));
        doneIfBoth();
      },
      error: () => {
        // ignore (header:true parse already handles)
      },
    });
  }

  async function upsertProduct(workspace_id: string, name: string, cost_price: number | null, reorder_threshold: number | null) {
    const payload: any = {
      workspace_id,
      name,
    };
    if (cost_price !== null) payload.cost_price = cost_price;
    if (reorder_threshold !== null) payload.reorder_threshold = Math.max(0, Math.round(reorder_threshold));

    // Unique index exists on (workspace_id, lower(name))
    // Supabase onConflict can't use expressions; so we try:
    // 1) find by ilike exact-ish
    // 2) update if found else insert

    const { data: existing, error: findErr } = await supabase
      .from("products")
      .select("id, name")
      .eq("workspace_id", workspace_id)
      .ilike("name", name)
      .maybeSingle();

    if (findErr) throw new Error(findErr.message);

    if (existing?.id) {
      const { error: updErr } = await supabase
        .from("products")
        .update(payload)
        .eq("id", existing.id)
        .eq("workspace_id", workspace_id);

      if (updErr) throw new Error(updErr.message);
      return existing.id as string;
    } else {
      const { data: ins, error: insErr } = await supabase
        .from("products")
        .insert([payload])
        .select("id")
        .single();

      if (insErr) throw new Error(insErr.message);
      return ins.id as string;
    }
  }

  async function upsertInventoryBalance(workspace_id: string, product_id: string, quantity_on_hand: number) {
    // safest: read then update/insert with workspace_id scope
    const { data: bal, error: balErr } = await supabase
      .from("inventory_balances")
      .select("quantity_on_hand")
      .eq("workspace_id", workspace_id)
      .eq("product_id", product_id)
      .maybeSingle();

    if (balErr) throw new Error(balErr.message);

    const current = Number(bal?.quantity_on_hand ?? 0);
    const next = quantity_on_hand;

    if (bal) {
      const { error: updErr } = await supabase
        .from("inventory_balances")
        .update({ quantity_on_hand: next })
        .eq("workspace_id", workspace_id)
        .eq("product_id", product_id);

      if (updErr) throw new Error(updErr.message);
    } else {
      const { error: insErr } = await supabase.from("inventory_balances").insert([
        { workspace_id, product_id, quantity_on_hand: next },
      ]);
      if (insErr) throw new Error(insErr.message);
    }

    const delta = next - current;
    if (delta !== 0) {
      const { error: moveErr } = await supabase.from("inventory_movements").insert([
        { workspace_id, product_id, quantity_change: delta, reason: "import" },
      ]);
      if (moveErr) console.warn("Movement insert failed:", moveErr.message);
    }
  }

  async function doImport() {
    if (!workspaceId) {
      alert("Workspace not set. Please login and complete setup.");
      return;
    }
    if (!rawRows.length) {
      alert("No rows parsed.");
      return;
    }
    if (!mapping.name) {
      alert("Please map a column to Product Name.");
      return;
    }
    if (!willImportProducts && !willImportInventory) {
      alert("Map at least one of: quantity_on_hand OR cost_price/reorder_threshold.");
      return;
    }

    // Build full rows (not just preview slice)
    const rows = rawRows
      .map((r) => {
        const name = String(r?.[mapping.name] ?? "").trim();
        const qty = mapping.quantity_on_hand ? toNumber(r?.[mapping.quantity_on_hand]) : null;
        const cost = mapping.cost_price ? toNumber(r?.[mapping.cost_price]) : null;
        const reorder = mapping.reorder_threshold ? toNumber(r?.[mapping.reorder_threshold]) : null;
        return { name, qty, cost, reorder };
      })
      .filter((r) => r.name);

    if (!rows.length) {
      alert("No valid rows (missing name).");
      return;
    }

    setImporting(true);

    try {
      let productsTouched = 0;
      let inventoryTouched = 0;

      // Import sequentially (simpler, safer)
      for (const r of rows) {
        const cost_price = willImportProducts ? (r.cost ?? null) : null;
        const reorder_threshold = willImportProducts ? (r.reorder ?? null) : null;

        const productId = await upsertProduct(
          workspaceId,
          r.name,
          cost_price,
          reorder_threshold
        );
        productsTouched++;

        if (willImportInventory && r.qty !== null) {
          await upsertInventoryBalance(workspaceId, productId, Math.round(r.qty));
          inventoryTouched++;
        }
      }

      window.dispatchEvent(new Event("adora:refresh"));

      alert(
        `Import complete ✅\n\nProducts updated: ${productsTouched}\nInventory updated: ${inventoryTouched}`
      );

      // Go somewhere sensible
      if (willImportInventory) window.location.href = "/inventory";
      else window.location.href = "/products";
    } catch (e: any) {
      alert(e?.message || "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  const box: React.CSSProperties = {
    border: "1px solid #E6E8EE",
    borderRadius: 18,
    padding: 16,
    background: "#fff",
    boxShadow: "0 10px 26px rgba(0,0,0,0.06)",
  };

  const label: React.CSSProperties = { fontWeight: 900, fontSize: 13 };
  const select: React.CSSProperties = {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 14,
    border: "1px solid #E6E8EE",
    fontSize: 15,
    marginTop: 8,
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

  const pill: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid #E6E8EE",
    background: "#F7F9FC",
    fontWeight: 900,
    fontSize: 12,
  };

  return (
    <AuthGate>
      <div style={{ padding: 16, maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>Smart Import</h1>
        <p style={{ marginTop: 8, color: "#5B6475" }}>
          Upload a CSV. We’ll auto-detect columns (even if headers are messy or missing),
          let you confirm mapping, then import into <b>Products</b> and/or <b>Inventory</b>.
        </p>

        <div style={box}>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) parseFile(f);
            }}
          />

          {fileName ? (
            <div style={{ marginTop: 10 }}>
              File: <b>{fileName}</b>
            </div>
          ) : null}

          {columns.length > 0 ? (
            <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <span style={pill}>Rows detected: {rawRows.length}</span>
                <span style={pill}>Name valid: {validNameCount} (preview)</span>
                <span style={pill}>
                  Importing:{" "}
                  {willImportProducts && willImportInventory
                    ? "Products + Inventory"
                    : willImportProducts
                    ? "Products only"
                    : willImportInventory
                    ? "Inventory only"
                    : "—"}
                </span>
              </div>

              <div
                style={{
                  display: "grid",
                  gap: 12,
                  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
                }}
              >
                <div>
                  <div style={label}>Product Name (required)</div>
                  <select
                    value={mapping.name}
                    onChange={(e) => {
                      const next = { ...mapping, name: e.target.value };
                      setMapping(next);
                      buildPreview(rawRows, next);
                    }}
                    style={select}
                  >
                    <option value="">— Select column —</option>
                    {columns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div style={label}>Quantity on hand (inventory)</div>
                  <select
                    value={mapping.quantity_on_hand}
                    onChange={(e) => {
                      const next = { ...mapping, quantity_on_hand: e.target.value };
                      setMapping(next);
                      buildPreview(rawRows, next);
                    }}
                    style={select}
                  >
                    <option value="">(none)</option>
                    {columns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div style={label}>Cost price (products)</div>
                  <select
                    value={mapping.cost_price}
                    onChange={(e) => {
                      const next = { ...mapping, cost_price: e.target.value };
                      setMapping(next);
                      buildPreview(rawRows, next);
                    }}
                    style={select}
                  >
                    <option value="">(none)</option>
                    {columns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div style={label}>Reorder threshold (products)</div>
                  <select
                    value={mapping.reorder_threshold}
                    onChange={(e) => {
                      const next = { ...mapping, reorder_threshold: e.target.value };
                      setMapping(next);
                      buildPreview(rawRows, next);
                    }}
                    style={select}
                  >
                    <option value="">(none)</option>
                    {columns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button onClick={doImport} disabled={importing} said-disabled={importing ? "1" : "0"} style={btn}>
                {importing ? "Importing..." : "Import"}
              </button>

              <div style={{ color: "#5B6475", fontSize: 13, marginTop: 2 }}>
                Tip: If your file has no header row, we’ll label columns as <b>col_1</b>,{" "}
                <b>col_2</b>, etc. Just map them using the preview below.
              </div>
            </div>
          ) : null}
        </div>

        {preview.length > 0 ? (
          <>
            <h2 style={{ marginTop: 18, fontSize: 18 }}>Preview (first {Math.min(200, preview.length)} rows)</h2>
            <div style={{ display: "grid", gap: 10 }}>
              {preview.slice(0, 25).map((r, idx) => (
                <div
                  key={idx}
                  style={{
                    border: "1px solid #E6E8EE",
                    borderRadius: 14,
                    padding: 12,
                    background: r.validName ? "#fff" : "#FFF5F5",
                    boxShadow: "0 10px 26px rgba(0,0,0,0.04)",
                  }}
                >
                  <div style={{ fontWeight: 900 }}>
                    {r.name || "(missing name)"}{" "}
                    {!r.validName ? <span style={{ color: "#B91C1C" }}>• Fix mapping</span> : null}
                  </div>
                  <div style={{ marginTop: 6, display: "grid", gap: 2, color: "#0B1220" }}>
                    <div>quantity_on_hand: {r.quantity_on_hand ?? "—"}</div>
                    <div>cost_price: {r.cost_price ?? "—"}</div>
                    <div>reorder_threshold: {r.reorder_threshold ?? "—"}</div>
                  </div>

                  {r.notes.length ? (
                    <div style={{ marginTop: 8, color: "#B91C1C", fontWeight: 800, fontSize: 12 }}>
                      {r.notes.join(" • ")}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            {preview.length > 25 ? (
              <p style={{ color: "#5B6475", marginTop: 10 }}>Showing first 25 rows…</p>
            ) : null}
          </>
        ) : null}
      </div>
    </AuthGate>
  );
}
