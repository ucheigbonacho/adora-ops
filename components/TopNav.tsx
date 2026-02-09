"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

export default function TopNav() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
    });
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const links = (
    <>
      <NavLink href="/dashboard" label="Dashboard" />
      <NavLink href="/products" label="Products" />
      <NavLink href="/inventory" label="Inventory" />
      <NavLink href="/sales" label="Sales" />
      <NavLink href="/expenses" label="Expenses" />

      {/* ✅ SINGLE SMART IMPORT */}
      <NavLink href="/import-smart" label="Import" />

      <NavLink href="/pricing" label="Pricing" highlight />
      <NavLink href="/billing" label="Billing" />
    </>
  );

  return (
    <header style={header()}>
      {/* Left: Logo + Name */}
      <Link href="/" style={brand()}>
        <img
          src="/adora-logo.png"
          alt="Adora Logo"
          style={{ height: 34, width: "auto" }}
        />
        <span style={{ fontWeight: 900, fontSize: 18 }}>Adora Ops</span>
      </Link>

      {/* Desktop Nav */}
      <nav style={desktopNav()}>
        {links}
      </nav>

      {/* Right side */}
      <div style={right()}>
        {email && <span style={emailStyle()}>{email}</span>}

        <button onClick={logout} style={logoutBtn()}>
          Logout
        </button>

        {/* Mobile Burger */}
        <button
          onClick={() => setOpen(!open)}
          style={burger()}
          aria-label="Menu"
        >
          ☰
        </button>
      </div>

      {/* Mobile Dropdown */}
      {open && <div style={mobileMenu()}>{links}</div>}
    </header>
  );
}

function NavLink({
  href,
  label,
  highlight,
}: {
  href: string;
  label: string;
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      style={{
        padding: "8px 12px",
        borderRadius: 10,
        fontWeight: 700,
        textDecoration: "none",
        color: highlight ? "#1F6FEB" : "#0B1220",
        background: highlight ? "#E9F2FF" : "transparent",
      }}
    >
      {label}
    </Link>
  );
}

/* ---------------- STYLES ---------------- */

function header(): React.CSSProperties {
  return {
    position: "sticky",
    top: 0,
    zIndex: 1000,
    background: "#fff",
    borderBottom: "1px solid #E6E8EE",
    padding: "10px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
  };
}

function brand(): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    textDecoration: "none",
    color: "#0B1220",
  };
}

function desktopNav(): React.CSSProperties {
  return {
    display: "flex",
    gap: 8,
    alignItems: "center",
  };
}

function right(): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
  };
}

function emailStyle(): React.CSSProperties {
  return {
    fontSize: 12,
    color: "#5B6475",
    display: "none",
  };
}

function logoutBtn(): React.CSSProperties {
  return {
    padding: "6px 10px",
    borderRadius: 10,
    border: "1px solid #E6E8EE",
    background: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  };
}

function burger(): React.CSSProperties {
  return {
    display: "none",
    padding: "6px 10px",
    borderRadius: 10,
    border: "1px solid #E6E8EE",
    background: "#fff",
    fontWeight: 900,
    cursor: "pointer",
    fontSize: 18,
  };
}

function mobileMenu(): React.CSSProperties {
  return {
    width: "100%",
    marginTop: 10,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  };
}

