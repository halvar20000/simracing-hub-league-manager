#!/usr/bin/env bash
# Auto-grant ADMIN role to specific Discord usernames on sign-in.
# Adds INITIAL_ADMIN_DISCORD_USERNAMES env var (comma-separated) and a
# signIn callback in Auth.js that promotes any matching username to ADMIN.

set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

# ------------------------------------------------------------
# 1. Update src/auth.ts to include the signIn callback
# ------------------------------------------------------------
echo ">>> Updating src/auth.ts..."

cat > src/auth.ts <<'EOF'
import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

function getAdminAllowlist(): string[] {
  return (process.env.INITIAL_ADMIN_DISCORD_USERNAMES ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [Discord],
  session: { strategy: "database" },
  callbacks: {
    async signIn({ user, account, profile }) {
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
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        // @ts-expect-error - role comes from our extended User model
        session.user.role = user.role;
      }
      return session;
    },
  },
});
EOF

# ------------------------------------------------------------
# 2. Append the env var to .env if not present
# ------------------------------------------------------------
echo ">>> Adding INITIAL_ADMIN_DISCORD_USERNAMES to .env..."
if grep -q "^INITIAL_ADMIN_DISCORD_USERNAMES=" .env 2>/dev/null; then
  echo "  Already present in .env. Edit manually if you need to change it."
else
  {
    echo ""
    echo "# Discord usernames (comma-separated) that auto-get ADMIN on sign-in"
    echo "INITIAL_ADMIN_DISCORD_USERNAMES=andreas_wuschnakowski"
  } >> .env
  echo "  Added: andreas_wuschnakowski"
fi

# ------------------------------------------------------------
# 3. Mirror to .env.example so it's documented in the repo
# ------------------------------------------------------------
if ! grep -q "^INITIAL_ADMIN_DISCORD_USERNAMES" .env.example 2>/dev/null; then
  {
    echo ""
    echo "# Discord usernames (comma-separated) that get ADMIN on sign-in"
    echo "INITIAL_ADMIN_DISCORD_USERNAMES="
  } >> .env.example
fi

echo ""
echo "Done."
echo ""
echo "Next steps:"
echo ""
echo "1. Restart the dev server to pick up the new env var:"
echo "   Ctrl-C in the npm run dev terminal, then npm run dev"
echo ""
echo "2. Add the same env var on Vercel (so production works too):"
echo "   Vercel project → Settings → Environment Variables → Add:"
echo "   Name:  INITIAL_ADMIN_DISCORD_USERNAMES"
echo "   Value: andreas_wuschnakowski"
echo "   Apply to: Production (and Preview if you want)."
echo "   Then redeploy (Deployments → … → Redeploy)."
echo ""
echo "3. Commit + push:"
echo "   git add -A"
echo "   git commit -m 'Auto-promote Discord usernames in INITIAL_ADMIN_DISCORD_USERNAMES to ADMIN on sign-in'"
echo "   git push"
echo ""
echo "Once deployed: when andreas_wuschnakowski signs in (first time or any"
echo "subsequent time), his role automatically becomes ADMIN. To grant admin"
echo "to more users later, just add their Discord usernames to the env var,"
echo "comma-separated."
