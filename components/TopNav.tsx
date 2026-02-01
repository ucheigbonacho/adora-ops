"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function TopNav() {
  const pathname = usePathname();

  // Hide nav on auth/setup pages
  if (pathname === "/login" || pathname === "/setup") return null;

  async function logout() {
    await supabase.auth.signOut();
    localStorage.removeItem("workspace_id");
    window.location.href = "/login";
  }

  const links = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/import", label: "Import" },
    { href: "/products", label: "Products" },
    { href: "/inventory", label: "Inventory" },
    { href: "/sales", label: "Sales" },
    { href: "/expenses", label: "Expenses" },
    { href: "/assistant", label: "Assistant" }, 
    { href: "/import-inventory", label: "Import Inventory" },

  ];

  return (
    <div
      style={{
        borderBottom: "1px solid #eee",
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div style={{ fontWeight: 800 }}>Adora Ops</div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {links.map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              style={{
                textDecoration: "none",
                padding: "6px 10px",
                borderRadius: 8,
                border: active ? "1px solid #111" : "1px solid transparent",
              }}
            >
              {l.label}
            </Link>
          );
        })}
      </div>

      <button onClick={logout} style={{ padding: "6px 10px" }}>
        Logout
      </button>
    </div>
  );
}
