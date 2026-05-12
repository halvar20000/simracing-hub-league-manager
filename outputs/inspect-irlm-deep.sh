#!/usr/bin/env bash
# Walk every session in the iRLM event response and print a one-line summary,
# plus look for combined / scored / final endpoints we may have missed.
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

LEAGUE_NAME="GT3WCTSeason2"
EVENT_ID="2645"

mkdir -p scripts

cat > scripts/inspect-irlm-deep.ts <<'EOF'
const BASE = "https://irleaguemanager.net/api";
const USERNAME = process.env.IRLM_USERNAME!;
const PASSWORD = process.env.IRLM_PASSWORD!;
const leagueName = process.env.LEAGUE_NAME!;
const eventId = process.env.EVENT_ID!;

async function login(): Promise<string> {
  const r = await fetch(`${BASE}/Authenticate/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  const j = (await r.json()) as Record<string, unknown>;
  return (
    (j.token as string) ||
    (j.accessToken as string) ||
    (j.jwt as string) ||
    (j.idToken as string)
  );
}

async function dumpJson(url: string, headers: Record<string, string>) {
  const r = await fetch(url, { headers });
  console.log(`\nGET ${url} -> ${r.status}`);
  if (!r.ok) {
    console.log("  body:", (await r.text()).slice(0, 200));
    return null;
  }
  return r.json() as Promise<unknown>;
}

async function main() {
  const token = await login();
  const auth = { Authorization: `Bearer ${token}` };
  console.log("Logged in. Token length:", token.length);

  // 1. Walk the existing /Events/{id}/Results response, print all session
  //    types and row counts.
  const evRaw = await dumpJson(
    `${BASE}/${leagueName}/Events/${eventId}/Results`,
    auth
  );
  const events = Array.isArray(evRaw) ? evRaw : evRaw ? [evRaw] : [];
  for (const ev of events) {
    console.log(
      "  EventResult top-level keys:",
      Object.keys(ev as object).join(", ")
    );
    const sessions =
      ((ev as { sessionResults?: unknown[] }).sessionResults as unknown[]) ?? [];
    for (let i = 0; i < sessions.length; i++) {
      const s = sessions[i] as Record<string, unknown>;
      const rows = (s.resultRows as unknown[]) ?? [];
      console.log(
        `    [${i}] sessionType=${String(s.sessionType)} ` +
          `sessionName=${String(s.sessionName)} ` +
          `classId=${String(s.classId ?? "-")} ` +
          `rows=${rows.length}`
      );
      if (rows.length > 0) {
        const first = rows[0] as Record<string, unknown>;
        console.log(
          "        first row pos:",
          `finishPosition=${first.finishPosition}`,
          `finalPosition=${first.finalPosition}`,
          `interval=${JSON.stringify(first.interval)}`
        );
      }
    }
  }

  // 2. Try a few candidate endpoints that might give a combined / scored view.
  const candidates = [
    `${BASE}/${leagueName}/Events/${eventId}/ScoredResults`,
    `${BASE}/${leagueName}/Events/${eventId}/Scored`,
    `${BASE}/${leagueName}/Events/${eventId}/CombinedResults`,
    `${BASE}/${leagueName}/Events/${eventId}/Result`,
    `${BASE}/${leagueName}/Events/${eventId}/Standings`,
    `${BASE}/${leagueName}/ScoredResults?eventId=${eventId}`,
    `${BASE}/${leagueName}/Sessions/${eventId}/Results`,
  ];
  console.log("\n--- candidate combined/scored endpoints ---");
  for (const url of candidates) {
    const j = (await dumpJson(url, auth)) as
      | unknown[]
      | Record<string, unknown>
      | null;
    if (!j) continue;
    const arr = Array.isArray(j) ? j : [j];
    if (arr.length === 0) {
      console.log("  (empty array)");
      continue;
    }
    const first = arr[0] as Record<string, unknown>;
    console.log("  top-level keys:", Object.keys(first).join(", "));
    // Drill into a likely "results" / "rows" / "scoredResultRows" array
    for (const key of [
      "scoredResultRows",
      "resultRows",
      "scoredResults",
      "results",
      "rows",
    ]) {
      const inner = first[key];
      if (Array.isArray(inner) && inner.length > 0) {
        const r0 = inner[0] as Record<string, unknown>;
        console.log(`  --> ${key}[0] keys:`, Object.keys(r0).join(", "));
        console.log(
          `  --> sample: finishPosition=${r0.finishPosition} finalPosition=${r0.finalPosition} interval=${JSON.stringify(r0.interval)} memberId=${r0.memberId}`
        );
        break;
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
EOF

# Make sure env is loaded so IRLM_USERNAME/IRLM_PASSWORD are set.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

LEAGUE_NAME="$LEAGUE_NAME" EVENT_ID="$EVENT_ID" \
  IRLM_USERNAME="${IRLM_USERNAME:-}" IRLM_PASSWORD="${IRLM_PASSWORD:-}" \
  npx tsx scripts/inspect-irlm-deep.ts
