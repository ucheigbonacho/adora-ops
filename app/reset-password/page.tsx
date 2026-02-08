"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function updatePassword() {
    if (!password || password.length < 6)
      return alert("Password must be at least 6 characters");

    setLoading(true);

    const { error } = await supabase.auth.updateUser({ password });

    setLoading(false);

    if (error) return alert(error.message);

    alert("Password updated successfully ✅");
    router.push("/login");
  }

  return (
    <div style={{ padding: 24, maxWidth: 420, margin: "60px auto" }}>
      <h1>Reset Password</h1>

      <input
        type="password"
        placeholder="New password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{
          width: "100%",
          padding: 12,
          borderRadius: 12,
          border: "1px solid #E6E8EE",
          marginTop: 12,
        }}
      />

      <button
        onClick={updatePassword}
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
        {loading ? "Updating..." : "Update Password"}
      </button>
    </div>
  );
}
