"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [loading, setLoading] = useState(false);

  async function submit() {
    const e = email.trim();
    const p = password.trim();

    if (!e) {
      alert("Please enter your email address.");
      return;
    }
    if (!p) {
      alert("Please enter a password.");
      return;
    }
    if (p.length < 6) {
      alert("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({ email: e, password: p });

      if (error) {
        setLoading(false);
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
        setLoading(false);
        alert(error.message);
        return;
      }

      window.location.href = "/setup";
    }

    setLoading(false);
  }

  return (
    <div style={{ padding: 24, maxWidth: 420 }}>
      <h1>{mode === "signup" ? "Create account" : "Log in"}</h1>

      <div style={{ display: "grid", gap: 10 }}>
        <input
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: 10 }}
        />

        <input
          placeholder="Password (min 6 chars)"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ padding: 10 }}
        />

        <button onClick={submit} disabled={loading} style={{ padding: 10 }}>
          {loading ? "Working..." : mode === "signup" ? "Sign up" : "Log in"}
        </button>

        <button
          onClick={() => setMode(mode === "signup" ? "login" : "signup")}
          disabled={loading}
          style={{ padding: 10, background: "transparent", border: "none", color: "blue" }}
        >
          Switch to {mode === "signup" ? "Login" : "Signup"}
        </button>
      </div>
    </div>
  );
}

