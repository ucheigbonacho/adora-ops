"use client";

import { useEffect, useState } from "react";
import AuthOnlyGate from "@/components/AuthOnlyGate";
import { supabase } from "@/lib/supabaseClient";

export default function SetupPage() {
  const [loading, setLoading] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("My Workspace");

  useEffect(() => {
    // optional: clear any bad workspace id that could cause confusion
    // localStorage.removeItem("workspace_id");
  }, []);

  async function createWorkspace() {
    setLoading(true);

    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const { data: ws, error } = await supabase
      .from("workspaces")
      .insert([{ name: workspaceName, owner_user_id: user.id }])
      .select()
      .single();

    if (error) {
      setLoading(false);
      alert("Failed to create workspace: " + error.message);
      return;
    }

    localStorage.setItem("workspace_id", ws.id);
    window.location.href = "/dashboard";
  }

  return (
    <AuthOnlyGate>
      <div style={{ padding: 24, maxWidth: 520 }}>
        <h1>Setup</h1>
        <p>Create your first workspace.</p>

        <input
          value={workspaceName}
          onChange={(e) => setWorkspaceName(e.target.value)}
          placeholder="Workspace name"
          style={{ width: "100%", padding: 10 }}
        />

        <div style={{ marginTop: 12 }}>
          <button onClick={createWorkspace} disabled={loading} style={{ padding: 10 }}>
            {loading ? "Working..." : "Create workspace"}
          </button>
        </div>
      </div>
    </AuthOnlyGate>
  );
}
