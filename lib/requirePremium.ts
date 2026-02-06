import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function requirePremium(workspace_id: string) {
  const { data: ws, error } = await supabaseAdmin
    .from("workspaces")
    .select("id, plan, subscription_status")
    .eq("id", workspace_id)
    .single();

  if (error) throw new Error(error.message);

  const plan = String(ws?.plan || "standard").toLowerCase();
  const status = String(ws?.subscription_status || "").toLowerCase();

  const isActive = status === "active" || status === "trialing";

  // If you want to allow premium even before webhook updates status:
  // you can just check plan === "premium" for now.
  const isPremium = plan === "premium" || plan === "pro";

  return {
    ok: isPremium && isActive,
    plan,
    status,
    workspace: ws,
  };
}
