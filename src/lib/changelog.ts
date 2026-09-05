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
    version: "2.3.0",
    date: "2026-09-05",
    changes: [
      "Importing the iRacing JSON of a team race now produces team results. Until today the importer only ever wrote the individual drivers, so an IEC round came out as one long list of names instead of the per-class team tables — LMP2, GT3 and Porsche Cup each with their teams. Upload the eventresult file and the round page shows the class tabs straight away; the team championship picks the round up as well.",
      "Every driver who took a stint is recorded on his team's result with his own laps, laps led, best and average lap and incidents — that is what the driver rows under each team are built from.",
      "A team is recognised by its iRacing team id, and on the first import by the season team of the drivers who drove the car. The iRacing id is remembered from then on, so later rounds match without a detour. The class comes from the drivers' registration, because iRacing's class names (“GT3 2025”, “Dallara P217”, “Porsche 992.2”) are not our class codes.",
      "The import page now says how many team results it built, and names any car it could not tie to a team in this season instead of silently leaving it out.",
      "Individual results are still stored for every driver — driver profiles, penalties, incident reports and the FPR calculation keep working. They are simply not shown on a team round any more.",
    ],
  },
  {
    version: "2.2.1",
    date: "2026-08-27",
    changes: [
      "The Team view on a round page no longer invents a team called “Independent”. Drivers who race without a team were bucketed together there and ranked like a real team — in Combined Cup S11 R1 that fake team even led the round with 106 points. A driver without a team is not a team: he scores for nobody and is simply not listed in the Team view any more. The season Team championship was always right; only the round view was wrong.",
      "The same round view also scored the wrong formula. It always took the best 2 drivers and counted the participation bonus, no matter what the season actually uses. It now reads the season's rules — for the Combined Cup that is the best 3 drivers per round on race points only — so the round Team view and the season Team championship finally show the same numbers (Combined Cup S11 R1: CAS Tech Performance grün 114, not 90).",
      "Each driver row in that view now shows the points that really count for his team, and the “Counts” column marks who made the cut. Where the participation bonus does not count for teams it is struck through instead of quietly added.",
      "The admin result-entry page had the same fake “Independent” team group; it is gone. Team-less drivers are entered from the Combined / Pro / Am tabs as usual.",
    ],
  },
  {
    version: "2.2.0",
    date: "2026-08-27",
    changes: [
      "Stint plans are private now. Until today the planner was wide open: anybody, signed in or not, could open /stint-planner, read every team's plan and even type into it during a race. From now on a plan belongs to the driver who created it. It can be opened by him, by every driver in the line-up, by anyone he adds by hand — and by CLS admins. Nobody else, even with the link.",
      "Building a plan stays open to the whole league: every CLS member can create one. It is reading someone else's that is closed.",
      "The overview page now lists your plans — the ones you created, the ones you are driving in and the ones you were added to — instead of everything on the site.",
      "Every driver you put in the line-up gets access automatically, because the driver rows already carry the CLS account (that is how the Discord stint reminders find them). Take a driver out of the line-up and the access goes with him.",
      "For everyone who belongs on the pit wall without driving — Teamchef, Spotter, Renningenieur — there is a new box on the plan page, “Who can open this plan”. The plan's creator picks them from the CLS driver list and they get the same rights as a driver.",
      "Everyone on a plan may edit it, not just its creator. On the boxenmauer it is rarely the person who built the plan who types the live corrections.",
      "Plans from before today have no recorded creator — that was never stored. They stay open to the drivers who are in them (and to admins), which is exactly the team that ran that race.",
      "The share link on its own no longer grants anything, and neither does the plan's edit token. The same rule now also guards the Discord stint DMs, the “post to Discord” button, the Garage 61 pull and every upload, so a plan id picked out of a chat log is no longer a way in.",
    ],
  },
  {
    version: "2.1.1",
    date: "2026-08-23",
    changes: [
      "Manage Team now shows the Teamchef as what he is — the first driver of the team. His name, iRacing ID and e-mail stand in the driver table with a ★, and only his iRating is editable there, so the line-up on Manage Team matches the roster driver for driver. Until now he was a loose “Your current iRating” field above the table, which made a three-driver team look like it had two.",
      "That field also said “Your” to admins and league staff, who were in fact looking at somebody else's iRating. It now carries the driver's name, both in the form and in the iRating warnings.",
    ],
  },
  {
    version: "2.1.0",
    date: "2026-08-23",
    changes: [
      "A season can now be archived. Old seasons pile up on the league page long after anyone still cares about them — GT3 WCT is on its 13th. Tick “Archive this season” on the season's admin page and it drops out of everything that is meant to show what is running now: the home page, the season grid on the league page, rosters, the race calendar and its subscribable feed, the streams page, the reporting page and the overlay's season picker. Its rounds stop posting to Discord, and it takes no new registrations.",
      "Nothing is deleted and the history stays. The Hall of Fame still credits its champion, drivers keep the season on their profile, its teams stay in the teams overview, and its incident reports and steward decisions stay published.",
      "Every link keeps working. Standings, roster and round pages of an archived season still open, so links already posted in Discord or in a YouTube description don't turn into dead ends. An overlay pointed at a fixed season id keeps feeding too.",
      "In the admin area nothing disappears: archived seasons stay in the league's season list, marked with a 📦 Archived badge. Untick the box to bring one straight back.",
    ],
  },
  {
    version: "2.0.3",
    date: "2026-08-23",
    changes: [
      "The per-team driver limit now also holds on Manage Team. A season can cap how many drivers a team may field — IEC Season 4 is set to 3 — and that cap was checked on the registration form and on the admin roster, but not on Manage Team: that form always offered four teammate rows and saved them all, so a team could quietly grow past its limit. Manage Team now offers exactly as many rows as the season allows and refuses a line-up that goes over it.",
      "The limit is spelled out on the form (“This season caps teams at 3 drivers, the Teamchef included”), so it is clear before saving rather than after.",
      "A team that is already over its limit keeps every driver visible — nobody is silently dropped — and is asked to clear a row the next time the line-up is saved.",
      "Registering the same team a second time can no longer push it over the limit either: drivers already on the roster who are not in the form now count towards the cap.",
    ],
  },
  {
    version: "2.0.2",
    date: "2026-08-23",
    changes: [
      "Registration errors are readable again on seasons that use a personal invitation link. Until now every error on such a season threw the driver onto “Registration is link-protected”, because the bounce-back dropped the invitation link's token. The actual reason — a missing iRating, a locked class, a team name already taken — was never shown. The form now comes back with the real message.",
      "A team whose leader no longer has an account is no longer stuck. If the team leader's user record was deleted or merged away, the team belonged to nobody: the leader could not update the line-up (“This team is already registered. Ask the team leader…”) and Manage Team refused everyone, including him. Any driver still on that team's roster can now take it over, and the team gets its leader back the moment he saves.",
    ],
  },
  {
    version: "2.0.1",
    date: "2026-08-20",
    changes: [
      "Filing a report on behalf of the league is now reachable from where stewards actually work. The admin page of a round has a “⚑ Report as league” button next to Race Center and Preview public, and a “⚖️ Reports” link to the season's case queue. Until now the only way in was the public round page, which meant leaving the admin area to find it.",
      "The incident-report queue also has a round picker at the top: pick the round, the report form opens straight away, newest race first.",
    ],
  },
  {
    version: "2.0.0",
    date: "2026-08-20",
    changes: [
      "The league can now open a case itself. Until now only a driver could file an incident report — if the stewards saw something on the replay that nobody protested, there was no way to put it on the record. A steward or admin now files a report on behalf of the league from the round page, with the same form, the same evidence links and the same case file. On the public incident list and for the driver concerned it appears as “League stewards”, not as the person who typed it, and the steward is not tagged as involved.",
      "Stewards can file at any time. The reporting window still governs drivers exactly as before; for stewards the button stays live and simply reads “File as steward”.",
      "New verdict: Disqualifikation (DSQ). The stewarding form now has a list of the round's results with tick boxes — the accused drivers first. Ticking a driver and saving the verdict sets that result to DSQ: his race points and his participation points for that race are gone, and every driver behind him moves up one place, both in the points and in the printed classification. On rounds with two races only the ticked race is forfeited; the other one keeps its points.",
      "It is reversible. Untick the driver and save again, or delete the verdict, and the result goes back to exactly the status it had before — including a disqualification that came from the results import in the first place. The round is re-scored automatically each time; no manual “Recompute scoring” needed.",
      "Round results now close the gap a disqualification leaves. Before, a disqualified P4 stayed in the table as “DSQ” and the man behind him still read “P5” while quietly scoring P4's points. Any table containing a DSQ is now renumbered so the positions and the points tell the same story. Tables without a disqualification are untouched and keep the original iRacing positions.",
    ],
  },
  {
    version: "1.99.0",
    date: "2026-08-19",
    changes: [
      "A driver who has been reported can finally read what they are accused of. Until now the incident list told you a case existed against you, who filed it and what round it was about — and not one word of the actual description. There was no way to answer something you could not read.",
      "“My Reports” now has a second block, “Reports against me”, listing every report in which you are named as the accused, with the text, the lap, the corner and the evidence the reporter attached. The same report also opens straight from the public incident list, but only for the two people it concerns — a “View details” link appears there for the reporter and for the accused, and for nobody else.",
      "It stays private. The public page still shows only the names and, once published, the verdict — never the written accusation. Being named as a witness is not enough to open it; only the accused, the reporter and the stewards can.",
      "Visible as soon as the report is filed, so there is time to look at your own replay while the race is still fresh, rather than finding out when the verdict lands.",
    ],
  },
  {
    version: "1.98.0",
    date: "2026-08-19",
    changes: [
      "The automatic “📋 Incident reports open” post in Discord is switched off — for every league and every series. It has its own tick box now on the admin league page, under the reports channel, and it starts unticked everywhere. Setting a channel is no longer enough on its own to make it post.",
      "Reporting itself is untouched: the protest window still opens on time, drivers still file reports on the round page, stewards work exactly as before. Only the announcement in Discord stops.",
      "While a league is off, its rounds are quietly marked as announced anyway. That matters if you ever tick the box again — it will post for the races that come after, and never for the ones that already went by. Without it, switching back on would empty months of old protest windows into the channel at once.",
      "The “Announce reporting now” button on the season admin page ignores the tick box, so you can still post it by hand for a single round.",
    ],
  },
  {
    version: "1.97.0",
    date: "2026-08-19",
    changes: [
      "The GT3 WCT standings can be taken away as a spreadsheet. A new “⬇ Export standings (.xlsx)” button above the table downloads an Excel workbook that opens straight in Excel, Numbers or Google Sheets — no copying out of the browser, no lost columns.",
      "The sheet holds more than the page shows at once: the summary columns you already know (position, number, driver, team, class, rounds, incidents, iRating, raw, participation, penalties, total) and then one column per round with that round's points, so the whole season sits side by side and can be sorted, filtered or charted however you like. A Dropped column names the rounds the drop-week rule left out, which is why a driver's round columns need not add up to the total.",
      "Pro and Am come along as their own sheets, and a small Info sheet records the league, the season, when the file was made and what the columns mean.",
      "It exports what the public sees: only published rounds are in the file, even when an admin is previewing a round that has not been marked completed yet.",
    ],
  },
  {
    version: "1.96.0",
    date: "2026-08-15",
    changes: [
      "Drivers can now say what they would rather drive, and the automatic line-up listens. Four new columns next to the availability grid: night, rain, the start, and the most stints in a row a driver wants. “Auto-fill drivers” takes all four into account together with the availability hours and an even share of the driving.",
      "Night is real time on your clock, not the sim's time of day — the window is set on the plan (23:00 to 06:00 by default) and needs a Race start to be worked out at all. Stints that begin in that window are marked ☾ in the schedule, so it is obvious who is being asked to drive at four in the morning.",
      "Preferences are wishes, not rules. The fill will break one rather than leave a stint empty — and it says so afterwards: a report under the table lists every driver with their stints, longest run, night and wet stints, and names in amber whatever had to go against their wish. Availability is stronger: a blocked hour is only used when there is genuinely nobody else, and that too is reported by stint number.",
      "They only apply to the automatic fill. A driver you pick by hand and a ± correction during the race are untouched, exactly as before — and picking a seat by hand clears the report rather than letting it describe a plan that has moved on.",
      "Double-stint mode now respects each driver's own limit: someone who put 1 in “Max row” is never paired, and the pairing never turns into three in a row.",
    ],
  },
  {
    version: "1.95.1",
    date: "2026-08-15",
    changes: [
      "The upload inside Pit-stop model feeds the same lap pool — one session export carries both the stops and the green laps, and it always did go into both. It just wasn't visible from there: the switch lived two cards down in Garage 61. It is now repeated under that upload button, with the current pool size next to it, so you can see what a file dropped there will do before you drop it.",
    ],
  },
  {
    version: "1.95.0",
    date: "2026-08-15",
    changes: [
      "Garage 61 imports can now be added up instead of replacing each other. Until now every session export — and every live pull — threw the previous data away, so a second test evening could only overwrite the first. The new tick box “Add to existing data” next to the upload button keeps the laps of every import and recomputes pace, fuel per lap and the temperature curve over all of them.",
      "It is the raw laps that are kept, not the summaries, so the numbers stay exact: the median is a real median over every lap, and the lap-time-vs-track-temperature fit finally gets the spread it needs — two sessions at 25 °C and 35 °C tell the planner what a degree costs, while one session at a single temperature never can.",
      "The pull and the file upload feed the same pool, so an old test session the API window no longer reaches can be topped up from its export.",
      "A “Lap pool” list shows every import with its laps, drivers and dates, and an × to drop one — a wet session or a run on the wrong setup can be removed and everything recomputes from the rest, instead of having to clear the lot and start again. Re-importing the same file is recognised and replaces the earlier copy rather than counting every lap twice. The pool holds up to 2000 laps; beyond that the oldest import is dropped and the message says which.",
      "Off by default, and existing plans are untouched: without the tick box an import behaves exactly as it always did.",
    ],
  },
  {
    version: "1.94.0",
    date: "2026-08-15",
    changes: [
      "Stint planner, on Johann Solowej's list of wishes. Refuelling is now a plain tick box: “Full” is on for every stop, and only when you untick it does the litres field open — pre-filled with what a full tank would have taken, so a splash is a number you edit down instead of one you have to work out. Next to the fuel a stint burns, the schedule now also shows the fuel LEFT in the tank when the stint ends (above the reserve), which is the number the stop has to put back in.",
      "The lap count of a stint can be typed over. After damage, a shortcut or a lap under safety car the car comes in when it comes in, not when the tank says so — type the laps that were actually run and the whole schedule after it moves. The cell turns amber to show the model has been overruled, and red when the laps typed need more fuel than the car has on board.",
      "New switch in the Race box: “Finish on a whole lap (+ 1)”. A timed race never ends mid-lap — it runs to the end of the lap the clock expires on and one more after that. The planner used to cut the last stint at the exact second, which quietly under-planned the fuel for the finish. With the switch on, the final stint is rounded up to whole laps plus one, using the lap time of the stint the flag falls in, and the finish becomes a projection like it already is in a distance race. Where those laps no longer fit in the tank, the plan honestly shows the extra splash it needs.",
      "Existing plans keep the finish they were built with: the switch is on for new plans only, so an archived plan re-opens with exactly the schedule it was signed off with.",
      "Race evaluation: a new “Ø clean” average lap per driver that ignores the lap into the pits and the lap back out. iRacing's own average divides total time by laps, so a stop sits inside it — a driver doing two stints back-to-back carries two stops in their average and reads slower than someone who did one, and a repair stop wrecks the figure completely. The “Average lap — gap to class best” chart now uses the clean figure, with a button to switch back to iRacing's own number.",
    ],
  },
  {
    version: "1.93.1",
    date: "2026-08-13",
    changes: [
      "Stream announcement: the “📺 Stream live” line in the Discord embed could advertise a time that had nothing to do with the stream. When the “Stream goes live at” field was left empty, the embed silently fell back to the “Post at” time — the moment the bot drops the message into the channel, usually a day or two before the race. The PCCD Oran Park embed therefore promised a stream on Tuesday 22:00 while the race was on Thursday 19:00.",
      "There is no fallback any more: no stream time set means the line is left out of the embed altogether. Better one line less than a wrong appointment. The admin page says so on the field and the Status box now shows “(not set — line hidden in the embed)” instead of pretending a fallback value is a real stream time.",
      "“Refresh embed” used to fail with a bare “Could not refresh: edit-failed” that told you nothing. The banner now carries Discord's own answer — for instance “Maximum number of edits to messages older than 1 hour reached (code 30046)”, a rate limit you hit by clicking Refresh a few times in a row, not a broken button. On top of that, a short rate limit is now simply waited out and retried instead of being handed to you as a failure.",
    ],
  },
  {
    version: "1.93.0",
    date: "2026-08-09",
    changes: [
      "Stint planner: the Drivers table now sits below the Garage 61 block and its charts, because that is the order the work happens in — pull the real laps, look at them, then settle the numbers the plan runs on.",
      "Because that puts the table a long way down the page, building the line-up moved to a new “Roster” box at the top, next to the fuel profiles. It lists who is on the plan and takes new drivers; a name shown in amber has no pace or fuel of their own yet. The add-driver field in the table below is gone — the roster is for who drives, the table for what they drive like.",
      "Fixed a trap that could cost a whole race weekend: a driver's Pace and L/lap cell was outlined green as soon as Garage 61 had data for them, even when the cell was still empty and the pulled figure was only sitting in it as a grey placeholder. It looked exactly like a filled-in value, so a plan could quietly run every driver on the Standard profile. Green now means there is a value in the cell; an empty cell with data waiting is outlined amber.",
      "The roster now says so out loud: any driver in the schedule without their own pace or fuel is named above the table, with a one-click “Apply Garage 61” button when the data is already there, and a note to type the numbers when it is not.",
      "“Apply to plan” no longer disappears after a page reload. It used to work only on a pull made in the same session, so a pull saved with the plan could be seen in the charts but never applied again — you had to pull afresh just to undo a ↺ or to re-project the pace after changing the track temperature.",
      "Above the table, a line explaining what nobody could tell from looking: typing in a cell takes effect immediately and needs no “apply” — that button only copies Garage 61's numbers into the table in the first place.",
    ],
  },
  {
    version: "1.92.0",
    date: "2026-08-09",
    changes: [
      "Combined Cup, 11th Season: the participation points (PCP) were configured with the wrong values — 6 points from 45 % race distance, while the new regulation says 5 points from 75 %. Both are corrected. The season had not been scored yet, so no standing changes.",
      "The 75 % is now measured across the whole round instead of per race. The Combined Cup runs two races per round and the regulation asks for “75 % der Gesamt-Rundenzahl in der kombinierten Wertung” — so a driver who runs one race in full and skips the other has covered half the round, not all of it, and no longer collects the participation points. A new option on the scoring system controls this; every other league keeps the previous per-race reading and is unaffected.",
      "The FPR bonus was checked against the same regulation and needed no change: 0–2 incidents = 3 points, 3–5 = 2, 6–7 = 1, equal incident counts get equal points, and both races of a round must reach 90 % distance.",
    ],
  },
  {
    version: "1.91.0",
    date: "2026-08-09",
    changes: [
      "Stint planner: every stint is now calculated from the driver who is actually in the car. Their own average lap time and fuel per lap from the Drivers table decide how long the stint runs and how many laps come out of a tank — not one shared profile for the whole team. Differences between drivers are often worth a lap a stint, and the plan now shows them.",
      "Fuel saving is an effort on top of that, not a second set of lap times: a fuel-save stint adds seconds per lap and takes litres per lap off that driver's own figures. Two new columns in the Drivers table, “FS +s” and “FS −L”, hold each driver's own saving — lifting and coasting is a skill, and one driver's half second buys what another pays nearly two seconds for. Left blank, a driver uses the gap between the Standard and Fuel-saving profiles.",
      "This fixes a quiet hole in the old model: a driver with their own pace and fuel had the profile replaced outright, so the Fuel-saving profile did nothing at all for exactly the drivers the team had the best data on. The plan showed a saving that never happened.",
      "A driver with no figures of their own still falls back to the Standard profile, but the plan says so now: their stints are marked “est” in the schedule and they are named under the Drivers table, so it is obvious which part of a plan is data and which part is an assumption.",
      "Existing plans are untouched. Every plan saved before this update keeps calculating exactly the way it did — an archived plan re-opens with the schedule it was signed off with. A new switch in Fuel profiles, “Where a stint gets its numbers”, moves an old plan over when you want it; new plans start on the new model.",
    ],
  },
  {
    version: "1.90.1",
    date: "2026-08-07",
    changes: [
      "Privacy policy: added Vercel Blob to the list of recipients. Uploaded images — league and team logos, stint-planner screenshots — are stored there and loaded by your browser directly, so it belongs in the list alongside Hetzner, Discord and Resend. Nothing about how the site works changed; the policy was simply incomplete.",
    ],
  },
  {
    version: "1.90.0",
    date: "2026-08-07",
    changes: [
      "Fix: the “incident reports are open” Discord post had never worked — not for one league, not once since it was built. It was the last notification still sent through a Discord webhook URL, and no league ever had that webhook filled in, so every announcement was silently dropped. It now posts through the CLS bot like every other notification.",
      "By default it goes to the league's RSVP channel, so nothing needs configuring. A new “Reports channel ID” field on the league edit page can send it somewhere else; clearing both switches the announcement off.",
      "The 12 rounds whose protest windows opened while this was broken (GT3 WCT 1-7, SFL 1, 2 and 4, PCCD 1 and 2) were marked as already announced, so nobody gets a burst of notices about races from June and July. The next race to finish is the first one that posts.",
    ],
  },
  {
    version: "1.89.0",
    date: "2026-08-07",
    changes: [
      "Race replays now load only when you ask for them. Until now, opening a round page with a linked video immediately loaded the YouTube or Twitch player, which handed your IP address to Google or Amazon before you had decided to watch anything. The player is now behind a placeholder with a play button: nothing leaves the site until you click it. There is also a link to open the replay directly on YouTube or Twitch instead.",
      "The thumbnails on the Race Streams page came from Google's image servers for the same reason, so every visit to that page pinged Google once per card. They are now fetched by our own server and served from this site, so the page looks exactly the same but your browser only ever talks to league.simracing-hub.com.",
      "The privacy policy has been updated to match: section 10 now states that simply opening a page transmits nothing to YouTube or Twitch, and that loading a player is your own choice.",
    ],
  },
  {
    version: "1.88.0",
    date: "2026-08-07",
    changes: [
      "The site now has an Impressum and a privacy policy, both linked from the footer on every page. Until now it had neither, which is a legal requirement in the EU for a site that carries names, results and Discord logins — not just for shops. Both pages are bilingual, German and English.",
      "The Impressum names the operator, a postal address, phone and email, as required by § 5 DDG in Germany and article 6 III LCEN in France, and adds the usual liability, link and copyright notices plus a trademark disclaimer for iRacing and the manufacturer names used in the league titles.",
      "The privacy policy explains, per GDPR articles 13 and 14, what the site actually stores about a driver and why: the Discord sign-in, the driver profile, iRacing customer ID and ratings, results, penalties, RSVP, incident reports, race-logger uploads, and which of those are public and which are only visible to stewards and admins. It also lists the third parties involved (Hetzner, Discord, Resend, iRacing, and the embedded YouTube/Twitch players), the retention rules, and how to request access, correction or deletion.",
      "Footer wording changed from “No tracking” to “No analytics”. There is still no analytics, no advertising and no profiling on this site — but an embedded YouTube or Twitch player on a round page is loaded from Google and Amazon servers and does see your visit, so the old claim was broader than it should have been.",
    ],
  },
  {
    version: "1.87.0",
    date: "2026-08-06",
    changes: [
      "Twitch replays: rounds can now link a Twitch VOD, not just a YouTube video. The SFL Cup is streamed on Twitch, so its races now show a player on the round page and cards on the Race Streams page like every other league. A league gets this by setting its Twitch channel on the league edit page; a cron then finds the broadcast for each completed round automatically.",
      "The Twitch matcher goes by broadcast time, not by title — a Twitch recording starts when the stream goes live, which is within an hour of the race, while the titles can be misleading (the SFL stream titled “Rennen drei” is in fact round 4, because round 3 was postponed). YouTube keeps matching by title, since those VODs are re-uploads posted days later.",
      "Twitch deletes past broadcasts after 7-60 days, so a linked Twitch replay carries a warning that it may already be gone. Ask the streamer to save a race as a Highlight to keep it permanently — the warning disappears once that happens.",
      "Fix: the “YouTube channel” field on the league edit page silently swallowed anything you typed, including a Twitch URL, and then failed forever inside the cron with no error shown anywhere. It now trims a pasted YouTube channel URL down to the handle and refuses anything else with a clear message pointing at the Twitch field.",
    ],
  },
  {
    version: "1.86.1",
    date: "2026-08-02",
    changes: [
      "Fix: in the leagues that apply penalty points straight away — Porsche Community Cup, IEC, NASCAR, SFL Cup, Combined Cup — a steward penalty was deducted from the championship but was nowhere to be seen on the round results page. The round showed the full points, the standings showed fewer, and nothing explained the difference. The penalty now appears in that round's Pen column and in its cell of the race-by-race table, so the round and the championship add up.",
      "GT3 WCT is unchanged: its points go into the penalty pool and only reach the standings when the pool is released at the end of the season, so they are deliberately not shown on the round.",
      "Drop weeks are unaffected: a penalised round is no more likely to be the dropped one than before. The penalty comes off the season total either way, so letting it decide the drop would cost the driver twice.",
    ],
  },
  {
    version: "1.86.0",
    date: "2026-08-02",
    changes: [
      "Reporting has a fourth penalty category. Kategorie 4 is a “Sondermaßnahme”: it deducts no points at all. Instead the steward types the measure as free text — a warning, a talk with race control, whatever the case calls for — and it is published with the decision next to the driver it applies to.",
      "Because it carries no points, a special measure can be issued with any verdict, not only with “points deduction”. It never reaches the championship standings and never enters the penalty pool.",
      "The scoring system page shows Kategorie 4 without a points box, since there is nothing to configure — it is available in every league automatically. Kategorie 0 to 3 keep their per-league point values exactly as before.",
    ],
  },
  {
    version: "1.85.1",
    date: "2026-07-30",
    changes: [
      "The new no-show rule was applied to the rounds of the 13th season that have already been run, not only to the ones still to come — so the penalty pool reads the same way from round 1 as it will for the rest of the season.",
    ],
  },
  {
    version: "1.85.0",
    date: "2026-07-30",
    changes: [
      "GT3 WCT, from the 13th season: a no-show point can be raced off again. Until now a point for “no RSVP and no-show” sat there for the rest of the season — it was the one demerit forgiveness never touched. From this season it behaves like any other pool point: two clean races take one point off, oldest first, whether that point came from an incident or from a missed round. Andreas asked for it, and it is on for the 13th season only — the 12th keeps the old rule.",
      "The other half of that rule: a no-show now interrupts a clean run. Miss a round without an RSVP and the clean-race counter goes back to zero, so the two races that earn the point back are the two after the no-show, not two you had already banked before it.",
      "Whether no-show points can be forgiven is now a per-season switch on the season settings page, so a future season can be set either way without touching the code.",
      "Fix: automatically forgiven points were shown in the penalty pool but were still deducted in full from the championship when the pool was released at the end of the season. Forgiveness now reaches the standings — which is the point of it.",
    ],
  },
  {
    version: "1.84.0",
    date: "2026-07-29",
    changes: [
      "Stint Planner: a “Clear Garage 61 data” button. It removes the stored analysis — the driver table stops showing Garage 61 columns, the provenance line and the measured pit stops go — and puts the temperature and wet coefficients back to their manual values, so you can start again from a clean pull instead of wondering what is still in there from last time.",
      "Stint Planner: clearing takes two clicks, and the pace and fuel the import had written into the driver table are only wiped if you tick the box for it. By then those are the numbers the schedule is built on, so they are not thrown away by accident — and figures you typed yourself are never touched either way.",
    ],
  },
  {
    version: "1.83.0",
    date: "2026-07-29",
    changes: [
      "Stint Planner: the stint schedule now uses the full width of the window instead of the page column. It is a landscape table — that is why it reads well in Johann's spreadsheet and badly here — and on a normal monitor it roughly doubles the room. The stint number and the driver stay pinned to the left while you scroll sideways.",
      "Stint Planner: every driver has a colour, as in his sheet, shown on the driver picker in the schedule and as a dot in the driver table, the per-driver totals and the availability grid. A double stint is the same colour twice and a swap is a change of colour, so the rotation reads without reading names.",
      "Stint Planner: the spotter column is hidden by default behind a “Show spotter” button — it was the widest column carrying the least information.",
      "Stint Planner: plans now print in landscape, so the schedule fits the paper the way the spreadsheet does.",
    ],
  },
  {
    version: "1.82.0",
    date: "2026-07-29",
    changes: [
      "Stint Planner: the stint schedule now also appears in the Pre-Race phase. It is what an event is planned around — who drives when, where the stops fall, how long each stint runs — so having it only in During-Race meant switching phases to answer a planning question. Both phases render the same table from one definition, so they cannot drift apart.",
      "Stint Planner: the Pre-Race copy leaves out the Note column. Notes are written while the race runs; before it, the column is just width. On paper nothing changes — the schedule still prints once, from the During-Race section.",
    ],
  },
  {
    version: "1.81.0",
    date: "2026-07-29",
    changes: [
      "Stint Planner: the schedule shows the lap time each stint was actually computed with. Everything in the row — laps, length, when the stint ends — falls out of that one number, and until now it was the only thing you could not see. A small amber “+x.x” marks how much slower it is than the driver's own pace; hovering spells out where that came from: pace, temperature, wet or half wet, race traffic.",
      "Stint Planner: the spotter column is now initials, not full names. It cost about a fifth of the table width to show something everyone in the team already knows; the full name is still there on hover.",
    ],
  },
  {
    version: "1.80.0",
    date: "2026-07-29",
    changes: [
      "Stint Planner: the pit-stop model card now holds only what a session can actually measure — pit lane loss, refuel rate, tyre-change time and whether the crew works in sequence. The session-export upload, the measured stops and “Use in this plan” sit directly underneath, so it is obvious where those three numbers come from.",
      "Stint Planner: it also says what cannot fill them. A Garage 61 pull gives pace, fuel per lap and temperature; pit constants can only come from a session export, because the API leaves out in- and out-laps and never reports the fuel added — exactly what a stop is measured from.",
      "Stint Planner: “Tyres still raceable at (%)” moved to Event, next to the other figures you decide yourself. Nothing measures it — it is the floor for double-stinting a set, and that is a team call.",
      "Stint Planner: tyre wear (%/lap) moved out of the pit-stop model and down to the driver table, where the per-driver column already lived. It is a property of the driver, not of the pit lane, and sitting among measured values made it look like the import filled it in. The plan-wide default now sits under that table.",
      "Stint Planner: the measuring session to drive is one click away on the pit card, instead of only appearing once a scan had already found something.",
    ],
  },
  {
    version: "1.79.0",
    date: "2026-07-28",
    changes: [
      "Stint Planner: Garage 61 data from short tracks works again. Lap times had to be over a minute to count as a full lap, so anything quicker — Lime Rock, Okayama, most ovals — imported as nothing at all, from the live pull and from an uploaded session export alike. A full lap is now measured against the session's own laps, so it works from a 15-second oval to the Nordschleife.",
      "Stint Planner: that failure used to report itself as “none matched your roster drivers”, which sent you looking at names that were perfectly fine. The two cases are now told apart: if the names really don't match you get the names Garage 61 has, and if the laps simply weren't usable it says so.",
      "Stint Planner: the pit-stop scan no longer counts leaving the garage at the start of a session as a pit stop (it was worth several minutes and skewed the measurement). A failed scan now says why, and both the scan and the empty state spell out the session to drive — including the fuel-only stop, without which a fill and a tyre change cannot be told apart.",
      "Stint Planner: a stop labelled “tyres only” that also splashed some fuel no longer charges that fuel to the tyre-change time.",
    ],
  },
  {
    version: "1.78.0",
    date: "2026-07-28",
    changes: [
      "Stint Planner: pit-stop constants can now be measured instead of typed. Upload a Garage 61 session export in which you drove the pit lane a few times — through without stopping, stopped without service, tyres only, tyres and fuel — and CLS reads the stops out of it: the last sector before the pits plus the first sector after, against a clean-lap reference. That gives the time each stop cost; the export supplies the litres.",
      "Stint Planner: say what happened at each stop (the file records the fuel, never the tyres) and the lane loss, tyre-change time and refuel rate fall out — plus whether the tyre change adds to the fuelling or hides under it. One click puts them in the plan; admins can save them to the pit-reference library for that car and track, so nobody measures the same car twice.",
      "Stint Planner: figures the session cannot support come back empty with the reason (“no tyres-only stop, so the tyre-change time could not be measured”) rather than as a plausible guess.",
      "This is Johann Solowej's measuring method, automated — it reproduces his Spa spreadsheet to a hundredth of a second.",
    ],
  },
  {
    version: "1.77.0",
    date: "2026-07-27",
    changes: [
      "Stint Planner: the pit-stop breakdown now reads correctly when tyres run parallel to fuelling. The total was always right, but it listed “23 lane + 65.2 fuel + 20 tyres” for an 88.2 s stop — the tyre change hides under the refuelling, so it now says so instead of showing parts that appear not to add up.",
      "Stint Planner: a Garage 61 pull is now saved with the plan straight away. Until now it only lived in the open page — leave the plan and come back and the tables were showing whatever was applied last time, which is why a 30-day pull seemed to fall back to the full history. The pulled data stays until you pull again.",
      "Stint Planner: the driver table says what it is built on — Garage 61 or a session export, the window used, the date range of the laps, how many older laps were left out and when it was pulled. No more guessing whether a table shows last week or last season.",
      "Stint Planner: “Apply to plan” still does the deliberate part — writing pace and fuel per driver into the figures the schedule runs on. Only that step touches your numbers.",
    ],
  },
  {
    version: "1.76.0",
    date: "2026-07-27",
    changes: [
      "Stint Planner: the driver table is now a full performance table. Next to each driver's pace, fuel per lap and tyre wear it shows the range per stint — how many laps that driver gets out of a tank and how long that takes at their own pace — plus the laps and stints they run in the current schedule. Underneath sits the team average, weighted by laps driven, and an even share of the distance, with anyone under 85 % of it flagged.",
      "Stint Planner: the pace in that table is the Garage 61 average projected to the plan's track temperature, and the range includes the race-traffic penalty — so the numbers you look at are the ones the schedule runs on. Per-stint temperatures, ½ wet and full wet are then applied stint by stint on top.",
    ],
  },
  {
    version: "1.75.0",
    date: "2026-07-27",
    changes: [
      "Stint Planner: a Garage 61 pull can be limited to recent data — current season (the new default), this + last season, or the last 30/60/90 days. Pace from an older season was set on a different BoP, a different tyre model and often a different track surface, so it quietly biases a plan; now it can be left out.",
      "Stint Planner: the pull tells you what it used — the window, how many older laps were left out, and the date range of the laps it kept. If the laps carry no date, it says so instead of pretending the filter worked.",
    ],
  },
  {
    version: "1.74.0",
    date: "2026-07-27",
    changes: [
      "Stint Planner: the track condition per stint is now dry, ½ wet or wet instead of a wet tick-box. A damp or drying track costs its own penalty per lap — by default 45 % of the full-wet figure, or enter your own. The “rain from stint” tool got a ½ wet button, so a drying race can be planned as it really unfolds: wet, then damp, then dry.",
      "Stint Planner: new “Race traffic” penalty in seconds per lap, added to every stint. Practice pace is set alone on an empty track; in the race there is traffic, dirty air and cars to pass, and nobody runs their practice pace for six hours. The fuel-save optimiser uses it too, so its strategies are compared at race pace instead of practice pace.",
      "Plans saved before this keep working: a stint that was ticked wet is now simply “wet”.",
    ],
  },
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
