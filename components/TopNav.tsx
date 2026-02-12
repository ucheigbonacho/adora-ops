"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function TopNav() {
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const isAuthed = !!email;

  useEffect(() => {
    let alive = true;

    // initial user
    supabase.auth.getUser().then(({ data }) => {
      if (!alive) return;
      setEmail(data.user?.email ?? null);
    });

    // react to login/logout
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });

    return () => {
      alive = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  // close mobile dropdown on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  // ✅ Keep your current app links (same as you posted)
  const appLinks = useMemo(
    () => (
      <>
        <NavLink href="/dashboard" label="Dashboard" active={pathname === "/dashboard"} />
        <NavLink href="/products" label="Products" active={pathname === "/products"} />
        <NavLink href="/inventory" label="Inventory" active={pathname === "/inventory"} />
        <NavLink href="/sales" label="Sales" active={pathname === "/sales"} />
        <NavLink href="/expenses" label="Expenses" active={pathname === "/expenses"} />
        <NavLink href="/import-smart" label="Import" />


        {/* Pricing as a button-style link */}
        <NavButton href="/pricing" label="Pricing" active={pathname === "/pricing"} />

        <NavLink href="/billing" label="Billing" active={pathname === "/billing"} />
      </>
    ),
    [pathname]
  );

  return (
    <header style={header()}>
      <div style={inner()}>
        {/* Brand */}
        <Link href="/" style={brand()}>
          <img
            src="/adora-logo.png"
            alt="Adora Ops"
            style={{
              height: 42,
              width: 42,
              borderRadius: 12,
              objectFit: "contain",
              background: "white",
              border: "1px solid rgba(49,66,87,0.12)",
              padding: 6,
            }}
          />
          <span style={{ fontWeight: 950, fontSize: 20, letterSpacing: "-0.02em" }}>
            AdoraOps
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav style={desktopNav()}>{appLinks}</nav>

        {/* Right side */}
        <div style={right()}>
          {/* Only show email+logout when logged in */}
          {isAuthed ? (
            <>
              <span style={emailStyle()} title={email ?? ""}>
                {email}
              </span>
              <button onClick={logout} style={ghostBtn()}>
                Logout
              </button>
            </>
          ) : (
            <>
              <Link href="/login" style={ghostLink()}>
                Log In
              </Link>
              <Link href="/login" style={primaryBtn()}>
                Get Started <span style={{ fontSize: 18, marginLeft: 6 }}>›</span>
              </Link>
            </>
          )}

          {/* Mobile burger */}
          <button
            onClick={() => setOpen(!open)}
            style={burger()}
            aria-label="Menu"
            title="Menu"
          >
            ☰
          </button>
        </div>
      </div>

      {/* Mobile Dropdown */}
      {open ? <div style={mobileMenu()}>{appLinks}{mobileAuthRow(isAuthed, email, logout)}</div> : null}
    </header>
  );
}

/* ---------------- Components ---------------- */

function NavLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      style={{
        padding: "10px 12px",
        borderRadius: 14,
        fontWeight: 800,
        textDecoration: "none",
        color: "#314257",
        background: active ? "rgba(49,66,87,0.10)" : "transparent",
        border: active ? "1px solid rgba(49,66,87,0.12)" : "1px solid transparent",
        transition: "transform 120ms ease, background 120ms ease",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as any).style.background = "rgba(49,66,87,0.08)";
        (e.currentTarget as any).style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as any).style.background = active
          ? "rgba(49,66,87,0.10)"
          : "transparent";
        (e.currentTarget as any).style.transform = "translateY(0px)";
      }}
    >
      {label}
    </Link>
  );
}

function NavButton({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      style={{
        padding: "10px 14px",
        borderRadius: 14,
        fontWeight: 950,
        textDecoration: "none",
        color: "#fff",
        background: active ? "#1A5FE0" : "#1F6FEB",
        border: "1px solid rgba(31,111,235,0.35)",
        boxShadow: "0 10px 22px rgba(31,111,235,0.22)",
        transition: "transform 120ms ease, filter 120ms ease",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as any).style.transform = "translateY(-1px)";
        (e.currentTarget as any).style.filter = "brightness(1.03)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as any).style.transform = "translateY(0px)";
        (e.currentTarget as any).style.filter = "none";
      }}
    >
      {label}
    </Link>
  );
}

function mobileAuthRow(
  isAuthed: boolean,
  email: string | null,
  logout: () => Promise<void>
) {
  return (
    <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
      {isAuthed ? (
        <>
          <div style={{ fontSize: 12, color: "#4b5b70", fontWeight: 700 }}>
            Signed in as <b>{email}</b>
          </div>
          <button onClick={logout} style={ghostBtn(true)}>
            Logout
          </button>
        </>
      ) : (
        <>
          <Link href="/login" style={ghostLink(true)}>
            Log In
          </Link>
          <Link href="/login" style={primaryBtn(true)}>
            Get Started <span style={{ fontSize: 18, marginLeft: 6 }}>›</span>
          </Link>
        </>
      )}
    </div>
  );
}

/* ---------------- Styles ---------------- */

function header(): React.CSSProperties {
  return {
    position: "sticky",
    top: 0,
    zIndex: 1000,
    background: "rgba(242, 240, 234, 0.88)", // matches your screenshot vibe
    backdropFilter: "blur(10px)",
    borderBottom: "1px solid rgba(49,66,87,0.12)",
  };
}

function inner(): React.CSSProperties {
  return {
    maxWidth: 1200,
    margin: "0 auto",
    padding: "14px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  };
}

function brand(): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    textDecoration: "none",
    color: "#314257",
  };
}

function desktopNav(): React.CSSProperties {
  return {
    display: "flex",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap",
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
    maxWidth: 220,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: 12,
    color: "#4b5b70",
    fontWeight: 700,
    padding: "8px 10px",
    borderRadius: 12,
    background: "rgba(255,255,255,0.6)",
    border: "1px solid rgba(49,66,87,0.12)",
  };
}

function ghostBtn(fullWidth = false): React.CSSProperties {
  return {
    width: fullWidth ? "100%" : undefined,
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(49,66,87,0.18)",
    background: "rgba(255,255,255,0.6)",
    color: "#314257",
    fontWeight: 900,
    cursor: "pointer",
  };
}

function ghostLink(fullWidth = false): React.CSSProperties {
  return {
    width: fullWidth ? "100%" : undefined,
    display: "inline-flex",
    justifyContent: "center",
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(49,66,87,0.18)",
    background: "rgba(255,255,255,0.6)",
    color: "#314257",
    fontWeight: 900,
    textDecoration: "none",
  };
}

function primaryBtn(fullWidth = false): React.CSSProperties {
  return {
    width: fullWidth ? "100%" : undefined,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "10px 14px",
    borderRadius: 14,
    border: "1px solid rgba(31,111,235,0.35)",
    background: "#1F6FEB",
    color: "#fff",
    fontWeight: 950,
    textDecoration: "none",
    boxShadow: "0 10px 22px rgba(31,111,235,0.22)",
    whiteSpace: "nowrap",
  };
}

function burger(): React.CSSProperties {
  return {
    display: "none",
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(49,66,87,0.18)",
    background: "rgba(255,255,255,0.6)",
    fontWeight: 950,
    cursor: "pointer",
    fontSize: 18,
  };
}

function mobileMenu(): React.CSSProperties {
  return {
    maxWidth: 1200,
    margin: "0 auto",
    padding: "0 16px 14px",
    display: "none",
    flexDirection: "column",
    gap: 8,
  };
}

/* ✅ Responsive rules without styled-jsx (safe in client component anyway) */
if (typeof window !== "undefined") {
  const injectOnce = () => {
    if (document.getElementById("adora-topnav-css")) return;
    const style = document.createElement("style");
    style.id = "adora-topnav-css";
    style.innerHTML = `
      @media (max-width: 860px){
        nav[data-adora-desktop="1"]{ display:none !important; }
        button[data-adora-burger="1"]{ display:inline-flex !important; }
        div[data-adora-mobile="1"]{ display:flex !important; }
      }
    `;
    document.head.appendChild(style);
  };
  injectOnce();
}
