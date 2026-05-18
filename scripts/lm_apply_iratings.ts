/**
 * Read outputs/iracing_irating_data.json (produced by Claude after a
 * Chrome-MCP fetch from iRacing's /data/member/get?include_licenses=
 * true endpoint) and update each User row with their latest iRating /
 * Safety Rating / license class for Sports Car, Formula Car, and Oval.
 *
 * Expected JSON shape (matches what Claude writes):
 *   [
 *     {
 *       "iracingMemberId": "1135701",
 *       "name": "Danny Platzer",
 *       "categories": {
 *         "sports_car":   { "irating": 1505, "safetyRating": 2.86, "licenseClass": "Rookie" },
 *         "formula_car":  null,
 *         "oval":         { "irating": null, "safetyRating": 2.50, "licenseClass": "Rookie" }
 *       }
 *     },
 *     ...
 *   ]
 *
 * Categories may be null (driver never raced) or have any subset of
 * the three fields populated.
 *
 * Step 1 (dry run): bash outputs/run_apply_iratings.sh
 * Step 2 (apply):   APPLY=1 bash outputs/run_apply_iratings.sh
 *
 * Needs Postgres 5432 → use phone hotspot at the office.
 */
import { prisma } from "@/lib/prisma";
import { readFileSync, existsSync } from "node:fs";

const APPLY = process.env.APPLY === "1";

interface CategoryStats {
  irating: number | null;
  safetyRating: number | null;
  licenseClass: string | null;
}
interface MemberRow {
  iracingMemberId: string;
  name?: string;
  categories: {
    sports_car?: CategoryStats | null;
    formula_car?: CategoryStats | null;
    oval?: CategoryStats | null;
  };
}

async function main() {
  const inputPath = "outputs/iracing_irating_data.json";
  if (!existsSync(inputPath)) {
    console.error(
      `Missing ${inputPath}. Ask Claude to write it after the Chrome fetch.`
    );
    process.exit(1);
  }

  const raw = readFileSync(inputPath, "utf-8");
  const rows = JSON.parse(raw) as MemberRow[];
  console.log(
    `Loaded ${rows.length} member rows from ${inputPath} (apply=${APPLY ? "YES" : "DRY"}).`
  );

  let matched = 0;
  let updated = 0;
  let skipped = 0;
  const now = new Date();

  for (const row of rows) {
    const user = await prisma.user.findFirst({
      where: { iracingMemberId: row.iracingMemberId },
      select: { id: true, firstName: true, lastName: true, name: true },
    });
    if (!user) {
      skipped++;
      console.log(
        `  ✗ ${row.iracingMemberId} (${row.name ?? "?"}) — no matching User`
      );
      continue;
    }
    matched++;

    const sc = row.categories.sports_car ?? null;
    const fc = row.categories.formula_car ?? null;
    const ov = row.categories.oval ?? null;

    const displayName =
      [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
      user.name ||
      row.name ||
      row.iracingMemberId;

    const summary = [
      sc ? `SC ${sc.irating ?? "—"} ${sc.safetyRating ?? "—"}` : null,
      fc ? `F ${fc.irating ?? "—"} ${fc.safetyRating ?? "—"}` : null,
      ov ? `O ${ov.irating ?? "—"} ${ov.safetyRating ?? "—"}` : null,
    ]
      .filter(Boolean)
      .join(" / ");

    console.log(`  ${displayName.padEnd(28)}  ${summary}`);

    if (!APPLY) continue;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        iratingSportsCar: sc?.irating ?? null,
        iratingFormulaCar: fc?.irating ?? null,
        iratingOval: ov?.irating ?? null,
        safetyRatingSportsCar: sc?.safetyRating ?? null,
        safetyRatingFormulaCar: fc?.safetyRating ?? null,
        safetyRatingOval: ov?.safetyRating ?? null,
        licenseClassSportsCar: sc?.licenseClass ?? null,
        licenseClassFormulaCar: fc?.licenseClass ?? null,
        licenseClassOval: ov?.licenseClass ?? null,
        iracingLastSyncedAt: now,
      },
    });
    updated++;
  }

  console.log();
  console.log(
    `Matched ${matched}, updated ${updated}, no-match ${skipped} of ${rows.length}.`
  );
  if (!APPLY) {
    console.log("Dry run — re-run with APPLY=1 to commit changes.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
