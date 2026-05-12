# RSVP feature — manual test plan

Run through this after deployment to verify the Discord-integrated RSVP system
works end-to-end.

## 0. Prereqs

- [ ] `bash outputs/lm_db_push_rsvp.sh` has completed without error
- [ ] Vercel env vars set: `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`,
      `DISCORD_APPLICATION_ID`
- [ ] Discord app's Interactions Endpoint URL is set to
      `https://league.simracing-hub.com/api/discord/interactions`
      and saved (green checkmark in Discord Developer Portal)
- [ ] Bot has been added to the guild with `Send Messages` + `Embed Links`
      permissions
- [ ] On the target league (start with CAS GT3 WCT): admin → edit league →
      filled in **Discord Guild ID**, **RSVP channel ID**, **Post N days
      before** (e.g. 7)

## 1. Cron posts the message

- [ ] Pick an UPCOMING round in an ACTIVE / OPEN_REGISTRATION season whose
      start time is **less than** `rsvpDaysBefore` days away. (If none, use
      the admin override in step 2.)
- [ ] Wait for the next `*/30` cron tick (or manually trigger via
      GitHub Actions → "Post RSVP messages" → Run workflow)
- [ ] Verify: an embed appears in the configured channel with title
      "🏁 RSVP — CAS GT3 WCT", three buttons (Accept / Decline / Tentative),
      live tally (`✅ 0 · ❌ 0 · ❔ 0`), and the race start as a relative
      timestamp like "in 6 days"

## 2. Admin can post / refresh manually

- [ ] Go to
      `/admin/leagues/cas-gt3-wct/seasons/<id>/rounds/<id>/rsvp`
- [ ] Click "Repost now" → another message appears in Discord and the new
      message ID shows in the admin page
- [ ] Click "Refresh embed" → no new message, the existing one is edited
      with current state

## 3. Discord button → DB write

- [ ] Click "Accept" on the Discord message as a driver who has a
      Registration in the season
- [ ] You should see an ephemeral reply: "✅ Accepted — RSVP recorded for
      <name>."
- [ ] The Discord embed updates: tally shows `✅ 1 · …`, your name appears
      under "Accepted"
- [ ] The admin overview page shows you under "Accepted" with source =
      `discord`
- [ ] Re-click "Tentative" → ephemeral confirmation, embed and admin overview
      both reflect the change

## 4. Discord button as non-registered user

- [ ] Have a Discord user with no Registration in the season click any button
- [ ] You should see an ephemeral reply pointing them to the sign-up URL
- [ ] No `RoundRsvp` row is created in the DB

## 5. Website widget mirrors

- [ ] Sign in as a registered driver, open the public round page
- [ ] The RSVP widget shows under the header with your current selection
      highlighted
- [ ] Click a different status → widget updates, Discord embed updates within
      a couple of seconds (the bot edit happens fire-and-forget on the server)

## 6. Reminder pings

- [ ] To test without waiting, manually trigger the
      "RSVP reminder pings" GitHub Actions workflow on a round that's
      within the 48h–24h window
- [ ] Verify the bot posts a follow-up message in the channel mentioning
      only silent drivers (those with no `RoundRsvp` row)
- [ ] Verify the round's `rsvpReminder48hAt` is now set in DB

## 7. No-show penalty (GT3 WCT only)

This is the critical one. Use a test season if possible.

- [ ] Setup: in a GT3 WCT season, a round with a few Registrations. Some
      drivers should have RSVP'd (Accept/Decline/Tentative), one should
      have not responded at all. None of the silent driver's `RaceResult`
      rows exist.
- [ ] Admin → round edit → set status to `COMPLETED` → Save
- [ ] Check DB: a `Penalty` row should exist for the silent no-show driver
      with `source = NO_RSVP_NO_SHOW`, `type = POINTS_DEDUCTION`,
      `pointsValue = 1`, `reason = "No RSVP and no-show"`
- [ ] The driver should NOT have a penalty if they RSVP'd Decline (or Accept
      or Tentative) — only true silence + no-show
- [ ] The penalty pool page at
      `/leagues/cas-gt3-wct/seasons/<id>/penalty-pool` should include this
      penalty in the driver's active pool
- [ ] If you flip the round status back away from COMPLETED, the auto
      penalty should be cleared

## 8. Other leagues should NOT get the penalty

- [ ] Repeat step 7 in a non-GT3 WCT league (e.g. CAS PCCD or CAS Combined Cup)
- [ ] Confirm NO penalty is created — the rule is GT3 WCT only
- [ ] All other functionality (Discord posting, buttons, widget, admin
      overview) should still work in the other leagues
