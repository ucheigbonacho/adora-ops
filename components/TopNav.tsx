"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type NavItem = { href: string; label: string; highlight?: boolean };

export default function TopNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
    });
  }, []);

  // Close menu on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const links: NavItem[] = useMemo(
    () => [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/products", label: "Products" },
      { href: "/inventory", label: "Inventory" },
      { href: "/sales", label: "Sales" },
      { href: "/expenses", label: "Expenses" },
      { href: "/import-smart", label: "Import" },
      { href: "/pricing", label: "Pricing", highlight: true },
      { href: "/billing", label: "Billing" },
    ],
    []
  );

  return (
    <header className="nav">
      <div className="inner">
        <Link href="/" className="brand" aria-label="Go to homepage">
          <img src="/adora-logo.png" alt="Adora Ops" className="logo" />
          <span className="brandText">Adora Ops</span>
        </Link>

        <nav className="desktopNav" aria-label="Primary">
          {links.map((l) => (
            <NavLink key={l.href} item={l} active={pathname === l.href} />
          ))}
        </nav>

        <div className="right">
          {email ? <span className="email">{email}</span> : null}

          <button className="btn ghost" onClick={logout}>
            Logout
          </button>

          <button
            className="btn burger"
            onClick={() => setOpen((v) => !v)}
            aria-label="Open menu"
            aria-expanded={open}
          >
            <span className="burgerIcon" aria-hidden="true">
              ☰
            </span>
          </button>
        </div>
      </div>

      {open ? (
        <div className="mobilePanel" role="dialog" aria-label="Mobile menu">
          <div className="mobileLinks">
            {links.map((l) => (
              <NavLink key={l.href} item={l} active={pathname === l.href} mobile />
            ))}
          </div>

          <div className="mobileActions">
            <button className="btn full" onClick={logout}>
              Logout
            </button>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .nav {
          position: sticky;
          top: 0;
          z-index: 1000;
          background: rgba(255, 255, 255, 0.9);
          backdrop-filter: blur(10px);
          border-bottom: 1px solid #e6e8ee;
        }
        .inner {
          max-width: 1120px;
          margin: 0 auto;
          padding: 12px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 10px;
          text-decoration: none;
          color: #0b1220;
        }
        .logo {
          width: 34px;
          height: 34px;
          border-radius: 10px;
          object-fit: contain;
        }
        .brandText {
          font-weight: 900;
          font-size: 16px;
          letter-spacing: -0.02em;
        }

        .desktopNav {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px;
          border-radius: 14px;
          border: 1px solid #e6e8ee;
          background: #fff;
          box-shadow: 0 10px 26px rgba(0, 0, 0, 0.06);
        }

        .right {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .email {
          font-size: 12px;
          color: #5b6475;
          max-width: 220px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .btn {
          border: 1px solid #e6e8ee;
          background: #fff;
          padding: 10px 12px;
          border-radius: 12px;
          font-weight: 900;
          cursor: pointer;
          color: #0b1220;
        }
        .btn:hover {
          background: #f7f8fb;
        }
        .btn.ghost {
          display: inline-flex;
        }

        .btn.burger {
          display: none;
          border: 1px solid #e6e8ee;
        }
        .burgerIcon {
          font-size: 18px;
          line-height: 1;
        }

        .mobilePanel {
          max-width: 1120px;
          margin: 0 auto;
          padding: 0 16px 14px;
        }
        .mobileLinks {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 12px;
          border: 1px solid #e6e8ee;
          border-radius: 16px;
          background: #fff;
          box-shadow: 0 10px 26px rgba(0, 0, 0, 0.06);
        }
        .mobileActions {
          margin-top: 10px;
        }
        .btn.full {
          width: 100%;
          padding: 12px 14px;
          border-radius: 14px;
        }

        /* Responsive */
        @media (max-width: 920px) {
          .desktopNav {
            display: none;
          }
          .email {
            display: none;
          }
          .btn.burger {
            display: inline-flex;
            align-items: center;
            justify-content: center;
          }
        }
      `}</style>
    </header>
  );
}

function NavLink({
  item,
  active,
  mobile,
}: {
  item: { href: string; label: string; highlight?: boolean };
  active?: boolean;
  mobile?: boolean;
}) {
  return (
    <>
      <Link
        href={item.href}
        className={[
          "link",
          item.highlight ? "highlight" : "",
          active ? "active" : "",
          mobile ? "mobile" : "",
        ].join(" ")}
      >
        {item.label}
      </Link>

      <style jsx>{`
        .link {
          padding: 9px 12px;
          border-radius: 12px;
          font-weight: 900;
          text-decoration: none;
          color: #0b1220;
          border: 1px solid transparent;
        }
        .link:hover {
          background: #f7f8fb;
        }
        .active {
          border-color: #e6e8ee;
          background: #fff;
        }
        .highlight {
          color: #1f6feb;
          background: #e9f2ff;
          border-color: #d6e8ff;
        }
        .mobile {
          border: 1px solid #e6e8ee;
          background: #fff;
        }
      `}</style>
    </>
  );
}
