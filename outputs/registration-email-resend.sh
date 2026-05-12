#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"
mkdir -p outputs-tmp

# ===========================================================================
# 1. Schema: League.registrationNotifyEmails (string array)
# ===========================================================================
cat > outputs-tmp/patch-schema.mjs <<'EOF'
import fs from "node:fs";
const FILE = "prisma/schema.prisma";
let s = fs.readFileSync(FILE, "utf8");
if (/registrationNotifyEmails/.test(s)) { console.log("Schema: already present."); process.exit(0); }
const lines = s.split("\n");
let inModel = false, close = -1;
for (let i = 0; i < lines.length; i++) {
  if (/^model\s+League\s*{/.test(lines[i])) { inModel = true; continue; }
  if (inModel && /^}\s*$/.test(lines[i])) { close = i; break; }
}
if (close === -1) { console.error("League brace not found."); process.exit(1); }
lines.splice(close, 0, "  registrationNotifyEmails      String[]  @default([])");
fs.writeFileSync(FILE, lines.join("\n"));
console.log("Schema: added registrationNotifyEmails on League.");
EOF
node outputs-tmp/patch-schema.mjs

echo ""
echo "=== prisma db push ==="
npx --yes prisma db push --skip-generate
rm -rf node_modules/.prisma node_modules/@prisma/client .next tsconfig.tsbuildinfo
npm install @prisma/client --no-audit --no-fund
npx --yes prisma generate

# ===========================================================================
# 2. Helper: src/lib/resend-email.ts
# ===========================================================================
mkdir -p src/lib
cat > src/lib/resend-email.ts <<'TS'
/**
 * Fire-and-forget Resend email. Never throws — registration must still
 * complete even if Resend is unavailable.
 */
export async function sendResendEmail(args: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
}): Promise<{ ok: boolean; status: number; body?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 0, body: "RESEND_API_KEY is not set" };
  }
  const from =
    args.from ??
    process.env.RESEND_FROM ??
    "CLS Registrations <noreply@simracing-hub.com>";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: args.to,
        subject: args.subject,
        html: args.html,
        text: args.text,
      }),
    });
    const body = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: e instanceof Error ? e.message : String(e) };
  }
}
TS
echo "[+] Wrote src/lib/resend-email.ts"

# ===========================================================================
# 3. Patch createRegistration to also send email
# ===========================================================================
cat > outputs-tmp/patch-action.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/actions/registrations.ts";
let s = fs.readFileSync(FILE, "utf8");

if (s.includes("sendResendEmail")) { console.log("Action: email already wired."); process.exit(0); }

// Add the import.
s = s.replace(
  `import { postDiscordWebhook } from "@/lib/discord-webhook";`,
  `import { postDiscordWebhook } from "@/lib/discord-webhook";\nimport { sendResendEmail } from "@/lib/resend-email";`
);

// Inject the email block right after the Discord webhook block.
const before = `    } catch {
      // Never block registration on webhook failure
    }

  revalidatePath(\`/leagues/\${leagueSlug}/seasons/\${seasonId}\`);`;

const after = `    } catch {
      // Never block registration on webhook failure
    }

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

  revalidatePath(\`/leagues/\${leagueSlug}/seasons/\${seasonId}\`);`;

if (!s.includes(before)) { console.error("createRegistration anchor (post-webhook block) not found."); process.exit(1); }
s = s.replace(before, after);

fs.writeFileSync(FILE, s);
console.log("Action: email notification wired.");
EOF
node outputs-tmp/patch-action.mjs

# ===========================================================================
# 4. League edit page — add a textarea for emails (one per line)
# ===========================================================================
cat > outputs-tmp/patch-league-edit.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/admin/leagues/[slug]/edit/page.tsx";
let s = fs.readFileSync(FILE, "utf8");
if (s.includes("registrationNotifyEmails")) { console.log("League edit: emails field already present."); process.exit(0); }

const before = `        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Discord webhook URL for registrations (optional)
          </span>`;
const insert = `        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Email recipients for new registrations (one per line)
          </span>
          <textarea
            name="registrationNotifyEmails"
            rows={3}
            defaultValue={(league.registrationNotifyEmails ?? []).join("\\n")}
            placeholder={"admin@example.com\\nsteward@example.com"}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
          />
          <span className="mt-1 block text-xs text-zinc-500">
            Sent via Resend. Requires RESEND_API_KEY in env. Leave blank to disable.
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Discord webhook URL for registrations (optional)
          </span>`;

if (!s.includes(before)) { console.error("League edit: webhook label anchor not found."); process.exit(1); }
s = s.replace(before, insert);
fs.writeFileSync(FILE, s);
console.log("League edit: emails textarea added.");
EOF
node outputs-tmp/patch-league-edit.mjs

# ===========================================================================
# 5. updateLeague action — parse + persist the emails list
# ===========================================================================
cat > outputs-tmp/patch-leagues-action.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/actions/leagues.ts";
let s = fs.readFileSync(FILE, "utf8");
if (s.includes("registrationNotifyEmails")) { console.log("Leagues action: already wired."); process.exit(0); }

s = s.replace(
  `  const webhookRaw = String(formData.get("discordRegistrationsWebhookUrl") ?? "").trim();
  const discordRegistrationsWebhookUrl = webhookRaw || null;`,
  `  const webhookRaw = String(formData.get("discordRegistrationsWebhookUrl") ?? "").trim();
  const discordRegistrationsWebhookUrl = webhookRaw || null;
  const emailsRaw = String(formData.get("registrationNotifyEmails") ?? "");
  const registrationNotifyEmails = emailsRaw
    .split(/[\\n,;]+/)
    .map((e) => e.trim())
    .filter((e) => e.length > 0 && /@/.test(e));`
);

s = s.replace(
  `    data: { name, description, discordRegistrationsWebhookUrl },`,
  `    data: { name, description, discordRegistrationsWebhookUrl, registrationNotifyEmails },`
);

fs.writeFileSync(FILE, s);
console.log("Leagues action: emails list persisted.");
EOF
node outputs-tmp/patch-leagues-action.mjs

rm -rf outputs-tmp

# ===========================================================================
# Type check + commit
# ===========================================================================
echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "Email notifications: send via Resend on registration submit (per-league recipient list)"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "Setup remaining:"
echo "  1. Sign up at https://resend.com (free tier — 3000 emails/month, no card needed)."
echo "  2. Verify your sending domain (5-min DNS step)."
echo "  3. Create an API key."
echo "  4. Add to your Vercel project env:"
echo "       RESEND_API_KEY=re_xxxxxxxxxxxxxxxx"
echo "       RESEND_FROM=\"CLS Registrations <noreply@simracing-hub.com>\"  (optional override)"
echo "  5. In Admin → Edit League → paste recipient emails (one per line)."
