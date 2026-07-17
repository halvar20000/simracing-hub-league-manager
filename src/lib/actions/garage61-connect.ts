"use server";

import { prisma } from "@/lib/prisma";
import { g61GetMe } from "@/lib/garage61";
import { encryptSecret, secretEncryptionAvailable } from "@/lib/crypto-secret";

// Per-plan Garage 61 connection. A plan's creator (holder of the editToken)
// pastes their own Garage 61 personal access token; it's validated via /me,
// stored AES-GCM-encrypted on the StintPlan row, and NEVER returned to any
// client. Anyone with the plan open can then trigger a pull that uses it. If a
// plan has no token, the pull falls back to the global GARAGE61_TOKEN env var.

export type G61TeamOption = { slug: string; name: string };

export type ConnectResult =
  | { ok: true; teams: G61TeamOption[] }
  | { ok: false; error: string };

async function assertEditor(
  planId: string,
  editToken: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const plan = await prisma.stintPlan.findUnique({
    where: { id: planId },
    select: { editToken: true },
  });
  if (!plan) return { ok: false, error: "Plan not found." };
  if (!editToken || plan.editToken !== editToken) {
    return { ok: false, error: "Only the plan's creator can change this." };
  }
  return { ok: true };
}

/** Validate + store a per-plan Garage 61 token; return the token's teams so the
 *  creator can pick which one to pull from. Gated by the plan's edit token. */
export async function connectGarage61(
  planId: string,
  editToken: string,
  rawToken: string
): Promise<ConnectResult> {
  const gate = await assertEditor(planId, editToken);
  if (!gate.ok) return gate;

  if (!secretEncryptionAvailable()) {
    return {
      ok: false,
      error:
        "Server can't store tokens securely yet — the GARAGE61_ENC_KEY isn't configured. Ask the admin to set it.",
    };
  }
  const tok = (rawToken ?? "").trim();
  if (tok.length < 8) return { ok: false, error: "That doesn't look like a valid token." };

  const me = await g61GetMe(tok);
  if (!me.ok) {
    return {
      ok: false,
      error:
        me.status === 401 || me.status === 403
          ? "Garage 61 rejected that token (check it and its API permissions)."
          : `Garage 61 didn't accept the token (${me.status}).`,
    };
  }

  const teams: G61TeamOption[] = (me.data.teams ?? [])
    .map((t) => ({ slug: t.slug, name: t.name }))
    .filter((t) => t.slug);

  // Store the token; default the selected team to the only team if there's one.
  const only = teams.length === 1 ? teams[0] : null;
  await prisma.stintPlan.update({
    where: { id: planId },
    data: {
      garage61TokenEnc: encryptSecret(tok),
      garage61TeamSlug: only?.slug ?? null,
      garage61TeamName: only?.name ?? null,
    },
  });

  return { ok: true, teams };
}

/** Choose which team the plan pulls from (creator only). */
export async function setGarage61Team(
  planId: string,
  editToken: string,
  teamSlug: string,
  teamName: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await assertEditor(planId, editToken);
  if (!gate.ok) return gate;
  await prisma.stintPlan.update({
    where: { id: planId },
    data: {
      garage61TeamSlug: teamSlug || null,
      garage61TeamName: teamName || null,
    },
  });
  return { ok: true };
}

/** Remove the per-plan token + team (creator only). */
export async function disconnectGarage61(
  planId: string,
  editToken: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await assertEditor(planId, editToken);
  if (!gate.ok) return gate;
  await prisma.stintPlan.update({
    where: { id: planId },
    data: {
      garage61TokenEnc: null,
      garage61TeamSlug: null,
      garage61TeamName: null,
    },
  });
  return { ok: true };
}

export type G61Status = {
  // A per-plan token is stored (never the token itself).
  connected: boolean;
  teamSlug: string | null;
  teamName: string | null;
  // The global GARAGE61_TOKEN env fallback is available server-side.
  globalFallback: boolean;
};

/** Read-only connection status for the UI. Exposes no secret. */
export async function getGarage61Status(planId: string): Promise<G61Status> {
  const plan = planId
    ? await prisma.stintPlan.findUnique({
        where: { id: planId },
        select: {
          garage61TokenEnc: true,
          garage61TeamSlug: true,
          garage61TeamName: true,
        },
      })
    : null;
  const globalFallback =
    !!process.env.GARAGE61_TOKEN && process.env.GARAGE61_TOKEN.length > 0;
  return {
    connected: !!plan?.garage61TokenEnc,
    teamSlug: plan?.garage61TeamSlug ?? null,
    teamName: plan?.garage61TeamName ?? null,
    globalFallback,
  };
}
