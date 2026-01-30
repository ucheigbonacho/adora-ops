"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function AuthOnlyGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        window.location.href = "/login";
        return;
      }
      setReady(true);
    })();
  }, []);

  if (!ready) return <div style={{ padding: 24 }}>Loading...</div>;
  return <>{children}</>;
}
