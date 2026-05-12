#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== Current auth.ts (top to providers block) ==="
sed -n '1,40p' src/auth.ts

mkdir -p outputs-tmp
cat > outputs-tmp/patch.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/auth.ts";
let s = fs.readFileSync(FILE, "utf8");

let changed = false;

// 1. Replace bare Discord with Discord({ authorization: ... })
if (!s.includes("identify guilds")) {
  // Match `providers: [Discord]` OR `providers: [Discord,]` etc.
  const re = /providers:\s*\[\s*Discord\s*\]/;
  if (!re.test(s)) {
    console.error("Could not find 'providers: [Discord]' to patch.");
    process.exit(1);
  }
  s = s.replace(re, `providers: [
    Discord({
      authorization: { params: { scope: "identify guilds" } },
    }),
  ]`);
  changed = true;
  console.log("Patched: Discord provider now requests 'identify guilds' scope.");
} else {
  console.log("Discord provider already requests guilds scope.");
}

// 2. Extend signIn callback with guild membership check.
if (!s.includes("CAS_DISCORD_GUILD_ID")) {
  // Insert just before `return true;` of the signIn callback.
  const re = /(async signIn\(\{[\s\S]*?\}\)\s*\{[\s\S]*?)\n(\s*)return true;\n(\s*)\},/;
  if (!re.test(s)) {
    console.error("Could not find signIn callback's `return true`.");
    process.exit(1);
  }
  s = s.replace(re, (m, head, indent, _close) => {
    return head + "\n" + indent + `// Check CAS Discord guild membership using the OAuth access token.
${indent}if (account?.provider === "discord" && user?.id) {
${indent}  const guildId = process.env.CAS_DISCORD_GUILD_ID;
${indent}  const accessToken = account.access_token;
${indent}  if (guildId && accessToken) {
${indent}    try {
${indent}      const res = await fetch("https://discord.com/api/users/@me/guilds", {
${indent}        headers: { Authorization: \`Bearer \${accessToken}\` },
${indent}      });
${indent}      if (res.ok) {
${indent}        const guilds = (await res.json()) as Array<{ id: string }>;
${indent}        const isMember = Array.isArray(guilds) && guilds.some((g) => g?.id === guildId);
${indent}        await prisma.user.update({
${indent}          where: { id: user.id },
${indent}          data: { casDiscordGuildMember: isMember },
${indent}        });
${indent}      }
${indent}    } catch {
${indent}      // Silent — never block sign-in on a Discord API hiccup.
${indent}    }
${indent}  }
${indent}}
${indent}return true;\n${indent}},`;
  });
  changed = true;
  console.log("Patched: signIn callback now checks CAS guild membership.");
} else {
  console.log("signIn callback already has guild check.");
}

// 3. Surface casDiscordGuildMember on session
if (!s.includes("session.user.casDiscordGuildMember")) {
  const re = /(async session\(\{ session, user \}\) \{[\s\S]*?session\.user\.role = user\.role;)/;
  if (re.test(s)) {
    s = s.replace(re, `$1
        // @ts-expect-error - casDiscordGuildMember comes from our extended User model
        session.user.casDiscordGuildMember = (user as { casDiscordGuildMember?: boolean }).casDiscordGuildMember ?? false;`);
    changed = true;
    console.log("Patched: session callback exposes casDiscordGuildMember.");
  }
}

if (changed) {
  fs.writeFileSync(FILE, s);
}
EOF
node outputs-tmp/patch.mjs
rm -rf outputs-tmp

echo ""
echo "=== Updated auth.ts (sanity check) ==="
sed -n '1,80p' src/auth.ts

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "Auth: actually apply the guilds-scope + guild-membership signIn check"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "After deploy: sign out, sign in. Discord MAY ask for the new scope; if not,"
echo "go to https://discord.com/settings/authorized-apps → revoke the league-manager"
echo "app → sign in again → consent screen will reappear with 'See your servers'."
