# Cutover Checklist — Neon/Vercel → Hetzner (zero data loss, ~minutes downtime)

Goal: 100% of the data transferred, writes frozen only for a few minutes, reads
available throughout, no split-brain. Everything user-facing lives in Postgres;
files stay on `@vercel/blob` (no file migration). Only Postgres moves.

## Decisions locked in
- Keep `@vercel/blob` through cutover → no file migration, both apps share the store.
- No Cloudflare (all users in EU) → DNS A-record points straight at the Hetzner IP.
- Schema applied with `prisma db push` (NOT migrate — migrations are drifted).

---

## T-7 to T-1 days — Stage and verify (no downtime, old site untouched)
- [ ] Hetzner CX22 up, Coolify installed (runbook Phases 1–2).
- [ ] Coolify Postgres `cls-db` (Postgres 17) deployed (Phase 3).
- [ ] App deployed in Coolify against a **throwaway restore** of a Neon dump, all
      env vars set, `output:"standalone"` added (Phases 4–5).
- [ ] Functional test on the temporary URL: Discord login, standings, RSVP write,
      one cron, overlay API. Fix anything now, not on cutover night.
- [ ] Measure DB size to size the window:
      `SELECT pg_size_pretty(pg_database_size(current_database()));`
- [ ] Lower DNS TTL for `league.simracing-hub.com` to 300 s (if not already).
- [ ] Drop the throwaway data so the real restore goes into a clean DB.

## T-0 — Cutover (the only window with frozen writes)

1. [ ] Pick a dead-quiet time (late evening, no race/import imminent). Post a
       short maintenance notice in Discord.

2. [ ] **Freeze writes on Neon** (reads keep working):
   ```sql
   ALTER DATABASE neondb SET default_transaction_read_only = true;
   ```
   (Use the actual DB name. New transactions become read-only; existing pooled
   connections pick it up on their next transaction. Optional belt: also pause
   the Vercel app so there are zero writers.)

3. [ ] **Final dump + restore** into Hetzner Postgres:
   ```bash
   bash deploy/migrate-db-from-neon.sh   # run from home or on the VPS, not office WiFi
   ```

4. [ ] **Verify the copy** — counts must match and newest rows must be present:
   ```bash
   # row counts per table, both DBs, then diff
   psql "$NEON_URL"   -At -c "select relname, n_live_tup from pg_stat_user_tables order by relname" > /tmp/neon_counts.txt
   psql "$TARGET_URL" -At -c "select relname, n_live_tup from pg_stat_user_tables order by relname" > /tmp/hetz_counts.txt
   diff /tmp/neon_counts.txt /tmp/hetz_counts.txt && echo "COUNTS MATCH"
   ```
   (n_live_tup is approximate; for the key tables also eyeball
   `SELECT max(createdAt) FROM "Registration";` etc. on both.)
   - [ ] Counts match / newest records present. **Do not proceed otherwise.**

5. [ ] **Flip DNS**: `league.simracing-hub.com` A-record → Hetzner IPv4.
       Remove the old Vercel record. Coolify auto-issues the Let's Encrypt cert.

6. [ ] **Smoke-test the live domain** (now on Hetzner):
   - [ ] `https://league.simracing-hub.com` loads over HTTPS.
   - [ ] Discord sign-in works (AUTH + DB).
   - [ ] A season standings page renders.
   - [ ] Submit one test RSVP from the site (write + Discord bot).
   - [ ] `curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/notify-reporting-open` → 200.
   - [ ] Overlay API returns data: `/api/overlay/standings?league=cas-gt3-wct`.

7. [ ] Lift the Discord maintenance notice. Migration done.

## T+0 to T+24h — Watch, then decommission
- [ ] Leave the old Vercel app **frozen but up** as a fallback for ~24 h.
- [ ] Confirm Coolify Postgres **backups** ran at least once, to an off-box target.
- [ ] After a clean day: cancel Vercel Pro, delete the Neon project (keep the final
      `.dump` as your archived backup).

## Rollback (if step 6 fails badly)
- [ ] Point DNS back to Vercel.
- [ ] Re-enable writes on Neon:
      `ALTER DATABASE neondb SET default_transaction_read_only = false;`
- [ ] You've lost nothing — Neon was the source of truth the whole time.
