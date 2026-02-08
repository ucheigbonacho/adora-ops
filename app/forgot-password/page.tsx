"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendReset() {
    if (!email) return alert("Enter your email");

    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "https://adoraops.com/reset-password",
    });

    setLoading(false);

    if (error) return alert(error.message);

    alert("Password reset link sent to your email 📩");
  }

  return (
    <div style={{ padding: 24, maxWidth: 420, margin: "60px auto" }}>
      <h1>Forgot Password</h1>

      <input
        type="email"
        placeholder="Your email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{
          width: "100%",
          padding: 12,
          borderRadius: 12,
          border: "1px solid #E6E8EE",
          marginTop: 12,
        }}
      />

      <button
        onClick={sendReset}
        disabled={loading}
        style={{
          marginTop: 16,
          padding: "12px 14px",
          width: "100%",
          borderRadius: 14,
          border: "none",
          background: "#1F6FEB",
          color: "#fff",
          fontWeight: 700,
          fontSize: 16,
        }}
      >
        {loading ? "Sending..." : "Send Reset Link"}
      </button>
    </div>
  );
}
