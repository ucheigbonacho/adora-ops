// lib/planGuard.ts
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type Plan = "starter" | "standard" | "premium";

export async function getWorkspacePlan(workspace_id: string): Promise<Plan> {
  const wid = String(workspace_id || "").trim();
  if (!wid) return "standard";

  const { data, error } = await supabaseAdmin
    .from("workspaces")
    .select("plan, subscription_status")
    .eq("id", wid)
    .maybeSingle();

  if (error) throw new Error(error.message);

  const plan = String(data?.plan || "standard").toLowerCase() as Plan;
  return plan || "standard";
}
