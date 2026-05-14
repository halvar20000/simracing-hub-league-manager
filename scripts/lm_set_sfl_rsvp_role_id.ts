/**
 * Set the SFL Cup league's discordRsvpRoleId so the next RSVP post pings
 * @SFL-Driver. Other leagues unaffected.
 *
 * Usage:
 *   npx tsx scripts/lm_set_sfl_rsvp_role_id.ts            # dry run
 *   APPLY=1 npx tsx scripts/lm_set_sfl_rsvp_role_id.ts    # apply
 */
import { prisma } from "@/lib/prisma";

const APPLY = process.env.APPLY === "1";
const SFL_DRIVER_ROLE_ID = "1224317904145616946";

async function main() {
  const league = await prisma.league.findUnique({
    where: { slug: "cas-sfl-cup" },
    select: { id: true, name: true, discordRsvpRoleId: true },
  });
  if (!league) throw new Error("League cas-sfl-cup not found");

  console.log(`League: ${league.name}`);
  console.log(`  current discordRsvpRoleId: ${league.discordRsvpRoleId ?? "(unset)"}`);
  console.log(`  target  discordRsvpRoleId: ${SFL_DRIVER_ROLE_ID}`);

  if (league.discordRsvpRoleId === SFL_DRIVER_ROLE_ID) {
    console.log("\nAlready at target — nothing to do.");
    return;
  }

  if (!APPLY) {
    console.log("\nDry run — re-run with APPLY=1 to commit.");
    return;
  }

  await prisma.league.update({
    where: { id: league.id },
    data: { discordRsvpRoleId: SFL_DRIVER_ROLE_ID },
  });
  console.log("✓ Updated.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
