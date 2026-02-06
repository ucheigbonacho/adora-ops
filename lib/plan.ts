// lib/plan.ts
export type Plan = "starter" | "standard" | "premium";

export function hasPremium(plan: string | null | undefined) {
  return String(plan || "").toLowerCase() === "premium";
}
