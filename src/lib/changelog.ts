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
