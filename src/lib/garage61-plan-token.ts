// Server-only helper (NOT "use server"): resolve which Garage 61 token + team a
// stint plan should pull with. Kept out of any "use server" module on purpose —
// every exported async fn in a "use server" file becomes a callable client
// endpoint, and this one decrypts the token, so it must never be exposed. Only
// the pull action (server-side) imports it.

import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto-secret";

export async function resolvePlanGarage61(planId: string | null): Promise<{
  token: string | null;
  teamSlug: string | null;
  source: "plan" | "global" | "none";
}> {
  if (planId) {
    const plan = await prisma.stintPlan.findUnique({
      where: { id: planId },
      select: { garage61TokenEnc: true, garage61TeamSlug: true },
    });
    const tok = decryptSecret(plan?.garage61TokenEnc ?? null);
    if (tok) {
      return { token: tok, teamSlug: plan?.garage61TeamSlug ?? null, source: "plan" };
    }
  }
  const env = process.env.GARAGE61_TOKEN;
  if (env && env.length > 0) return { token: env, teamSlug: null, source: "global" };
  return { token: null, teamSlug: null, source: "none" };
}
