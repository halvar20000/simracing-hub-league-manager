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
      // Auto-link freshly-created Discord users onto an existing
      // admin-registered User if their first+last name matches exactly
      // one such user that doesn't have a Discord Account yet.
      // Prevents duplicate User rows when an admin pre-registers a driver
      // (with iRacing ID / registration) and the driver later signs in
      // via Discord for the first time.
      if (account?.provider === "discord" && user?.id) {
        try {
          const justCreated = await prisma.user.findUnique({
            where: { id: user.id },
            select: {
              firstName: true,
              lastName: true,
              name: true,
              _count: {
                select: {
                  registrations: true,
                  incidentReports: true,
                  approvedRegistrations: true,
                },
              },
            },
          });
          const isFreshUser =
            !!justCreated &&
            justCreated._count.registrations === 0 &&
            justCreated._count.incidentReports === 0 &&
            justCreated._count.approvedRegistrations === 0;
          if (isFreshUser) {
            const dn =
              (profile as { global_name?: string; username?: string } | null) ??
              {};
            const candidates = [
              `${justCreated.firstName ?? ""} ${justCreated.lastName ?? ""}`,
              justCreated.name ?? "",
              dn.global_name ?? "",
              dn.username ?? "",
            ]
              .map((s) => s.trim().toLowerCase().replace(/\s+/g, " "))
              .filter((s) => s.length > 1);
            if (candidates.length > 0) {
              const others = await prisma.user.findMany({
                where: { id: { not: user.id }, accounts: { none: {} } },
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  name: true,
                },
              });
              const normalise = (s: string | null | undefined) =>
                (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
              const matches = others.filter((o) => {
                const compare = [
                  normalise(`${o.firstName ?? ""} ${o.lastName ?? ""}`),
                  normalise(o.name),
                ].filter((x) => x.length > 1);
                return compare.some((c) => candidates.includes(c));
              });
              if (matches.length === 1) {
                const target = matches[0];
                await prisma.$transaction([
                  prisma.account.updateMany({
                    where: { userId: user.id },
                    data: { userId: target.id },
                  }),
                  prisma.session.updateMany({
                    where: { userId: user.id },
                    data: { userId: target.id },
                  }),
                  prisma.user.delete({ where: { id: user.id } }),
                ]);
                user.id = target.id;
              }
            }
          }
        } catch {
          // Auto-link is best-effort; never block sign-in.
        }
      }

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
