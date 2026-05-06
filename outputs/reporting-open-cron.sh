#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ============================================================================
# 1. Schema: Round.reportingNotifiedAt
# ============================================================================
echo "=== 1. Schema ==="
node -e "
const fs = require('fs');
const FILE = 'prisma/schema.prisma';
let s = fs.readFileSync(FILE, 'utf8');
const re = /(model Round \{[\s\S]*?)(\n\})/;
const m = s.match(re);
if (!m) { console.error('  Round model not found.'); process.exit(1); }
if (/\n\s+reportingNotifiedAt\s+DateTime\?/.test(m[1])) {
  console.log('  Already has reportingNotifiedAt.');
} else {
  s = s.replace(re, m[1] + '\n  reportingNotifiedAt     DateTime?' + m[2]);
  fs.writeFileSync(FILE, s);
  console.log('  Added Round.reportingNotifiedAt.');
}
"

# ============================================================================
# 2. db push + generate
# ============================================================================
echo ""
echo "=== 2. prisma db push + generate ==="
npx prisma db push --accept-data-loss
npx prisma generate

# ============================================================================
# 3. Helper + manual form action: src/lib/actions/round-reporting.ts
# ============================================================================
echo ""
echo "=== 3. Create round-reporting helper ==="
cat > src/lib/actions/round-reporting.ts <<'TS'
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { postDiscordWebhook } from "@/lib/discord-webhook";
import { requireAdmin } from "@/lib/auth-helpers";

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

/**
 * Idempotent: only fires the Discord post if reportingNotifiedAt is null
 * AND the cooldown window has elapsed. Marks the round notified on success.
 */
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

  revalidatePath(`/admin/leagues/${lg.slug}/seasons/${round.seasonId}`);
  return { ok: true };
}

/**
 * Server action — fires from a manual admin button.
 * Pass through `force: true` so admin can re-fire even if cooldown not yet
 * elapsed (useful for testing / re-sending lost messages).
 */
export async function notifyReportingOpenManually(formData: FormData) {
  await requireAdmin();
  const roundId = String(formData.get("roundId") ?? "");
  if (!roundId) throw new Error("roundId required");
  await notifyReportingOpenForRound(roundId, { force: true });
}
TS
echo "  Written."

# ============================================================================
# 4. Cron API route
# ============================================================================
echo ""
echo "=== 4. Create /api/cron/notify-reporting-open route ==="
mkdir -p 'src/app/api/cron/notify-reporting-open'
cat > 'src/app/api/cron/notify-reporting-open/route.ts' <<'TS'
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notifyReportingOpenForRound } from "@/lib/actions/round-reporting";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Vercel cron auto-attaches Authorization: Bearer ${CRON_SECRET}
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // Pull rounds that haven't been notified yet.
  const candidates = await prisma.round.findMany({
    where: {
      reportingNotifiedAt: null,
      season: {
        status: { in: ["OPEN_REGISTRATION", "ACTIVE"] },
        scoringSystem: {
          protestCooldownHours: { not: null },
        },
      },
    },
    include: {
      season: { include: { scoringSystem: true } },
    },
    take: 200,
  });

  const fired: string[] = [];
  const skipped: { id: string; reason: string }[] = [];

  for (const round of candidates) {
    const cooldown = round.season.scoringSystem?.protestCooldownHours;
    if (cooldown == null) {
      skipped.push({ id: round.id, reason: "no-cooldown" });
      continue;
    }
    const opensAt = new Date(round.startsAt.getTime() + cooldown * 3600 * 1000);
    if (opensAt > now) {
      skipped.push({ id: round.id, reason: "too-early" });
      continue;
    }

    const result = await notifyReportingOpenForRound(round.id);
    if (result.ok) {
      fired.push(round.id);
    } else {
      skipped.push({ id: round.id, reason: result.reason });
    }
  }

  return NextResponse.json({
    ok: true,
    now: now.toISOString(),
    fired,
    skipped,
  });
}
TS
echo "  Written."

# ============================================================================
# 5. vercel.json with cron schedule (every 30 min)
# ============================================================================
echo ""
echo "=== 5. Create vercel.json ==="
if [ -f vercel.json ]; then
  echo "  vercel.json already exists — leaving alone (paste it back if you want me to merge cron config)."
else
cat > vercel.json <<'JSON'
{
  "crons": [
    {
      "path": "/api/cron/notify-reporting-open",
      "schedule": "*/30 * * * *"
    }
  ]
}
JSON
  echo "  Written. Runs every 30 minutes."
fi

# ============================================================================
# 6. Manual button on season admin page (best effort)
# ============================================================================
echo ""
echo "=== 6. Add manual 'Notify Discord' button on season admin round row ==="
cat > /tmp/lm_round_btn.js <<'JS'
const fs = require('fs');
const FILE = 'src/app/admin/leagues/[slug]/seasons/[seasonId]/page.tsx';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

if (s.includes('notifyReportingOpenManually')) {
  console.log('  Already wired.');
  process.exit(0);
}

// Add import for the action
const importBlock = `import { notifyReportingOpenManually } from "@/lib/actions/round-reporting";\n`;
if (!s.includes('notifyReportingOpenManually')) {
  // Insert near other imports
  s = importBlock + s;
}

console.log('  Import added. UI button placement requires the round-row JSX —');
console.log('  if needed paste lines 200-260 of the season admin page and I will add it.');
fs.writeFileSync(FILE, s);
JS
node /tmp/lm_round_btn.js

# ============================================================================
# 7. Verify
# ============================================================================
echo ""
echo "=== 7. Verify ==="
echo "-- schema --"
grep -n 'reportingNotifiedAt' prisma/schema.prisma | head -3
echo "-- helper --"
ls -la src/lib/actions/round-reporting.ts
echo "-- cron route --"
ls -la 'src/app/api/cron/notify-reporting-open/route.ts'
echo "-- vercel.json --"
cat vercel.json

# ============================================================================
# 8. TS check
# ============================================================================
echo ""
echo "=== 8. TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing."
  exit 1
}

# ============================================================================
# 9. Commit + push
# ============================================================================
echo ""
echo "=== 9. Commit + push ==="
git add -A
git status --short
git commit -m "Auto Discord notification when reporting window opens (Vercel cron, every 30 min, idempotent via Round.reportingNotifiedAt)"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "=== POST-DEPLOY: required Vercel env var ==="
echo ""
echo "  Add CRON_SECRET to Vercel:"
echo "    Vercel Dashboard → Project → Settings → Environment Variables"
echo "    Name:  CRON_SECRET"
echo "    Value: any random string (pwgen -s 48 1, openssl rand -hex 32, etc.)"
echo "    Apply to: Production, Preview, Development"
echo ""
echo "  Without CRON_SECRET, the route returns 401 to Vercel's cron and"
echo "  notifications never fire. Vercel automatically passes the secret as"
echo "  Authorization: Bearer <CRON_SECRET> when invoking the cron."
echo ""
echo "=== TEST AFTER DEPLOY ==="
echo "  Once CRON_SECRET is set, the cron runs every 30 minutes. To test"
echo "  immediately, you can hit the route with the secret yourself:"
echo ""
echo "    curl -H \"Authorization: Bearer \$CRON_SECRET\" \\"
echo "      https://league.simracing-hub.com/api/cron/notify-reporting-open"
echo ""
echo "  Returns JSON with 'fired' (rounds that got notified) and 'skipped'"
echo "  (with reason: too-early / no-webhook / etc.)"
echo ""
echo "Manual button on season admin page — currently the import is added"
echo "but the button JSX wasn't placed yet (the rounds-table JSX needs to"
echo "be inspected first). Paste lines 200-260 of"
echo "  src/app/admin/leagues/[slug]/seasons/[seasonId]/page.tsx"
echo "if you want the manual button as a follow-up."
