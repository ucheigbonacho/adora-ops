"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function AuthGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!session) {
        window.location.href = "/login";
        return;
      }

      const workspaceId = localStorage.getItem("workspace_id");
      if (!workspaceId) {
        window.location.href = "/setup";
        return;
      }

      setReady(true);
    })();
  }, []);

  if (!ready) return <div style={{ padding: 24 }}>Loading...</div>;

  return <>{children}</>;
}
