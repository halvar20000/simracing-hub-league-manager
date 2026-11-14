/**
 * CAS Rating pages (/rating, /cas-rating/ranking, licence card, nav badge):
 * German + English. Language comes from the `cls_cr_lang` cookie (server
 * side, see cas-rating-lang.ts), default German like the regulation and the
 * stint planner. `en` is the source of truth for the key set; `de` is typed
 * against it, so a missing key is a build error.
 */
export type CrLang = "de" | "en";
export const CR_LANG_COOKIE = "cls_cr_lang";
export const CR_DEFAULT_LANG: CrLang = "de";

const en = {
  // shared
  cr: "CR",
  performance: "Performance",
  attendance: "Attendance",
  races: "Races",
  noRaceYet: "No race counted yet",
  noChange: "± 0.0 since last race",
  sinceLastRace: (v: string) => `${v} since last race`,
  chartEmpty: "The curve starts after your first counted race. Until then everybody is at 50.",
  chartAria: "CAS Rating over time",
  preview: "Preview — the CAS Rating is not live yet.",
  previewText:
    "It starts with the new SFL Cup season (first race 25 November); the other leagues follow with their next seasons. Until it goes live the numbers are not official.",
  howItWorks: "How the CAS Rating works",
  rankingAll: "Ranking of all drivers",
  updated: "Updated a few minutes after results or steward decisions are published.",
  badgeTitle: "My CAS Rating",
  // /rating
  myTitle: "My CAS Rating",
  myIntro:
    "One number from 0 to 100 for every CAS driver, across all leagues: how well, how cleanly and how regularly you race with us.",
  overTime: "Rating over time",
  perfBox: (w: number, missing: number) =>
    `Average points of your last ${w} races${missing > 0 ? ` (${missing} still counted as 50)` : ""}`,
  attBox: "Races driven in the leagues you are registered in",
  lastRaces: (w: number) => `Your last ${w} races`,
  pointsRule:
    "Place up to 60 (winner 60, last 0; DNF and DSQ 0) + clean up to 40 (−4 per incident per 10 laps) − steward penalties (category 1 / 2 / 3: −5 / −10 / −20).",
  noCountedRace: "No counted race yet — you start at 50.",
  noShow: "No-show without declining",
  penaltyNoResult: "Steward penalty (no result in that race)",
  attPerLeague: "Attendance per league",
  notRegistered: "You are not registered in a league that counts right now, so your attendance is 50 %.",
  league: "League",
  driven: "Driven",
  heldSince: "Races held since you registered",
  streamed: (n: number) => `(${n} streamed)`,
  restHalf: (w: number) => `of ${w} (the rest count as half)`,
  bonus: (n: number) =>
    `Bonus: ${n} extra race${n === 1 ? "" : "s"} (Fun League, fill-in or official CAS stream outside your leagues).`,
  history: "History",
  historyIntro: (w: number) => `Every race that counted for your rating. Greyed out: older than your last ${w}.`,
  noCountedRaceShort: "No counted race yet.",
  olderDeductions: (n: number) => `Older deductions no longer counted: ${n}.`,
  onlyPublished: "Only results published in CLS count. Leagues that count:",
  noLeagueYet: "none yet — each league joins with its next season",
  profileSettings: "Profile settings",
  colDate: "Date",
  colRace: "Race",
  colPos: "Pos.",
  colIncLaps: "Inc / laps",
  colPlace: "Place",
  colClean: "Clean",
  colPenalty: "Penalty",
  colPoints: "Points",
  raceN: (n: number) => `race ${n}`,
  // ranking
  rankTitle: "CAS Rating – Ranking",
  rankIntro: "Every CAS driver, highest rating first. Everybody starts at 50.",
  rankRules: "How the CAS Rating works (rules) →",
  rankAllAtStart: "No race has counted yet, so every driver is at 50.0 and listed alphabetically.",
  colDriver: "Driver",
  colLastRace: "Last race",
  you: "you",
  rankFooter: (n: number) =>
    `${n} drivers: everyone who has been registered in a CAS league. Equal CR = equal place.`,
};

export type CrDict = typeof en;

const de: CrDict = {
  cr: "CR",
  performance: "Leistung",
  attendance: "Teilnahme",
  races: "Rennen",
  noRaceYet: "Noch kein gewertetes Rennen",
  noChange: "± 0,0 seit letztem Rennen",
  sinceLastRace: (v) => `${v} seit letztem Rennen`,
  chartEmpty: "Die Kurve beginnt nach deinem ersten gewerteten Rennen. Bis dahin stehen alle bei 50.",
  chartAria: "Verlauf des CAS Rating",
  preview: "Vorschau – das CAS Rating ist noch nicht live.",
  previewText:
    "Es startet mit der neuen Saison des SFL Cup (erstes Rennen am 25. November); die anderen Ligen folgen mit ihrer nächsten Saison. Bis dahin sind die Werte nicht offiziell.",
  howItWorks: "So funktioniert das CAS Rating",
  rankingAll: "Rangliste aller Fahrer",
  updated: "Wird wenige Minuten nach veröffentlichten Ergebnissen oder Steward-Entscheidungen aktualisiert.",
  badgeTitle: "Mein CAS Rating",
  myTitle: "Mein CAS Rating",
  myIntro:
    "Eine Zahl von 0 bis 100 für jeden CAS-Fahrer, über alle Ligen: wie gut, wie sauber und wie regelmäßig du bei uns fährst.",
  overTime: "Verlauf",
  perfBox: (w, missing) =>
    `Durchschnitt der Punkte deiner letzten ${w} Rennen${missing > 0 ? ` (${missing} zählen noch mit 50)` : ""}`,
  attBox: "Gefahrene Rennen in den Ligen, in denen du angemeldet bist",
  lastRaces: (w) => `Deine letzten ${w} Rennen`,
  pointsRule:
    "Platz bis 60 (Sieger 60, Letzter 0; DNF und DSQ 0) + Sauberkeit bis 40 (−4 je Incident pro 10 Runden) − Steward-Strafen (Kategorie 1 / 2 / 3: −5 / −10 / −20).",
  noCountedRace: "Noch kein gewertetes Rennen – du startest bei 50.",
  noShow: "No-show ohne Abmeldung",
  penaltyNoResult: "Steward-Strafe (kein Ergebnis in diesem Rennen)",
  attPerLeague: "Teilnahme pro Liga",
  notRegistered: "Du bist gerade in keiner gewerteten Liga angemeldet, deshalb liegt deine Teilnahme bei 50 %.",
  league: "Liga",
  driven: "Gefahren",
  heldSince: "Ausgetragene Rennen seit deiner Anmeldung",
  streamed: (n) => `(${n} gestreamt)`,
  restHalf: (w) => `von ${w} (der Rest zählt halb)`,
  bonus: (n) =>
    `Bonus: ${n} zusätzliche${n === 1 ? "s Rennen" : " Rennen"} (Fun League, Ersatzfahrer oder offizieller CAS-Stream außerhalb deiner Ligen).`,
  history: "Historie",
  historyIntro: (w) => `Jedes Rennen, das für dein Rating gezählt hat. Ausgegraut: älter als deine letzten ${w}.`,
  noCountedRaceShort: "Noch kein gewertetes Rennen.",
  olderDeductions: (n) => `Ältere Abzüge, die nicht mehr zählen: ${n}.`,
  onlyPublished: "Es zählen nur im CLS veröffentlichte Ergebnisse. Gewertete Ligen:",
  noLeagueYet: "noch keine – jede Liga kommt mit ihrer nächsten Saison dazu",
  profileSettings: "Profil-Einstellungen",
  colDate: "Datum",
  colRace: "Rennen",
  colPos: "Pos.",
  colIncLaps: "Inc / Runden",
  colPlace: "Platz",
  colClean: "Sauber",
  colPenalty: "Strafe",
  colPoints: "Punkte",
  raceN: (n) => `Rennen ${n}`,
  rankTitle: "CAS Rating – Rangliste",
  rankIntro: "Alle CAS-Fahrer, höchstes Rating zuerst. Alle starten bei 50.",
  rankRules: "So funktioniert das CAS Rating (Reglement) →",
  rankAllAtStart: "Es wurde noch kein Rennen gewertet, deshalb stehen alle bei 50,0 und sind alphabetisch sortiert.",
  colDriver: "Fahrer",
  colLastRace: "Letztes Rennen",
  you: "du",
  rankFooter: (n) =>
    `${n} Fahrer: alle, die in einer CAS-Liga angemeldet waren. Gleiches CR = gleicher Platz.`,
};

export const CR_DICTS: Record<CrLang, CrDict> = { en, de };

export function parseCrLang(v: string | null | undefined): CrLang {
  return v === "en" || v === "de" ? v : CR_DEFAULT_LANG;
}

/** 43.6 / 43,6 — one decimal, in the page language. */
export function fmtCrIn(lang: CrLang, v: number): string {
  return (Math.round(v * 10) / 10).toLocaleString(lang === "de" ? "de-DE" : "en-GB", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}
