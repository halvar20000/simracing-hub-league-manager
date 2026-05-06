#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ============================================================================
# 1. Append shared notifyTeamChange helper to registrations.ts
# ============================================================================
echo "=== 1. Append notifyTeamChange helper ==="
cat > /tmp/lm_notify_helper.txt <<'BLOCK'

// ============================================================================
// Shared notifier for team-leader-driven changes (used by update / withdraw /
// transfer). Fires Discord webhook AND email to the league's notify list.
// Fire-and-forget — never blocks the action on a webhook/email failure.
// ============================================================================
type TeamChangeKind =
  | "REGISTERED"
  | "UPDATED"
  | "WITHDRAWN"
  | "LEADERSHIP_TRANSFERRED";

async function notifyTeamChange(params: {
  leagueSlug: string;
  seasonId: string;
  kind: TeamChangeKind;
  teamName: string;
  seasonLabel: string;
  fields: Array<{ name: string; value: string; inline?: boolean }>;
}) {
  const META: Record<
    TeamChangeKind,
    { emoji: string; title: string; color: number }
  > = {
    REGISTERED: { emoji: "🏁", title: "New team registration", color: 0xff6b35 },
    UPDATED: { emoji: "✏️", title: "Team updated", color: 0x3b82f6 },
    WITHDRAWN: { emoji: "❌", title: "Team withdrawn", color: 0xef4444 },
    LEADERSHIP_TRANSFERRED: {
      emoji: "🔄",
      title: "Team leadership transferred",
      color: 0xf59e0b,
    },
  };
  const meta = META[params.kind];

  const lg = await prisma.league.findUnique({
    where: { slug: params.leagueSlug },
    select: {
      name: true,
      discordRegistrationsWebhookUrl: true,
      registrationNotifyEmails: true,
    },
  });
  if (!lg) return;

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://league.simracing-hub.com";
  const rosterUrl = `${baseUrl}/admin/leagues/${params.leagueSlug}/seasons/${params.seasonId}/roster`;
  const heading = `${meta.emoji} ${meta.title} — ${lg.name} ${params.seasonLabel}`;

  // ---- Discord ----
  if (lg.discordRegistrationsWebhookUrl) {
    try {
      await postDiscordWebhook(lg.discordRegistrationsWebhookUrl, {
        username: "CLS Registrations",
        embeds: [
          {
            title: heading,
            description: `Team: **${params.teamName}**`,
            url: rosterUrl,
            color: meta.color,
            fields: params.fields,
            timestamp: new Date().toISOString(),
            footer: { text: "Click the title to open the roster" },
          },
        ],
      });
    } catch {
      // never block on webhook errors
    }
  }

  // ---- Email ----
  const recipients = (lg.registrationNotifyEmails ?? []).filter(
    (e): e is string => typeof e === "string" && /@/.test(e)
  );
  if (recipients.length > 0) {
    const escape = (v: string | number | null | undefined) =>
      String(v ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    const subject = `${meta.emoji} ${meta.title} — ${lg.name} ${params.seasonLabel} — ${params.teamName}`;
    const fieldsHtml = params.fields
      .map(
        (f) =>
          `<tr><td style="padding:6px 0;color:#71717a;width:140px;vertical-align:top;">${escape(
            f.name
          )}</td><td>${escape(f.value)}</td></tr>`
      )
      .join("");

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; color: #18181b;">
        <h2 style="margin: 0 0 8px 0; color: #ff6b35;">${escape(heading)}</h2>
        <p style="margin: 0 0 16px 0; color: #52525b; font-size: 13px;">
          Team: <strong>${escape(params.teamName)}</strong>
        </p>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          ${fieldsHtml}
        </table>
        <p style="margin-top: 20px;">
          <a href="${rosterUrl}" style="display: inline-block; background: #ff6b35; color: #18181b; padding: 10px 16px; text-decoration: none; border-radius: 6px; font-weight: 600;">Open roster</a>
        </p>
        <p style="margin-top: 24px; color: #a1a1aa; font-size: 12px;">CLS — CAS League Scoring</p>
      </div>
    `;
    const text = [
      heading,
      "",
      `Team: ${params.teamName}`,
      "",
      ...params.fields.map((f) => `${f.name}: ${f.value}`),
      "",
      `Open roster: ${rosterUrl}`,
    ].join("\n");

    try {
      await sendResendEmail({ to: recipients, subject, html, text });
    } catch {
      // never block on email errors
    }
  }
}
BLOCK

node -e "
const fs = require('fs');
const FILE = 'src/lib/actions/registrations.ts';
let s = fs.readFileSync(FILE, 'utf8');
if (s.includes('async function notifyTeamChange')) {
  console.log('  Helper already present.');
  process.exit(0);
}
const block = fs.readFileSync('/tmp/lm_notify_helper.txt', 'utf8');
s = s.trimEnd() + '\n' + block + '\n';
fs.writeFileSync(FILE, s);
console.log('  Helper appended.');
"

# ============================================================================
# 2. updateTeamRegistration: notify on save
# ============================================================================
echo ""
echo "=== 2. Patch updateTeamRegistration to call notifier ==="
node -e "
const fs = require('fs');
const FILE = 'src/lib/actions/registrations.ts';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

// Anchor on the closing of the loop that finishes processing teammates,
// and insert the notify call before the revalidatePath block.
// Specifically — anchor on 'revalidatePath(' after the for-loop in
// updateTeamRegistration. There are multiple revalidatePath's in the file;
// be specific by anchoring on 'team_updated' redirect.
const re = /(  revalidatePath\(\`\/teams\/\\\$\{teamId\}\/manage\`\);\s*\n\s*revalidatePath\(\`\/registrations\`\);\s*\n\s*redirect\(\`\/registrations\?success=team_updated\`\);)/;
if (!re.test(s)) {
  console.error('  updateTeamRegistration anchor not found.');
  process.exit(1);
}
s = s.replace(re, \`  // Notify admins of the change
  const finalTeammates = await prisma.registration.findMany({
    where: {
      teamId: team.id,
      userId: { not: team.leaderUserId ?? '' },
      status: { not: 'WITHDRAWN' },
    },
    include: { user: true },
    orderBy: { createdAt: 'asc' },
  });
  const teammateLines = finalTeammates.map((r) =>
    \\\`\\\${r.user.firstName ?? ''} \\\${r.user.lastName ?? ''}\\\`.trim() +
    (r.user.iracingMemberId ? \\\` (iR \\\${r.user.iracingMemberId})\\\` : '')
  );
  const leaderReg = team.registrations.find((r) => r.userId === team.leaderUserId);
  await notifyTeamChange({
    leagueSlug: team.season.league.slug,
    seasonId: team.seasonId,
    kind: 'UPDATED',
    teamName: team.name,
    seasonLabel: \\\`\\\${team.season.name} \\\${team.season.year}\\\`,
    fields: [
      {
        name: 'Team leader',
        value: leaderReg
          ? \\\`\\\${leaderReg.user.firstName ?? ''} \\\${leaderReg.user.lastName ?? ''}\\\`.trim()
          : '—',
        inline: false,
      },
      {
        name: \\\`Active teammates (\\\${finalTeammates.length})\\\`,
        value: teammateLines.length > 0 ? teammateLines.join('\\\\n') : '(none)',
        inline: false,
      },
    ],
  });

\$1\`);
fs.writeFileSync(FILE, s);
console.log('  Patched.');
"

# ============================================================================
# 3. withdrawTeam: notify
# ============================================================================
echo ""
echo "=== 3. Patch withdrawTeam to call notifier ==="
node -e "
const fs = require('fs');
const FILE = 'src/lib/actions/registrations.ts';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

const re = /(  revalidatePath\(\\s*\n?\\s*\`\/leagues\/\\\$\{team\.season\.league\.slug\}\/seasons\/\\\$\{team\.seasonId\}\/roster\`\\s*\n?\\s*\\);\\s*\n\\s*revalidatePath\(\\s*\n?\\s*\`\/admin\/leagues\/\\\$\{team\.season\.league\.slug\}\/seasons\/\\\$\{team\.seasonId\}\/roster\`\\s*\n?\\s*\\);\\s*\n\\s*revalidatePath\(\`\/registrations\`\\);\\s*\n\\s*redirect\(\`\/registrations\?success=team_withdrawn\`\);)/;

if (!re.test(s)) {
  console.error('  withdrawTeam anchor not found.');
  process.exit(1);
}

s = s.replace(re, \`  const leaderReg = team.registrations.find((r) => r.userId === team.leaderUserId);
  await notifyTeamChange({
    leagueSlug: team.season.league.slug,
    seasonId: team.seasonId,
    kind: 'WITHDRAWN',
    teamName: team.name,
    seasonLabel: \\\`\\\${team.season.name} \\\${team.season.year}\\\`,
    fields: [
      {
        name: 'Withdrawn by',
        value: leaderReg
          ? \\\`\\\${leaderReg.user.firstName ?? ''} \\\${leaderReg.user.lastName ?? ''}\\\`.trim()
          : '—',
        inline: false,
      },
      {
        name: 'Members affected',
        value: String(team.registrations.length),
        inline: false,
      },
    ],
  });

\$1\`);
fs.writeFileSync(FILE, s);
console.log('  Patched.');
"

# ============================================================================
# 4. transferTeamLeadership: notify
# ============================================================================
echo ""
echo "=== 4. Patch transferTeamLeadership to call notifier ==="
node -e "
const fs = require('fs');
const FILE = 'src/lib/actions/registrations.ts';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

const re = /(  revalidatePath\(\\s*\n?\\s*\`\/leagues\/\\\$\{team\.season\.league\.slug\}\/seasons\/\\\$\{team\.seasonId\}\/roster\`\\s*\n?\\s*\\);\\s*\n\\s*revalidatePath\(\\s*\n?\\s*\`\/admin\/leagues\/\\\$\{team\.season\.league\.slug\}\/seasons\/\\\$\{team\.seasonId\}\/roster\`\\s*\n?\\s*\\);\\s*\n\\s*revalidatePath\(\`\/registrations\`\\);\\s*\n\\s*redirect\(\`\/registrations\?success=leadership_transferred\`\);)/;

if (!re.test(s)) {
  console.error('  transferTeamLeadership anchor not found.');
  process.exit(1);
}

s = s.replace(re, \`  const oldLeaderReg = team.registrations.find((r) => r.userId === sessionUser.id);
  const newLeaderName = newLeaderReg.user
    ? \\\`\\\${newLeaderReg.user.firstName ?? ''} \\\${newLeaderReg.user.lastName ?? ''}\\\`.trim()
    : '—';
  const oldLeaderName = oldLeaderReg
    ? \\\`\\\${oldLeaderReg.user.firstName ?? ''} \\\${oldLeaderReg.user.lastName ?? ''}\\\`.trim()
    : '—';
  await notifyTeamChange({
    leagueSlug: team.season.league.slug,
    seasonId: team.seasonId,
    kind: 'LEADERSHIP_TRANSFERRED',
    teamName: team.name,
    seasonLabel: \\\`\\\${team.season.name} \\\${team.season.year}\\\`,
    fields: [
      { name: 'Old leader', value: oldLeaderName, inline: true },
      { name: 'New leader', value: newLeaderName, inline: true },
    ],
  });

\$1\`);
fs.writeFileSync(FILE, s);
console.log('  Patched.');
"

# ============================================================================
# 5. Verify
# ============================================================================
echo ""
echo "=== 5. Verify ==="
echo "-- helper --"
grep -n 'async function notifyTeamChange' src/lib/actions/registrations.ts
echo ""
echo "-- callsites --"
grep -n 'notifyTeamChange({' src/lib/actions/registrations.ts | head -5

# ============================================================================
# 6. TS check
# ============================================================================
echo ""
echo "=== 6. TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing."
  exit 1
}

# ============================================================================
# 7. Commit + push
# ============================================================================
echo ""
echo "=== 7. Commit + push ==="
git add -A
git status --short
git commit -m "Notifications: Discord + email on team update/withdraw/transfer-leadership (mirrors new-registration alerts)"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "Three new notification kinds, fired from /teams/<id>/manage actions:"
echo "  ✏️ Team updated              — when leader saves teammate or iRating changes"
echo "  ❌ Team withdrawn             — when leader withdraws the entire team"
echo "  🔄 Team leadership transferred — when leader hands over to a teammate"
echo ""
echo "All three use the SAME Discord webhook URL and email recipients you've"
echo "configured per league (League edit page → 'Email recipients' and 'Discord"
echo "webhook URL'). No new config needed."
