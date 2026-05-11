#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p scripts
cat > scripts/lm_inspect_andre_merge.ts <<'TS'
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const candidates = await prisma.user.findMany({
    where: {
      OR: [
        { iracingMemberId: "781575" },
        { email: { contains: "brechmann", mode: "insensitive" } },
        { name: { contains: "Brechmann", mode: "insensitive" } },
        {
          AND: [
            { firstName: { contains: "André", mode: "insensitive" } },
          ],
        },
        {
          AND: [
            { firstName: { contains: "Andre", mode: "insensitive" } },
            { lastName: { contains: "Brechmann", mode: "insensitive" } },
          ],
        },
      ],
    },
  });

  console.log(`\n=== ${candidates.length} candidate(s) ===\n`);

  for (const u of candidates) {
    console.log(`-- userId=${u.id} --`);
    console.log(`  firstName     : ${u.firstName ?? "—"}`);
    console.log(`  lastName      : ${u.lastName ?? "—"}`);
    console.log(`  name (display): ${u.name ?? "—"}`);
    console.log(`  email         : ${u.email ?? "—"}`);
    console.log(`  iracingMemberId: ${(u as any).iracingMemberId ?? "—"}`);
    console.log(`  role          : ${(u as any).role ?? "—"}`);
    console.log(`  isAdmin       : ${(u as any).isAdmin ?? "—"}`);
    console.log(`  createdAt     : ${(u as any).createdAt ?? "—"}`);

    const id = u.id;

    const [
      accounts,
      sessions,
      registrations,
      reports,
      decisions,
      reportComments,
      reportEvidence,
      leaguesCreated,
      csvImports,
    ] = await Promise.all([
      prisma.account.findMany({ where: { userId: id }, select: { provider: true, providerAccountId: true } }),
      prisma.session.findMany({ where: { userId: id }, select: { id: true } }),
      prisma.registration.findMany({
        where: { userId: id },
        include: {
          season: { select: { name: true, year: true, league: { select: { name: true, slug: true } } } },
        },
      }),
      prisma.incidentReport.findMany({ where: { reporterUserId: id }, select: { id: true, status: true } }),
      prisma.incidentDecision.findMany({ where: { decidedByUserId: id }, select: { id: true } }),
      prisma.incidentReportComment.findMany({ where: { authorUserId: id }, select: { id: true } }),
      prisma.incidentReportEvidence.findMany({ where: { addedByUserId: id }, select: { id: true } }),
      (prisma as any).league.findMany({ where: { createdById: id }, select: { slug: true } }).catch(() => []),
      (prisma as any).csvImport.findMany({ where: { uploadedById: id }, select: { id: true } }).catch(() => []),
    ]);

    console.log(`  Accounts      : ${accounts.length}  ${accounts.map(a => `${a.provider}:${a.providerAccountId}`).join(", ")}`);
    console.log(`  Sessions      : ${sessions.length}`);
    console.log(`  Registrations : ${registrations.length}`);
    for (const r of registrations) {
      console.log(`    - regId=${r.id}  ${r.season.league.name} / ${r.season.name} ${r.season.year}`);
    }
    console.log(`  Reports filed : ${reports.length}`);
    console.log(`  Decisions made: ${decisions.length}`);
    console.log(`  ReportComments: ${reportComments.length}`);
    console.log(`  ReportEvidence: ${reportEvidence.length}`);
    console.log(`  Leagues created: ${(leaguesCreated as any[]).length}`);
    console.log(`  CSV imports   : ${(csvImports as any[]).length}`);
    console.log("");
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
TS

npx --yes tsx scripts/lm_inspect_andre_merge.ts
