"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthWorkspaceGate";
import { supabase } from "@/lib/supabaseClient";

type ExpenseRow = {
  id: string;
  name: string;
  amount: number | null;
  category: string | null;
  created_at: string;
};

function stripLeadingZeros(s: string) {
  // For amounts (allow decimals)
  const cleaned = String(s ?? "").replace(/[^\d.]/g, "");
  if (!cleaned) return "";

  // keep only first decimal point if user pasted multiple
  const parts = cleaned.split(".");
  const intPart = parts[0] ?? "";
  const decPart = parts.length > 1 ? parts.slice(1).join("") : "";

  const intNoZeros = intPart.replace(/^0+(?=\d)/, "");
  if (parts.length > 1) return `${intNoZeros || "0"}.${decPart.replace(/[^\d]/g, "")}`;

  return (intNoZeros || "0").replace(/[^\d]/g, "");
}

function toNumberSafe(v: string, fallback = 0) {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : fallback;
}

export default function ExpensesPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);

  // form fields as strings (prevents 030 confusion)
  const [name, setName] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [category, setCategory] = useState<string>("general");

  const [loading, setLoading] = useState(false);

  // editing (optional but very helpful)
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editAmountStr, setEditAmountStr] = useState("");
  const [editCategory, setEditCategory] = useState<string>("general");

  useEffect(() => {
    setWorkspaceId(localStorage.getItem("workspace_id"));
  }, []);

  async function loadExpenses() {
    if (!workspaceId) return;

    const { data, error } = await supabase
      .from("expenses")
      .select("id, name, amount, category, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (error) {
      alert("Failed to load expenses: " + error.message);
      return;
    }

    setExpenses((data as ExpenseRow[]) || []);
  }

  // 🔄 AUTO REFRESH WHEN ASSISTANT UPDATES DATA
  useEffect(() => {
    const onRefresh = () => loadExpenses();
    window.addEventListener("adora:refresh", onRefresh);
    return () => window.removeEventListener("adora:refresh", onRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  useEffect(() => {
    if (workspaceId) loadExpenses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  async function addExpense() {
    if (!workspaceId) return;

    const nm = name.trim();
    const amt = Math.max(0, toNumberSafe(amountStr, 0));

    if (!nm) {
      alert("Enter expense name");
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      alert("Enter a valid amount");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from("expenses").insert([
        {
          workspace_id: workspaceId,
          name: nm,
          amount: amt,
          category,
        },
      ]);

      if (error) throw new Error(error.message);

      setName("");
      setAmountStr("");
      setCategory("general");

      await loadExpenses();
      window.dispatchEvent(new Event("adora:refresh"));
      alert("Expense added ✅");
    } catch (e: any) {
      alert(e?.message || "Failed to add expense.");
    } finally {
      setLoading(false);
    }
  }

  function startEdit(x: ExpenseRow) {
    setEditId(x.id);
    setEditName(x.name ?? "");
    setEditAmountStr(String(x.amount ?? 0));
    setEditCategory((x.category ?? "general").toLowerCase());
  }

  function cancelEdit() {
    setEditId(null);
    setEditName("");
    setEditAmountStr("");
    setEditCategory("general");
  }

  async function saveEdit(x: ExpenseRow) {
    if (!workspaceId) return;

    const nm = editName.trim();
    const amt = Math.max(0, toNumberSafe(editAmountStr, 0));

    if (!nm) {
      alert("Expense name cannot be empty");
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      alert("Enter a valid amount");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from("expenses")
        .update({ name: nm, amount: amt, category: editCategory })
        .eq("workspace_id", workspaceId)
        .eq("id", x.id);

      if (error) throw new Error(error.message);

      cancelEdit();
      await loadExpenses();
      window.dispatchEvent(new Event("adora:refresh"));
      alert("Saved ✅");
    } catch (e: any) {
      alert(e?.message || "Failed to save.");
    } finally {
      setLoading(false);
    }
  }

  const summary = useMemo(() => {
    const total = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
    const inv = expenses
      .filter((e) => String(e.category || "").toLowerCase() === "inventory")
      .reduce((s, e) => s + Number(e.amount || 0), 0);

    return { total, inv };
  }, [expenses]);

  // --- UI styles ---
  const brand = {
    text: "#0B1220",
    muted: "#5B6475",
    border: "#E6E8EE",
    card: "#FFFFFF",
    cardSoft: "#F7F9FC",
    primary: "#1F6FEB",
    primarySoft: "#E9F2FF",
  };

  const page: React.CSSProperties = {
    padding: 16,
    maxWidth: 980,
    margin: "0 auto",
    color: brand.text,
  };

  const card: React.CSSProperties = {
    border: `1px solid ${brand.border}`,
    borderRadius: 18,
    padding: 16,
    background: brand.card,
    boxShadow: "0 10px 26px rgba(0,0,0,0.06)",
  };

  const input: React.CSSProperties = {
    width: "100%",
    padding: "12px 12px",
    marginTop: 8,
    borderRadius: 12,
    border: `1px solid ${brand.border}`,
    fontSize: 16,
    outline: "none",
    background: "#fff",
  };

  const select: React.CSSProperties = {
    ...input,
    appearance: "auto",
  };

  const btn: React.CSSProperties = {
    padding: "12px 14px",
    borderRadius: 14,
    border: `1px solid ${brand.primary}`,
    background: brand.primary,
    color: "#fff",
    fontWeight: 900,
    fontSize: 15,
    cursor: "pointer",
  };

  const btnGhost: React.CSSProperties = {
    padding: "12px 14px",
    borderRadius: 14,
    border: `1px solid ${brand.border}`,
    background: "#fff",
    color: brand.text,
    fontWeight: 900,
    fontSize: 15,
    cursor: "pointer",
  };

  return (
    <AuthGate>
      <div style={page}>
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
            <h1 style={{ margin: 0, fontSize: 26, lineHeight: 1.15 }}>Expenses</h1>
            <p style={{ margin: "6px 0 0", color: brand.muted }}>
              Track spending and keep profit calculations accurate.
            </p>
          </div>

          <button onClick={loadExpenses} disabled={loading} style={btnGhost}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {/* Summary */}
        <div
          style={{
            ...card,
            background: brand.cardSoft,
            marginBottom: 12,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 12, fontWeight: 900, color: brand.muted }}>Total expenses</div>
            <div style={{ fontSize: 22, fontWeight: 1000, marginTop: 4 }}>
              {summary.total.toFixed(2)}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 900, color: brand.muted }}>
              Inventory purchases
            </div>
            <div style={{ fontSize: 22, fontWeight: 1000, marginTop: 4 }}>
              {summary.inv.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Add expense */}
        <div style={card}>
          <div style={{ display: "grid", gap: 12, maxWidth: 560 }}>
            <label style={{ fontWeight: 900 }}>
              Expense name
              <input
                style={input}
                placeholder="e.g., Diesel, Rent, Packaging"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>

            <label style={{ fontWeight: 900 }}>
              Amount
              <input
                style={input}
                inputMode="decimal"
                placeholder="e.g., 150"
                value={amountStr}
                onChange={(e) => setAmountStr(stripLeadingZeros(e.target.value))}
              />
            </label>

            <label style={{ fontWeight: 900 }}>
              Category
              <select style={select} value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="general">general</option>
                <option value="inventory">inventory</option>
                <option value="rent">rent</option>
                <option value="utilities">utilities</option>
                <option value="transport">transport</option>
                <option value="marketing">marketing</option>
                <option value="salary">salary</option>
              </select>
            </label>

            <button onClick={addExpense} disabled={loading} style={btn}>
              {loading ? "Saving..." : "Add Expense"}
            </button>
          </div>
        </div>

        <hr style={{ margin: "18px 0", borderColor: brand.border }} />

        <h2 style={{ margin: 0, fontSize: 20 }}>Expense History</h2>

        {expenses.length === 0 ? (
          <p style={{ color: brand.muted, marginTop: 10 }}>No expenses yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
            {expenses.map((x) => {
              const isEditing = editId === x.id;

              return (
                <div key={x.id} style={card}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 1000, fontSize: 16 }}>{x.name}</div>
                      <div style={{ marginTop: 6, color: brand.muted, fontSize: 13 }}>
                        Amount: <b>{Number(x.amount || 0).toFixed(2)}</b> • Category:{" "}
                        <b>{x.category ?? "—"}</b>
                        <div style={{ marginTop: 4 }}>
                          <small>{new Date(x.created_at).toLocaleString()}</small>
                        </div>
                      </div>
                    </div>

                    {!isEditing ? (
                      <button style={btnGhost} onClick={() => startEdit(x)}>
                        Edit
                      </button>
                    ) : null}
                  </div>

                  {isEditing ? (
                    <div style={{ display: "grid", gap: 12, marginTop: 12, maxWidth: 560 }}>
                      <label style={{ fontWeight: 900 }}>
                        Expense name
                        <input
                          style={input}
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                        />
                      </label>

                      <label style={{ fontWeight: 900 }}>
                        Amount
                        <input
                          style={input}
                          inputMode="decimal"
                          value={editAmountStr}
                          onChange={(e) => setEditAmountStr(stripLeadingZeros(e.target.value))}
                        />
                      </label>

                      <label style={{ fontWeight: 900 }}>
                        Category
                        <select
                          style={select}
                          value={editCategory}
                          onChange={(e) => setEditCategory(e.target.value)}
                        >
                          <option value="general">general</option>
                          <option value="inventory">inventory</option>
                          <option value="rent">rent</option>
                          <option value="utilities">utilities</option>
                          <option value="transport">transport</option>
                          <option value="marketing">marketing</option>
                          <option value="salary">salary</option>
                        </select>
                      </label>

                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button style={btn} onClick={() => saveEdit(x)} disabled={loading}>
                          {loading ? "Saving..." : "Save"}
                        </button>
                        <button style={btnGhost} onClick={cancelEdit} disabled={loading}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AuthGate>
  );
}
