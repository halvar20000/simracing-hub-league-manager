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
  return s
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, " ") // drop "[TAG]" prefixes
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Build a small set of normalised name candidates for a user.
 * Covers: firstName+lastName (admin-imported pattern), name (Discord
 * display name pattern), name with [TAG] stripped.
 */
function nameCandidates(u: {
  firstName: string | null;
  lastName: string | null;
  name: string | null;
}): Set<string> {
  const out = new Set<string>();
  const add = (s: string) => {
    const n = normaliseName(s);
    if (n.length > 1) out.add(n);
  };
  add(`${u.firstName ?? ""} ${u.lastName ?? ""}`);
  add(u.name ?? "");
  return out;
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

  // Build a per-user candidate set. Then for each Discord-Account user,
  // find admin (no Account) users whose candidates overlap.
  const candidatesByUser = new Map<string, Set<string>>();
  for (const u of users) candidatesByUser.set(u.id, nameCandidates(u));

  const discordUsers = users.filter((u) => u._count.accounts > 0);
  const adminUsers = users.filter((u) => u._count.accounts === 0);

  type Pair = {
    name: string;
    discordUser: (typeof users)[number];
    adminUser: (typeof users)[number];
  };
  const pairs: Pair[] = [];
  const ambiguous: string[] = [];

  for (const d of discordUsers) {
    const dCands = candidatesByUser.get(d.id) ?? new Set<string>();
    if (dCands.size === 0) continue;
    const matches: typeof adminUsers = [];
    for (const a of adminUsers) {
      const aCands = candidatesByUser.get(a.id) ?? new Set<string>();
      for (const c of dCands) {
        if (aCands.has(c)) {
          matches.push(a);
          break;
        }
      }
    }
    const displayName =
      [...dCands][0] ?? d.name ?? `${d.firstName ?? ""} ${d.lastName ?? ""}`;
    if (matches.length === 1) {
      pairs.push({ name: displayName, discordUser: d, adminUser: matches[0] });
    } else if (matches.length > 1) {
      ambiguous.push(
        `${displayName} — Discord user ${d.id} matches ${matches.length} admin users: ${matches
          .map((m) => `${m.id} (${m.firstName ?? ""} ${m.lastName ?? ""}, name=${m.name ?? "—"})`)
          .join("; ")}`
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

  const PLACEHOLDER_RE = /^iracing-\d+@imported\.simracing-hub\.com$/i;
  let merged = 0;
  for (const p of pairs) {
    try {
      // If the admin user's email is a placeholder and the Discord user has
      // a real one, move the real email onto the admin record.
      const discordEmail = p.discordUser.email;
      const adminEmail = p.adminUser.email;
      const adminEmailIsPlaceholder =
        !adminEmail || PLACEHOLDER_RE.test(adminEmail);
      const shouldMoveEmail =
        !!discordEmail &&
        !PLACEHOLDER_RE.test(discordEmail) &&
        adminEmailIsPlaceholder;

      const ops = [
        // Clear the Discord user's email first to free the unique constraint
        // before we copy it onto the admin record.
        ...(shouldMoveEmail
          ? [
              prisma.user.update({
                where: { id: p.discordUser.id },
                data: { email: null },
              }),
              prisma.user.update({
                where: { id: p.adminUser.id },
                data: { email: discordEmail },
              }),
            ]
          : []),
        prisma.account.updateMany({
          where: { userId: p.discordUser.id },
          data: { userId: p.adminUser.id },
        }),
        prisma.session.updateMany({
          where: { userId: p.discordUser.id },
          data: { userId: p.adminUser.id },
        }),
        prisma.user.delete({ where: { id: p.discordUser.id } }),
      ];
      await prisma.$transaction(ops);
      console.log(
        `✓ Merged "${p.name}"${shouldMoveEmail ? `  (email → ${discordEmail})` : ""}`
      );
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
