/**
 * One-shot backfill: read race-center.html on simracing-hub.com, parse one
 * <article id="X-rN"> per round, upload the referenced chart PNGs + replay
 * MP4 + poster JPG from the local races/ folder to Vercel Blob, and populate
 * the RaceCenter + RaceCenterChart rows in CLS.
 *
 * Saves Thomas from manually re-typing Thruxton R11 and Magny-Cours R10 into
 * the admin form; same script handles any future race-center.html article in
 * the same shape.
 *
 * Usage:
 *   npx tsx scripts/backfill-race-center.ts thruxton-r11 magnycours-r10
 *   npx tsx scripts/backfill-race-center.ts --all
 *   npx tsx scripts/backfill-race-center.ts --league cas-gt3-wct thruxton-r11
 *
 * Env required:
 *   DATABASE_URL              Postgres connection (Neon)
 *   BLOB_READ_WRITE_TOKEN     Vercel Blob token (same one used in production)
 *
 * Filesystem prerequisites:
 *   $HOME/Nextcloud/AI/SimRacing-News/race-center.html
 *   $HOME/Nextcloud/AI/SimRacing-News/races/<slug>-r<N>-{chart-*,replay,poster}.{png,mp4,jpg}
 */

// Load env vars from .env.local then .env (later loads don't overwrite earlier).
// Without this, `tsx scripts/...` doesn't see DATABASE_URL / BLOB_READ_WRITE_TOKEN
// from the .env files — only Next.js's runtime does, not raw tsx.
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

import { PrismaClient } from "@prisma/client";
import { put } from "@vercel/blob";
import * as cheerio from "cheerio";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const prisma = new PrismaClient();

const SIMRACING_HUB_ROOT = path.join(homedir(), "Nextcloud", "AI", "SimRacing-News");
const RACE_CENTER_HTML = path.join(SIMRACING_HUB_ROOT, "race-center.html");
const RACES_DIR = path.join(SIMRACING_HUB_ROOT, "races");

// Map chart-card "card-tag" text → RaceCenterChart.chartType.
const CHART_TAG_TO_TYPE: Record<string, string> = {
  "Gap to Leader": "gap",
  "Race Pace": "pace",
  "Pit Stops": "pits",
  "Incident Timeline": "incidents",
  "Position Changes": "positions",
  "Overtake Net": "overtakes",
  "Incident Locations": "incidents-map",
  "Pit Loss": "pit-loss",
  "Stint Pace": "stint-pace",
  "Battle Proximity": "battle",
};

// Map "partly cloudy" etc. → iRacing skies code.
const SKIES_TEXT_TO_CODE: Record<string, number> = {
  clear: 0,
  "partly cloudy": 1,
  "mostly cloudy": 2,
  overcast: 3,
};

type Args = {
  leagueSlug: string;
  articleIds: string[];
  all: boolean;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const args: Args = { leagueSlug: "cas-gt3-wct", articleIds: [], all: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--league") args.leagueSlug = argv[++i];
    else if (a === "--all") args.all = true;
    else if (a.startsWith("--")) {
      console.error(`Unknown flag: ${a}`);
      process.exit(2);
    } else {
      args.articleIds.push(a);
    }
  }
  if (!args.all && args.articleIds.length === 0) {
    console.error(
      "Usage: backfill-race-center.ts [--league SLUG] <article-id> [<article-id> …]\n" +
        "       backfill-race-center.ts [--league SLUG] --all"
    );
    process.exit(2);
  }
  return args;
}

async function main() {
  const args = parseArgs();

  if (!existsSync(RACE_CENTER_HTML)) {
    console.error(`race-center.html not found at ${RACE_CENTER_HTML}`);
    process.exit(1);
  }
  const html = await readFile(RACE_CENTER_HTML, "utf-8");
  const $ = cheerio.load(html);

  // Discover all article IDs present in the HTML.
  const allIds: string[] = [];
  $("article.race-entry[id]").each((_, el) => {
    const id = $(el).attr("id");
    if (id) allIds.push(id);
  });
  console.log(`Found ${allIds.length} article(s) in race-center.html: ${allIds.join(", ")}`);

  const todo = args.all ? allIds : args.articleIds;
  for (const id of todo) {
    if (!allIds.includes(id)) {
      console.error(`!! Article ${id} not found in race-center.html; skipping`);
      continue;
    }
    console.log(`\n=== Backfilling ${id} ===`);
    try {
      await backfillOne($, id, args.leagueSlug);
    } catch (err) {
      console.error(`!! ${id} failed:`, err);
    }
  }

  await prisma.$disconnect();
  console.log("\nDone.");
}

async function backfillOne(
  $: cheerio.CheerioAPI,
  articleId: string,
  leagueSlug: string
): Promise<void> {
  // articleId is "<track-slug>-r<N>", e.g. "thruxton-r11".
  const m = articleId.match(/^(.+)-r(\d+)$/);
  if (!m) throw new Error(`articleId ${articleId} doesn't match <slug>-r<N>`);
  const fileSlug = articleId; // for races/<articleId>-chart-*.png lookup
  const roundNumber = parseInt(m[2], 10);

  // Resolve Round in CLS. Find the *active* season of the league.
  const league = await prisma.league.findUnique({
    where: { slug: leagueSlug },
    include: { seasons: { where: { status: "ACTIVE" }, orderBy: { startsOn: "desc" }, take: 1 } },
  });
  if (!league) throw new Error(`League ${leagueSlug} not found`);
  if (league.seasons.length === 0)
    throw new Error(`League ${leagueSlug} has no active season`);
  const season = league.seasons[0];

  const round = await prisma.round.findUnique({
    where: { seasonId_roundNumber: { seasonId: season.id, roundNumber } },
  });
  if (!round) throw new Error(`Round R${roundNumber} not found in season ${season.name}`);
  console.log(`Found round: ${round.name} (id=${round.id})`);

  const article = $(`article#${articleId}`);
  if (article.length === 0) throw new Error(`Article #${articleId} not in DOM`);

  // ------------------------------------------------------------------
  // Parse the By-the-Numbers cards.
  // ------------------------------------------------------------------
  const numberCards = new Map<string, { h3: string; p: string }>();
  article
    .find('h3.race-block-title:contains("By the Numbers")')
    .nextAll(".card-grid")
    .first()
    .find(".card")
    .each((_, el) => {
      const tag = $(el).find(".card-tag").text().trim();
      const h3 = $(el).find("h3").text().trim();
      const p = $(el).find("p").first().text().trim();
      numberCards.set(tag, { h3, p });
    });

  const winnerCard = numberCards.get("Race Winner");
  const fastestLapCard = numberCards.get("Fastest Lap");
  const comebackCard = numberCards.get("Comeback Drive");
  const cleanestCard = numberCards.get("Cleanest Race");
  const yellowsCard = numberCards.get("Yellow Flags");
  const conditionsCard = numberCards.get("Conditions");

  // Yellow flags — h3 like "Zero cautions" or "2 cautions"
  const yellowParse = parseYellowFlags(yellowsCard?.h3 ?? null);
  // Conditions — paragraph like "Air 19,2 °C · Track 25,2 °C · Skies partly cloudy …"
  const conditionsParse = parseConditions(conditionsCard?.p ?? null);

  // Comeback driver: look up by name; null if no exact match (admin can fill later).
  let comebackUserId: string | null = null;
  if (comebackCard?.h3) {
    comebackUserId = await findUserByDisplayName(comebackCard.h3);
    if (!comebackUserId) {
      console.warn(`  ! Couldn't resolve comeback driver "${comebackCard.h3}" — leaving null`);
    }
  }

  // ------------------------------------------------------------------
  // Parse Race Highlights — collect <p> children as markdown paragraphs.
  // ------------------------------------------------------------------
  const highlightsParas: string[] = [];
  article.find(".race-highlights p").each((_, p) => {
    // Strip HTML tags but keep <strong>…</strong> as **…**.
    const md = htmlToMarkdownParagraph($, p);
    if (md.trim().length > 0) highlightsParas.push(md);
  });
  const highlightsMd = highlightsParas.join("\n\n") || null;

  // Headline — try the .race-entry-head h2, fall back to round name.
  const headline = article.find(".race-entry-head h2").text().trim() || null;

  // Replay caption — under .race-replay
  const replayCaption = article.find(".race-replay .replay-caption").text().trim() || null;

  // Broadcast URL — usually absent on race-center.html; leave null.
  // Source URL — the data-note <a> if present
  const sourceUrl = article.find(".data-note a").attr("href") ?? null;
  const broadcastUrl = sourceUrl?.includes("league.simracing-hub.com") ? sourceUrl : null;

  // ------------------------------------------------------------------
  // Upload replay + poster.
  // ------------------------------------------------------------------
  const base = `race-center/${leagueSlug}/${season.id}/${roundNumber}`;
  const replayLocal = path.join(RACES_DIR, `${fileSlug}-replay.mp4`);
  const posterLocal = path.join(RACES_DIR, `${fileSlug}-poster.jpg`);
  const replayBlobUrl = (await uploadIfExists(replayLocal, `${base}/replay.mp4`)) ?? null;
  const posterBlobUrl = (await uploadIfExists(posterLocal, `${base}/poster.jpg`)) ?? null;

  // ------------------------------------------------------------------
  // Upsert the RaceCenter row.
  // ------------------------------------------------------------------
  const data = {
    headline,
    highlightsMd,
    winnerNote: winnerCard?.p ?? null,
    fastestLapNote: fastestLapCard?.p ?? null,
    cleanestNote: cleanestCard?.p ?? null,
    comebackUserId,
    comebackNote: comebackCard?.p ?? null,
    yellowFlagCount: yellowParse.count,
    yellowFlagNote: yellowParse.note,
    airTempC: conditionsParse.airTempC,
    trackTempC: conditionsParse.trackTempC,
    skiesCode: conditionsParse.skiesCode,
    cloudCoverPct: null, // not visible in the HTML
    precipMm: null,
    precipTimePct: null,
    replayBlobUrl,
    posterBlobUrl,
    replayCaption,
    broadcastUrl,
    publishedAt: new Date(), // backfilled rows go live immediately
  };

  const raceCenter = await prisma.raceCenter.upsert({
    where: { roundId: round.id },
    create: { roundId: round.id, ...data },
    update: data,
  });
  console.log(`  ✓ RaceCenter upserted (id=${raceCenter.id})`);

  // ------------------------------------------------------------------
  // Upload + upsert each chart.
  // ------------------------------------------------------------------
  const chartCards = article
    .find('h3.race-block-title:contains("Data Views")')
    .nextAll(".card-grid")
    .first()
    .find(".card");

  let chartCount = 0;
  for (let i = 0; i < chartCards.length; i++) {
    const el = chartCards[i];
    const tag = $(el).find(".card-tag").text().trim();
    const chartType = CHART_TAG_TO_TYPE[tag];
    if (!chartType) {
      console.warn(`  ! Unknown chart card tag "${tag}" — skipping`);
      continue;
    }
    const imgSrc = $(el).find("img").attr("src") ?? "";
    const caption = $(el).find("p").first().text().trim() || null;
    const local = path.join(RACES_DIR, path.basename(imgSrc));
    if (!existsSync(local)) {
      console.warn(`  ! ${local} not found — skipping ${chartType}`);
      continue;
    }
    const blobUrl = await uploadFile(local, `${base}/chart-${chartType}.png`);
    await prisma.raceCenterChart.upsert({
      where: { raceCenterId_chartType: { raceCenterId: raceCenter.id, chartType } },
      create: {
        raceCenterId: raceCenter.id,
        chartType,
        title: tag,
        blobUrl,
        caption,
        sortOrder: i,
      },
      update: { title: tag, blobUrl, caption, sortOrder: i },
    });
    chartCount++;
  }
  console.log(`  ✓ ${chartCount} chart(s) uploaded`);
  console.log(`  ✓ Published at ${data.publishedAt.toISOString()}`);
}

// ---------------------------------------------------------------------------
// helpers

async function uploadFile(localPath: string, blobPath: string): Promise<string> {
  const buf = await readFile(localPath);
  const blob = await put(blobPath, buf, { access: "public", allowOverwrite: true });
  return blob.url;
}

async function uploadIfExists(localPath: string, blobPath: string): Promise<string | null> {
  if (!existsSync(localPath)) {
    console.warn(`  ! ${localPath} not found — skipping`);
    return null;
  }
  return uploadFile(localPath, blobPath);
}

function parseYellowFlags(h3: string | null): { count: number; note: string | null } {
  if (!h3) return { count: 0, note: null };
  const t = h3.toLowerCase();
  if (t.includes("zero")) return { count: 0, note: h3 };
  const m = t.match(/(\d+)/);
  return { count: m ? parseInt(m[1], 10) : 0, note: h3 };
}

type ConditionsParse = {
  airTempC: number | null;
  trackTempC: number | null;
  skiesCode: number | null;
};
function parseConditions(p: string | null): ConditionsParse {
  if (!p) return { airTempC: null, trackTempC: null, skiesCode: null };
  // "Air 19,2 °C · Track 25,2 °C · Skies partly cloudy · Dry (wetness 1)."
  // Accept both decimal commas and points.
  const airM = p.match(/Air\s+(-?\d+[.,]?\d*)\s*°/i);
  const trkM = p.match(/Track\s+(-?\d+[.,]?\d*)\s*°/i);
  const skyM = p.match(/Skies\s+([a-z ]+?)(?:[·•·]|$)/i);
  const skiesText = skyM ? skyM[1].trim().toLowerCase() : null;
  return {
    airTempC: airM ? parseFloat(airM[1].replace(",", ".")) : null,
    trackTempC: trkM ? parseFloat(trkM[1].replace(",", ".")) : null,
    skiesCode: skiesText && SKIES_TEXT_TO_CODE[skiesText] != null ? SKIES_TEXT_TO_CODE[skiesText] : null,
  };
}

async function findUserByDisplayName(display: string): Promise<string | null> {
  const trimmed = display.trim();
  if (trimmed.length === 0) return null;
  const parts = trimmed.split(/\s+/);
  // Try (firstName, lastName) exact match.
  if (parts.length >= 2) {
    const first = parts[0];
    const last = parts.slice(1).join(" ");
    const u = await prisma.user.findFirst({
      where: { firstName: { equals: first, mode: "insensitive" }, lastName: { equals: last, mode: "insensitive" } },
      select: { id: true },
    });
    if (u) return u.id;
  }
  // Fall back to a single-field search on User.name.
  const u2 = await prisma.user.findFirst({
    where: { name: { equals: trimmed, mode: "insensitive" } },
    select: { id: true },
  });
  return u2?.id ?? null;
}

function htmlToMarkdownParagraph(
  $: cheerio.CheerioAPI,
  el: cheerio.Element
): string {
  // Walk children; <strong> → **, <em> → _, everything else → text.
  const $p = $(el);
  const $clone = $p.clone();
  $clone.find("strong, b").each((_i, n) => {
    const t = $(n).text();
    $(n).replaceWith(`**${t}**`);
  });
  $clone.find("em, i").each((_i, n) => {
    const t = $(n).text();
    $(n).replaceWith(`_${t}_`);
  });
  return $clone.text().replace(/\s+/g, " ").trim();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
