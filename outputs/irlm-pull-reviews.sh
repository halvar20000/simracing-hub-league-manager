#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"
mkdir -p outputs-tmp

# ===========================================================================
# 1. Schema: IncidentReport.irlmReviewId for dedupe
# ===========================================================================
cat > outputs-tmp/patch-schema.mjs <<'EOF'
import fs from "node:fs";
const FILE = "prisma/schema.prisma";
let s = fs.readFileSync(FILE, "utf8");
if (/irlmReviewId\s+Int\?/.test(s)) { console.log("Schema: irlmReviewId already present."); process.exit(0); }
const lines = s.split("\n");
let inModel = false, close = -1;
for (let i = 0; i < lines.length; i++) {
  if (/^model\s+IncidentReport\s*{/.test(lines[i])) { inModel = true; continue; }
  if (inModel && /^}\s*$/.test(lines[i])) { close = i; break; }
}
if (close === -1) { console.error("IncidentReport brace not found."); process.exit(1); }
lines.splice(close, 0, "  irlmReviewId Int?       @unique");
fs.writeFileSync(FILE, lines.join("\n"));
console.log("Schema: added irlmReviewId.");
EOF
node outputs-tmp/patch-schema.mjs

echo ""
echo "=== prisma db push ==="
npx --yes prisma db push --skip-generate
rm -rf node_modules/.prisma node_modules/@prisma/client .next tsconfig.tsbuildinfo
npm install @prisma/client --no-audit --no-fund
npx --yes prisma generate

# ===========================================================================
# 2. Add fetchReviews to src/lib/irlm.ts
# ===========================================================================
cat > outputs-tmp/patch-irlm.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/irlm.ts";
let s = fs.readFileSync(FILE, "utf8");
if (s.includes("fetchEventReviews")) { console.log("irlm.ts: fetchEventReviews already present."); process.exit(0); }

s += `

export interface IRLMReviewMember {
  memberId: number;
  firstName?: string;
  lastName?: string;
}

export interface IRLMReviewVote {
  id?: number;
  voteCategoryId?: number;
  voteCategoryText?: string;
  description?: string;
  memberAtFault?: IRLMReviewMember;
}

export interface IRLMReview {
  reviewId: number;
  leagueId?: number;
  seasonId?: number;
  eventId?: number;
  sessionId?: number;
  sessionName?: string;
  sessionNr?: number;
  authorName?: string;
  createdOn?: string;
  lastModifiedOn?: string;
  fullDescription?: string;
  onLap?: string | null;
  corner?: string | null;
  timeStamp?: string | null;
  incidentNr?: string | null;
  incidentKind?: string | null;
  involvedMembers?: IRLMReviewMember[];
  involvedTeams?: { teamId?: number; name?: string }[];
  resultText?: string;
  voteResults?: IRLMReviewVote[];
  reviewComments?: { id?: number; text?: string }[];
}

/** Fetch all reviews for an iRLM event. */
export async function fetchEventReviews(
  leagueName: string,
  eventId: number
): Promise<IRLMReview[]> {
  const data = await irlmFetch<unknown>(\`/\${leagueName}/Events/\${eventId}/Reviews\`);
  return Array.isArray(data) ? (data as IRLMReview[]) : [];
}
`;

fs.writeFileSync(FILE, s);
console.log("irlm.ts: fetchEventReviews appended.");
EOF
node outputs-tmp/patch-irlm.mjs

# ===========================================================================
# 3. New action: src/lib/actions/irlm-reviews-import.ts
# ===========================================================================
mkdir -p src/lib/actions
cat > src/lib/actions/irlm-reviews-import.ts <<'TS'
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSteward } from "@/lib/auth-helpers";
import { fetchEventReviews, fetchLeagueMembers, type IRLMReview } from "@/lib/irlm";

interface PullSummary {
  rounds: number;
  reviewsSeen: number;
  reviewsImported: number;
  reviewsSkippedDecided: number;
  reviewsSkippedNoMember: number;
  reviewsAlreadyExisted: number;
}

export async function pullReviewsFromIRLM(formData: FormData): Promise<void> {
  const me = await requireSteward();
  const leagueSlug = String(formData.get("leagueSlug") ?? "");
  const seasonId = String(formData.get("seasonId") ?? "");
  if (!leagueSlug || !seasonId) {
    redirect(`/admin/stewards?error=${encodeURIComponent("Missing leagueSlug or seasonId")}`);
  }

  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: {
      league: { select: { slug: true } },
      rounds: {
        where: { irlmEventId: { not: null } },
        select: { id: true, name: true, roundNumber: true, irlmEventId: true },
      },
    },
  });
  if (!season || season.league.slug !== leagueSlug) {
    redirect(`/admin/stewards?error=${encodeURIComponent("Season not found")}`);
  }
  if (!season.irlmLeagueName) {
    redirect(
      `/admin/leagues/${leagueSlug}/seasons/${seasonId}/reports?error=${encodeURIComponent(
        "Season has no irlmLeagueName configured"
      )}`
    );
  }

  // Build memberId → iRacingId map (and to display name) once.
  const irlmMembers = await fetchLeagueMembers(season.irlmLeagueName!);
  const memberToCust = new Map<number, string>();
  const memberDisplay = new Map<number, string>();
  for (const m of irlmMembers) {
    memberToCust.set(m.memberId, String(m.iRacingId));
    memberDisplay.set(m.memberId, `${m.firstname ?? ""} ${m.lastname ?? ""}`.trim());
  }

  const summary: PullSummary = {
    rounds: 0,
    reviewsSeen: 0,
    reviewsImported: 0,
    reviewsSkippedDecided: 0,
    reviewsSkippedNoMember: 0,
    reviewsAlreadyExisted: 0,
  };

  for (const round of season.rounds) {
    if (!round.irlmEventId) continue;
    summary.rounds += 1;

    let reviews: IRLMReview[] = [];
    try {
      reviews = await fetchEventReviews(season.irlmLeagueName!, round.irlmEventId);
    } catch (e) {
      console.error("[iRLM Reviews]", round.name, e);
      continue;
    }
    summary.reviewsSeen += reviews.length;

    for (const r of reviews) {
      // Filter: only open / under review (no decision yet)
      if (Array.isArray(r.voteResults) && r.voteResults.length > 0) {
        summary.reviewsSkippedDecided += 1;
        continue;
      }

      // Skip if we already have this review
      const existing = await prisma.incidentReport.findFirst({
        where: { irlmReviewId: r.reviewId },
      });
      if (existing) {
        summary.reviewsAlreadyExisted += 1;
        continue;
      }

      // Reporter: first involved member that maps to a registered driver in our season
      const involved = Array.isArray(r.involvedMembers) ? r.involvedMembers : [];
      let reporterReg: { id: string; userId: string } | null = null;
      const matchedRegs: { regId: string; userId: string }[] = [];

      for (const m of involved) {
        const cust = memberToCust.get(m.memberId);
        if (!cust) continue;
        const reg = await prisma.registration.findFirst({
          where: {
            seasonId,
            status: "APPROVED",
            user: { iracingMemberId: cust },
          },
          select: { id: true, userId: true },
        });
        if (reg) {
          matchedRegs.push({ regId: reg.id, userId: reg.userId });
          if (!reporterReg) reporterReg = reg;
        }
      }

      if (!reporterReg) {
        summary.reviewsSkippedNoMember += 1;
        continue;
      }

      // Build description with metadata + iRLM authorName for transparency.
      const descParts: string[] = [];
      if (r.fullDescription) descParts.push(r.fullDescription.trim());
      const meta: string[] = [];
      if (r.authorName) meta.push(`Reported on iRLM by ${r.authorName}`);
      if (r.sessionName) meta.push(`Session: ${r.sessionName}`);
      meta.push(`iRLM review #${r.reviewId}`);
      descParts.push("\n— " + meta.join(" • "));

      const lapNumber = r.onLap ? parseInt(String(r.onLap), 10) : null;
      const corner = (r.corner ?? "").trim() || null;
      const timeStamp = (r.timeStamp ?? "").trim() || null;

      const created = await prisma.incidentReport.create({
        data: {
          roundId: round.id,
          reporterUserId: reporterReg.userId,
          reporterRegistrationId: reporterReg.id,
          lapNumber: Number.isFinite(lapNumber) ? lapNumber : null,
          turnOrSector: corner,
          description: descParts.filter(Boolean).join("\n"),
          status: "SUBMITTED",
          submittedAt: r.createdOn ? new Date(r.createdOn) : new Date(),
          replayTimestamp: timeStamp,
          outsideRaceIncident: false,
          irlmReviewId: r.reviewId,
        },
      });

      // Tag involved drivers (skip the reporter themself)
      for (const reg of matchedRegs) {
        await prisma.incidentReportInvolvedDriver
          .create({
            data: {
              incidentReportId: created.id,
              registrationId: reg.regId,
              role: reg.regId === reporterReg.id ? "REPORTER" : "ACCUSED",
            },
          })
          .catch(() => {
            /* dup */
          });
      }

      summary.reviewsImported += 1;
    }
  }

  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/reports`);
  revalidatePath(`/admin/stewards`);

  const params = new URLSearchParams({
    pulled: String(summary.reviewsImported),
    seen: String(summary.reviewsSeen),
    skippedDecided: String(summary.reviewsSkippedDecided),
    skippedNoMember: String(summary.reviewsSkippedNoMember),
    existed: String(summary.reviewsAlreadyExisted),
    rounds: String(summary.rounds),
  });
  redirect(
    `/admin/leagues/${leagueSlug}/seasons/${seasonId}/reports?${params.toString()}`
  );
}
TS
echo "[+] Wrote src/lib/actions/irlm-reviews-import.ts"

# ===========================================================================
# 4. Patch the admin reports queue page: add the Pull-from-iRLM button + summary banner
# ===========================================================================
cat > outputs-tmp/patch-queue.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/admin/leagues/[slug]/seasons/[seasonId]/reports/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

if (s.includes("pullReviewsFromIRLM")) { console.log("Reports queue: already wired."); process.exit(0); }

// Add imports
s = s.replace(
  `import { formatDateTime } from "@/lib/date";`,
  `import { formatDateTime } from "@/lib/date";\nimport { pullReviewsFromIRLM } from "@/lib/actions/irlm-reviews-import";\nimport { SubmitWithSpinner } from "@/components/SubmitWithSpinner";`
);

// Make the page accept searchParams for the summary
const propsBefore = `export default async function AdminReportsQueue({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string }>;
}) {`;
const propsAfter = `export default async function AdminReportsQueue({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; seasonId: string }>;
  searchParams: Promise<{ pulled?: string; seen?: string; skippedDecided?: string; skippedNoMember?: string; existed?: string; rounds?: string; error?: string }>;
}) {
  const sp = await searchParams;`;
if (s.includes(propsBefore)) s = s.replace(propsBefore, propsAfter);

// Inject the pull button + summary banner after the heading.
const headingBefore = `        <h1 className="mt-2 text-2xl font-bold">Incident Reports</h1>`;
const headingAfter = `        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="mt-2 text-2xl font-bold">Incident Reports</h1>
          {season.irlmLeagueName && (
            <form action={pullReviewsFromIRLM}>
              <input type="hidden" name="leagueSlug" value={slug} />
              <input type="hidden" name="seasonId" value={seasonId} />
              <SubmitWithSpinner
                label="Pull open reports from iRLM"
                pendingLabel="Pulling from iRLM…"
                className="rounded border border-emerald-600 bg-emerald-950/40 px-3 py-1.5 text-sm font-medium text-emerald-300 hover:bg-emerald-900"
              />
            </form>
          )}
        </div>`;
if (s.includes(headingBefore)) s = s.replace(headingBefore, headingAfter);

// Add a summary banner when sp.pulled or sp.error is present, just below the heading section.
const bannerBefore = `        <p className="mt-1 text-sm text-zinc-400">`;
const bannerAfter = `        {sp.error && (
          <div className="mb-3 rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">{sp.error}</div>
        )}
        {sp.pulled != null && (
          <div className="mb-3 rounded border border-emerald-800 bg-emerald-950/40 p-3 text-xs text-emerald-200 space-y-0.5">
            <p>Imported <strong>{sp.pulled}</strong> open report{sp.pulled === "1" ? "" : "s"} from iRLM (across {sp.rounds} round{sp.rounds === "1" ? "" : "s"}).</p>
            <p className="text-emerald-300/80">
              Saw {sp.seen} review{sp.seen === "1" ? "" : "s"} in total ·
              skipped {sp.skippedDecided} already decided ·
              skipped {sp.skippedNoMember} with no roster match ·
              {sp.existed} already imported.
            </p>
          </div>
        )}
        <p className="mt-1 text-sm text-zinc-400">`;
if (s.includes(bannerBefore)) s = s.replace(bannerBefore, bannerAfter);

fs.writeFileSync(FILE, s);
console.log("Reports queue: pull button + summary wired.");
EOF
node outputs-tmp/patch-queue.mjs

rm -rf outputs-tmp

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "iRLM: pull open reviews into IncidentReports (per-season, dedupe by irlmReviewId)"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
