"use client";

import Link from "next/link";

export default function HomeLanding() {
  return (
    <main className="page">
      {/* HERO */}
      <section className="hero">
        <div className="heroInner">
          <div className="heroLeft">
            <div className="pill">Inventory • Sales • Expenses • Smart Import</div>
            <h1>
              Run your store like a pro — <span>without spreadsheets</span>
            </h1>
            <p>
              Adora Ops helps small businesses track stock, record sales, manage expenses, and see profit
              — fast. Built for busy store owners.
            </p>

            <div className="ctaRow">
              <Link className="btn primary" href="/login">
                Get started
              </Link>
              <Link className="btn secondary" href="/pricing">
                View pricing
              </Link>
            </div>

            <div className="trust">
              <div className="trustItem">
                <b>1 minute</b>
                <span>to set up</span>
              </div>
              <div className="trustItem">
                <b>Smart Import</b>
                <span>CSV & messy files</span>
              </div>
              <div className="trustItem">
                <b>Mobile-ready</b>
                <span>works on any device</span>
              </div>
            </div>
          </div>

          <div className="heroRight">
            <div className="mockCard">
              <div className="mockTop">
                <div className="dot" />
                <div className="dot" />
                <div className="dot" />
                <div className="mockTitle">Adora Ops Dashboard</div>
              </div>

              <div className="mockGrid">
                <div className="stat">
                  <div className="label">Revenue (Today)</div>
                  <div className="value">$1,240</div>
                  <div className="sub">Paid + Unpaid</div>
                </div>
                <div className="stat">
                  <div className="label">Profit (Today)</div>
                  <div className="value">$410</div>
                  <div className="sub">After COGS</div>
                </div>
                <div className="stat">
                  <div className="label">Low Stock</div>
                  <div className="value">3 items</div>
                  <div className="sub">Reorder now</div>
                </div>
                <div className="stat">
                  <div className="label">Top Product</div>
                  <div className="value">Indomie</div>
                  <div className="sub">Highest sales</div>
                </div>
              </div>

              <div className="mockTable">
                <div className="row head">
                  <span>Product</span>
                  <span>On hand</span>
                  <span>Status</span>
                </div>
                <div className="row">
                  <span>Indomie</span>
                  <span>12</span>
                  <span className="tag warn">Low</span>
                </div>
                <div className="row">
                  <span>Peak Milk</span>
                  <span>48</span>
                  <span className="tag ok">OK</span>
                </div>
                <div className="row">
                  <span>Rice (5kg)</span>
                  <span>7</span>
                  <span className="tag warn">Low</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="section">
        <div className="inner">
          <h2>Everything you need to track cash, stock, and profit</h2>
          <p className="muted">Simple flows. Clear numbers. No accounting knowledge required.</p>

          <div className="grid">
            <Feature title="Fast sales entry" desc="Record sales in seconds and automatically reduce stock." />
            <Feature title="Inventory that makes sense" desc="Track stock in selling units. Get low-stock alerts." />
            <Feature title="Expenses + profit" desc="See revenue, expenses, and profit — including COGS." />
            <Feature title="Smart Import" desc="Import products and inventory even when the file is messy." />
            <Feature title="Works on mobile" desc="Responsive UI designed for store owners on the move." />
            <Feature title="Built to scale later" desc="Barcode scanning and POS integrations can come next." />
          </div>

          <div className="ctaBar">
            <div>
              <div className="ctaTitle">Start free and get setup fast</div>
              <div className="muted">Create your workspace and import products in minutes.</div>
            </div>
            <Link className="btn primary" href="/login">
              Create account
            </Link>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="inner footerInner">
          <div className="brandMini">
            <img src="/adora-logo.png" alt="Adora Ops" className="logoMini" />
            <div>
              <div className="brandName">Adora Ops</div>
              <div className="muted">Simple operations for small businesses.</div>
            </div>
          </div>

          <div className="footerLinks">
            <Link href="/pricing">Pricing</Link>
            <Link href="/login">Login</Link>
            <Link href="/dashboard">Dashboard</Link>
          </div>
        </div>
      </footer>

      <style jsx>{`
        .page {
          color: #0b1220;
          background:
            radial-gradient(900px 450px at 20% 0%, rgba(31, 111, 235, 0.12), transparent 60%),
            radial-gradient(900px 450px at 80% 10%, rgba(11, 18, 32, 0.08), transparent 60%),
            #ffffff;
        }
        .hero {
          padding: 64px 16px 24px;
        }
        .heroInner {
          max-width: 1120px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 1.1fr 0.9fr;
          gap: 24px;
          align-items: center;
        }
        .pill {
          display: inline-flex;
          padding: 8px 12px;
          border-radius: 999px;
          border: 1px solid #e6e8ee;
          background: rgba(255, 255, 255, 0.8);
          font-weight: 900;
          font-size: 12px;
          color: #1f6feb;
        }
        h1 {
          margin: 14px 0 8px;
          font-size: 48px;
          line-height: 1.05;
          letter-spacing: -0.03em;
        }
        h1 span {
          color: #1f6feb;
        }
        p {
          margin: 0;
          color: #5b6475;
          font-size: 16px;
          line-height: 1.6;
          max-width: 56ch;
        }
        .ctaRow {
          display: flex;
          gap: 10px;
          margin-top: 18px;
          flex-wrap: wrap;
        }
        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 12px 14px;
          border-radius: 14px;
          font-weight: 1000;
          text-decoration: none;
          border: 1px solid #e6e8ee;
          background: #fff;
          color: #0b1220;
          box-shadow: 0 10px 26px rgba(0, 0, 0, 0.06);
        }
        .btn.primary {
          border-color: #0b1220;
          background: #0b1220;
          color: #fff;
        }
        .trust {
          display: flex;
          gap: 16px;
          margin-top: 18px;
          flex-wrap: wrap;
        }
        .trustItem {
          display: grid;
          gap: 2px;
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid #e6e8ee;
          background: rgba(255, 255, 255, 0.75);
        }

        .mockCard {
          border: 1px solid #e6e8ee;
          border-radius: 20px;
          background: #fff;
          box-shadow: 0 18px 40px rgba(0, 0, 0, 0.1);
          overflow: hidden;
        }
        .mockTop {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 14px;
          border-bottom: 1px solid #e6e8ee;
          background: #f7f8fb;
        }
        .dot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          border: 1px solid #e6e8ee;
          background: #fff;
        }
        .mockTitle {
          margin-left: 8px;
          font-weight: 1000;
          font-size: 12px;
          color: #5b6475;
        }
        .mockGrid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          padding: 14px;
        }
        .stat {
          border: 1px solid #e6e8ee;
          border-radius: 16px;
          padding: 12px;
        }
        .label {
          font-size: 12px;
          color: #5b6475;
          font-weight: 900;
        }
        .value {
          font-size: 20px;
          font-weight: 1000;
          margin-top: 6px;
        }
        .sub {
          font-size: 12px;
          color: #5b6475;
          margin-top: 2px;
        }
        .mockTable {
          padding: 0 14px 14px;
        }
        .row {
          display: grid;
          grid-template-columns: 1.2fr 0.6fr 0.6fr;
          gap: 10px;
          padding: 10px 12px;
          border: 1px solid #e6e8ee;
          border-radius: 14px;
          margin-top: 10px;
          align-items: center;
        }
        .row.head {
          background: #f7f8fb;
          font-weight: 1000;
          color: #5b6475;
          margin-top: 0;
        }
        .tag {
          justify-self: start;
          padding: 6px 10px;
          border-radius: 999px;
          font-weight: 1000;
          font-size: 12px;
          border: 1px solid #e6e8ee;
          background: #fff;
        }
        .tag.ok {
          color: #0b8a5a;
          background: rgba(11, 138, 90, 0.08);
          border-color: rgba(11, 138, 90, 0.25);
        }
        .tag.warn {
          color: #b45309;
          background: rgba(245, 158, 11, 0.12);
          border-color: rgba(245, 158, 11, 0.35);
        }

        .section {
          padding: 52px 16px;
        }
        .inner {
          max-width: 1120px;
          margin: 0 auto;
        }
        h2 {
          margin: 0;
          font-size: 28px;
          letter-spacing: -0.02em;
        }
        .muted {
          color: #5b6475;
          margin-top: 10px;
        }
        .grid {
          margin-top: 18px;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }
        .ctaBar {
          margin-top: 18px;
          display: flex;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          padding: 16px;
          border-radius: 18px;
          border: 1px solid #e6e8ee;
          background: #fff;
          box-shadow: 0 10px 26px rgba(0, 0, 0, 0.06);
        }
        .ctaTitle {
          font-weight: 1000;
          font-size: 16px;
        }

        .footer {
          padding: 26px 16px;
          border-top: 1px solid #e6e8ee;
          background: #fff;
        }
        .footerInner {
          display: flex;
          justify-content: space-between;
          gap: 18px;
          flex-wrap: wrap;
          align-items: center;
        }
        .brandMini {
          display: flex;
          gap: 10px;
          align-items: center;
        }
        .logoMini {
          width: 34px;
          height: 34px;
          border-radius: 10px;
          border: 1px solid #e6e8ee;
          background: #fff;
          object-fit: contain;
        }
        .brandName {
          font-weight: 1000;
        }
        .footerLinks {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }
        .footerLinks a {
          color: #0b1220;
          text-decoration: none;
          font-weight: 900;
        }

        @media (max-width: 980px) {
          .heroInner {
            grid-template-columns: 1fr;
          }
          h1 {
            font-size: 40px;
          }
          .grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}

function Feature({ title, desc }: { title: string; desc: string }) {
  return (
    <>
      <div className="card">
        <div className="title">{title}</div>
        <div className="desc">{desc}</div>
      </div>

      <style jsx>{`
        .card {
          border: 1px solid #e6e8ee;
          border-radius: 18px;
          padding: 16px;
          background: #fff;
          box-shadow: 0 10px 26px rgba(0, 0, 0, 0.06);
        }
        .title {
          font-weight: 1000;
          font-size: 16px;
        }
        .desc {
          margin-top: 6px;
          color: #5b6475;
          line-height: 1.6;
        }
      `}</style>
    </>
  );
}
