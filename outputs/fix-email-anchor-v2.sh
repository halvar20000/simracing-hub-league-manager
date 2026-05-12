#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# Show exact bytes around the anchor area so we can confirm what's actually there.
echo "=== exact bytes (cat -A) lines 145–160 ==="
awk 'NR>=145 && NR<=165 { printf "%4d|%s\n", NR, $0 }' src/lib/actions/registrations.ts

mkdir -p outputs-tmp
cat > outputs-tmp/patch.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/actions/registrations.ts";
let s = fs.readFileSync(FILE, "utf8");

if (s.includes("sendResendEmail")) { console.log("Email already wired."); process.exit(0); }

// Add the import.
if (!s.includes('from "@/lib/resend-email"')) {
  s = s.replace(
    `import { postDiscordWebhook } from "@/lib/discord-webhook";`,
    `import { postDiscordWebhook } from "@/lib/discord-webhook";\nimport { sendResendEmail } from "@/lib/resend-email";`
  );
}

const emailBlock = `
  // Fire-and-forget email notification(s)
  try {
    const lg2 = await prisma.league.findUnique({
      where: { slug: leagueSlug },
      select: { registrationNotifyEmails: true },
    });
    const recipients = (lg2?.registrationNotifyEmails ?? []).filter(
      (e) => typeof e === "string" && /@/.test(e)
    );
    if (recipients.length > 0) {
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://league.simracing-hub.com";
      const rosterUrl = \`\${baseUrl}/admin/leagues/\${leagueSlug}/seasons/\${seasonId}/roster\`;
      const teamLabel2 = teamId
        ? (await prisma.team.findUnique({ where: { id: teamId }, select: { name: true } }))?.name ?? "—"
        : "Independent";
      const className2 = carClassId
        ? (await prisma.carClass.findUnique({ where: { id: carClassId }, select: { name: true } }))?.name ?? "—"
        : null;

      const subject =
        existing && existing.status !== "PENDING"
          ? \`Updated registration — \${season.league.name} \${season.name}\`
          : \`New registration — \${season.league.name} \${season.name}\`;

      const escape = (v: string | number | null | undefined) =>
        String(v ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");

      const html = \`
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; color: #18181b;">
          <h2 style="margin: 0 0 8px 0; color: #ff6b35;">📝 \${escape(subject)}</h2>
          <p style="margin: 0 0 16px 0; color: #52525b; font-size: 13px;">
            \${existing && existing.status !== "PENDING" ? "Updated registration (was " + escape(existing.status.toLowerCase()) + ")" : "New pending registration awaiting approval"}
          </p>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr><td style="padding: 6px 0; color: #71717a; width: 110px;">Driver</td><td>\${escape(user.firstName)} \${escape(user.lastName)}</td></tr>
            <tr><td style="padding: 6px 0; color: #71717a;">iRacing ID</td><td>\${escape(user.iracingMemberId)}</td></tr>
            <tr><td style="padding: 6px 0; color: #71717a;">Start #</td><td>\${startNumber != null ? "#" + escape(startNumber) : "—"}</td></tr>
            <tr><td style="padding: 6px 0; color: #71717a;">Team</td><td>\${escape(teamLabel2)}</td></tr>
            \${className2 ? \`<tr><td style="padding: 6px 0; color: #71717a;">Class</td><td>\${escape(className2)}</td></tr>\` : ""}
            \${notes ? \`<tr><td style="padding: 6px 0; color: #71717a; vertical-align: top;">Notes</td><td>\${escape(notes)}</td></tr>\` : ""}
          </table>
          <p style="margin-top: 20px;">
            <a href="\${rosterUrl}" style="display: inline-block; background: #ff6b35; color: #18181b; padding: 10px 16px; text-decoration: none; border-radius: 6px; font-weight: 600;">Open roster</a>
          </p>
          <p style="margin-top: 24px; color: #a1a1aa; font-size: 12px;">CLS — CAS League Scoring</p>
        </div>
      \`;

      const text = [
        subject,
        "",
        \`Driver: \${user.firstName} \${user.lastName}\`,
        \`iRacing ID: \${user.iracingMemberId}\`,
        \`Start #: \${startNumber != null ? "#" + startNumber : "—"}\`,
        \`Team: \${teamLabel2}\`,
        className2 ? \`Class: \${className2}\` : null,
        notes ? \`Notes: \${notes}\` : null,
        "",
        \`Open roster: \${rosterUrl}\`,
      ].filter((x): x is string => x !== null).join("\\n");

      await sendResendEmail({ to: recipients, subject, html, text });
    }
  } catch {
    // Never block registration on email failure
  }
`;

// Find the closing brace of the webhook try/catch (the one immediately followed
// by a revalidatePath line). Use a regex so whitespace can't trip us up.
const re = /(\/\/[^\n]*Never block registration on webhook failure[^\n]*\n)(\s*)(\})\s*\n(\s*revalidatePath)/;
const m = s.match(re);
if (!m) {
  console.error("Could not find the closing of the webhook try/catch followed by revalidatePath.");
  process.exit(1);
}
const matchIdx = m.index ?? 0;
const matchEnd = matchIdx + m[0].length;
// We want to keep everything up to and including the closing `}` of the try/catch,
// then insert the email block, then the revalidatePath line as-is.
const closeBraceEnd = matchIdx + m[1].length + m[2].length + m[3].length; // up through `}`
s = s.slice(0, closeBraceEnd) + "\n" + emailBlock + s.slice(closeBraceEnd);

fs.writeFileSync(FILE, s);
console.log("Email block inserted via regex anchor.");
EOF
node outputs-tmp/patch.mjs
rm -rf outputs-tmp

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "Email notifications: regex-based insertion (whitespace-tolerant)"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
