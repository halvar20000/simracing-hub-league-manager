#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ============================================================================
# 1. Move the helper out of "use server" file
#    src/lib/notify-reporting.ts        — pure helper (no "use server")
#    src/lib/actions/round-reporting.ts — server-action wrapper that imports
#                                         the helper (kept "use server")
# ============================================================================

echo "=== 1. Create src/lib/notify-reporting.ts (pure helper) ==="
cat > src/lib/notify-reporting.ts <<'TS'
import { prisma } from "@/lib/prisma";
import { postDiscordWebhook } from "@/lib/discord-webhook";

export type NotifyResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "round-not-found"
        | "already-notified"
        | "no-webhook"
        | "no-cooldown"
        | "too-early"
        | "webhook-failed";
    };

export async function notifyReportingOpenForRound(
  roundId: string,
  opts?: { force?: boolean }
): Promise<NotifyResult> {
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      season: { include: { league: true, scoringSystem: true } },
    },
  });
  if (!round) return { ok: false, reason: "round-not-found" };
  if (round.reportingNotifiedAt) return { ok: false, reason: "already-notified" };

  const lg = round.season.league;
  if (!lg.discordRegistrationsWebhookUrl) {
    return { ok: false, reason: "no-webhook" };
  }

  const cooldownHrs = round.season.scoringSystem?.protestCooldownHours ?? null;
  const windowHrs = round.season.scoringSystem?.protestWindowHours ?? null;
  if (cooldownHrs == null) {
    return { ok: false, reason: "no-cooldown" };
  }

  const opensAt = new Date(
    round.startsAt.getTime() + cooldownHrs * 3600 * 1000
  );
  const now = new Date();
  if (!opts?.force && opensAt > now) {
    return { ok: false, reason: "too-early" };
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://league.simracing-hub.com";
  const reportUrl = `${baseUrl}/leagues/${lg.slug}/seasons/${round.seasonId}/rounds/${round.id}/report`;

  let deadlineText = "";
  if (windowHrs != null) {
    const closeAt = new Date(opensAt.getTime() + windowHrs * 3600 * 1000);
    deadlineText = `Reports close ${closeAt.toUTCString()}.`;
  }

  try {
    await postDiscordWebhook(lg.discordRegistrationsWebhookUrl, {
      username: "CLS Reports",
      embeds: [
        {
          title: `📋 Incident reports open — ${lg.name}`,
          description:
            `**${round.season.name} ${round.season.year}** · Round ${round.roundNumber}: **${round.name}**` +
            (round.track ? ` · ${round.track}` : "") +
            (deadlineText ? `\n\n${deadlineText}` : ""),
          url: reportUrl,
          color: 0xf59e0b,
          fields: [
            {
              name: "Submit a report",
              value: `[Open the report form](${reportUrl})`,
              inline: false,
            },
          ],
          timestamp: new Date().toISOString(),
          footer: { text: "CLS — Incident reports" },
        },
      ],
    });
  } catch {
    return { ok: false, reason: "webhook-failed" };
  }

  await prisma.round.update({
    where: { id: roundId },
    data: { reportingNotifiedAt: new Date() },
  });

  return { ok: true };
}
TS
echo "  Written."

# ============================================================================
# 2. Rewrite src/lib/actions/round-reporting.ts to just be a thin server-action
#    wrapper that calls the helper above.
# ============================================================================
echo ""
echo "=== 2. Rewrite src/lib/actions/round-reporting.ts ==="
cat > src/lib/actions/round-reporting.ts <<'TS'
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { notifyReportingOpenForRound } from "@/lib/notify-reporting";

export async function notifyReportingOpenManually(formData: FormData) {
  await requireAdmin();
  const roundId = String(formData.get("roundId") ?? "");
  if (!roundId) throw new Error("roundId required");
  await notifyReportingOpenForRound(roundId, { force: true });

  // Revalidate the season admin page so the button state refreshes.
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: { season: { include: { league: true } } },
  });
  if (round) {
    revalidatePath(
      `/admin/leagues/${round.season.league.slug}/seasons/${round.seasonId}`
    );
  }
}
TS
echo "  Rewritten."

# ============================================================================
# 3. Update the cron route to import from the new pure helper
# ============================================================================
echo ""
echo "=== 3. Update cron route's import path ==="
node -e "
const fs = require('fs');
const FILE = 'src/app/api/cron/notify-reporting-open/route.ts';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;
s = s.replace(
  /import \{ notifyReportingOpenForRound \} from \"@\/lib\/actions\/round-reporting\";/,
  'import { notifyReportingOpenForRound } from \"@/lib/notify-reporting\";'
);
if (s === before) {
  console.log('  Already imports from notify-reporting.');
  process.exit(0);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
"

# ============================================================================
# 4. Verify
# ============================================================================
echo ""
echo "=== 4. Verify ==="
echo "-- helper file --"
ls -la src/lib/notify-reporting.ts
echo ""
echo "-- server action wrapper --"
head -5 src/lib/actions/round-reporting.ts
echo ""
echo "-- cron route imports --"
head -5 'src/app/api/cron/notify-reporting-open/route.ts'

# ============================================================================
# 5. TS check
# ============================================================================
echo ""
echo "=== 5. TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing."
  exit 1
}

# ============================================================================
# 6. Commit + push
# ============================================================================
echo ""
echo "=== 6. Commit + push ==="
git add -A
git status --short
git commit -m "Split notify helper out of 'use server' file so the cron API route can import it cleanly"
git push

echo ""
echo "Done. Wait ~60s for Vercel to redeploy, then retry:"
echo ""
echo "  curl -H \"Authorization: Bearer YOUR_CRON_SECRET\" \\"
echo "    https://league.simracing-hub.com/api/cron/notify-reporting-open"
echo ""
echo "Should return 200 with JSON {ok:true, fired:[], skipped:[...]}, not 404."
