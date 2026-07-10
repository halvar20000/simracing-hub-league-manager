"use server";

import { prisma } from "@/lib/prisma";
import { postBotMessage, type Embed } from "@/lib/discord-bot";
import { buildSchedule } from "@/lib/stint-planner";
import {
  defaultPlannerState,
  stateToInput,
  type PlannerState,
} from "@/lib/stint-plan-state";

// Posts a saved stint plan to the CAS Discord channel via the existing bot.
// Channel is fixed (override with STINT_PLANNER_DISCORD_CHANNEL_ID); the bot
// must have Send Messages + Embed Links permission in that channel.
const CHANNEL_ID =
  process.env.STINT_PLANNER_DISCORD_CHANNEL_ID ?? "1096395046586159227";

export type PostToDiscordResult =
  | { ok: true }
  | { ok: false; error: string };

export async function postStintPlanToDiscord(
  planId: string
): Promise<PostToDiscordResult> {
  const plan = await prisma.stintPlan.findUnique({
    where: { id: planId },
    select: { id: true, title: true, payload: true },
  });
  if (!plan) return { ok: false, error: "Save the plan first." };

  const base = defaultPlannerState();
  const stored = (plan.payload ?? {}) as Partial<PlannerState>;
  const state: PlannerState = {
    ...base,
    ...stored,
    title: plan.title,
    event: { ...base.event, ...(stored.event ?? {}) },
    notes: { ...base.notes, ...(stored.notes ?? {}) },
  };

  const result = buildSchedule(stateToInput(state));
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://league.simracing-hub.com";
  const planUrl = `${baseUrl}/stint-planner/${plan.id}`;

  const lineup =
    result.perDriver.length > 0
      ? result.perDriver
          .map(
            (d) =>
              `• ${d.name} — ${d.stints} stint${d.stints === 1 ? "" : "s"}`
          )
          .join("\n")
      : "—";

  const embed: Embed = {
    title: `🏁 ${state.title}`,
    url: planUrl,
    color: 0xff6b35,
    description: state.notes.pre?.trim()
      ? state.notes.pre.trim().slice(0, 600)
      : undefined,
    fields: [
      { name: "Track", value: state.event.track || "—", inline: true },
      { name: "Car", value: state.event.car || "—", inline: true },
      { name: "Race length", value: state.event.raceDuration || "—", inline: true },
      {
        name: "Stints / stops",
        value: `${result.totals.stintCount} / ${result.totals.pitStops}`,
        inline: true,
      },
      { name: "Drivers", value: lineup, inline: false },
    ],
    footer: { text: "CLS Stint Planner" },
  };

  const res = await postBotMessage(CHANNEL_ID, {
    content: `**${state.title}** — ${planUrl}`,
    embeds: [embed],
    allowed_mentions: { parse: [] },
  });
  if (!res.ok) {
    return {
      ok: false,
      error:
        res.body === "missing-DISCORD_BOT_TOKEN"
          ? "Discord bot is not configured."
          : `Discord rejected the post (${res.status}). Check the bot can post in that channel.`,
    };
  }
  return { ok: true };
}
