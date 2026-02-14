"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type NavItem = { label: string; href: string };

export default function TopNav() {
  const [open, setOpen] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);

  // Close menu when resizing to desktop
  useEffect(() => {
    function onResize() {
      if (window.innerWidth >= 920) setOpen(false);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ✅ Detect auth state (client)
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        setIsAuthed(!!data?.session);
      } finally {
        if (mounted) setLoadingAuth(false);
      }
    }

    init();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthed(!!session);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  const nav: NavItem[] = useMemo(
    () => [
      { label: "Dashboard", href: "/dashboard" },
      { label: "Products", href: "/products" },
      { label: "Inventory", href: "/inventory" },
      { label: "Sales", href: "/sales" },
      { label: "Expenses", href: "/expenses" },
      // ✅ show "Import" but route to smart import
      { label: "Import", href: "/import-smart" },
      { label: "Assistant", href: "/assistant" },
      { label: "Pricing", href: "/pricing" },
      { label: "Billing", href: "/billing" },
    ],
    []
  );

  async function logout() {
    try {
      await supabase.auth.signOut();
      localStorage.removeItem("workspace_id"); // optional (keeps UI clean)
      window.location.href = "/login";
    } catch {
      // ignore
    }
  }

  const showAuthButtons = !loadingAuth; // avoid flicker

  return (
    <>
      <header className="topnav">
        <div className="inner">
          {/* Brand */}
          <Link className="brand" href="/" onClick={() => setOpen(false)}>
            <span className="logoWrap" aria-hidden="true">
              <img src="/adora-logo.png" alt="" className="logo" />
            </span>
            <span className="brandText">AdoraOps</span>
          </Link>

          {/* Desktop nav */}
          <nav className="navDesktop" aria-label="Primary">
            {nav.map((item) => (
              <Link key={item.href} className="navLink" href={item.href}>
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Right actions (desktop) */}
          <div className="actionsDesktop">
            {showAuthButtons ? (
              isAuthed ? (
                <>
                  <Link className="btnGhost" href="/dashboard">
                    Dashboard
                  </Link>
                  <button className="btnPrimary" onClick={logout} type="button">
                    Log out <span className="arrow">›</span>
                  </button>
                </>
              ) : (
                <>
                  <Link className="btnGhost" href="/login">
                    Log In
                  </Link>
                  <Link className="btnPrimary" href="/login">
                    Get Started <span className="arrow">›</span>
                  </Link>
                </>
              )
            ) : (
              <>
                <div className="btnGhost" aria-hidden="true" style={{ opacity: 0.6 }}>
                  …
                </div>
              </>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            className="hamburger"
            aria-label="Open menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            type="button"
          >
            <span className={`bar ${open ? "x1" : ""}`} />
            <span className={`bar ${open ? "x2" : ""}`} />
            <span className={`bar ${open ? "x3" : ""}`} />
          </button>
        </div>

        {/* Mobile menu panel */}
        {open ? (
          <div className="mobilePanel" role="dialog" aria-label="Menu">
            <div className="mobileLinks">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  className="mobileLink"
                  href={item.href}
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
            </div>

            <div className="mobileActions">
              {showAuthButtons ? (
                isAuthed ? (
                  <>
                    <Link className="btnGhost mobileBtn" href="/dashboard" onClick={() => setOpen(false)}>
                      Dashboard
                    </Link>
                    <button className="btnPrimary mobileBtn" onClick={logout} type="button">
                      Log out <span className="arrow">›</span>
                    </button>
                  </>
                ) : (
                  <>
                    <Link className="btnGhost mobileBtn" href="/login" onClick={() => setOpen(false)}>
                      Log In
                    </Link>
                    <Link className="btnPrimary mobileBtn" href="/login" onClick={() => setOpen(false)}>
                      Get Started <span className="arrow">›</span>
                    </Link>
                  </>
                )
              ) : null}
            </div>
          </div>
        ) : null}
      </header>

      <style jsx>{`
        .topnav {
          position: sticky;
          top: 0;
          z-index: 50;
          background: rgba(248, 246, 241, 0.86);
          backdrop-filter: blur(10px);
          border-bottom: 1px solid rgba(230, 232, 238, 0.9);
        }

        .inner {
          max-width: 1120px;
          margin: 0 auto;
          padding: 14px 16px;
          display: flex;
          align-items: center;
          gap: 14px;
        }

        /* ✅ stop purple/underline defaults no matter what globals say */
        .topnav :global(a),
        .topnav :global(a:visited),
        .topnav :global(a:hover),
        .topnav :global(a:active) {
          color: #0b1220;
          text-decoration: none;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 180px;
        }

        .logoWrap {
          width: 44px;
          height: 44px;
          border-radius: 14px;
          border: 1px solid #e6e8ee;
          background: #fff;
          display: grid;
          place-items: center;
          box-shadow: 0 10px 26px rgba(0, 0, 0, 0.06);
          overflow: hidden;
        }

        .logo {
          width: 28px;
          height: 28px;
          object-fit: contain;
        }

        .brandText {
          font-weight: 1000;
          font-size: 18px;
          letter-spacing: -0.02em;
        }

        .navDesktop {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
          justify-content: center;
        }

        .navLink {
          padding: 10px 12px;
          border-radius: 12px;
          font-weight: 900;
          font-size: 14px;
          border: 1px solid transparent;
          transition: background 120ms ease, border-color 120ms ease, transform 120ms ease;
        }
        .navLink:hover {
          background: rgba(31, 111, 235, 0.08);
          border-color: rgba(31, 111, 235, 0.25);
          transform: translateY(-1px);
        }

        .actionsDesktop {
          display: flex;
          gap: 10px;
          align-items: center;
          justify-content: flex-end;
          min-width: 240px;
        }

        .btnGhost,
        .btnPrimary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 12px 14px;
          border-radius: 14px;
          font-weight: 1000;
          font-size: 14px;
          border: 1px solid #e6e8ee;
          background: #fff;
          box-shadow: 0 10px 26px rgba(0, 0, 0, 0.06);
          cursor: pointer;
        }

        .btnGhost:hover {
          background: rgba(255, 255, 255, 0.85);
          border-color: rgba(11, 18, 32, 0.18);
        }

        .btnPrimary {
          border-color: #1f6feb;
          background: #1f6feb;
          color: #fff !important;
          box-shadow: 0 14px 30px rgba(31, 111, 235, 0.25);
        }
        .btnPrimary:hover {
          filter: brightness(0.98);
          transform: translateY(-1px);
        }

        .arrow {
          margin-left: 8px;
          font-size: 18px;
          line-height: 1;
        }

        /* Mobile hamburger hidden on desktop */
        .hamburger {
          display: none;
          margin-left: auto;
          width: 46px;
          height: 46px;
          border-radius: 14px;
          border: 1px solid #e6e8ee;
          background: #fff;
          box-shadow: 0 10px 26px rgba(0, 0, 0, 0.06);
          cursor: pointer;
          position: relative;
        }

        .bar {
          position: absolute;
          left: 12px;
          right: 12px;
          height: 2px;
          background: #0b1220;
          border-radius: 2px;
          transition: transform 140ms ease, opacity 140ms ease, top 140ms ease;
        }
        .bar:nth-child(1) {
          top: 16px;
        }
        .bar:nth-child(2) {
          top: 22px;
        }
        .bar:nth-child(3) {
          top: 28px;
        }

        .x1 {
          top: 22px !important;
          transform: rotate(45deg);
        }
        .x2 {
          opacity: 0;
        }
        .x3 {
          top: 22px !important;
          transform: rotate(-45deg);
        }

        .mobilePanel {
          display: none;
        }

        /* ✅ ONLY change nav on mobile */
        @media (max-width: 919px) {
          .navDesktop,
          .actionsDesktop {
            display: none;
          }

          .hamburger {
            display: inline-block;
          }

          .mobilePanel {
            display: block;
            border-top: 1px solid rgba(230, 232, 238, 0.9);
            background: rgba(248, 246, 241, 0.96);
            backdrop-filter: blur(10px);
          }

          .mobileLinks {
            display: grid;
            gap: 10px;
            padding: 14px 16px 10px;
          }

          .mobileLink {
            padding: 14px 14px;
            border-radius: 14px;
            border: 1px solid #e6e8ee;
            background: #fff;
            font-weight: 1000;
            box-shadow: 0 10px 26px rgba(0, 0, 0, 0.06);
          }

          .mobileActions {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            padding: 0 16px 16px;
          }

          .mobileBtn {
            width: 100%;
          }
        }
      `}</style>
    </>
  );
}
