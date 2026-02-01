"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import AuthGate from "@/components/AuthWorkspaceGate";

type Expense = {
  id: string;
  category: string;
  description: string;
  amount: number;
  expense_date: string;
};

export default function ExpensesPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState<number>(0);
  const [expenseDate, setExpenseDate] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setWorkspaceId(localStorage.getItem("workspace_id"));
  }, []);

  async function loadExpenses() {
    if (!workspaceId) return;

    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("expense_date", { ascending: false });

    if (error) {
      alert("Failed to load expenses: " + error.message);
      return;
    }

    setExpenses((data as Expense[]) || []);
  }
// 🔄 AUTO REFRESH WHEN ASSISTANT UPDATES DATA
useEffect(() => {
  const onRefresh = () => loadExpenses();
  window.addEventListener("adora:refresh", onRefresh);
  return () => window.removeEventListener("adora:refresh", onRefresh);
}, [workspaceId]);

  async function addExpense() {
    if (!workspaceId) return;
    if (!category || !amount || !expenseDate) {
      alert("Fill required fields.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.from("expenses").insert([
      {
        workspace_id: workspaceId,
        category,
        description,
        amount,
        expense_date: expenseDate,
      },
    ]);

    if (error) {
      setLoading(false);
      alert("Failed to add expense: " + error.message);
      return;
    }

    setCategory("");
    setDescription("");
    setAmount(0);
    setExpenseDate("");
    await loadExpenses();
    setLoading(false);
  }

  useEffect(() => {
    if (workspaceId) loadExpenses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  return (
    <AuthGate>
      <div style={{ padding: 24, maxWidth: 700 }}>
        <h1>Expenses</h1>

        <div style={{ display: "grid", gap: 10 }}>
          <input
            placeholder="Category (e.g. Rent, Ads, Fuel)"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
          <input
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <input
            type="number"
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
          <input
            type="date"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
          />
          <button onClick={addExpense} disabled={loading}>
            {loading ? "Saving..." : "Add Expense"}
          </button>
        </div>

        <hr style={{ margin: "20px 0" }} />

        <h2>Expense History</h2>
        {expenses.map((e) => (
          <div key={e.id} style={{ marginBottom: 10 }}>
            <b>{e.category}</b> – ${Number(e.amount).toFixed(2)} <br />
            {e.description} <br />
            <small>{e.expense_date}</small>
          </div>
        ))}
      </div>
    </AuthGate>
  );
}

