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
  providers: [
    Discord({
      authorization: { params: { scope: "identify email guilds" } },
      allowDangerousEmailAccountLinking: true,
    }),
  ],
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
      // Check CAS Discord guild membership using the OAuth access token.
      if (account?.provider === "discord" && user?.id) {
        const guildId = process.env.CAS_DISCORD_GUILD_ID;
        const accessToken = account.access_token;
        if (guildId && accessToken) {
          try {
            const res = await fetch("https://discord.com/api/users/@me/guilds", {
              headers: { Authorization: `Bearer ${accessToken}` },
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
      },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        // @ts-expect-error - role comes from our extended User model
        session.user.role = user.role;
        // @ts-expect-error - casDiscordGuildMember comes from our extended User model
        session.user.casDiscordGuildMember = (user as { casDiscordGuildMember?: boolean }).casDiscordGuildMember ?? false;
      }
      return session;
    },
  },
});
