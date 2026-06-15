# League Manager — Self-Hosting Runbook

Move CLS off Vercel + Neon onto one small VPS. Fixed cost **~€4.35/month**, no usage metering, no "Fluid Active CPU" pauses. Replaces **both** bills.

## Why this stack

- **Hetzner Cloud CX22** — 2 vCPU, 4 GB RAM, 40 GB NVMe, ~€4.35/mo, datacenter in Germany (Falkenstein/Nürnberg). Plenty for this app + Postgres.
- **Coolify** (free, open-source, self-hosted) — basically self-hosted Vercel. Git-push deploys, automatic Let's Encrypt HTTPS, a managed Postgres container, built-in scheduled tasks (crons) and automated DB backups. Keeps the workflow you already have.
- **Local Postgres** in a container on the same box — no compute-hour metering, ever. This is what kills the Neon problem.

Total: **~€4.35/mo** vs Vercel Pro ($20) + Neon paid (~$19). Cancel both once cutover is verified.

---

## What only YOU can do (I can't from the sandbox)

1. Create a Hetzner account + the server (needs your payment method).
2. Point DNS for `league.simracing-hub.com` at the new server IP.
3. Hold the secrets (Discord tokens, PayPal, AUTH_SECRET, etc.) — copy them from the Vercel dashboard.

Everything else (Coolify config, env wiring, DB migration, verification) I can walk you through live via the browser when you're ready — just say so.

---

## Phase 0 — Prep (before touching anything)

- [ ] In Vercel dashboard → project → Settings → **Environment Variables**: export/screenshot the full list. You'll re-enter them in Coolify. Expect: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_DISCORD_ID`, `AUTH_DISCORD_SECRET`, `AUTH_URL`, `INITIAL_ADMIN_DISCORD_USERNAMES`, `IRLM_USERNAME`, `IRLM_PASSWORD`, `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, `DISCORD_APPLICATION_ID`, `CRON_SECRET`, PayPal keys, and `BLOB_READ_WRITE_TOKEN` (see Phase 5).
- [ ] Lower the DNS TTL for `league.simracing-hub.com` to 300 s now, so the cutover later is fast.
- [ ] Note where `simracing-hub.com` DNS is managed (registrar / Cloudflare?). Tell me and I'll give you the exact record to change.

## Phase 1 — Server

1. Hetzner Cloud Console → new project "cls" → **Add Server**.
2. Location: Falkenstein or Nürnberg. Image: **Ubuntu 24.04**. Type: **CX22**.
3. Add your SSH key. Enable backups (optional, +20%, ~€0.90/mo — recommended).
4. Create. Note the public IPv4.
5. SSH in: `ssh root@SERVER_IP`. Then harden minimally:
   ```bash
   apt update && apt -y upgrade
   ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw allow 8000 && ufw --force enable
   ```
   (Port 8000 is Coolify's dashboard — you can close it again after setup.)

## Phase 2 — Coolify

1. Install:
   ```bash
   curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
   ```
2. Open `http://SERVER_IP:8000`, create the admin account (first user wins — do this immediately).
3. Settings → set your instance domain later; for now continue.

## Phase 3 — Database

1. In Coolify: **+ New Resource → Database → PostgreSQL**. Pick **Postgres 17** (matches Neon). Name it `cls-db`.
2. Deploy it. Copy the **internal connection string** Coolify shows (looks like `postgres://postgres:PASS@cls-db:5432/postgres`). This becomes the app's `DATABASE_URL`.
3. Migrate data from Neon → see `migrate-db-from-neon.sh` in this folder. Run it **from home or from the VPS** — your office WiFi blocks port 5432 (known issue). Steps it does:
   - `pg_dump` the Neon database to a `.dump` file (custom format, `--no-owner`).
   - `pg_restore` it into the Coolify Postgres.
   - Because the schema is Prisma-managed, you can alternatively let the app run `prisma db push` on first boot and only restore the *data* — but a full dump/restore is simplest and preserves everything.

## Phase 4 — App

1. **+ New Resource → Application → Public/Private Git Repository** → connect GitHub (install Coolify's GitHub App so it can read the private repo) → pick `halvar20000/simracing-hub-league-manager`, branch `main`.
2. Build pack: **Dockerfile** (use the `Dockerfile` in this folder — copy it to the repo root) for deterministic builds. Nixpacks auto-detect also works but the Dockerfile is safer for Prisma.
3. Set the domain to `https://league.simracing-hub.com`. Coolify provisions SSL automatically once DNS points here (Phase 6).
4. Paste **all** env vars from Phase 0. Change `DATABASE_URL` to the Coolify internal string from Phase 3. Set `AUTH_URL=https://league.simracing-hub.com`.
5. One-line repo change needed for the Dockerfile build — add to `next.config.ts`:
   ```ts
   const nextConfig: NextConfig = {
     output: "standalone",   // <-- add this line
     experimental: { serverActions: { bodySizeLimit: "25mb" } },
   };
   ```
6. Deploy. The Dockerfile entrypoint runs `prisma migrate deploy` (or `db push`) then starts the server.

## Phase 5 — File uploads (`@vercel/blob`) — DECISION NEEDED

The app uploads files (stream posters, IEC result JSON) via `@vercel/blob`. Two paths:

- **A. Keep it (recommended for cutover).** The `@vercel/blob` SDK works from any host, not just Vercel — you just need `BLOB_READ_WRITE_TOKEN` (Vercel dashboard → Storage → your Blob store → Tokens). Free tier is generous. Zero code change. Revisit later.
- **B. Cut Vercel entirely.** Swap blob calls for local-disk storage on a Coolify volume, or Cloudflare R2 (S3-compatible, free egress). Small code change. Do this as a follow-up, not during cutover.

Start with **A** so the migration is low-risk. We can do **B** later if you want zero Vercel footprint.

## Phase 6 — DNS cutover

1. Verify the app responds on the server IP first (Coolify gives a temporary URL, or test with a hosts-file override).
2. Change the `league.simracing-hub.com` **A record** → new server IPv4. (Remove the old Vercel CNAME/A.)
3. Wait for propagation (fast, since TTL=300). Coolify issues the Let's Encrypt cert automatically.
4. **Discord OAuth + Interactions** need NO changes — the domain is identical, so the callback (`/api/auth/...`) and Interactions Endpoint (`/api/discord/interactions`) just work. PayPal return URLs likewise.

## Phase 7 — Crons

- The 6 GitHub Actions workflows (`cron-*.yml`) curl endpoints on `league.simracing-hub.com`. After cutover they hit the VPS instead of Vercel — **no change needed**, and now they cost nothing (local Postgres). Confirm `CRON_SECRET` matches what's set in Coolify.
- The one `vercel.json` cron (`notify-reporting-open`, daily 09:00 UTC) is the only Vercel-native scheduler. Recreate it either as a Coolify **Scheduled Task** (`curl -H "Authorization: Bearer $CRON_SECRET" https://league.simracing-hub.com/api/cron/notify-reporting-open`) or add it as a 7th GitHub Actions workflow. `vercel.json` can then be deleted.

## Phase 8 — Verify, then decommission

- [ ] Sign in with Discord (tests AUTH + DB).
- [ ] Load a season standings page (tests reads).
- [ ] Submit a test RSVP from the website widget (tests writes + Discord bot).
- [ ] Trigger one cron manually and confirm 200 + expected Discord post.
- [ ] Confirm the public overlay API (`/api/overlay/standings?league=cas-gt3-wct`) returns data for your OBS overlay.
- [ ] Watch Coolify Postgres backups run once.
- [ ] Only then: **cancel Vercel Pro** and **delete the Neon project** (export a final Neon backup first).

## Backups (don't skip)

- Coolify → the Postgres resource → **Backups**: schedule daily, retain 7–14 days, and set an off-box destination (an S3 bucket or your Nextcloud via a script). A VPS can die — the DB is your league's history.
- Hetzner server snapshots/backups cover the whole box (the +€0.90/mo option in Phase 1).

## Cost recap

| Item | Now | After |
|---|---|---|
| Vercel | Pro $20/mo | €0 (cancel) |
| Neon | heading to ~$19/mo | €0 (delete) |
| Hetzner CX22 | — | €4.35/mo |
| Hetzner backups (opt.) | — | ~€0.90/mo |
| **Total** | **~$39/mo** | **~€4–5/mo** |
