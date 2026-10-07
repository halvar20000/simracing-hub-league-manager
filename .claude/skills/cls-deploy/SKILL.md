---
name: cls-deploy
description: Ship a change to the live CLS site (league.simracing-hub.com) — version bump, changelog, typecheck, full build, explicit git add, push to main, then confirm the new version is live. Use whenever a code change in this repo is ready to go out, or when the user says deploy / ship / push / live / release.
---

# Deploying CLS (league-manager)

A push to `main` IS the deploy: Coolify on the Hetzner box (5.75.174.170) builds
and restarts the app on its own, ~3–4 minutes after the push. There is no
staging. So everything below happens BEFORE the push, and the job is not done
until the live site reports the new version.

Run every step yourself — do not hand the user a command to run.

Paths and commands assume the Claude Code session inside the `claude-agent`
container on Unraid, repo at `/mnt/user/AI/Projects/league-manager` (the only
checkout; on the Mac it is the SMB mount `/Volumes/AI/Projects/league-manager`).

## 1. Start from a clean, current main

```bash
cd /mnt/user/AI/Projects/league-manager
git fetch origin
git status -sb          # must show "## main...origin/main" with no [ahead]/[behind]
```

If it is behind, `git pull --ff-only` first. If it diverged, stop and ask —
another session (or the user) shipped something in between.

## 2. Version + changelog — EVERY deploy

`src/lib/changelog.ts` is the single source of truth. `CHANGELOG[0].version`
feeds the footer, `/api/build-id` and the stale-build banner on long-lived
pages (stint planner), so a deploy without a bump leaves open tabs unaware
that their Server Action IDs just died.

1. Read the TOP entry first — another session may have shipped versions since
   you last looked. Never reuse or skip a number.
2. Add a new entry at the top of the array:
   - fix / small tweak → patch (2.36.0 → 2.36.1)
   - new feature → minor (2.36.1 → 2.37.0)
   - big rework → major
   - `date`: today, `YYYY-MM-DD`
   - `changes`: plain English, written for league admins/drivers, what they
     will notice — not file names or function names.

Pure asset additions (e.g. a poster PNG in `public/schedules/`) and docs-only
commits (`CLAUDE.md`, skills) may skip the bump — say so in the reply.

## 3. Schema changes need manual DDL on the live DB

If `prisma/schema.prisma` changed: the runtime container does NOT apply schema
and there is no Prisma CLI in it. Apply additive DDL on the live Postgres
BEFORE pushing code that reads the new column/table, otherwise the live site
throws on every query that touches it.

```bash
ssh -i /home/agent/.ssh/hetzner_cls root@5.75.174.170   # from the container
# (`ssh hetzner` does NOT work in the container — its config expands ~ to /root)
```

Find the CLS Postgres container by probing for a `Round` table (its name is a
random Coolify hash and changes on redeploy — never hardcode it), then
`ALTER TABLE "X" ADD COLUMN IF NOT EXISTS ...`. Never `prisma migrate dev`
(it offers a reset that wipes data). Never drop/rename without asking.
Write the SQL to a file, `scp` it up and feed it with `docker exec -i <c> ... < file`
— quoting SQL through nested ssh + docker + sh is where mistakes happen.

## 4. Typecheck and full build — both must exit 0

```bash
node node_modules/typescript/bin/tsc --noEmit -p .
node node_modules/next/dist/bin/next build
```

- Use the real entry points: the Unraid share stores `node_modules/.bin`
  symlinks as `XSym` text files, so `npx next build` dies with
  `XSym: command not found` (exit 127).
- `tsc` alone is not enough — `next build` catches route/server-component
  errors tsc doesn't. Check the EXIT CODE, not just the last lines of output.
- The build takes ~2 minutes. Run it in the background and poll if the
  tool call would otherwise time out.
- `outputs/` and `scripts/` are excluded in `tsconfig.json` on purpose (old
  one-off scripts that no longer typecheck live there). Keep it that way.

## 5. Commit with EXPLICIT paths — never `git add -A` / `git add .`

The working tree always carries stray untracked files (screenshots,
`tsconfig.chk*.json`, `TEAM_LOGOS/`, scratch scripts). Stage exactly the files
you changed:

```bash
git add src/lib/changelog.ts src/lib/actions/registrations.ts 'src/app/leagues/[slug]/...'
git status --short       # nothing unintended staged
```

- Quote paths containing `[slug]`/`[seasonId]` brackets.
- `scripts/lm_*.ts` and `outputs/` are gitignored — never name them in
  `git add` (with `set -e` an ignored path aborts the whole script).
- Commit message: what changed for users + the version, e.g.
  `Team registration: validate before any write (v2.36.1)`.

## 6. Push

```bash
git push origin main
```

`origin` is `git@github.com:halvar20000/simracing-hub-league-manager.git`; the
repo-local `core.sshCommand` uses the deploy key
`/home/agent/.ssh/github_league_manager` (container) or
`/root/.ssh/github_league_manager` (Unraid host). A
`known_hosts ... Operation not permitted` warning on the host is harmless.

## 7. Confirm it is live

```bash
curl -s "https://league.simracing-hub.com/api/build-id?cb=$RANDOM"
# → {"version":"2.36.1"}
```

Poll every ~60 s; expect the old version for 3–4 minutes. Don't trust the
`/changelog` page (hard-cached). If the version has not changed after ~8
minutes, the Coolify build failed or never started — check the app container
logs on the Hetzner box (`docker ps`, then `docker logs --since 15m <app>`) or
the Coolify dashboard (`http://5.75.174.170:8000`) before pushing anything else.

For an asset-only push (no version bump) confirm the asset URL itself returns
200 instead.

## 8. Report

One or two sentences: what changed for users, the version that is live. Mention
any manual follow-up (DDL applied, data fixed, something the admin must click).
If a step was skipped (no bump for an asset-only push), say which and why.
