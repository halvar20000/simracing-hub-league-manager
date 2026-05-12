#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"
mkdir -p outputs-tmp

# ===========================================================================
# 1. Schema: IncidentReport.irlmProtestId
# ===========================================================================
cat > outputs-tmp/patch-schema.mjs <<'EOF'
import fs from "node:fs";
const FILE = "prisma/schema.prisma";
let s = fs.readFileSync(FILE, "utf8");
if (/irlmProtestId\s+Int\?/.test(s)) { console.log("Schema: irlmProtestId already present."); process.exit(0); }
const lines = s.split("\n");
let inModel = false, close = -1;
for (let i = 0; i < lines.length; i++) {
  if (/^model\s+IncidentReport\s*{/.test(lines[i])) { inModel = true; continue; }
  if (inModel && /^}\s*$/.test(lines[i])) { close = i; break; }
}
if (close === -1) { console.error("IncidentReport brace not found."); process.exit(1); }
lines.splice(close, 0, "  irlmProtestId Int?      @unique");
fs.writeFileSync(FILE, lines.join("\n"));
console.log("Schema: added irlmProtestId.");
EOF
node outputs-tmp/patch-schema.mjs

echo ""
echo "=== prisma db push ==="
npx --yes prisma db push --skip-generate
rm -rf node_modules/.prisma node_modules/@prisma/client .next tsconfig.tsbuildinfo
npm install @prisma/client --no-audit --no-fund
npx --yes prisma generate

# ===========================================================================
# 2. Add fetchEventProtests to src/lib/irlm.ts
# ===========================================================================
cat > outputs-tmp/patch-irlm.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/irlm.ts";
let s = fs.readFileSync(FILE, "utf8");
if (s.includes("fetchEventProtests")) { console.log("irlm.ts: fetchEventProtests already present."); process.exit(0); }

s += `

export interface IRLMProtestMember {
  memberId: number;
  firstName?: string;
  lastName?: string;
}

export interface IRLMProtest {
  protestId: number;
  eventId?: number;
  sessionId?: number;
  sessionNr?: number;
  sessionName?: string;
  author?: IRLMProtestMember;
  fullDescription?: string;
  onLap?: string | null;
  corner?: string | null;
  involvedMembers?: IRLMProtestMember[];
}

/** Fetch all open protests for an iRLM event. */
export async function fetchEventProtests(
  leagueName: string,
  eventId: number
): Promise<IRLMProtest[]> {
  const data = await irlmFetch<unknown>(\`/\${leagueName}/Events/\${eventId}/Protests\`);
  return Array.isArray(data) ? (data as IRLMProtest[]) : [];
}
`;

fs.writeFileSync(FILE, s);
console.log("irlm.ts: fetchEventProtests appended.");
EOF
node outputs-tmp/patch-irlm.mjs

# ===========================================================================
# 3. Extend pullReviewsFromIRLM to also pull protests
# ===========================================================================
cat > outputs-tmp/patch-pull.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/actions/irlm-reviews-import.ts";
let s = fs.readFileSync(FILE, "utf8");

if (s.includes("fetchEventProtests")) { console.log("Action: protest pull already wired."); process.exit(0); }

// Update the import line to also bring in fetchEventProtests + type
s = s.replace(
  `import { fetchEventReviews, fetchLeagueMembers, type IRLMReview } from "@/lib/irlm";`,
  `import { fetchEventReviews, fetchEventProtests, fetchLeagueMembers, type IRLMReview, type IRLMProtest } from "@/lib/irlm";`
);

// Extend the summary type to include protest counts
s = s.replace(
  `interface PullSummary {
  rounds: number;
  reviewsSeen: number;
  reviewsImported: number;
  reviewsSkippedDecided: number;
  reviewsSkippedNoMember: number;
  reviewsAlreadyExisted: number;
}`,
  `interface PullSummary {
  rounds: number;
  reviewsSeen: number;
  reviewsImported: number;
  reviewsSkippedDecided: number;
  reviewsSkippedNoMember: number;
  reviewsAlreadyExisted: number;
  protestsSeen: number;
  protestsImported: number;
  protestsSkippedNoMember: number;
  protestsAlreadyExisted: number;
}`
);

// Init the new fields
s = s.replace(
  `  const summary: PullSummary = {
    rounds: 0,
    reviewsSeen: 0,
    reviewsImported: 0,
    reviewsSkippedDecided: 0,
    reviewsSkippedNoMember: 0,
    reviewsAlreadyExisted: 0,
  };`,
  `  const summary: PullSummary = {
    rounds: 0,
    reviewsSeen: 0,
    reviewsImported: 0,
    reviewsSkippedDecided: 0,
    reviewsSkippedNoMember: 0,
    reviewsAlreadyExisted: 0,
    protestsSeen: 0,
    protestsImported: 0,
    protestsSkippedNoMember: 0,
    protestsAlreadyExisted: 0,
  };`
);

// Add the protest fetch + import block at the end of each round iteration.
// Find the closing `}` of `for (const r of reviews) { ... }` and inject before
// the round loop's closing brace.
const before = `      summary.reviewsImported += 1;
    }
  }`;
const after = `      summary.reviewsImported += 1;
    }

    // ---------- PROTESTS ----------
    let protests: IRLMProtest[] = [];
    try {
      protests = await fetchEventProtests(season.irlmLeagueName!, round.irlmEventId);
    } catch (e) {
      console.error("[iRLM Protests]", round.name, e);
    }
    summary.protestsSeen += protests.length;

    for (const pr of protests) {
      const existing = await prisma.incidentReport.findFirst({
        where: { irlmProtestId: pr.protestId },
      });
      if (existing) {
        summary.protestsAlreadyExisted += 1;
        continue;
      }

      // Reporter from author.memberId
      const authorMemberId = pr.author?.memberId;
      const authorCust = authorMemberId != null ? memberToCust.get(authorMemberId) : undefined;
      let reporterReg: { id: string; userId: string } | null = null;
      if (authorCust) {
        const reg = await prisma.registration.findFirst({
          where: { seasonId, status: "APPROVED", user: { iracingMemberId: authorCust } },
          select: { id: true, userId: true },
        });
        if (reg) reporterReg = reg;
      }
      if (!reporterReg) {
        summary.protestsSkippedNoMember += 1;
        continue;
      }

      // Accused from involvedMembers
      const involved = Array.isArray(pr.involvedMembers) ? pr.involvedMembers : [];
      const accusedRegs: { regId: string; userId: string }[] = [];
      for (const m of involved) {
        const cust = memberToCust.get(m.memberId);
        if (!cust) continue;
        const reg = await prisma.registration.findFirst({
          where: { seasonId, status: "APPROVED", user: { iracingMemberId: cust } },
          select: { id: true, userId: true },
        });
        if (reg) accusedRegs.push({ regId: reg.id, userId: reg.userId });
      }

      const descParts: string[] = [];
      if (pr.fullDescription) descParts.push(pr.fullDescription.trim());
      const meta: string[] = [];
      const authorName = pr.author ? \`\${pr.author.firstName ?? ""} \${pr.author.lastName ?? ""}\`.trim() : null;
      if (authorName) meta.push(\`Protest by \${authorName}\`);
      if (pr.sessionName) meta.push(\`Session: \${pr.sessionName}\`);
      meta.push(\`iRLM protest #\${pr.protestId}\`);
      descParts.push("\\n— " + meta.join(" • "));

      const lapNumber = pr.onLap ? parseInt(String(pr.onLap), 10) : null;
      const corner = (pr.corner ?? "").trim() || null;

      const created = await prisma.incidentReport.create({
        data: {
          roundId: round.id,
          reporterUserId: reporterReg.userId,
          reporterRegistrationId: reporterReg.id,
          lapNumber: Number.isFinite(lapNumber) ? lapNumber : null,
          turnOrSector: corner,
          description: descParts.filter(Boolean).join("\\n"),
          status: "SUBMITTED",
          submittedAt: new Date(),
          outsideRaceIncident: false,
          irlmProtestId: pr.protestId,
        },
      });

      // Reporter as REPORTER
      await prisma.incidentReportInvolvedDriver
        .create({
          data: {
            incidentReportId: created.id,
            registrationId: reporterReg.id,
            role: "REPORTER",
          },
        })
        .catch(() => { /* dup */ });
      // Involved as ACCUSED
      for (const a of accusedRegs) {
        if (a.regId === reporterReg.id) continue;
        await prisma.incidentReportInvolvedDriver
          .create({
            data: {
              incidentReportId: created.id,
              registrationId: a.regId,
              role: "ACCUSED",
            },
          })
          .catch(() => { /* dup */ });
      }

      summary.protestsImported += 1;
    }
  }`;

if (!s.includes(before)) { console.error("Anchor for review-loop end not found."); process.exit(1); }
s = s.replace(before, after);

// Update the redirect query string to include protest counts.
const qBefore = `  const params = new URLSearchParams({
    pulled: String(summary.reviewsImported),
    seen: String(summary.reviewsSeen),
    skippedDecided: String(summary.reviewsSkippedDecided),
    skippedNoMember: String(summary.reviewsSkippedNoMember),
    existed: String(summary.reviewsAlreadyExisted),
    rounds: String(summary.rounds),
  });`;
const qAfter = `  const params = new URLSearchParams({
    pulled: String(summary.reviewsImported + summary.protestsImported),
    pulledReviews: String(summary.reviewsImported),
    pulledProtests: String(summary.protestsImported),
    seen: String(summary.reviewsSeen + summary.protestsSeen),
    seenReviews: String(summary.reviewsSeen),
    seenProtests: String(summary.protestsSeen),
    skippedDecided: String(summary.reviewsSkippedDecided),
    skippedNoMember: String(summary.reviewsSkippedNoMember + summary.protestsSkippedNoMember),
    existed: String(summary.reviewsAlreadyExisted + summary.protestsAlreadyExisted),
    rounds: String(summary.rounds),
  });`;
s = s.replace(qBefore, qAfter);

fs.writeFileSync(FILE, s);
console.log("Action: protest pull wired.");
EOF
node outputs-tmp/patch-pull.mjs

# ===========================================================================
# 4. Update the queue page button label + summary banner
# ===========================================================================
cat > outputs-tmp/patch-queue.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/admin/leagues/[slug]/seasons/[seasonId]/reports/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// Update the button label to mention both
s = s.replace(
  `                label="Pull open reports from iRLM"
                pendingLabel="Pulling from iRLM…"`,
  `                label="Pull from iRLM (reviews + protests)"
                pendingLabel="Pulling from iRLM…"`
);

// Extend the summary banner with protest counts.
s = s.replace(
  `        {sp.pulled != null && (
          <div className="mb-3 rounded border border-emerald-800 bg-emerald-950/40 p-3 text-xs text-emerald-200 space-y-0.5">
            <p>Imported <strong>{sp.pulled}</strong> open report{sp.pulled === "1" ? "" : "s"} from iRLM (across {sp.rounds} round{sp.rounds === "1" ? "" : "s"}).</p>
            <p className="text-emerald-300/80">
              Saw {sp.seen} review{sp.seen === "1" ? "" : "s"} in total ·
              skipped {sp.skippedDecided} already decided ·
              skipped {sp.skippedNoMember} with no roster match ·
              {sp.existed} already imported.
            </p>
          </div>
        )}`,
  `        {sp.pulled != null && (
          <div className="mb-3 rounded border border-emerald-800 bg-emerald-950/40 p-3 text-xs text-emerald-200 space-y-0.5">
            <p>
              Imported <strong>{sp.pulled}</strong> from iRLM —
              {sp.pulledReviews ?? "?"} review{sp.pulledReviews === "1" ? "" : "s"}
              + {sp.pulledProtests ?? "?"} protest{sp.pulledProtests === "1" ? "" : "s"}
              (across {sp.rounds} round{sp.rounds === "1" ? "" : "s"}).
            </p>
            <p className="text-emerald-300/80">
              Saw {sp.seen} total ({sp.seenReviews ?? "?"} reviews + {sp.seenProtests ?? "?"} protests) ·
              skipped {sp.skippedDecided} already decided ·
              skipped {sp.skippedNoMember} with no roster match ·
              {sp.existed} already imported.
            </p>
          </div>
        )}`
);

// Extend the searchParams type to include the new fields
s = s.replace(
  `  searchParams: Promise<{ pulled?: string; seen?: string; skippedDecided?: string; skippedNoMember?: string; existed?: string; rounds?: string; error?: string }>;`,
  `  searchParams: Promise<{ pulled?: string; pulledReviews?: string; pulledProtests?: string; seen?: string; seenReviews?: string; seenProtests?: string; skippedDecided?: string; skippedNoMember?: string; existed?: string; rounds?: string; error?: string }>;`
);

fs.writeFileSync(FILE, s);
console.log("Queue page: protest summary wired.");
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
git commit -m "iRLM: also pull /Protests (open by definition) into IncidentReports; dedupe via irlmProtestId"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
