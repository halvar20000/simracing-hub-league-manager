"use server";

import { prisma } from "@/lib/prisma";
import { sendDirectMessage, type Embed } from "@/lib/discord-bot";
import { buildSchedule, fmtDuration } from "@/lib/stint-planner";
import {
  hydratePlanState,
  stateToInput,
  DEFAULT_ALERT_LEAD_MIN,
  type PlannerState,
} from "@/lib/stint-plan-state";

/**
 * "You're up next" Discord DMs for a live stint plan.
 *
 * The planner already knows, to the minute, when every stint starts — including
 * the live ± corrections typed on the pit wall. This turns that into a nudge:
 * the driver of the next stint gets a DM from the league bot a configurable
 * number of minutes before they are due in the car.
 *
 * Everything is decided server-side and every sent alert is written into the
 * plan payload (`alertsSent`), so two open pit-wall tabs cannot double-DM and a
 * reload cannot re-send. The client merges the returned ledger back into its
 * state so its own auto-save can't drop it again.
 */

export type StintAlertResult =
  | {
      ok: true;
      /** Stint indexes alerted in this call (0-based). */
      sent: number[];
      /** Human-readable lines for the planner status area. */
      messages: string[];
      /** The ledger as it now stands — merge this into the client state. */
      alertsSent: Record<string, string>;
    }
  | { ok: false; error: string };

/** Never alert for a stint that started more than this long ago. */
const STALE_AFTER_MS = 10 * 60_000;

function planUrlFor(id: string): string {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://league.simracing-hub.com";
  return `${base}/stint-planner/${id}`;
}

/**
 * @param planId  the saved plan
 * @param force   ignore the lead time and the ledger — used by "Send test DM",
 *                which alerts the next upcoming stint straight away
 */
export async function checkStintPlanAlerts(
  planId: string,
  force = false
): Promise<StintAlertResult> {
  const plan = await prisma.stintPlan.findUnique({
    where: { id: planId },
    select: { id: true, title: true, payload: true, archivedAt: true },
  });
  if (!plan) return { ok: false, error: "Plan not found." };

  const state: PlannerState = hydratePlanState(plan.payload, plan.title);
  // A completed plan never DMs anyone — not even with "Send test DM". Months
  // later someone opens last season's plan to look at the analysis; that must
  // not ping the drivers who were in it.
  if (plan.archivedAt) {
    return force
      ? { ok: false, error: "This plan is completed — reopen it to send alerts." }
      : { ok: true, sent: [], messages: [], alertsSent: state.alertsSent ?? {} };
  }
  if (!force && !state.alertsEnabled) {
    return { ok: true, sent: [], messages: [], alertsSent: state.alertsSent ?? {} };
  }

  const result = buildSchedule(stateToInput(state));
  if (result.raceStartUtcMs == null) {
    return {
      ok: false,
      error: "Set the race start in the event card — without it there is no clock to alert against.",
    };
  }

  const leadMin = Number(state.event.alertLeadMin);
  const lead =
    (isFinite(leadMin) && leadMin > 0 ? leadMin : DEFAULT_ALERT_LEAD_MIN) * 60_000;
  const now = Date.now();
  const ledger: Record<string, string> = { ...(state.alertsSent ?? {}) };

  // Which stints are due for an alert? Normally exactly one; a tab that was
  // closed over a driver change might find two, and both should still go out.
  const due = result.stints.filter((st, i) => {
    if (st.wallStartMs == null) return false;
    if (!force && ledger[String(i)]) return false;
    const untilStart = st.wallStartMs - now;
    if (force) return untilStart > -STALE_AFTER_MS;
    return untilStart <= lead && untilStart > -STALE_AFTER_MS;
  });
  const targets = force ? due.slice(0, 1) : due;
  if (targets.length === 0) {
    return { ok: true, sent: [], messages: [], alertsSent: ledger };
  }

  const sent: number[] = [];
  const messages: string[] = [];

  for (const st of targets) {
    const i = st.index - 1; // ScheduleStint.index is 1-based
    if (!st.driverId) {
      messages.push(`Stint ${st.index} has no driver assigned — no alert sent.`);
      if (!force) ledger[String(i)] = new Date().toISOString();
      continue;
    }
    const user = await prisma.user.findUnique({
      where: { id: st.driverId },
      select: { discordId: true, name: true, firstName: true },
    });
    const who = st.driverName ?? user?.name ?? "the next driver";
    if (!user?.discordId) {
      messages.push(
        `${who} has no Discord account linked in CLS — no alert sent for stint ${st.index}.`
      );
      // Don't burn the ledger entry on a missing link: once the driver links
      // their account the next check should still reach them.
      continue;
    }

    // Claim BEFORE sending: a duplicate DM is worse than a missed one, and a
    // second tab checking at the same second must lose the race.
    if (!force) ledger[String(i)] = new Date().toISOString();

    const minutesOut = Math.max(0, Math.round((st.wallStartMs! - now) / 60_000));
    const clockIn = new Date(st.wallStartMs!).toLocaleTimeString("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Berlin",
    });
    const prev = result.stints[i - 1];
    const embed: Embed = {
      title: `🏁 ${state.title}`,
      url: planUrlFor(plan.id),
      color: 0xff6b35,
      description:
        minutesOut > 0
          ? `**You are up in ${minutesOut} min** — stint ${st.index} of ${result.stints.length}.`
          : `**You are up now** — stint ${st.index} of ${result.stints.length}.`,
      fields: [
        { name: "Clock in", value: `${clockIn} (Berlin)`, inline: true },
        { name: "Race time", value: fmtDuration(st.startSec), inline: true },
        { name: "Laps", value: String(Math.round(st.laps)), inline: true },
        {
          name: "Profile",
          value: st.profile === "saving" ? "Fuel-save" : "Standard",
          inline: true,
        },
        {
          name: "Before you",
          value: prev?.driverName ?? "—",
          inline: true,
        },
        ...(st.wet ? [{ name: "Conditions", value: "🌧 Wet", inline: true }] : []),
      ],
      footer: { text: "CLS Stint Planner" },
    };

    const res = await sendDirectMessage(user.discordId, {
      content: `${st.driverName ?? ""} — stint ${st.index} in ${minutesOut} min.`.trim(),
      embeds: [embed],
      allowed_mentions: { parse: [] },
    });
    if (res.ok) {
      sent.push(i);
      messages.push(`Discord alert sent to ${who} for stint ${st.index}.`);
    } else {
      // Give the entry back so the next check retries — a closed DM inbox is
      // usually a one-off (Discord 403 when the user shares no guild).
      if (!force) delete ledger[String(i)];
      messages.push(
        res.body === "missing-DISCORD_BOT_TOKEN"
          ? "Discord bot is not configured."
          : `Discord refused the DM to ${who} (${res.status}) — they may have DMs from server members switched off.`
      );
    }
  }

  if (!force && JSON.stringify(ledger) !== JSON.stringify(state.alertsSent ?? {})) {
    await prisma.stintPlan
      .update({
        where: { id: plan.id },
        data: { payload: { ...(plan.payload as object), alertsSent: ledger } },
      })
      .catch(() => null);
  }

  return { ok: true, sent, messages, alertsSent: ledger };
}
