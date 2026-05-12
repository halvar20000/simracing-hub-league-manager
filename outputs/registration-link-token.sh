#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"
mkdir -p outputs-tmp

# ===========================================================================
# 1. Schema: Season.registrationToken
# ===========================================================================
cat > outputs-tmp/patch-schema.mjs <<'EOF'
import fs from "node:fs";
const FILE = "prisma/schema.prisma";
let s = fs.readFileSync(FILE, "utf8");
if (/registrationToken\s+String\?/.test(s)) { console.log("Schema: registrationToken already present."); process.exit(0); }
const lines = s.split("\n");
let inModel = false, close = -1;
for (let i = 0; i < lines.length; i++) {
  if (/^model\s+Season\s*{/.test(lines[i])) { inModel = true; continue; }
  if (inModel && /^}\s*$/.test(lines[i])) { close = i; break; }
}
if (close === -1) { console.error("Season brace not found."); process.exit(1); }
lines.splice(close, 0, "  registrationToken String?");
fs.writeFileSync(FILE, lines.join("\n"));
console.log("Schema: added Season.registrationToken.");
EOF
node outputs-tmp/patch-schema.mjs

echo ""
echo "=== prisma db push ==="
npx --yes prisma db push --skip-generate
rm -rf node_modules/.prisma node_modules/@prisma/client .next tsconfig.tsbuildinfo
npm install @prisma/client --no-audit --no-fund
npx --yes prisma generate

# ===========================================================================
# 2. Server actions: generate / clear the token
# ===========================================================================
cat > outputs-tmp/patch-actions.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/actions/seasons.ts";
let s = fs.readFileSync(FILE, "utf8");

if (s.includes("regenerateRegistrationToken")) { console.log("Seasons action: token actions already wired."); process.exit(0); }

s += `

export async function regenerateRegistrationToken(
  leagueSlug: string,
  seasonId: string
): Promise<void> {
  await requireAdmin();
  // 22 chars of base64url-ish randomness, plenty for an unguessable token.
  const token = Array.from({ length: 4 })
    .map(() => Math.random().toString(36).slice(2, 10))
    .join("")
    .slice(0, 24);
  await prisma.season.update({
    where: { id: seasonId },
    data: { registrationToken: token },
  });
  revalidatePath(\`/admin/leagues/\${leagueSlug}/seasons/\${seasonId}\`);
}

export async function clearRegistrationToken(
  leagueSlug: string,
  seasonId: string
): Promise<void> {
  await requireAdmin();
  await prisma.season.update({
    where: { id: seasonId },
    data: { registrationToken: null },
  });
  revalidatePath(\`/admin/leagues/\${leagueSlug}/seasons/\${seasonId}\`);
}
`;

fs.writeFileSync(FILE, s);
console.log("Seasons action: token regenerate/clear added.");
EOF
node outputs-tmp/patch-actions.mjs

# ===========================================================================
# 3. Register page: enforce token + preserve through OAuth
# ===========================================================================
cat > outputs-tmp/patch-register-page.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/register/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

if (s.includes("registrationToken")) { console.log("Register page: token gate already wired."); process.exit(0); }

// Extend searchParams type to include `t`.
s = s.replace(
  `  searchParams: Promise<{ error?: string }>;`,
  `  searchParams: Promise<{ error?: string; t?: string }>;`
);

// Pass `t` through the auth callback URL.
s = s.replace(
  `  if (!session?.user?.id) {
    redirect(
      \`/api/auth/signin?callbackUrl=/leagues/\${slug}/seasons/\${seasonId}/register\`
    );
  }`,
  `  const token = (await searchParams).t ?? null;
  if (!session?.user?.id) {
    const cb = \`/leagues/\${slug}/seasons/\${seasonId}/register\${token ? \`?t=\${encodeURIComponent(token)}\` : ""}\`;
    redirect(\`/api/auth/signin?callbackUrl=\${encodeURIComponent(cb)}\`);
  }`
);

// After loading season, gate on token if season has one configured.
const before = `  if (!season || season.league.slug !== slug) notFound();`;
const after = `  if (!season || season.league.slug !== slug) notFound();

  // Token gate — only people with the Discord link can register.
  if (season.registrationToken && season.registrationToken !== token) {
    return (
      <div className="space-y-4">
        <Link
          href={\`/leagues/\${slug}/seasons/\${seasonId}\`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Back to season
        </Link>
        <h1 className="text-2xl font-bold">Registration is link-protected</h1>
        <p className="text-zinc-400">
          To register for {season.name} {season.year}, please use the
          registration link posted in the CAS Community Discord.
        </p>
        <p className="text-xs text-zinc-500">
          If you can&apos;t find the link, ask an admin or steward to share it
          with you.
        </p>
      </div>
    );
  }`;

if (s.includes(before)) {
  s = s.replace(before, after);
}

fs.writeFileSync(FILE, s);
console.log("Register page: token gate inserted.");
EOF
node outputs-tmp/patch-register-page.mjs

# ===========================================================================
# 4. createRegistration action: re-check token (defence in depth)
# ===========================================================================
cat > outputs-tmp/patch-create-action.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/actions/registrations.ts";
let s = fs.readFileSync(FILE, "utf8");

if (s.includes("registrationToken check")) { console.log("createRegistration: token check already wired."); process.exit(0); }

const before = `  if (season.status !== "OPEN_REGISTRATION" && season.status !== "ACTIVE") {
    redirect(
      \`/leagues/\${leagueSlug}/seasons/\${seasonId}?error=Registration+is+not+open\`
    );
  }`;

const after = `  if (season.status !== "OPEN_REGISTRATION" && season.status !== "ACTIVE") {
    redirect(
      \`/leagues/\${leagueSlug}/seasons/\${seasonId}?error=Registration+is+not+open\`
    );
  }

  // registrationToken check — defence in depth (the page already gated, but
  // a hand-crafted POST would otherwise bypass).
  if (season.registrationToken) {
    const submittedToken = String(formData.get("t") ?? "").trim();
    if (submittedToken !== season.registrationToken) {
      redirect(
        \`/leagues/\${leagueSlug}/seasons/\${seasonId}/register?error=Please+use+the+registration+link+from+Discord\`
      );
    }
  }`;

if (!s.includes(before)) {
  console.error("createRegistration: status-check anchor not found.");
  process.exit(1);
}
s = s.replace(before, after);
fs.writeFileSync(FILE, s);
console.log("createRegistration: token check wired.");
EOF
node outputs-tmp/patch-create-action.mjs

# ===========================================================================
# 5. Register page form: include hidden `t` input so the action receives it
# ===========================================================================
cat > outputs-tmp/patch-form.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/register/page.tsx";
let s = fs.readFileSync(FILE, "utf8");
if (s.includes('name="t"')) { console.log("Register page: hidden token input already present."); process.exit(0); }

const before = `      <form action={create} className="space-y-4">`;
const after  = `      <form action={create} className="space-y-4">
        {token && <input type="hidden" name="t" value={token} />}`;
if (!s.includes(before)) { console.error("Register page: form anchor not found."); process.exit(1); }
s = s.replace(before, after);
fs.writeFileSync(FILE, s);
console.log("Register page: hidden token input inserted.");
EOF
node outputs-tmp/patch-form.mjs

# ===========================================================================
# 6. Admin season page: token controls + updated copy-link button
# ===========================================================================
cat > outputs-tmp/patch-admin-season.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/admin/leagues/[slug]/seasons/[seasonId]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");
if (s.includes("regenerateRegistrationToken")) { console.log("Admin season: token controls already wired."); process.exit(0); }

// Add imports for the action.
if (!s.includes('regenerateRegistrationToken')) {
  // Add to existing seasons-action import OR add a new line.
  if (s.includes(`from "@/lib/actions/seasons"`)) {
    s = s.replace(
      /import\s*\{([^}]*)\}\s*from\s*"@\/lib\/actions\/seasons"/,
      (m, names) => {
        const trimmed = names.trim().replace(/,\s*$/, "");
        return `import { ${trimmed}, regenerateRegistrationToken, clearRegistrationToken } from "@/lib/actions/seasons"`;
      }
    );
  } else {
    s = s.replace(
      /(import\s*\{[^}]*\}\s*from\s*"@\/lib\/prisma";)/,
      `$1\nimport { regenerateRegistrationToken, clearRegistrationToken } from "@/lib/actions/seasons";`
    );
  }
}

// Update the existing registration-link card to include the token in the URL
// + show a "Generate / regenerate / clear" form below the link.
const cardBefore = `              <code className="mt-2 block break-all rounded bg-zinc-950 px-2 py-1 text-xs text-zinc-200">
                {(process.env.NEXT_PUBLIC_SITE_URL ?? "https://league.simracing-hub.com") +
                  \`/leagues/\${slug}/seasons/\${seasonId}/register\`}
              </code>
            </div>
            <CopyTextButton
              text={(process.env.NEXT_PUBLIC_SITE_URL ?? "https://league.simracing-hub.com") +
                \`/leagues/\${slug}/seasons/\${seasonId}/register\`}
              label="Copy registration link"
              copiedLabel="Copied!"
              className="rounded border border-emerald-600 bg-emerald-900/40 px-3 py-1.5 text-sm font-medium text-emerald-200 hover:bg-emerald-800"
            />
          </div>
        </section>
      )}`;

const cardAfter = `              <code className="mt-2 block break-all rounded bg-zinc-950 px-2 py-1 text-xs text-zinc-200">
                {(process.env.NEXT_PUBLIC_SITE_URL ?? "https://league.simracing-hub.com") +
                  \`/leagues/\${slug}/seasons/\${seasonId}/register\` +
                  (season.registrationToken ? \`?t=\${season.registrationToken}\` : "")}
              </code>
              <p className="mt-2 text-xs text-emerald-200/80">
                {season.registrationToken
                  ? "Token-protected. Only this exact link unlocks the registration form."
                  : "No token set — anyone with the URL can register. Click 'Generate token' to lock it down."}
              </p>
            </div>
            <CopyTextButton
              text={(process.env.NEXT_PUBLIC_SITE_URL ?? "https://league.simracing-hub.com") +
                \`/leagues/\${slug}/seasons/\${seasonId}/register\` +
                (season.registrationToken ? \`?t=\${season.registrationToken}\` : "")}
              label="Copy registration link"
              copiedLabel="Copied!"
              className="rounded border border-emerald-600 bg-emerald-900/40 px-3 py-1.5 text-sm font-medium text-emerald-200 hover:bg-emerald-800"
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <form action={regenerateRegistrationToken.bind(null, slug, seasonId)}>
              <button
                type="submit"
                className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
              >
                {season.registrationToken ? "Regenerate token" : "Generate token"}
              </button>
            </form>
            {season.registrationToken && (
              <form action={clearRegistrationToken.bind(null, slug, seasonId)}>
                <button
                  type="submit"
                  className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800"
                >
                  Clear token (allow open access)
                </button>
              </form>
            )}
          </div>
        </section>
      )}`;

if (!s.includes(cardBefore)) {
  console.error("Admin season: registration-link card anchor not found. (Did you run the earlier polish script?)");
  process.exit(1);
}
s = s.replace(cardBefore, cardAfter);
fs.writeFileSync(FILE, s);
console.log("Admin season: token URL + Generate/Clear controls wired.");
EOF
node outputs-tmp/patch-admin-season.mjs

rm -rf outputs-tmp

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "Registration: per-season token gate (Discord-link-only access; admin can generate / regenerate / clear)"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
