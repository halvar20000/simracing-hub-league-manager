#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ============================================================================
# 1. Create /admin/links page
# ============================================================================
echo "=== 1. Create /admin/links page ==="
mkdir -p src/app/admin/links
PAGE='src/app/admin/links/page.tsx'
if [ -f "$PAGE" ]; then
  echo "  Already exists — leaving alone."
else
cat > "$PAGE" <<'TSX'
import { requireSteward } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import CopyTextButton from "@/components/CopyTextButton";

const STATUS_TONE: Record<string, string> = {
  OPEN_REGISTRATION:
    "border-emerald-700/40 bg-emerald-950/30 text-emerald-200",
  ACTIVE: "border-blue-700/40 bg-blue-950/30 text-blue-200",
  COMPLETED: "border-zinc-700 bg-zinc-900/50 text-zinc-400",
  ARCHIVED: "border-zinc-800 bg-zinc-950 text-zinc-500",
};

const STATUS_LABEL: Record<string, string> = {
  OPEN_REGISTRATION: "OPEN",
  ACTIVE: "ACTIVE",
  COMPLETED: "DONE",
  ARCHIVED: "ARCHIVED",
};

export default async function AdminLinksPage() {
  await requireSteward();

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    process.env.NEXTAUTH_URL ??
    "https://league.simracing-hub.com";

  const leagues = await prisma.league.findMany({
    orderBy: { name: "asc" },
    include: {
      seasons: {
        where: { status: { not: "DRAFT" } },
        orderBy: [{ year: "desc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          year: true,
          status: true,
          registrationToken: true,
        },
      },
    },
  });

  const leaguesWithSeasons = leagues.filter((l) => l.seasons.length > 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Useful Links</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Copy any URL with the Copy button — paste straight into Discord, it
          auto-embeds. Greyed-out sections are completed seasons.
        </p>
      </div>

      {/* === Top-level === */}
      <section>
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-zinc-500">
          Top-level
        </h2>
        <div className="space-y-1.5 rounded border border-zinc-800 bg-zinc-900/40 p-3">
          <LinkRow label="Public homepage" url={`${baseUrl}/`} />
          <LinkRow label="All rosters" url={`${baseUrl}/rosters`} />
          <LinkRow label="All leagues" url={`${baseUrl}/leagues`} />
          <LinkRow label="Admin dashboard" url={`${baseUrl}/admin`} />
        </div>
      </section>

      {leaguesWithSeasons.map((league) => (
        <section key={league.id}>
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-zinc-500">
            {league.name}
          </h2>

          <div className="space-y-1.5 rounded border border-zinc-800 bg-zinc-900/40 p-3">
            <LinkRow
              label="Public league page"
              url={`${baseUrl}/leagues/${league.slug}`}
            />
            <LinkRow
              label="Admin league page"
              url={`${baseUrl}/admin/leagues/${league.slug}`}
            />
          </div>

          <div className="mt-3 space-y-3">
            {league.seasons.map((s) => {
              const isCompleted =
                s.status === "COMPLETED" || s.status === "ARCHIVED";
              const tone = STATUS_TONE[s.status] ?? STATUS_TONE.ARCHIVED;
              const label = STATUS_LABEL[s.status] ?? s.status;
              const seasonBase = `${baseUrl}/leagues/${league.slug}/seasons/${s.id}`;
              const adminBase = `${baseUrl}/admin/leagues/${league.slug}/seasons/${s.id}`;
              const regUrl = s.registrationToken
                ? `${seasonBase}/register?t=${s.registrationToken}`
                : `${seasonBase}/register`;

              return (
                <div
                  key={s.id}
                  className={`rounded border p-3 ${
                    isCompleted
                      ? "border-zinc-800 bg-zinc-950/50"
                      : "border-zinc-700 bg-zinc-900"
                  }`}
                >
                  <div
                    className={`mb-2 flex items-center gap-2 text-sm ${
                      isCompleted ? "text-zinc-500" : "text-zinc-200"
                    }`}
                  >
                    <span className="font-semibold">
                      {s.name} {s.year}
                    </span>
                    <span
                      className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone}`}
                    >
                      {label}
                    </span>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <p
                        className={`mb-1 text-[10px] font-semibold uppercase tracking-wider ${
                          isCompleted ? "text-zinc-600" : "text-zinc-500"
                        }`}
                      >
                        Public
                      </p>
                      <div className="space-y-1">
                        <LinkRow
                          label="Season detail"
                          url={seasonBase}
                          muted={isCompleted}
                        />
                        <LinkRow
                          label="Roster"
                          url={`${seasonBase}/roster`}
                          muted={isCompleted}
                        />
                        <LinkRow
                          label="Statistics"
                          url={`${seasonBase}/stats`}
                          muted={isCompleted}
                        />
                        {!isCompleted && (
                          <LinkRow
                            label="Registration"
                            url={regUrl}
                            muted={isCompleted}
                          />
                        )}
                      </div>
                    </div>

                    <div>
                      <p
                        className={`mb-1 text-[10px] font-semibold uppercase tracking-wider ${
                          isCompleted ? "text-zinc-600" : "text-zinc-500"
                        }`}
                      >
                        Admin
                      </p>
                      <div className="space-y-1">
                        <LinkRow
                          label="Season admin"
                          url={adminBase}
                          muted={isCompleted}
                        />
                        <LinkRow
                          label="Roster admin"
                          url={`${adminBase}/roster`}
                          muted={isCompleted}
                        />
                        <LinkRow
                          label="Pro/Am calculator"
                          url={`${adminBase}/pro-am`}
                          muted={isCompleted}
                        />
                        <LinkRow
                          label="Cars"
                          url={`${adminBase}/cars`}
                          muted={isCompleted}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function LinkRow({
  label,
  url,
  muted,
}: {
  label: string;
  url: string;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex flex-wrap items-center gap-2 ${
        muted ? "opacity-60" : ""
      }`}
    >
      <span className="w-36 shrink-0 text-xs text-zinc-400">{label}</span>
      <code className="min-w-0 flex-1 truncate rounded bg-zinc-950 px-2 py-1 font-mono text-xs text-zinc-300">
        {url}
      </code>
      <CopyTextButton text={url} label="Copy" />
    </div>
  );
}
TSX
  echo "  Created."
fi

# ============================================================================
# 2. Add 'Links' tab to AdminTabs
# ============================================================================
echo ""
echo "=== 2. Add Links tab to AdminTabs ==="
node -e "
const fs = require('fs');
const FILE = 'src/components/AdminTabs.tsx';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;
if (s.includes('href=\"/admin/links\"')) {
  console.log('  Already wired.');
  process.exit(0);
}
// Insert a Links tab right after the Stewards tab
s = s.replace(
  /(<Tab\s*\n\s*href=\"\/admin\/stewards\"\s*\n\s*active=\{isActive\(\"\/admin\/stewards\"\)\}\s*\n\s*>[\s\S]*?<\/Tab>)/,
  \`\$1
      <Tab href=\"/admin/links\" active={isActive(\"/admin/links\")}>
        Links
      </Tab>\`
);
if (s === before) {
  console.error('  Anchor not found.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
"

# ============================================================================
# 3. TS check
# ============================================================================
echo ""
echo "=== 3. TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing."
  exit 1
}

# ============================================================================
# 4. Commit + push
# ============================================================================
echo ""
echo "=== 4. Commit + push ==="
git add -A
git status --short
git commit -m "Admin: shareable Links page (raw URLs with Copy buttons), grouped per league/season; Links tab in admin nav"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "Then visit  https://league.simracing-hub.com/admin/links"
echo "Or click 'Links' in the admin top-nav."
