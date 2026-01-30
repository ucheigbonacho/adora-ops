"use client";

import Link from "next/link";
import AuthGate from "@/components/AuthWorkspaceGate";

export default function ImportHubPage() {
  const cardStyle: React.CSSProperties = {
    border: "1px solid #ddd",
    borderRadius: 12,
    padding: 16,
    background: "white",
  };

  const btnStyle: React.CSSProperties = {
    display: "inline-block",
    marginTop: 10,
    padding: "8px 12px",
    border: "1px solid #111",
    borderRadius: 10,
    textDecoration: "none",
  };

  return (
    <AuthGate>
      <div style={{ padding: 24, maxWidth: 900 }}>
        <h1>Import</h1>
        <p>Upload CSV files to quickly onboard your business data.</p>

        <div style={{ display: "grid", gap: 14 }}>
          <div style={cardStyle}>
            <h2 style={{ margin: 0 }}>Import Products</h2>
            <p style={{ marginTop: 8 }}>
              CSV headers: <b>name</b>, <b>reorder_threshold</b>
            </p>
            <Link href="/import-products" style={btnStyle}>
              Go to Product Import →
            </Link>
          </div>

          <div style={cardStyle}>
            <h2 style={{ margin: 0 }}>Import Inventory</h2>
            <p style={{ marginTop: 8 }}>
              CSV headers: <b>name</b>, <b>quantity_on_hand</b>
            </p>
            <Link href="/import-inventory" style={btnStyle}>
              Go to Inventory Import →
            </Link>
          </div>

          <div style={cardStyle}>
            <h2 style={{ margin: 0 }}>Coming next</h2>
            <ul style={{ marginTop: 8 }}>
              <li>Import Sales</li>
              <li>Import Expenses</li>
              <li>Import Employees / Payroll</li>
            </ul>
          </div>
        </div>
      </div>
    </AuthGate>
  );
}
