/**
 * Set the SFL Cup discordEmbedColor to Discord-pink (#EB459E).
 *
 * Usage:
 *   npx tsx scripts/lm_set_sfl_embed_color.ts            # dry run
 *   APPLY=1 npx tsx scripts/lm_set_sfl_embed_color.ts    # apply
 */
import { prisma } from "@/lib/prisma";

const APPLY = process.env.APPLY === "1";
const TARGET = "#EB459E";

async function main() {
  const league = await prisma.league.findUnique({
    where: { slug: "cas-sfl-cup" },
    select: { id: true, name: true, discordEmbedColor: true },
  });
  if (!league) throw new Error("League cas-sfl-cup not found");

  console.log(`League: ${league.name}`);
  console.log(`  current discordEmbedColor: ${league.discordEmbedColor ?? "(unset)"}`);
  console.log(`  target  discordEmbedColor: ${TARGET}`);

  if (league.discordEmbedColor === TARGET) {
    console.log("\nAlready at target — nothing to do.");
    return;
  }

  if (!APPLY) {
    console.log("\nDry run — re-run with APPLY=1 to commit.");
    return;
  }

  await prisma.league.update({
    where: { id: league.id },
    data: { discordEmbedColor: TARGET },
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
