/**
 * Print every distinct iRacing member ID known to the league-manager
 * DB, along with the User's display name (for sanity-checking on
 * Claude's side). Output is JSON written to outputs/iracing_ids.json
 * so Claude can read the file directly and feed it to iRacing's
 * /data/member/get endpoint via the Chrome BFF proxy.
 *
 * Usage:
 *   npx tsx scripts/lm_dump_iracing_ids.ts
 *
 * Network: needs Neon (port 5432) — tether to phone hotspot at the
 * office.
 */
import { prisma } from "@/lib/prisma";
import { writeFileSync, mkdirSync } from "node:fs";

async function main() {
  const users = await prisma.user.findMany({
    where: { iracingMemberId: { not: null } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      iracingMemberId: true,
      firstName: true,
      lastName: true,
      name: true,
      iracingLastSyncedAt: true,
    },
  });

  const out = users.map((u) => ({
    userId: u.id,
    iracingMemberId: u.iracingMemberId,
    name:
      [u.firstName, u.lastName].filter(Boolean).join(" ").trim() ||
      u.name ||
      "(unnamed)",
    lastSyncedAt: u.iracingLastSyncedAt
      ? u.iracingLastSyncedAt.toISOString()
      : null,
  }));

  mkdirSync("outputs", { recursive: true });
  writeFileSync(
    "outputs/iracing_ids.json",
    JSON.stringify(out, null, 2) + "\n"
  );

  console.log(`Wrote ${out.length} driver IDs to outputs/iracing_ids.json`);
  console.log();
  console.log("Next: tell Claude 'iracing_ids.json is ready'.");
  console.log(
    "Claude will read the file, fetch member data via the Chrome MCP,"
  );
  console.log("and write outputs/iracing_irating_data.json.");
  console.log("Then run: bash outputs/run_apply_iratings.sh");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
