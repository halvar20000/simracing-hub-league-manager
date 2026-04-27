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
