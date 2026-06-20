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
