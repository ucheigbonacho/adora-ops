"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("signup");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const [loading, setLoading] = useState(false);

  // Prefill email if they chose "remember me" earlier
  useEffect(() => {
    try {
      const saved = localStorage.getItem("adora_login_email");
      if (saved) setEmail(saved);
      const remember = localStorage.getItem("adora_remember_me");
      if (remember === "false") setRememberMe(false);
    } catch {}
  }, []);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "14px 14px",
    marginTop: 8,
    borderRadius: 14,
    border: "1px solid #E6E8EE",
    fontSize: 16,
    outline: "none",
    background: "#fff",
  };

  const buttonStyle: React.CSSProperties = {
    padding: "14px 16px",
    borderRadius: 16,
    border: "1px solid #0B1220",
    background: "#0B1220",
    color: "#fff",
    fontWeight: 900,
    fontSize: 16,
    cursor: "pointer",
    width: "100%",
  };

  const secondaryBtnStyle: React.CSSProperties = {
    ...buttonStyle,
    background: "#fff",
    color: "#0B1220",
    border: "1px solid #E6E8EE",
  };

  const linkStyle: React.CSSProperties = {
    color: "#1F6FEB",
    fontWeight: 900,
    textDecoration: "none",
  };

  async function submit() {
    setLoading(true);

    const e = email.trim();
    const p = password;

    if (!e || !p) {
      setLoading(false);
      alert("Please enter email and password.");
      return;
    }

    // Remember-me behavior (store email only)
    try {
      localStorage.setItem("adora_remember_me", String(rememberMe));
      if (rememberMe) localStorage.setItem("adora_login_email", e);
      else localStorage.removeItem("adora_login_email");
    } catch {}

    try {
      if (mode === "signup") {
        const name = fullName.trim();
        if (!name) {
          alert("Please enter your full name.");
          return;
        }

        const { error } = await supabase.auth.signUp({
          email: e,
          password: p,
          options: {
            data: { name },
          },
        });

        if (error) {
          alert(error.message);
          return;
        }

        alert("Signup successful ✅ Now switch to Login and sign in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: e,
          password: p,
        });

        if (error) {
          alert(error.message);
          return;
        }

        window.location.href = "/setup";
      }
    } catch (err: any) {
      alert(err?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 16,
        background:
          "radial-gradient(1200px 600px at 10% 0%, #E9F2FF 0%, rgba(233,242,255,0) 55%), radial-gradient(900px 500px at 90% 10%, #F3F4F6 0%, rgba(243,244,246,0) 55%), #fff",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          borderRadius: 22,
          border: "1px solid #E6E8EE",
          background: "#fff",
          boxShadow: "0 16px 48px rgba(0,0,0,0.10)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ padding: 18, borderBottom: "1px solid #E6E8EE" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 12,
                background: "#0B1220",
                display: "grid",
                placeItems: "center",
                color: "#fff",
                fontWeight: 900,
              }}
            >
              A
            </div>
            <div>
              <div style={{ fontWeight: 900, fontSize: 18, lineHeight: 1.1 }}>Adora Ops</div>
              <div style={{ color: "#5B6475", fontSize: 13 }}>
                {mode === "signup" ? "Create your account" : "Welcome back"}
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: 18 }}>
          <h1 style={{ margin: 0, fontSize: 26 }}>
            {mode === "signup" ? "Sign up" : "Log in"}
          </h1>
          <p style={{ marginTop: 8, color: "#5B6475" }}>
            {mode === "signup"
              ? "Start tracking products, inventory, sales, and profit."
              : "Log in to your workspace."}
          </p>

          <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
            {mode === "signup" && (
              <label style={{ fontWeight: 900 }}>
                Full name
                <input
                  style={inputStyle}
                  placeholder="e.g. Uche Igbonacho"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                />
              </label>
            )}

            <label style={{ fontWeight: 900 }}>
              Email
              <input
                style={inputStyle}
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="email"
              />
            </label>

            <label style={{ fontWeight: 900 }}>
              Password
              <input
                style={inputStyle}
                placeholder="Minimum 6 characters"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
              />
            </label>

            {/* Toggles row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                justifyContent: "space-between",
                flexWrap: "wrap",
              }}
            >
              <label style={{ display: "flex", alignItems: "center", gap: 10, color: "#5B6475" }}>
                <input
                  type="checkbox"
                  checked={showPassword}
                  onChange={(e) => setShowPassword(e.target.checked)}
                  style={{ width: 18, height: 18 }}
                />
                Show password
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 10, color: "#5B6475" }}>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  style={{ width: 18, height: 18 }}
                />
                Remember me
              </label>

              <div style={{ marginLeft: "auto" }}>
                {mode === "login" ? (
                  <a href="/forgot-password" style={linkStyle}>
                    Forgot password?
                  </a>
                ) : null}
              </div>
            </div>

            <button onClick={submit} disabled={loading} style={buttonStyle}>
              {loading ? "Working..." : mode === "signup" ? "Create account" : "Log in"}
            </button>

            <button
              onClick={() => setMode(mode === "signup" ? "login" : "signup")}
              disabled={loading}
              style={secondaryBtnStyle}
            >
              Switch to {mode === "signup" ? "Login" : "Signup"}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: 14,
            borderTop: "1px solid #E6E8EE",
            color: "#5B6475",
            fontSize: 12,
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span>Secure login via Supabase</span>
          <span>© {new Date().getFullYear()} Adora Ops</span>
        </div>
      </div>
    </div>
  );
}
