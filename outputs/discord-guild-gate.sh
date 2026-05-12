#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"
mkdir -p outputs-tmp

# ===========================================================================
# 1. Schema: User.casDiscordGuildMember
# ===========================================================================
cat > outputs-tmp/patch-schema.mjs <<'EOF'
import fs from "node:fs";
const FILE = "prisma/schema.prisma";
let s = fs.readFileSync(FILE, "utf8");
if (/casDiscordGuildMember\s+Boolean/.test(s)) { console.log("Schema: already present."); process.exit(0); }
const lines = s.split("\n");
let inModel = false, close = -1;
for (let i = 0; i < lines.length; i++) {
  if (/^model\s+User\s*{/.test(lines[i])) { inModel = true; continue; }
  if (inModel && /^}\s*$/.test(lines[i])) { close = i; break; }
}
if (close === -1) { console.error("User brace not found."); process.exit(1); }
lines.splice(close, 0, "  casDiscordGuildMember Boolean @default(false)");
fs.writeFileSync(FILE, lines.join("\n"));
console.log("Schema: added User.casDiscordGuildMember.");
EOF
node outputs-tmp/patch-schema.mjs

echo ""
echo "=== prisma db push ==="
npx --yes prisma db push --skip-generate
rm -rf node_modules/.prisma node_modules/@prisma/client .next tsconfig.tsbuildinfo
npm install @prisma/client --no-audit --no-fund
npx --yes prisma generate

# ===========================================================================
# 2. Update auth.ts — request 'guilds' scope, check membership in signIn
# ===========================================================================
cat > outputs-tmp/patch-auth.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/auth.ts";
let s = fs.readFileSync(FILE, "utf8");

// 2a. Replace `Discord` (bare provider) with Discord({ authorization: ... }).
if (!s.includes("identify guilds")) {
  s = s.replace(
    `providers: [Discord]`,
    `providers: [
    Discord({
      authorization: { params: { scope: "identify guilds" } },
    }),
  ]`
  );
}

// 2b. Extend signIn callback with guild check.
if (!s.includes("casDiscordGuildMember")) {
  // Insert just before `return true;` at the end of signIn callback.
  s = s.replace(
    `    async signIn({ user, account, profile }) {
      // Auto-promote whitelisted Discord usernames to ADMIN
      if (account?.provider === "discord" && user?.id) {
        const allowlist = getAdminAllowlist();
        const username = (profile as { username?: string } | null)
          ?.username?.toLowerCase();
        if (username && allowlist.includes(username)) {
          await prisma.user.update({
            where: { id: user.id },
            data: { role: "ADMIN" },
          });
        }
      }
      return true;
    },`,
    `    async signIn({ user, account, profile }) {
      // Auto-promote whitelisted Discord usernames to ADMIN
      if (account?.provider === "discord" && user?.id) {
        const allowlist = getAdminAllowlist();
        const username = (profile as { username?: string } | null)
          ?.username?.toLowerCase();
        if (username && allowlist.includes(username)) {
          await prisma.user.update({
            where: { id: user.id },
            data: { role: "ADMIN" },
          });
        }

        // Check CAS Discord guild membership using the OAuth access token.
        const guildId = process.env.CAS_DISCORD_GUILD_ID;
        const accessToken = account.access_token;
        if (guildId && accessToken) {
          try {
            const res = await fetch("https://discord.com/api/users/@me/guilds", {
              headers: { Authorization: \`Bearer \${accessToken}\` },
            });
            if (res.ok) {
              const guilds = (await res.json()) as Array<{ id: string }>;
              const isMember = Array.isArray(guilds) && guilds.some((g) => g?.id === guildId);
              await prisma.user.update({
                where: { id: user.id },
                data: { casDiscordGuildMember: isMember },
              });
            }
          } catch {
            // Silent — never block sign-in on a Discord API hiccup.
          }
        }
      }
      return true;
    },`
  );
}

// 2c. Surface casDiscordGuildMember on the session object so client code can read it
if (!s.includes("session.user.casDiscordGuildMember")) {
  s = s.replace(
    `    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        // @ts-expect-error - role comes from our extended User model
        session.user.role = user.role;
      }
      return session;
    },`,
    `    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        // @ts-expect-error - role comes from our extended User model
        session.user.role = user.role;
        // @ts-expect-error - casDiscordGuildMember comes from our extended User model
        session.user.casDiscordGuildMember = (user as { casDiscordGuildMember?: boolean }).casDiscordGuildMember ?? false;
      }
      return session;
    },`
  );
}

fs.writeFileSync(FILE, s);
console.log("auth.ts: guilds scope + membership check wired.");
EOF
node outputs-tmp/patch-auth.mjs

# ===========================================================================
# 3. Register page — gate non-guild-members
# ===========================================================================
cat > outputs-tmp/patch-register.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/register/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

if (s.includes("casDiscordGuildMember")) { console.log("Register page: guild gate already wired."); process.exit(0); }

// Insert the gate AFTER the profile-completion check + BEFORE the season-status check.
const before = `  if (!user.firstName || !user.lastName || !user.iracingMemberId) {
    redirect(
      \`/profile?error=Please+complete+your+profile+before+registering\`
    );
  }`;
const after = `  if (!user.firstName || !user.lastName || !user.iracingMemberId) {
    redirect(
      \`/profile?error=Please+complete+your+profile+before+registering\`
    );
  }

  // Discord guild membership gate (only enforced when CAS_DISCORD_GUILD_ID is set).
  const guildEnforced = !!process.env.CAS_DISCORD_GUILD_ID;
  if (guildEnforced && !user.casDiscordGuildMember) {
    const inviteUrl = process.env.CAS_DISCORD_INVITE_URL ?? null;
    return (
      <div className="space-y-4">
        <Link
          href={\`/leagues/\${slug}/seasons/\${seasonId}\`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Back to season
        </Link>
        <h1 className="text-2xl font-bold">CAS Discord membership required</h1>
        <p className="text-zinc-400">
          Registration is restricted to members of the CAS Community Discord.
          Join the server, then sign out and sign back in here so we can
          re-check your membership.
        </p>
        {inviteUrl && (
          <a
            href={inviteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded bg-[#5865F2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4752c4]"
          >
            Join CAS Discord
          </a>
        )}
        <p className="text-xs text-zinc-500">
          Already in the Discord? Sign out and sign back in to refresh — we
          only see your guild list at sign-in time.
        </p>
      </div>
    );
  }`;

if (!s.includes(before)) { console.error("Register page: profile-check anchor not found."); process.exit(1); }
s = s.replace(before, after);
fs.writeFileSync(FILE, s);
console.log("Register page: guild gate inserted.");
EOF
node outputs-tmp/patch-register.mjs

# ===========================================================================
# 4. createRegistration action — re-check guild membership (defence in depth)
# ===========================================================================
cat > outputs-tmp/patch-action.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/actions/registrations.ts";
let s = fs.readFileSync(FILE, "utf8");

if (s.includes("casDiscordGuildMember")) { console.log("createRegistration: guild check already wired."); process.exit(0); }

// Add guild-member check right after the profile-completion check.
const before = `  if (
    !user ||
    !user.firstName ||
    !user.lastName ||
    !user.iracingMemberId
  ) {
    redirect("/profile?error=Please+complete+your+profile+before+registering");
  }`;
const after = `  if (
    !user ||
    !user.firstName ||
    !user.lastName ||
    !user.iracingMemberId
  ) {
    redirect("/profile?error=Please+complete+your+profile+before+registering");
  }

  // Discord guild membership gate
  if (process.env.CAS_DISCORD_GUILD_ID && !user.casDiscordGuildMember) {
    redirect(
      \`/leagues/\${leagueSlug}/seasons/\${seasonId}/register?error=CAS+Discord+membership+is+required\`
    );
  }`;

if (!s.includes(before)) { console.error("createRegistration: profile-check anchor not found."); process.exit(1); }
s = s.replace(before, after);
fs.writeFileSync(FILE, s);
console.log("createRegistration: guild check wired.");
EOF
node outputs-tmp/patch-action.mjs

rm -rf outputs-tmp

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "Discord guild gate: only CAS guild members can register (auth checks /users/@me/guilds at sign-in)"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "Setup remaining:"
echo "  1) In Discord: Settings → Advanced → enable Developer Mode."
echo "  2) Right-click the CAS server icon → Copy Server ID (18-digit number)."
echo "  3) In Vercel → Settings → Environment Variables, add:"
echo "       CAS_DISCORD_GUILD_ID=<that number>"
echo "       CAS_DISCORD_INVITE_URL=https://discord.gg/xxxxxx   (optional but nice)"
echo "  4) Redeploy."
echo "  5) Existing logged-in users need to sign out + sign back in once so we can"
echo "     re-fetch their guild list (we only see it at sign-in time)."
echo ""
echo "If CAS_DISCORD_GUILD_ID is NOT set, the gate is disabled and nothing changes."
