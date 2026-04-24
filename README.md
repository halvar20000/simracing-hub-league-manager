# Simracing-Hub's League Manager

Web-based league management tool for iRacing communities.

## Stack

- Next.js 15 (App Router, TypeScript, Tailwind)
- Auth.js v5 with Discord provider
- Prisma + Postgres (hosted on Neon)
- Deployed on Vercel

## Local development

```bash
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000).

## Environment variables

Copy `.env.example` to `.env.local` and fill in the real values:

- `DATABASE_URL` — Neon Postgres connection string
- `AUTH_SECRET` — random 32-byte base64 string (`openssl rand -base64 32`)
- `AUTH_DISCORD_ID`, `AUTH_DISCORD_SECRET` — Discord OAuth credentials

## Database

Apply schema changes to your database:

```bash
npx prisma db push
```

Open Prisma Studio to browse data:

```bash
npx prisma studio
```

## Project status

Phase 1 Week 1 complete — authentication skeleton deployed.
See `league-manager-phase1-spec.md` for the full roadmap.
