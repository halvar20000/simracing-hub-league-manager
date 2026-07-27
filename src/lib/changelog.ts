/**
 * Site changelog — single source of truth for the version number and the
 * public /changelog page.
 *
 * HOW TO UPDATE (do this with EVERY user-visible change):
 *   1. Add a new entry at the TOP of the array.
 *   2. Bump the version: new feature → minor (1.1.0 → 1.2.0),
 *      fix/small tweak → patch (1.1.0 → 1.1.1), big rework → major.
 *   3. Date format: YYYY-MM-DD (deploy date).
 *
 * The newest entry's version is shown in the footer.
 */

export type ChangelogEntry = {
  version: string;
  date: string; // YYYY-MM-DD
  changes: string[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.73.2",
    date: "2026-07-27",
    changes: [
      "Stint Planner: a Garage 61 pull no longer shows a second driver table. It now lists only what “Apply to plan” would change — per driver, the pace and fuel figure the plan holds today crossed out and the new one next to it, with anything you typed yourself marked as kept. Once applied, the list disappears: the driver table is the single place those numbers live.",
      "Stint Planner: the pace in that list is projected to the plan's track temperature, the same way Apply does it, so the number you review is the number that lands in the table (the raw race pace of the laps can differ by several seconds a lap when the temperatures differ).",
    ],
  },
  {
    version: "1.73.1",
    date: "2026-07-27",
    changes: [
      "Stint Planner: a decimal comma is now accepted everywhere. Typing “12,5” instead of “12.5” used to be read as nothing at all, so the field looked filled while the planner saw a zero — the fuel-save optimiser then refused to start with “fill in both fuel profiles first”, and stints, fuel and tyre wear could quietly collapse to zero. Lap times take a comma too (“8:00,5”).",
      "Stint Planner: an empty field now falls back to its default rather than to zero — clearing the driver-swap time no longer removes the 30-second floor.",
    ],
  },
  {
    version: "1.73.0",
    date: "2026-07-27",
    changes: [
      "Stint Planner: the driver list is now a data table — laps measured, best lap, average lap and the track temperature those laps were set at, plus the three figures the plan actually runs on: race pace, fuel per lap and tyre wear per lap. Pulling from Garage 61 fills them per driver instead of only setting lap times.",
      "Stint Planner: any of those figures can be overwritten by hand, and the planner then uses your number — a driver who lifts and coasts really does get another lap out of the tank. Values from Garage 61 show green, your own show amber, and the next import refills the green ones while leaving yours untouched (↺ hands a row back to the data).",
      "Stint Planner: tyre wear stays yours to enter — Garage 61 does not measure it. Blank falls back to the plan's default wear.",
    ],
  },
  {
    version: "1.72.0",
    date: "2026-07-27",
    changes: [
      "Stint Planner: races no longer have to end on the clock. “Race ends on” switches between Time, Laps and Distance — so “500 laps of Road America” or “1000 km of Spa” can be planned properly. Enter the distance plus the lap length and the planner works out the lap target (rounded up, because the distance has to be covered) and projects the finishing time instead of asking for it.",
      "Stint Planner: in a distance race the last stint is cut by the laps that are left, never mid-lap, and it carries no pit stop. The projected finish, the Clock-in column, the live tracker and the Discord alerts all follow that projection.",
      "Stint Planner: the fuel-save optimiser flips its objective for a distance race — the distance is fixed, so it looks for the quickest way to cover the laps rather than the most laps in a set time, and the table shows race time instead of total laps.",
    ],
  },
  {
    version: "1.71.1",
    date: "2026-07-27",
    changes: [
      "Stint Planner: “Session start” is now called “Race start” — the moment the race really begins — and takes seconds. Next to it sits a “Now” button: press it as the green flag falls and the whole plan snaps to the real clock. If the plan carries a green-flag offset, the button subtracts it, so the flag still lands exactly on the moment you pressed.",
      "Stint Planner: new “Fuel to the grid” field — the litres burned on the lap out to the grid and behind the pace car. That fuel is gone before the flag drops, so it comes off the first stint only, and the first stop puts it back in. On a tight tank it can cost the first stint a lap, which is exactly when you want to know.",
    ],
  },
  {
    version: "1.71.0",
    date: "2026-07-27",
    changes: [
      "Stint Planner: pit stops are no longer one flat number. Switch on “Pit-stop model” and every stop is computed from the litres that actually go in, whether tyres are changed and whether the driver changes — so a splash costs what a splash costs instead of being priced like a full service. The lane loss, refuel rate (l/s), tyre time and the 30-second driver-change floor are entered once; the driver change runs in parallel with fuelling, the tyre change on top of it, exactly as in the car.",
      "Stint Planner: per-stint controls for litres and tyre change. A shorter fill shortens the following stint automatically, and the schedule shows what each stop costs, broken down on hover.",
      "Stint Planner: tyres are modelled. Wear in % per lap (per driver where you know it), condition carried across stints when the set stays on, and a warning when a stint would end below the level you consider raceable — that is what makes double-stinting a set a decision instead of a guess.",
      "Stint Planner: fuel consumption can now be set per driver, not just one number for the team. A smoother driver really does get a lap more out of the tank, and the schedule reflects it.",
      "Stint Planner: the fuel-save optimiser prices its own stops with the model, so saving fuel now correctly shortens the stops as well as stretching the stint.",
      "Admin → Pit references: a shared library of measured pit constants per car and track, with the measuring method written down. One click in a plan loads them. Thanks to Johann Solowej, whose test-session method and Spa-24h workbook this is built from.",
    ],
  },
  {
    version: "1.70.0",
    date: "2026-07-27",
    changes: [
      "Stint Planner: a plan can be marked as completed once the race is over. “✓ Mark completed” freezes the event, drivers, stints and the live ± corrections, and stops the Discord stint alerts — nobody gets a DM from a plan that ran months ago. The debrief stays open: race result, race log, poster, impressions and the post-race notes can still be added afterwards. Reopen it any time with one click; whoever created the plan (or an admin) may do both.",
      "Stint Planner: the overview is now split into “Active plans” and “Completed”. Completed plans are dimmed, carry the date they were finished, and open straight on the post-race tab.",
    ],
  },
  {
    version: "1.69.0",
    date: "2026-07-27",
    changes: [
      "Race Logger: the race logger from the broadcast overlays is now available on its own — one file, no OBS, no Python. Download it under “Race Logger” in the menu, paste your personal key once, and every race you drive is recorded and sent to CLS by itself. That log is what Driver of the Day and the stint-planner race analysis run on, so nobody has to hunt for log files after the race any more.",
      "Race Logger: only race sessions are recorded (practice and qualifying are ignored), the file always stays on your own PC as well, and the logger's page has a re-send button if an upload fails.",
      "Driver of the Day: the admin panel now lists the logs drivers uploaded themselves for that round and uses the ticked ones directly — picking files by hand still works and is unchanged.",
    ],
  },
  {
    version: "1.68.0",
    date: "2026-07-27",
    changes: [
      "Stint Planner: German guide at /stint-planner/anleitung, linked from the overview page as “📖 Anleitung (DE)”. Part one is a two-minute read for drivers (open the link, find your stints, read Clock in, Discord reminder); part two covers the whole tool for whoever builds the plan — event setup, pace and fuel-save, per-stint temperature and the ramp, the ±min column during the race, and the post-race analysis from eventresult.json plus race log. With screenshots and an FAQ.",
    ],
  },
  {
    version: "1.67.0",
    date: "2026-07-27",
    changes: [
      "Stint Planner: the driver of the next stint can now get a Discord DM from the league bot before they are due in the car. Switch “🔔 Discord alert” on above the schedule and set the lead time (default 15 minutes). The alert follows the live ± corrections, so it moves with the race instead of with the original plan, and every alert is recorded on the plan — two open pit-wall tabs cannot double-message anyone.",
      "Stint Planner: “Test” next to the alert switch sends the DM for the next upcoming stint straight away — the whole chain, so you find out before the race whether a driver's Discord actually reaches them.",
      "Stint Planner: a driver without a Discord account linked in CLS is named in the planner instead of failing silently. They can link it by signing in to CLS once with Discord.",
    ],
  },
  {
    version: "1.66.0",
    date: "2026-07-27",
    changes: [
      "Stint Planner: new “Poster & impressions” card in After Race. Upload the official finisher certificate or your own result poster, plus up to 20 pictures from the race — livery shots, the start, the moment it went wrong. Thumbnails keep the page short, a click opens the picture full size, and every picture takes an optional caption. Everything is archived with the plan, so the whole team sees it on the share link.",
    ],
  },
  {
    version: "1.65.0",
    date: "2026-07-26",
    changes: [
      "Stint Planner: the temperature ramp now takes three points — start, peak and end, plus the stint the peak falls in (default: the middle stint). The track warms up to the peak and cools off after it, which is what a daytime race actually does. Leave the peak empty and it stays a single straight line from start to end.",
    ],
  },
  {
    version: "1.64.0",
    date: "2026-07-26",
    changes: [
      "Stint Planner: track temperature is now per stint, like the wet flag. Every stint row has a °C field; a stint left blank runs at the plan's Track temp, i.e. exactly the pace you entered. Anything else shifts that stint's lap time by the temperature slope (the Garage 61 fit when there is one, otherwise 1.0 s per 10 °C) — the field turns red when the stint costs time and green when it gains.",
      "Stint Planner: new “🌡 Temp ramp” helper above the schedule — enter the temperature at the start and at the end of the race and every stint is filled with its share of a linear ramp, which you can then correct stint by stint.",
    ],
  },
  {
    version: "1.63.0",
    date: "2026-07-26",
    changes: [
      "Stint Planner: the plan is now split into three tabs — Pre-Race (event setup, pace, drivers, Garage 61, availability), During Race (summary, live tracker, stint schedule, per-driver totals) and After Race (race log, event result). The plan opens on the tab that matches the race clock: before the start Pre-Race, from the green flag During Race, and from 20 minutes after the chequered flag After Race — pick a tab yourself and your choice wins.",
      "Stint Planner: the three note fields now sit in their own section — the pre-race note in Pre-Race, the during-race note in During Race, the post-race note in After Race.",
      "Stint Planner: printing always contains all three sections, whatever is on screen — the pit-wall printout stays complete.",
    ],
  },
  {
    version: "1.62.1",
    date: "2026-07-26",
    changes: [
      "Stint Planner: the empty-drivers hint pointed at a menu that no longer exists.",
    ],
  },
  {
    version: "1.62.0",
    date: "2026-07-26",
    changes: [
      "Stint Planner: adding drivers is now a search field instead of a dropdown with all 315 CLS drivers in it. Type two letters, pick with ↑↓ and Enter — the field keeps focus so a whole line-up goes in without touching the mouse. Accents are ignored, so “Muller” finds “Müller”.",
    ],
  },
  {
    version: "1.61.0",
    date: "2026-07-25",
    changes: [
      "Stint Planner: the race-log dashboard now sits above the event result instead of below it — a 57-entry endurance result made it impossible to find.",
      "Stint Planner: long event results open on your own car class (or the top 10) with a “Show all N entries” link, so the finishing order of a big field no longer buries the rest of the page.",
    ],
  },
  {
    version: "1.60.1",
    date: "2026-07-25",
    changes: [
      "Stint Planner: a race log analysed by an older build has no lap timestamps, so the dashboard silently fell back to the reconstructed driver split even when the stint schedule had drivers assigned. The planner now says so and offers a “Re-analyse log” button that re-reads the file from the archive — no need to find the .jsonl again.",
    ],
  },
  {
    version: "1.60.0",
    date: "2026-07-25",
    changes: [
      "Stint Planner: the race-log dashboard now takes the driver order straight from your own stint schedule. Every real stint from the log is matched to the planned stint it overlaps in time — including the live ± corrections you typed during the race — so the per-driver split is what you planned, not a guess. The fastest-lap reconstruction is only used when no drivers are assigned in the schedule, and the dashboard says which of the two it used.",
    ],
  },
  {
    version: "1.59.0",
    date: "2026-07-25",
    changes: [
      "Stint Planner: team races now show every team driver in the race-log dashboard, not just one. The iRacing race logger records a single driver name per car and never sees the driver swaps, so laps, best lap, average lap and incidents are now taken from the uploaded eventresult.json — iRacing's own per-driver scoring — while the stint split that colours the lap trace is reconstructed from each driver's fastest-lap number and lap count. Everything derived from that reconstruction is marked as such, and the dashboard says so when the reconstruction doesn't add up exactly.",
      "Stint Planner: the event result now also stores our own entry's driver line-up, so the planner knows which car and which drivers are ours. Re-upload the eventresult.json on older plans to enable the per-driver breakdown.",
    ],
  },
  {
    version: "1.58.1",
    date: "2026-07-25",
    changes: [
      "Stint Planner: the lap-trace tooltip no longer covers the chart legend and stays inside the card at both edges.",
    ],
  },
  {
    version: "1.58.0",
    date: "2026-07-25",
    changes: [
      "Stint Planner: the race log is now a team-performance dashboard. It shows only the drivers who sat in your car — laps, best, average, green-lap pace, consistency spread, stints and incidents — as stat cards, a lap-time trace over the whole race (one colour per driver, pit stops marked), and bar charts for pace, consistency, laps and incidents. The fastest lap in your own car class is drawn as a reference line; the rest of the field is no longer listed.",
    ],
  },
  {
    version: "1.57.0",
    date: "2026-07-25",
    changes: [
      "Stint Planner: uploading an eventresult.json no longer fails silently. After a site update, an open planner tab was still talking to the old build — every upload and auto-save died without a word. The planner now checks which version is live, shows a “new version — reload” banner, and reports upload errors instead of swallowing them.",
      "Stint Planner: team events (6h and other endurance races) are listed one row per TEAM with its driver line-up, car class and class position, and your own entry is highlighted — instead of one row per driver stint.",
      "Stint Planner: new “Race log” card — upload the race-logger .jsonl to see the pace each driver actually ran, the real stint lengths and pit-stop times, and how that compares to the plan. One click writes the measured pace and track temperature back into the plan.",
      "iRacing event-result files are now also accepted unwrapped (raw data payload), not only in the { type: \"event_result\", data: … } download format.",
    ],
  },
  {
    version: "1.56.1",
    date: "2026-07-25",
    changes: [
      "Calendar feed (.ics): event durations now cover the whole race evening (practice + qualifying + race) instead of just the race length — GT3 WCT 3h10, PCCD 1h45, SFL Cup 1h45, NASCAR CAS Cup 2h00; other leagues get race length + 45 minutes.",
    ],
  },
  {
    version: "1.56.0",
    date: "2026-07-25",
    changes: [
      "Incident reporting can now be switched off per league: a new “Incident reporting enabled” toggle on the scoring system hides the ⚑ Report incident button and pages everywhere and rejects submissions for that league. Switched off for the NASCAR CAS Cup, which does not use steward reporting.",
    ],
  },
  {
    version: "1.55.1",
    date: "2026-07-24",
    changes: [
      "Calendar feed (.ics) timezone fix: downloaded or subscribed calendar events were showing up 2 hours late (1 hour in winter) in Apple/Google/Outlook calendars. The feed now correctly labels race times as Europe/Berlin local time, so imported events match the times shown on the website — including across summer/winter time changes.",
    ],
  },
  {
    version: "1.55.0",
    date: "2026-07-22",
    changes: [
      "Round schedules now sort by calendar date instead of round number, on both the season page and the admin season overview. Normally these match, so nothing changes — but when a round is postponed to a make-up date (a “Nachholtermin”), it now appears in its real chronological slot at the end of the list instead of stuck in the middle by its round number. Standings, scoring and the R1…Rn round columns are unaffected — they still use round numbers.",
    ],
  },
  {
    version: "1.54.1",
    date: "2026-07-22",
    changes: [
      "Fill-in no-show penalty fix (GT3 WCT): a waiting-list driver who accepts a one-race fill-in offer and then doesn't show up — without declining — now gets the same no-show penalty point as a confirmed grid driver who ghosts a race. Previously the no-show penalty only ever looked at confirmed grid drivers, so an accepted fill-in who no-showed slipped through. Fill-ins who were only offered a slot (never accepted) or who declined the offer are still exempt.",
    ],
  },
  {
    version: "1.54.0",
    date: "2026-07-22",
    changes: [
      "Roster pages now have a “Download JSON” button (next to Download CSV) on both the solo/driver roster and the team roster. It exports the full roster as a structured JSON file including every driver's allocations — car class, Pro/Am and GDC — plus start number, iRacing ID, iRating, team, car and registration status, with a small league/season header. Handy for feeding rosters into overlays, spreadsheets or your own tools.",
    ],
  },
  {
    version: "1.53.0",
    date: "2026-07-22",
    changes: [
      "Round results now offer the raw iRacing results file for download. When you import an eventresult JSON for a round, it's archived and, once the round is published, a small “Source files” box on the public results page lets anyone download the exact eventresult.json — handy for stats tools, re-checks or your own records. Admins also get a download link for the last-imported file on the Import iRacing JSON page. Re-importing replaces the archived file.",
    ],
  },
  {
    version: "1.52.2",
    date: "2026-07-17",
    changes: [
      "Stint Planner fix: the driver-performance dashboard now always shows only the drivers on the plan's roster, even after a page refresh. Previously a plan saved with an older analysis could bring back non-roster drivers on reload until you re-pulled; the dashboard now filters to the roster every time it renders.",
    ],
  },
  {
    version: "1.52.1",
    date: "2026-07-17",
    changes: [
      "Stint Planner fix: ticking a stint Wet now actually lengthens it. Previously the wet penalty only applied if you'd pulled Garage 61 rain data first; without it the penalty defaulted to zero, so wet stints kept their dry length. Wet stints now use the shown wet-penalty default (editable) even with no rain data.",
    ],
  },
  {
    version: "1.52.0",
    date: "2026-07-17",
    changes: [
      "Stint Planner: single vs double-stint optimisation. iRacing's driver swap is a mandatory 30s that runs concurrently with fuelling, so a swap only costs time when it's longer than your refuel — which is exactly what decides whether double-stinting is worth it. New Event fields for the driver-swap floor (default 30s) and your refuel time; when a driver stays in for a second stint (a refuel-only stop) the schedule saves max(0, swap − refuel) at that stop. A “Double stints” checkbox fills the drivers in pairs, and a readout compares single vs double — how many stops are refuel-only and the time/laps saved — telling you when double-stinting genuinely helps and when the swap is already hidden under fuelling (so it doesn't).",
    ],
  },
  {
    version: "1.51.0",
    date: "2026-07-17",
    changes: [
      "Stint Planner: wet weather is now per-stint instead of a whole-race switch, because rain usually arrives mid-race. Each stint row has a Wet tick box, plus a “Rain from stint N” shortcut that marks that stint and all later ones wet (and an “All dry” reset). Wet stints get the wet penalty (seconds per lap) added, so the schedule re-plans exactly where the rain falls — e.g. dry for three stints then wet drops the total laps and can change the number of stops. The wet penalty is still measured from your Garage 61 rain laps (and editable). Wet stints are tinted blue and print as “WET”.",
    ],
  },
  {
    version: "1.50.0",
    date: "2026-07-17",
    changes: [
      "Stint Planner: rain support. Garage 61 records track wetness per lap, so the planner now separates your wet laps from your dry ones — wet laps no longer skew the dry pace and fuel numbers. When you've run in the rain, the performance dashboard shows a Wet weather panel (wet pace and fuel per driver, wetness range, and how much slower wet is than dry), and the Event card gets a Dry/Wet switch: flip to Wet and the whole schedule re-plans at wet pace (fewer laps, fewer stops). The wet penalty is measured from your rain laps when available (e.g. +19 s/lap) and is editable, since real rain varies a lot.",
    ],
  },
  {
    version: "1.49.1",
    date: "2026-07-17",
    changes: [
      "Stint Planner: a Garage 61 pull/import now only includes the drivers on the plan's roster. Pulling a whole Garage 61 team used to bring in everyone who ever ran the track+car; now the laps are scoped to the drivers you've added under Drivers, so the pace/fuel and the performance dashboard show your line-up only. (If the plan has no drivers yet, it still shows everyone.)",
    ],
  },
  {
    version: "1.49.0",
    date: "2026-07-17",
    changes: [
      "Stint Planner: each stint row now has a Note field at the end — jot down anything that happened that stint (contact, spin, rain, safety car, pit issue). Notes are saved with the plan, sync live to everyone on the shared link, and print with the schedule, so they double as a running race log for the debrief.",
    ],
  },
  {
    version: "1.48.0",
    date: "2026-07-17",
    changes: [
      "Stint Planner: a driver-performance dashboard from your Garage 61 data. After you pull or import laps, a new section shows a per-driver stats table (best, median, gap to fastest, consistency, fuel per lap) plus three charts: a pace-and-consistency box plot (who's quick and who's steady), fuel per lap, and lap time vs track temperature. It's saved with the plan, so teammates and the pit wall see the same picture on the shared link. Consistency is measured on temperature-normalised laps so it isn't inflated by the track warming up.",
    ],
  },
  {
    version: "1.47.0",
    date: "2026-07-17",
    changes: [
      "Stint Planner: track temperature now factors into expected lap times. There's a new “Track temp (°C)” field — set your race-day track temperature and the planner adjusts the Standard, Fuel-save and per-driver lap times to it. When you import or pull Garage 61 laps, each lap's track temp is read and, if your laps span a range of temperatures, the planner fits how much lap time changes per degree (measured within each driver, so a fast driver who only ran in the heat can't skew it) and calibrates automatically. If the laps are all at one temperature it falls back to an editable seconds-per-10°C estimate. So laps banked on a cool 20°C test now project sensibly onto a hot 46°C race.",
    ],
  },
  {
    version: "1.46.0",
    date: "2026-07-17",
    changes: [
      "Stint Planner: connect your own Garage 61 account to a plan. Each saved plan now has a “Connect my token” option — paste a Garage 61 personal access token, pick which of your teams to pull from, and the “Pull from Garage 61” button fetches that team's laps. So it's no longer limited to the site owner's account: any team can use their own Garage 61 data. Tokens are encrypted at rest and never shown again; only the plan's creator can set or change one, while anyone with the plan link can pull. Plans without a token fall back to the site's shared token if one is configured.",
    ],
  },
  {
    version: "1.45.0",
    date: "2026-07-17",
    changes: [
      "Stint Planner: pull practice laps straight from Garage 61 — no more exporting spreadsheets. The Garage 61 card now has a “Pull from Garage 61” button that fetches your team's laps for the selected Track and Car directly from the Garage 61 API, then fills the Standard fuel profile and each matching driver's race pace and fuel-per-lap exactly like the .xlsx upload (which still works as a fallback). The track and car are matched automatically by their iRacing IDs. Requires the league's Garage 61 API token to be configured.",
    ],
  },
  {
    version: "1.44.1",
    date: "2026-07-15",
    changes: [
      "Drivers can now retire themselves from a season on the My Registrations page — no need to ask an admin. Hit “Retire” on an approved entry and your results and championship points stay exactly as they are (your name shows with a “Retired” badge), your grid seat is freed, and the next driver on the waiting list is promoted. To keep things fair, coming back is admin-controlled: an admin uses the roster “Un-retire” button, so nobody can flip-flop and bump a just-promoted driver off the grid.",
    ],
  },
  {
    version: "1.44.0",
    date: "2026-07-15",
    changes: [
      "Admins can now retire a driver from a season. On the roster page (every league and season), each approved driver has a Retire button — retiring keeps all of that driver's results, so their championship points and finishing position stay exactly as they are, but their name shows struck-through with a “Retired” badge everywhere it appears (standings, rosters, round results) and they no longer count against the grid's driver limit. On a capped season this frees a seat, so the next driver on the waiting list is automatically promoted and notified. Retired drivers also drop out of future RSVP posts, one-race fill-in offers and no-show penalties. It's fully reversible: an Un-retire button brings a driver back into a confirmed seat if the cap allows.",
    ],
  },
  {
    version: "1.43.0",
    date: "2026-07-15",
    changes: [
      "Stream announcement: the “Stream live” time in the Discord embed is now a separate field from the posting time. Previously the embed reused the “Post at” moment as the advertised stream-live time, so scheduling the post for an earlier day made the embed announce the wrong go-live time. The round’s stream page now has a dedicated “Stream goes live at” field (defaults to the race start); leave it blank to fall back to the post time. Edit it and hit “Refresh embed” to correct an already-posted announcement.",
    ],
  },
  {
    version: "1.42.0",
    date: "2026-07-13",
    changes: [
      "Stint Planner fuel-save optimizer now applies its result and reflects the real driver line-up. Clicking Optimize automatically writes the best (max-distance) strategy — target lap time and fuel per lap — into the Standard profile, so the whole stint schedule updates in one click. The optimizer also weights the pace by your real per-driver lap times (by stints driven) instead of the Standard profile alone, so a slower or faster line-up shifts the recommended number of pit stops.",
    ],
  },
  {
    version: "1.41.0",
    date: "2026-07-13",
    changes: [
      "Stint Planner: import real data from Garage 61 session exports (.xlsx) — no API/token needed. Upload one or more session exports and the planner reads each driver's real race pace and fuel-per-lap from the practice laps (isolating clean full green laps by fuel used, so spins/out-laps don't skew it), shows a per-driver preview, and fills the Standard fuel profile plus each matching roster driver's lap time. Files are parsed in your browser — nothing is uploaded.",
    ],
  },
  {
    version: "1.40.0",
    date: "2026-07-10",
    changes: [
      "Stint Planner: admins can now delete a stint plan. A Delete button appears next to each plan in the list for admins only (with a confirm), handy for clearing out test plans.",
    ],
  },
  {
    version: "1.39.0",
    date: "2026-07-10",
    changes: [
      "Stint Planner is now live for the whole team during a race. On a saved plan, edits — like the ± minute stint corrections — save automatically (no Save button needed) and everyone with the link sees the updated schedule and pit countdowns within a few seconds. Anyone with the link can make corrections (last change wins, ideal for one person on the pit wall); a green “Live · auto-saving” badge shows the sync status.",
    ],
  },
  {
    version: "1.38.0",
    date: "2026-07-10",
    changes: [
      "Stint Planner: a fuel-save strategy optimizer. A new “Optimize” button works out, for the fixed race time, which pace/fuel trade-off covers the most distance — because saving fuel can drop a pit stop and hand back its ~time loss. It shows a table per pit-stop count with the fastest target lap time and fuel/lap that still fits (only saving the minimum needed to drop a stop), the laps per stint, and the total laps, and highlights the strategy that goes furthest — telling you whether to push flat-out or lift-and-coast to save a stop.",
    ],
  },
  {
    version: "1.37.0",
    date: "2026-07-10",
    changes: [
      "Stint Planner: driver availability + spotters. A new Availability grid lets you tick, per driver, which race hours they're available (everyone is available by default). Each stint row now also has a Spotter dropdown next to the driver. Both the driver and spotter menus only offer drivers who are available for that stint's hour, and the spotter can never be the stint's own driver.",
    ],
  },
  {
    version: "1.36.0",
    date: "2026-07-10",
    changes: [
      "Stint Planner: a saved plan can be posted to the CAS Discord with one click. The “Post to Discord” button sends a tidy embed — plan title (linking back to the plan), track, car, race length, stint/stop count and the driver line-up with each driver's stint count — to the team channel.",
    ],
  },
  {
    version: "1.35.0",
    date: "2026-07-10",
    changes: [
      "Stint Planner — three additions: (1) a live “now” tracker — when a session start is set, a green banner shows the current stint, the driver, and a live countdown to the next pit, and the current stint row is highlighted; (2) stint length can now be fuel-limited (default), a fixed time, or a fixed number of laps, plus an optional fuel reserve kept in the tank as a safety margin (with a warning if a stint would need more fuel than the tank holds); (3) a Duplicate button on the plan list clones any plan as a starting point for the next event.",
    ],
  },
  {
    version: "1.34.0",
    date: "2026-07-10",
    changes: [
      "Stint Planner: each plan now doubles as a race document. Three comment boxes — Pre-Race, During-Race and Post-Race — are saved with the plan and shown on the shared link. And at the end of the session you can upload the iRacing eventresult.json: it's archived (with a download link) and parsed into a finishing-order table (position, car number, driver, car, laps, incidents) right on the plan.",
    ],
  },
  {
    version: "1.33.1",
    date: "2026-07-10",
    changes: [
      "Stint Planner: the Track and Car menus now list the full synced iRacing catalog (529 tracks, 193 cars) instead of only the tracks/cars CLS had already raced — so Special-Event venues like Road America are selectable even if CAS has never run there.",
    ],
  },
  {
    version: "1.33.0",
    date: "2026-07-10",
    changes: [
      "Stint Planner: you can now pick the Track and Car from CLS (the tracks CLS has raced and the cars it knows), stored on the plan and shown in the plan list. Each stint row also has a live correction field in minutes (± ) — enter how far a stint ran long or short during the race and every following stint's times shift automatically, with a “Projected finish” readout so you can see the drift from the race length. (Pulling driver lap data from Garage 61 for the chosen track+car is planned as a follow-up.)",
    ],
  },
  {
    version: "1.32.0",
    date: "2026-07-10",
    changes: [
      "Stint Planner now has a master page (/stint-planner) listing every saved plan with its race length, driver count and last-updated time, plus a “New plan” button — the planner itself moved to /stint-planner/new. Drivers are now picked from CLS: the driver menu and per-stint dropdowns list everyone with a CLS registration (no more typing names by hand), so stint plans line up with real drivers.",
    ],
  },
  {
    version: "1.31.0",
    date: "2026-07-10",
    changes: [
      "New Endurance Stint Planner (/stint-planner, in the top nav). A standalone tool for iRacing Special Events: enter race length, lap time, fuel per lap, tank size and pit loss, and it works out laps and fuel per stint, the number of stops, and a full stint schedule. Assign a driver to each stint (with an optional per-driver lap time that lengthens a slower driver's stints), see per-driver totals, an optional wall-clock timeline if you set a session start, and an optional fuel-saving profile. Plans can be saved and shared via a link, and printed. Modelled on the community Enduro Manager spreadsheet.",
    ],
  },
  {
    version: "1.30.0",
    date: "2026-07-09",
    changes: [
      "Driver of the Day now works for two-race rounds (SFL, PCCD, Combined Cup): upload both race logs together and the site picks ONE combined Driver of the Day across the two races — positions gained, overtakes, recovery and clean racing are added up over both races. To keep it fair, a driver has to be classified in both races to win it (a DNF or a skipped race is still shown but can't take the award). Single-race rounds (IEC, GT3 WCT, Nascar) are unchanged.",
    ],
  },
  {
    version: "1.29.0",
    date: "2026-07-08",
    changes: [
      "Round results now have a GDC tab. On seasons with the Gentleman Driver Class enabled (e.g. GT3 WCT), the round results view shows a GDC table alongside Quali, Pro, Am and Teams — listing the GDC drivers with their class-relative GDC points for that race. Previously GDC only appeared in the season standings; now each round's GDC classification is visible too, computed the same way as the standings so the numbers match.",
    ],
  },
  {
    version: "1.28.3",
    date: "2026-07-08",
    changes: [
      "Driver of the Day (admin Race Center): the uploaded source files are now downloadable again. Once a round's Driver of the Day is computed, an “Uploaded source files” box shows ⬇ download links for the archived eventresult.json and race-log.jsonl, so you can retrieve them later (e.g. for a race summary) without re-exporting from iRacing.",
    ],
  },
  {
    version: "1.28.2",
    date: "2026-07-06",
    changes: [
      "Round RSVP & Grid pages: the “Fill-in” badge now points at the driver who actually holds the freed seat. When a waiting-list driver declines their fill-in offer, the seat chains down to the next driver — the badge now follows that same chain instead of always marking the first waiting-list drivers by registration date. Previously a driver who had declined could still show as “Fill-in” while the driver who really took the seat showed only “Waiting list”.",
    ],
  },
  {
    version: "1.28.1",
    date: "2026-07-06",
    changes: [
      "Waiting list (GT3 WCT): the “Startberechtigt Round 1” eligibility flag now only applies to Round 1 of the season, as intended. A driver who joins the waiting list after Round 1 has run can now be auto-offered a fill-in spot for any later round (and is subject to the no-show penalty like any other grid driver) even without the flag set. Previously the flag was wrongly required for every round, so later-registering waiting-list drivers were never offered freed slots.",
    ],
  },
  {
    version: "1.28.0",
    date: "2026-07-04",
    changes: [
      "Team logos can now be uploaded directly. When creating or editing a team (admin), you can pick an image file (PNG, JPG, WebP, SVG or GIF, up to 5 MB) instead of having to host it somewhere and paste a URL — it's stored automatically and shown on the Teams page and rosters. Pasting a URL still works, and editing a team offers a “Remove on save” option for the current logo.",
    ],
  },
  {
    version: "1.27.0",
    date: "2026-07-02",
    changes: [
      "Direct admin penalties (issued without an incident report, e.g. for a wrong league livery) are now shown on the public Incidents page as their own card — marked “DIRECT PENALTY” with the note “Direct penalty point without a reported incident — issued by race control”, listing the driver, the points and the public reason. They are included in the league filter and the header penalty-points total.",
    ],
  },
  {
    version: "1.26.0",
    date: "2026-07-02",
    changes: [
      "Admins/stewards can now issue a manual penalty without an incident report (e.g. wrong or missing league livery). New “Manual penalty” section on the admin Penalty Pool page: pick driver, round, points and a public reason. The penalty behaves like any steward penalty — on deferred-pool seasons (GT3 WCT) it goes into the penalty pool, counts for auto-forgiveness and is released at season end; a Delete button allows mistake correction.",
    ],
  },
  {
    version: "1.25.2",
    date: "2026-06-30",
    changes: [
      "Removed the “Current Leader” card from the season header. The season hero now shows Progress and Next Race (plus Class Leaders on team seasons like the IEC); the full standings remain one click away.",
    ],
  },
  {
    version: "1.25.1",
    date: "2026-06-30",
    changes: [
      "Removed the P1/P2/P3 podium frames from the top of the round results page. The Driver of the Day hero remains the only highlight box above the results; the full classification (with the correct points) is unchanged below it.",
    ],
  },
  {
    version: "1.25.0",
    date: "2026-06-29",
    changes: [
      "The public Incidents page is now a proper decisions overview. Each report is shown as a card (newest first) that, once the steward's decision is published, displays the verdict, exactly how many penalty points (or time/grid penalty) each driver received, and the public reason — so you no longer have to open each report (which was sign-in-only) to see the outcome. Added league filter chips and a header summary (reports, decided, total penalty points applied).",
    ],
  },
  {
    version: "1.24.1",
    date: "2026-06-29",
    changes: [
      "CAS GT3 WCT: the per-round Discord RSVP message now includes a “🏁 Grid & Waiting List” link button to that round's public eligibility overview, so drivers can check who's eligible for the same round straight from the RSVP post.",
    ],
  },
  {
    version: "1.24.0",
    date: "2026-06-29",
    changes: [
      "New public “Grid & Waiting List” page for each round (linked from the round page and the season race calendar). It's a read-only overview showing who is eligible to drive the round, who has been filled in from the waiting list, and who has declined — the same eligibility view admins see, now visible to everyone without any way to change RSVPs.",
    ],
  },
  {
    version: "1.23.1",
    date: "2026-06-28",
    changes: [
      "Fix: the “Eligible” column on the admin round RSVP page now reflects waiting-list promotions correctly. It is computed live from the number of confirmed drivers who declined the round — the first N waiting-list drivers (by registration date) show as eligible — instead of depending on whether a fill-in invite had already been sent. This means declines made before the fill-in invites existed are now counted too.",
    ],
  },
  {
    version: "1.23.0",
    date: "2026-06-28",
    changes: [
      "Waiting-list fill-ins are now easier to confirm. When a confirmed driver declines a round, the next driver on the waiting list gets a Discord DM with Accept / Decline buttons — clicking Accept locks in the race (no need to message the admin), and Decline passes the offer straight to the next driver. The offer is now also sent by email, so drivers are reached even if their Discord DMs are closed. League admins are emailed whenever a fill-in is offered and again when a driver accepts, so the iRacing invite can be ready. The admin round RSVP page shows each fill-in driver's accepted/awaiting status.",
      "The admin round RSVP page now has an “Eligible” column in the all-drivers table (shown on seasons with a waiting list). Confirmed grid drivers are always eligible; each time a confirmed driver declines, the next driver on the waiting list becomes eligible for that round and is marked “fill-in” — giving a clear overview of the waiting-list status for the round at a glance.",
    ],
  },
  {
    version: "1.22.0",
    date: "2026-06-28",
    changes: [
      "Steward review: penalty points can now be handed out to several drivers at once. The decision form has a table where each row picks a driver (any participant of the round, including the person who filed the report), a penalty category, and its own public comment — so different drivers can get a different reason for their penalty point. The per-driver reason is shown on the public Steward Decisions page.",
    ],
  },
  {
    version: "1.21.0",
    date: "2026-06-27",
    changes: [
      "Team seasons (IEC): you can now register an additional team as a non-driving Teammanager even if you already drive (and are Teamchef) in another team. On the My Registrations page, each open team season shows a “+ Register another team as Teammanager” button that opens a form pre-set with you as the manager — add the team, its drivers and pick a Teamchef (which can't be you). Your existing driver registration stays untouched.",
    ],
  },
  {
    version: "1.20.12",
    date: "2026-06-25",
    changes: [
      "Round results: when driver FPR (Fair Play Rating) is enabled, the FPR points a driver earns for the round are now included in the Combined view — folded into the Bonus column and the Total — matching the season standings. Previously FPR only showed up in the championship standings, not on the round page.",
    ],
  },
  {
    version: "1.20.11",
    date: "2026-06-25",
    changes: [
      "Disconnects are now scored sensibly on import (all leagues): a driver who loses connection but completed at least the minimum race distance is recorded as DNF (and scores), instead of being disqualified. A disconnect below the minimum distance still counts as DSQ. Previously every disconnect became a DSQ regardless of how much of the race was completed. Re-import a round's JSON to apply it to existing results.",
    ],
  },
  {
    version: "1.20.10",
    date: "2026-06-25",
    changes: [
      "Multi-race rounds (e.g. SFL Cup): the participation/PCP bonus no longer appears in the individual Race 1 and Race 2 result tabs — those now show pure race points. The PCP bonus is still included in the Combined rating, as per the regulation.",
    ],
  },
  {
    version: "1.20.9",
    date: "2026-06-25",
    changes: [
      "The steward incident review page is now fully in German — headings, labels, buttons, helper texts, status badges (Eingereicht / In Prüfung / Entschieden / Abgewiesen) and the danger zone.",
    ],
  },
  {
    version: "1.20.8",
    date: "2026-06-25",
    changes: [
      "Incident stewarding penalty section is now in German (“Beschuldigter Fahrer”, “Strafpunkte”, “Strafgrund”, “Strafempfänger”) and only the Strafpunkte field remains — the Time penalty and Grid positions inputs were removed, since CAS penalises only with penalty points.",
    ],
  },
  {
    version: "1.20.7",
    date: "2026-06-25",
    changes: [
      "Incident stewarding: the penalty category field and its options are now labelled “Kategorie” (e.g. “Kategorie 0 — 0 pts”), and the “Warning” wording was removed from Kategorie 0.",
    ],
  },
  {
    version: "1.20.6",
    date: "2026-06-25",
    changes: [
      "Incident stewarding: the decision field is now labelled “Urteil”, and the only penalty option is “Strafpunkte (Penalty-Points)” alongside “Kein Vergehen (No action)”. The other verdict types (warning, reprimand, time penalty, grid penalty, suspension) were removed from the steward form, since CAS penalises purely with penalty points.",
    ],
  },
  {
    version: "1.20.5",
    date: "2026-06-25",
    changes: [
      "Penalty pool table for no-show-only leagues (e.g. SFL Cup) now shows the green “clean race” ✓ marker for rounds a driver raced, matching the GT3 WCT pool table design.",
    ],
  },
  {
    version: "1.20.4",
    date: "2026-06-25",
    changes: [
      "Penalty pool table: the “DSQ” marker now only shows for a round when the driver was disqualified in every race of that round. A driver who finished at least one race of a multi-race round cleanly is no longer marked DSQ there — they showed up, so the cell is blank.",
    ],
  },
  {
    version: "1.20.3",
    date: "2026-06-25",
    changes: [
      "Fixed the round results page (Combined view and podium) ordering drivers tied on points inconsistently with the season standings. Ties are now broken the same way everywhere: equal points → fewer incidents ranks higher → more race points → more races completed. Previously two drivers on equal points could appear in a different order on the round page than in the standings.",
    ],
  },
  {
    version: "1.20.2",
    date: "2026-06-25",
    changes: [
      "Fixed multi-race rounds (e.g. SFL Cup, 2 sprints per round) wrongly zeroing a driver's whole round when they were disqualified in just one race. A DSQ now forfeits only the race it happened in — points earned in the other race of the same round are kept. Single-race leagues (GT3 WCT, IEC) are unaffected. Re-score affected rounds via the admin “Recompute scoring” button to apply.",
    ],
  },
  {
    version: "1.20.1",
    date: "2026-06-24",
    changes: [
      "On Pro/Am seasons (e.g. GT3 WCT), the driver's Pro or Am tier now shows as a colored badge across the combined standings, the round results / race / qualifying tables, and the season roster. The redundant empty car-class Class column is hidden on these seasons.",
    ],
  },
  {
    version: "1.20.0",
    date: "2026-06-24",
    changes: [
      "Race points are now awarded by classification, not raw finishing position. When a driver is disqualified (or doesn't score — DNS / below the minimum distance), everyone behind them moves up a place and takes the higher points, so there are no gaps in the points (e.g. a disqualified P4 no longer loses the 29 points — the next driver inherits them). This matches how the Pro/Am class points already worked. Applies to all leagues; existing rounds adopt it the next time their results are imported or re-scored.",
    ],
  },
  {
    version: "1.19.3",
    date: "2026-06-24",
    changes: [
      "Fixed standings showing 0 points for every driver early in a season that uses drop-weeks. The “drop worst N rounds” rule was dropping rounds even when fewer than N had been run (e.g. after Round 1 of a season that drops 3), which subtracted everyone back to zero. Drops now only apply once a driver has more results than the counting allotment (best “total − N” rounds).",
    ],
  },
  {
    version: "1.19.2",
    date: "2026-06-24",
    changes: [
      "Removed the redundant per-class “Pro”/“Am” sub-tables that appeared below the Combined standings (often showing “No results yet”). The dedicated Pro and Am tabs already cover this.",
    ],
  },
  {
    version: "1.19.1",
    date: "2026-06-24",
    changes: [
      "Race-by-race standings: the Driver column header (and the Team header on the team view) is now sortable too — click it to sort alphabetically by name.",
    ],
  },
  {
    version: "1.19.0",
    date: "2026-06-24",
    changes: [
      "Race-by-race standings are now interactive: a search box filters by driver name or number, every column (Pos, Total, Inc, iR and each round) is sortable by clicking its header, and the Driver column stays frozen on the left when you scroll right. The same search, sort and frozen-column behaviour applies to the team race-by-race view (IEC, SFL).",
    ],
  },
  {
    version: "1.18.7",
    date: "2026-06-23",
    changes: [
      "Penalty pool: a disqualified race no longer counts as a clean race, so it does not advance auto-forgiveness. It still shows as a white “DSQ” marker in the table.",
    ],
  },
  {
    version: "1.18.6",
    date: "2026-06-23",
    changes: [
      "Penalty pool table now shows two more per-round markers: a red ✕ when a driver declined that round via RSVP, and a white “DSQ” when a driver raced but was disqualified.",
    ],
  },
  {
    version: "1.18.5",
    date: "2026-06-23",
    changes: [
      "Standings now always list drivers who have raced above drivers who haven't raced yet. Registered drivers with no result are pushed to the bottom of the Combined, Pro and Am tables instead of being mixed in among drivers who scored zero or took incidents.",
    ],
  },
  {
    version: "1.18.4",
    date: "2026-06-23",
    changes: [
      "Fixed the Combined tab on the round results page for Pro/Am seasons (GT3 WCT): it now awards points by overall finishing position (P1=35, P2=33, …) across the whole field, instead of showing class-relative points. The Pro and Am tabs still show class-relative points for the championship.",
    ],
  },
  {
    version: "1.18.3",
    date: "2026-06-23",
    changes: [
      "Penalty pool: a driver who started the race now counts as a clean race even if they were disqualified (as long as they took no penalty points). Disqualified drivers get the green check and their two-clean-races forgiveness still progresses. Only drivers who did not start (DNS) or have no result at all are left blank.",
    ],
  },
  {
    version: "1.18.2",
    date: "2026-06-23",
    changes: [
      "Fixed empty Pro and Am tabs on the round results page for Pro/Am seasons (GT3 WCT). The tabs now split drivers by their Pro/Am tier instead of by car class, so they populate correctly. Affects both the public round page and the admin race-center view.",
    ],
  },
  {
    version: "1.18.1",
    date: "2026-06-23",
    changes: [
      "Fixed a results-import bug in the car-enforced leagues (GT3 WCT, IEC) that wrongly disqualified drivers for “driving the wrong car”. The check now compares the actual iRacing car, so a car simply being renamed by iRacing (e.g. “BMW M4 GT3 EVO”, “Mercedes-AMG GT3 2020”) no longer triggers a false disqualification. Re-import the affected round to clear any wrongly applied DSQs.",
    ],
  },
  {
    version: "1.18.0",
    date: "2026-06-23",
    changes: [
      "“Manage team” now opens right on the roster in a pop-up window instead of taking you to a separate page. Admins and team leaders can change a team's drivers, name, class/car, leadership and manager without leaving the roster — close the pop-up and the roster refreshes automatically. Works on the admin and public rosters and on the My Registrations page.",
    ],
  },
  {
    version: "1.17.1",
    date: "2026-06-23",
    changes: [
      "Fixed the no-show penalty so it only applies to confirmed grid drivers. A driver who is still pending approval, on the waiting list, or (in GT3 WCT) not yet cleared to take a slot no longer receives a no-show penalty point — they were never expected to race and often can't even RSVP yet. Only approved, confirmed entrants who go silent and don't show up are affected.",
    ],
  },
  {
    version: "1.17.0",
    date: "2026-06-22",
    changes: [
      "New “Driver of the Day” for each round. After a race, an admin uploads the iRacing result file plus the race log, and the site picks the standout drive of the day — shown as a hero card at the top of the round page. It deliberately isn't just the race winner: it rewards positions gained, overtakes, fighting back from a bad moment, and clean racing, so the driver who carved through the field gets the spotlight. A driver can't win it two rounds in a row in the same season, and on multiclass events there's a winner per car class. It's recognition only — no championship points.",
    ],
  },
  {
    version: "1.16.0",
    date: "2026-06-21",
    changes: [
      "Teams page: much smarter grouping so each org shows as ONE box. It now merges spelling and punctuation variants (e.g. “CAS Tech Performance” and “CAS-Tech Performance”, “Neon Simsports” and the “Simsport” typo, “DanKüchen” and “DAN Küchen”), the different subteam tags (colours, numbers, brackets like “[petrol]”, dinosaur and Greek-letter names), and an org's division/class/sponsor entries (e.g. AUT/GER, GT3/LMP2, “…by Wallmeier Selected”) into the single main team. Non-teams like “Independent” and “Free Agent” are hidden. Teams can now show their logo on the card — starting with Alemannia Aachen, WS Racing eSports, GermanSimRacing and Melanzani Racing — with a clean initials badge as fallback for the rest.",
    ],
  },
  {
    version: "1.15.0",
    date: "2026-06-21",
    changes: [
      "Combined Cup team championship now matches the rulebook: each round it counts a team's best two drivers ranked by their combined (Race 1 + Race 2) result, scored on race points only (penalties included; participation and fair-play bonuses stay driver-only). Previously it scored the best two per individual race.",
    ],
  },
  {
    version: "1.14.0",
    date: "2026-06-21",
    changes: [
      "New “Teams” page in the top menu: every team across all leagues and seasons shown as a grid of boxes — click a box to open a popup with the drivers behind it (with their number, the leagues/seasons they raced under, and a link to each driver's profile). Subteams are grouped under their main team, so “CAS Tech Performance Green/Blue” or “Alemannia Aachen White/Black” show as a single team. There's a search box to filter by name.",
    ],
  },
  {
    version: "1.13.0",
    date: "2026-06-20",
    changes: [
      "Combined Cup standings now have a dedicated tab for each car (BMW M2, Ray F1600, SpecRacer Ford) alongside the Combined and Team tabs, so you can see the championship for one car at a glance. Every race counts in the per-car standings — the combined drop-week doesn't apply there. The Combined tab now shows just the overall table (the per-car breakdown that used to repeat below it has moved into its own tabs). Participation points now count only toward the Combined standing — the per-car and team championships are scored on race points only.",
    ],
  },
  {
    version: "1.12.0",
    date: "2026-06-20",
    changes: [
      "New “Streams” page in the top menu: every race-stream replay across all leagues in one place, newest first, with thumbnails and a direct link to each YouTube video. Filter by league with the chips at the top.",
    ],
  },
  {
    version: "1.11.3",
    date: "2026-06-20",
    changes: [
      "Race stream matching now looks back across the whole current season by default (previously only ~45 days), so all of a season's rounds get their YouTube stream linked automatically — not just the most recent few.",
    ],
  },
  {
    version: "1.11.2",
    date: "2026-06-20",
    changes: [
      "Race stream matching now scans the whole YouTube channel (not just the ~100 newest videos), so earlier rounds of past seasons are found too, and it understands the “5. Lauf” title spelling in addition to “Lauf 5”.",
    ],
  },
  {
    version: "1.11.1",
    date: "2026-06-20",
    changes: [
      "Race stream matching now works for how CAS-SIM TV actually publishes: it matches the YouTube video by its title (round number — including the German “Lauf N” — plus the track) instead of expecting the upload time to line up with the race start. Stream recordings uploaded a day or two after the race are now found correctly.",
    ],
  },
  {
    version: "1.11.0",
    date: "2026-06-20",
    changes: [
      "Race stream videos: completed rounds can now show the YouTube stream replay embedded right on the round page. Set a league's YouTube channel (@handle or ID) on the league edit page and a background task automatically finds and links each round's stream VOD. Admins can also trigger a match on demand or paste a link by hand from the round page.",
    ],
  },
  {
    version: "1.10.2",
    date: "2026-06-19",
    changes: [
      "Waiting list is now strictly by registration date: the earliest drivers up to the cap always get the grid and later sign-ups go to the waiting list, no matter what order the admin approves them in. Previously, approving a later registration before an earlier one could give the later driver a grid seat. Drivers promoted off the waiting list when a seat frees are notified by Discord DM as before.",
    ],
  },
  {
    version: "1.10.1",
    date: "2026-06-19",
    changes: [
      "Infrastructure: CLS now runs on a self-hosted Hetzner server (managed with Coolify), moved off Vercel and Neon. Same site and features — just a new, fully self-hosted home.",
    ],
  },
  {
    version: "1.10.0",
    date: "2026-06-19",
    changes: [
      "GT3 WCT: new “Eligible R1” (Startberechtigt Round 1) toggle on the admin roster. Brand-new drivers who haven't been classified Pro/Am yet start as not-eligible; the admin decides who may race. When a confirmed driver declines a round, the automatic waiting-list fill-in offer is now only sent to drivers marked eligible. All previously registered GT3 WCT drivers were set to eligible.",
    ],
  },
  {
    version: "1.9.6",
    date: "2026-06-17",
    changes: [
      "Discord community stats: the members table is now sortable — click any column header to sort by member, CLS driver, join date, messages, chat/league activity or status — and each column has its own filter box.",
    ],
  },
  {
    version: "1.9.5",
    date: "2026-06-17",
    changes: [
      "Discord race events: the league logo is now centered with padding on a properly proportioned banner, so it no longer appears oversized/zoomed in the event cover.",
    ],
  },
  {
    version: "1.9.4",
    date: "2026-06-17",
    changes: [
      "Fixed the start time shown on Discord race events. Race times are now interpreted as German time (Europe/Berlin), so an event scheduled for 19:00 shows 19:00 in Germany — and the correct local time for anyone in another timezone — instead of being shifted by the UTC offset.",
    ],
  },
  {
    version: "1.9.3",
    date: "2026-06-17",
    changes: [
      "Fixed Discord race events failing to create — they are now correctly created as external (location-based) events, so the automatic reminder works as intended.",
    ],
  },
  {
    version: "1.9.2",
    date: "2026-06-17",
    changes: [
      "Discord race events: the logo cover image is now best-effort — if Discord rejects it (e.g. an unsupported logo format), the event is still created without the image instead of failing. The admin “Create Discord event” button now also shows the exact Discord error when something goes wrong.",
    ],
  },
  {
    version: "1.9.1",
    date: "2026-06-17",
    changes: [
      "Registration notification emails now include the driver's Discord ID (when known), making it easier to link a new or updated registration to the right Discord member. Shows “— (not linked)” if the driver hasn't connected Discord yet.",
    ],
  },
  {
    version: "1.9.0",
    date: "2026-06-17",
    changes: [
      "Discord race-event reminders: CLS now creates a Discord scheduled event for each upcoming race automatically, so members get Discord's built-in pop-up reminder about 15 minutes before the race starts. Events appear in the server's Events tab with the league logo as the cover image; the start time, 2-hour default duration and round-page link are filled in from the schedule.",
      "Admins also get a “📅 Discord event” button on each round page to create or refresh that round's event on demand (handy after a reschedule).",
    ],
  },
  {
    version: "1.8.0",
    date: "2026-06-17",
    changes: [
      "GT3 WCT penalty points: reverted to the original pool system for every season. Incident penalty points now collect in the penalty pool all season long and are only deducted from the championship at the end of the season, when an admin releases the pool — they no longer come off in the round they were given. Auto-forgiveness for clean races works as before, and the Release buttons are back on the penalty-pool pages.",
    ],
  },
  {
    version: "1.7.0",
    date: "2026-06-17",
    changes: [
      "Team-event season pages (IEC) now show a team-grouped roster: each team is the heading row with its drivers listed underneath, instead of one flat driver list. The team leader is marked with a ★.",
      "That roster is now sortable and filterable — click a column header to sort (the Team column reorders whole teams; Driver, Class, Car, iRacing ID and iRating sort drivers within each team), and each column has a filter box.",
    ],
  },
  {
    version: "1.6.0",
    date: "2026-06-16",
    changes: [
      "Wrong-car disqualification for IEC and GT3 WCT: when results are imported from the iRacing JSON, CLS now compares the car each driver actually raced against the car they registered. If they differ, the result is automatically disqualified (DSQ) and points for that round are forfeited.",
      "The import summary lists every auto-DQ'd driver with the car they drove vs. the car they registered, so you can spot mistakes at a glance. If a car change was approved, just edit the result and clear the DSQ status.",
      "For these two leagues the importer no longer overwrites a driver's registered car with whatever they drove — the registration stays the source of truth. Other leagues are unaffected.",
    ],
  },
  {
    version: "1.5.0",
    date: "2026-06-15",
    changes: [
      "The IEC team roster (admin and public) is now sortable and filterable, like the solo roster. Click a column header to sort: the Team and Registered columns reorder whole teams, while Driver, Class, Car, iRacing ID and iRating sort the drivers within each team. Each column also has a filter box. Teams stay grouped — the team name and controls always sit at the top of each block, however you sort.",
    ],
  },
  {
    version: "1.4.0",
    date: "2026-06-15",
    changes: [
      "Race results now publish only when a round is marked Completed. After a race, admins import the results and can preview the results table and the updated standings exactly as the public will see them — but the public round page shows a \"results are being reviewed\" note and the championship standings stay unchanged until the round is set to Completed.",
      "Admin preview: signed-in admins/stewards see the pending round's results and a standings preview (with an orange \"Preview — admin only\" banner). A new \"👁 Preview public\" button on the admin round page opens the public view. The season schedule shows \"Pending\" instead of a results link until a round is completed.",
      "One-click publishing: the admin round page now has a green \"✓ Publish results\" button (and an \"Unpublish\" button to revert) so you no longer need to open the Edit round form to make results live. Publishing runs the full pipeline — penalty-pool recompute, no-show penalties and the Discord results post.",
    ],
  },
  {
    version: "1.3.2",
    date: "2026-06-15",
    changes: [
      "Added a \"Manage team →\" button to each team on the admin roster (team seasons), matching the public roster.",
    ],
  },
  {
    version: "1.3.1",
    date: "2026-06-15",
    changes: [
      "Withdrawn drivers now disappear from their team on the admin roster and the printable roster, matching the public roster — a driver withdrawn from a team is no longer listed under it.",
    ],
  },
  {
    version: "1.3.0",
    date: "2026-06-14",
    changes: [
      "Waiting list for capped seasons: once a season reaches its driver limit (set via \"Max drivers\" on the season — 50 for the new GT3 WCT season), further approved registrations join a waiting list, ordered by registration date.",
      "Automatic one-race fill-ins: when a confirmed driver declines a race, the driver at the top of the waiting list is automatically offered that round and notified by Discord DM. If that driver also declines, the offer passes down to the next driver on the list; if the original driver un-declines, the offer is withdrawn.",
      "Permanent withdrawals promote the next driver on the waiting list into a confirmed seat (with a Discord DM).",
      "Admins can see and manage the waiting list on the roster page (positions, registration dates, promote/demote) and see each round's fill-ins on the RSVP page. The public roster shows the waiting list with positions and registration dates.",
    ],
  },
  {
    version: "1.2.0",
    date: "2026-06-12",
    changes: [
      "Leagues can now be archived: hidden from the home page, league list and rosters while all data is kept. The TSS GT4 league is archived (paused indefinitely).",
    ],
  },
  {
    version: "1.1.1",
    date: "2026-06-12",
    changes: [
      "Start numbers are now fixed after registration — drivers can still edit car and notes, but start number changes go through an admin.",
    ],
  },
  {
    version: "1.1.0",
    date: "2026-06-12",
    changes: [
      "Drivers can now edit their own registration (car, start number, notes) until their first race result of the season is uploaded — the admin approval is kept. Team changes still go through an admin.",
      "Edit links added on My Registrations and the season page (\"Edit registration →\").",
      "New contact form (/contact): report bugs, change requests and ideas about the website directly to the developer — via the footer button or the floating button at the bottom right of every page.",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-06-12",
    changes: [
      "Baseline release. CLS — CAS League Scoring: six championships, registrations with admin approval, results import, standings, incident reporting & steward decisions, penalty pool with auto-forgiveness (GT3 WCT), Discord RSVP & notifications, team management (IEC), public overlay API.",
    ],
  },
];

export const CURRENT_VERSION = CHANGELOG[0].version;
