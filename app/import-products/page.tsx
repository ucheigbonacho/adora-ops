"use client";

import { useEffect, useMemo, useState } from "react";
import * as Papa from "papaparse";
import AuthGate from "@/components/AuthWorkspaceGate";
import { supabase } from "@/lib/supabaseClient";

type ParsedRow = {
  name?: string;
  reorder_threshold?: string | number;
};

type PreviewRow = {
  name: string;
  reorder_threshold: number;
  valid: boolean;
  error?: string;
};

export default function ImportProductsPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const [fileName, setFileName] = useState<string>("");
  const [rawRows, setRawRows] = useState<ParsedRow[]>([]);
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
      const rtRaw = r.reorder_threshold ?? 0;
      const reorder_threshold = Number(rtRaw);

      if (!name) {
        return { name: "", reorder_threshold: 0, valid: false, error: `Row ${idx + 2}: missing name` };
      }
      if (Number.isNaN(reorder_threshold) || reorder_threshold < 0) {
        return {
          name,
          reorder_threshold: 0,
          valid: false,
          error: `Row ${idx + 2}: invalid reorder_threshold`,
        };
      }

      return { name, reorder_threshold, valid: true };
    });

    setPreview(normalized);
  }

  function onPickFile(file: File) {
    setFileName(file.name);
    setRawRows([]);
    setPreview([]);

    Papa.parse<ParsedRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
      complete: (results) => {
        const rows = results.data || [];
        setRawRows(rows);
        normalize(rows);
      },
      error: (err) => {
        alert("CSV parse error: " + err.message);
      },
    });
  }

  async function importRows() {
    if (!workspaceId) {
      alert("Workspace not set. Please login and complete setup.");
      return;
    }

    const validRows = preview.filter((r) => r.valid);
    if (validRows.length === 0) {
      alert("No valid rows to import.");
      return;
    }

    setImporting(true);

    // Build insert payload
    const payload = validRows.map((r) => ({
      workspace_id: workspaceId,
      name: r.name,
      reorder_threshold: r.reorder_threshold,
    }));

    // Insert in chunks (safer for large files)
    const CHUNK = 200;
    for (let i = 0; i < payload.length; i += CHUNK) {
      const chunk = payload.slice(i, i + CHUNK);
      const { error } = await supabase.from("products").insert(chunk);
      if (error) {
        setImporting(false);
        alert("Import failed: " + error.message);
        return;
      }
    }

    setImporting(false);
    alert(`Imported ${validRows.length} products ✅`);
    window.location.href = "/products";
  }

  return (
    <AuthGate>
      <div style={{ padding: 24, maxWidth: 900 }}>
        <h1>Import Products (CSV)</h1>

        <p>
          CSV must have headers: <b>name</b>, <b>reorder_threshold</b>
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
                {importing ? "Importing..." : `Import ${validCount} products`}
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
                  <div>reorder_threshold: {r.reorder_threshold}</div>
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
