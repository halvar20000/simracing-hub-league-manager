#!/usr/bin/env bash
# Deploy: fix the 2-hour offset on Discord timestamps (stream
# announcements + RSVP posts).
#
# DIAGNOSIS
#   <input type="datetime-local"> produces a naive wall-clock string
#   ("2026-05-20T19:00"). The round / stream actions do
#   `new Date(thatString)`. On Vercel the server is UTC, so JS reads
#   it as 19:00 UTC — although the admin meant 19:00 Europe/Berlin.
#   The value is stored as "wall clock tagged UTC".
#
#   The rest of the app never notices: every screen formats with
#   .getUTCHours()/.getHours() the same way, so 19:00 in = 19:00 out.
#   Discord is the exception — <t:UNIX:F> renders against the viewer's
#   real timezone, so a Berlin viewer saw 21:00 for a stored "19:00
#   UTC". Hence the manual -2h workaround.
#
# FIX (scoped to the Discord boundary only — no data migration, no
# change to how the app stores or displays times):
#   * New helper src/lib/timezone.ts — wallClockToInstant() /
#     discordTimestamp() re-interpret the stored UTC wall-clock fields
#     as Europe/Berlin and return the true instant. DST-correct (uses
#     Intl, so +2h in summer / +1h in winter).
#   * discord-stream-embed.ts — race + stream <t:> use discordTimestamp().
#   * discord-rsvp-embed.ts — race <t:> uses discordTimestamp().
#
# No DB / schema changes.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_discord_time_fix.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push"
git add \
  src/lib/timezone.ts \
  src/lib/discord-stream-embed.ts \
  src/lib/discord-rsvp-embed.ts \
  outputs/run_deploy_discord_time_fix.sh
git commit -m "Discord embeds: fix 2-hour timestamp offset

datetime-local inputs give a naive wall-clock string; new Date() on
the UTC Vercel server reads it as UTC, so an admin's 19:00 (Berlin)
is stored as 19:00 UTC. The app is internally consistent (everything
reads .getUTCHours the same way) but Discord's <t:UNIX> renders in
the viewer's real timezone -> Berlin viewers saw +2h.

New src/lib/timezone.ts re-interprets the stored UTC wall-clock
fields as Europe/Berlin and returns the true instant (DST-correct via
Intl). discord-stream-embed.ts and discord-rsvp-embed.ts now run
their startsAt / scheduledStreamAt through discordTimestamp() before
emitting <t:>. Scoped to the Discord boundary — no data migration,
no display changes elsewhere." || true
git push

echo "Done."
