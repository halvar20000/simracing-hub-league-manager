/**
 * Bulk-merge duplicate User pairs where one was created by Discord login
 * and the other was admin-pre-registered.
 *
 * Matching rule: same lower(firstName + " " + lastName), exactly one of
 * the two has a Discord Account, the other has none.
 *
 * Merge direction: the Discord-Account User is MOVED ONTO the
 * admin-pre-registered User (the one with iracingMemberId / registrations).
 * Specifically:
 *   - prisma.account → repointed userId
 *   - prisma.session → repointed userId
 *   - the Discord-only User is deleted
 *
 * That's safer for our data (registrations, results, all FKs stay where
 * they are). On next login NextAuth looks up the Account → finds it on
 * the admin User → session points to the admin User → driver can now
 * RSVP/decline because the Account's userId resolves to the user that
 * actually has the registration.
 *
 * Usage:
 *   npx tsx scripts/lm_merge_duplicate_users.ts            # dry run
 *   APPLY=1 npx tsx scripts/lm_merge_duplicate_users.ts    # apply
 */
import { prisma } from "@/lib/prisma";

const APPLY = process.env.APPLY === "1";

function normaliseName(s: string | null | undefined): string {
  if (!s) return "";
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      firstName: true,
      lastName: true,
      name: true,
      email: true,
      iracingMemberId: true,
      createdAt: true,
      _count: {
        select: {
          accounts: true,
          registrations: true,
        },
      },
    },
  });

  console.log(`Total users: ${users.length}\n`);

  // Group by normalised "firstName lastName"
  const byKey = new Map<string, typeof users>();
  for (const u of users) {
    const key = normaliseName(`${u.firstName ?? ""} ${u.lastName ?? ""}`);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(u);
  }

  type Pair = {
    name: string;
    discordUser: (typeof users)[number];
    adminUser: (typeof users)[number];
    note?: string;
  };
  const pairs: Pair[] = [];
  const ambiguous: string[] = [];

  for (const [key, group] of byKey.entries()) {
    if (group.length < 2) continue;
    const withAccount = group.filter((u) => u._count.accounts > 0);
    const withoutAccount = group.filter((u) => u._count.accounts === 0);
    if (withAccount.length === 1 && withoutAccount.length === 1) {
      pairs.push({
        name: key,
        discordUser: withAccount[0],
        adminUser: withoutAccount[0],
      });
    } else if (group.length > 1) {
      ambiguous.push(
        `${key} — ${group.length} rows, ${withAccount.length} with Account, ${withoutAccount.length} without`
      );
    }
  }

  console.log(`=== Pairs to merge (${pairs.length}) ===`);
  console.log(
    `  Each row: Discord-User → adminUser (Discord Account moves onto admin user; Discord-User row deleted)\n`
  );
  for (const p of pairs) {
    console.log(`  "${p.name}"`);
    console.log(
      `    discord: id=${p.discordUser.id}  email=${p.discordUser.email ?? "—"}  accounts=${p.discordUser._count.accounts}  registrations=${p.discordUser._count.registrations}`
    );
    console.log(
      `    admin:   id=${p.adminUser.id}  iRacing=${p.adminUser.iracingMemberId ?? "—"}  registrations=${p.adminUser._count.registrations}`
    );
  }
  console.log("");

  if (ambiguous.length > 0) {
    console.log(`=== Ambiguous (need manual review, NOT merged) ===`);
    for (const a of ambiguous) console.log(`  ${a}`);
    console.log("");
  }

  if (pairs.length === 0) {
    console.log("Nothing to merge.");
    return;
  }

  if (!APPLY) {
    console.log(
      `Dry run — no changes made. Re-run with APPLY=1 to merge ${pairs.length} pair(s).`
    );
    return;
  }

  let merged = 0;
  for (const p of pairs) {
    try {
      await prisma.$transaction([
        prisma.account.updateMany({
          where: { userId: p.discordUser.id },
          data: { userId: p.adminUser.id },
        }),
        prisma.session.updateMany({
          where: { userId: p.discordUser.id },
          data: { userId: p.adminUser.id },
        }),
        prisma.user.delete({ where: { id: p.discordUser.id } }),
      ]);
      console.log(`✓ Merged "${p.name}"`);
      merged++;
    } catch (e) {
      console.error(
        `✗ Failed "${p.name}": ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }
  console.log(`\nDone: ${merged}/${pairs.length} merged.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
