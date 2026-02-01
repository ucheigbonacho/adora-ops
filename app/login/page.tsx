"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // ✅ added
  const [fullName, setFullName] = useState("");

  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);

    const e = email.trim();
    const p = password;

    if (!e || !p) {
      setLoading(false);
      alert("Please enter email and password.");
      return;
    }

    try {
      if (mode === "signup") {
        const name = fullName.trim();
        if (!name) {
          setLoading(false);
          alert("Please enter your full name.");
          return;
        }

        const { error } = await supabase.auth.signUp({
          email: e,
          password: p,
          options: {
            data: {
              name, // ✅ stored in user_metadata
            },
          },
        });

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

        alert("Logged in ✅");
        window.location.href = "/setup";
      }
    } catch (err: any) {
      alert(err?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 420 }}>
      <h1>{mode === "signup" ? "Create account" : "Log in"}</h1>

      <div style={{ display: "grid", gap: 10 }}>
        {/* ✅ Full name only on signup */}
        {mode === "signup" && (
          <input
            placeholder="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        )}

        <input
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          placeholder="Password (min 6 chars)"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button onClick={submit} disabled={loading}>
          {loading ? "Working..." : mode === "signup" ? "Sign up" : "Log in"}
        </button>

        <button
          onClick={() => setMode(mode === "signup" ? "login" : "signup")}
          disabled={loading}
        >
          Switch to {mode === "signup" ? "Login" : "Signup"}
        </button>
      </div>
    </div>
  );
}


