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
