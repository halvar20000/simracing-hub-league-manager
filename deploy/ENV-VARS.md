# Environment variables to recreate in Coolify

Captured from the Vercel project's Environment Variables (14 Jun 2026).
Copy each VALUE from Vercel into the Coolify app's Environment Variables tab.
Keys only here — values are secret and stay with Thomas.

## IMPORTANT: Vercel hides "Sensitive" values — you cannot copy them out of Vercel.
## Get each value from its SOURCE instead (Claude never needs to see them; Thomas
## types them straight into Coolify):
##  - Not secret, read from source: DISCORD_APPLICATION_ID, DISCORD_PUBLIC_KEY,
##    AUTH_DISCORD_ID (Discord Dev Portal); CAS_DISCORD_GUILD_ID,
##    CAS_DISCORD_INVITE_URL; RESEND_FROM (the from-address).
##  - Known/retrievable credentials: IRACING_EMAIL/PASSWORD (iRacing login),
##    IRLM_USERNAME/PASSWORD (iRLeagueManager login), AUTH_DISCORD_SECRET +
##    DISCORD_BOT_TOKEN (Discord Portal: copy if saved, else Reset),
##    RESEND_API_KEY (Resend dashboard: create new key if not saved),
##    BLOB_READ_WRITE_TOKEN (Vercel -> Storage -> Blob store -> Tokens; shown there).
##  - Regenerate: AUTH_SECRET (openssl rand -base64 32; logs everyone out once),
##    CRON_SECRET (new value; also update the GitHub Actions repo secret to match).
##  - Timing: values you RESET (e.g. bot token) break the live Vercel site instantly;
##    prefer saved copies, otherwise reset at cutover, not before.

## Status of values
## SECURED via `vercel env pull` (in .env.from-vercel, dev scope = cross-env values):
- [x] AUTH_SECRET
- [x] AUTH_DISCORD_ID
- [x] AUTH_DISCORD_SECRET
- [x] BLOB_READ_WRITE_TOKEN  # keep @vercel/blob through cutover (works off-Vercel)
## STILL TO GATHER (sources noted above):
- [ ] DISCORD_BOT_TOKEN       # Discord Portal -> Bot (copy if saved, else Reset)
- [ ] DISCORD_APPLICATION_ID  # Discord Portal -> General Info (not secret)
- [ ] DISCORD_PUBLIC_KEY      # Discord Portal -> General Info (not secret)
- [ ] CAS_DISCORD_GUILD_ID    # known
- [ ] CAS_DISCORD_INVITE_URL  # known
- [ ] RESEND_API_KEY          # Resend dashboard (new key if not saved)
- [ ] RESEND_FROM             # the from-address, e.g. noreply@simracing-hub.com
- [ ] IRLM_USERNAME           # iRLeagueManager login
- [ ] IRLM_PASSWORD           # iRLeagueManager login
- [ ] IRACING_EMAIL           # iRacing login
- [ ] IRACING_PASSWORD        # iRacing login
- [ ] CRON_SECRET             # generate fresh + update GitHub Actions repo secret
## IGNORE: VERCEL_OIDC_TOKEN (Vercel-internal, not needed on the new host)

## Change for the new host
- [ ] DATABASE_URL  -> use the Coolify Postgres INTERNAL url (not the Neon one).
      Coolify: Postgres resource -> "Postgres URL (internal)". Format:
      postgres://postgres:<pw>@<db-host>:5432/postgres

## Add new (were not needed on Vercel — it auto-detected the URL)
- [ ] AUTH_URL=https://league.simracing-hub.com
- [ ] AUTH_TRUST_HOST=true   # NextAuth v5 self-host: trust the proxy host

## Double-check
- [x] Confirmed complete — IRACING_PASSWORD is the newest var; nothing hidden above it.
      Full set = 17 variables.
- [ ] INITIAL_ADMIN_DISCORD_USERNAMES was not in the list — fine if unused; the app
      also supports DB-set admin roles.
