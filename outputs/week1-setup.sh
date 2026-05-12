#!/usr/bin/env bash
# Week 1 scaffold for Simracing-Hub's League Manager
# Creates a Next.js 15 project at ~/Nextcloud/AI/league-manager/
# with Auth.js (Discord provider) and Prisma + Postgres.
#
# Prerequisites:
#   - Node.js 20+ installed (check with: node --version)
#   - npm installed
#   - Internet connection
#
# Usage:
#   bash ~/path/to/week1-setup.sh

set -euo pipefail

PROJECT_PARENT="$HOME/Nextcloud/AI"
PROJECT_NAME="league-manager"
PROJECT_DIR="$PROJECT_PARENT/$PROJECT_NAME"

echo "============================================="
echo "Simracing-Hub League Manager — Week 1 setup"
echo "============================================="
echo ""
echo "Target directory: $PROJECT_DIR"
echo ""

# Safety: abort if the target already exists
if [ -d "$PROJECT_DIR" ]; then
  echo "ERROR: $PROJECT_DIR already exists."
  echo "Delete it first if you want to start fresh, then re-run this script."
  exit 1
fi

# Check Node version
NODE_VERSION=$(node --version 2>/dev/null | sed 's/^v//' | cut -d. -f1 || echo "0")
if [ "$NODE_VERSION" -lt "20" ]; then
  echo "ERROR: Node.js 20 or higher is required. Found: $(node --version 2>/dev/null || echo 'not installed')"
  echo "Install from https://nodejs.org or via: brew install node"
  exit 1
fi

mkdir -p "$PROJECT_PARENT"
cd "$PROJECT_PARENT"

# ------------------------------------------------------------
# 1. Scaffold Next.js project
# ------------------------------------------------------------
echo ""
echo ">>> Step 1: Creating Next.js 15 project (this takes a minute)..."
echo ""

npx --yes create-next-app@latest "$PROJECT_NAME" \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --use-npm \
  --no-turbopack \
  --skip-install

cd "$PROJECT_DIR"

# ------------------------------------------------------------
# 2. Install dependencies
# ------------------------------------------------------------
echo ""
echo ">>> Step 2: Installing dependencies..."
echo ""

npm install

npm install \
  next-auth@beta \
  @auth/prisma-adapter \
  @prisma/client@^6 \
  zod \
  lucide-react \
  clsx \
  tailwind-merge

npm install -D prisma@^6

# ------------------------------------------------------------
# 3. Initialize Prisma
# ------------------------------------------------------------
echo ""
echo ">>> Step 3: Initializing Prisma..."
echo ""

npx prisma init --datasource-provider postgresql

# Ensure prisma generate runs on npm install (needed for Vercel builds)
npm pkg set scripts.postinstall="prisma generate"

# ------------------------------------------------------------
# 4. Write custom files
# ------------------------------------------------------------
echo ""
echo ">>> Step 4: Writing project files..."
echo ""

# prisma/schema.prisma — Auth.js tables plus our initial User model
cat > prisma/schema.prisma <<'EOF'
// Prisma schema for Simracing-Hub's League Manager
// Week 1: Auth.js tables + base User model with role
// Week 2 will extend this with League, Season, Round, Registration, etc.

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  ADMIN
  DRIVER
}

model User {
  id              String    @id @default(cuid())
  name            String?
  email           String?   @unique
  emailVerified   DateTime?
  image           String?

  // Our custom fields
  firstName       String?
  lastName        String?
  iracingMemberId String?   @unique
  role            Role      @default(DRIVER)
  isActive        Boolean   @default(true)

  accounts        Account[]
  sessions        Session[]

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}
EOF

# src/lib/prisma.ts — Prisma client singleton
mkdir -p src/lib
cat > src/lib/prisma.ts <<'EOF'
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
EOF

# src/auth.ts — Auth.js v5 centralized config
cat > src/auth.ts <<'EOF'
import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [Discord],
  session: { strategy: "database" },
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        // @ts-expect-error - role comes from our extended User model
        session.user.role = user.role;
      }
      return session;
    },
  },
});
EOF

# src/app/api/auth/[...nextauth]/route.ts — Auth.js API routes
mkdir -p "src/app/api/auth/[...nextauth]"
cat > "src/app/api/auth/[...nextauth]/route.ts" <<'EOF'
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
EOF

# src/types/next-auth.d.ts — type augmentation
mkdir -p src/types
cat > src/types/next-auth.d.ts <<'EOF'
import type { DefaultSession } from "next-auth";
import type { Role } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
  }
}
EOF

# src/components/nav.tsx — top nav with sign-in/out
mkdir -p src/components
cat > src/components/nav.tsx <<'EOF'
import Link from "next/link";
import { auth, signIn, signOut } from "@/auth";

export default async function Nav() {
  const session = await auth();

  return (
    <nav className="border-b border-zinc-800 bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-bold tracking-tight">
          Simracing-Hub's League Manager
        </Link>
        <div className="flex items-center gap-4 text-sm">
          {session?.user ? (
            <>
              <Link href="/dashboard" className="hover:text-orange-400">
                Dashboard
              </Link>
              <span className="text-zinc-400">
                {session.user.name ?? session.user.email}
              </span>
              <form
                action={async () => {
                  "use server";
                  await signOut();
                }}
              >
                <button
                  type="submit"
                  className="rounded bg-zinc-800 px-3 py-1.5 hover:bg-zinc-700"
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <form
              action={async () => {
                "use server";
                await signIn("discord");
              }}
            >
              <button
                type="submit"
                className="rounded bg-indigo-600 px-3 py-1.5 font-medium hover:bg-indigo-500"
              >
                Sign in with Discord
              </button>
            </form>
          )}
        </div>
      </div>
    </nav>
  );
}
EOF

# src/app/layout.tsx — base layout
cat > src/app/layout.tsx <<'EOF'
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Nav from "@/components/nav";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Simracing-Hub's League Manager",
  description:
    "League management for iRacing communities — registrations, seasons, results, standings, and more.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} min-h-screen bg-zinc-950 text-zinc-100`}>
        <Nav />
        <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
EOF

# src/app/page.tsx — home page
cat > src/app/page.tsx <<'EOF'
import { auth } from "@/auth";

export default async function Home() {
  const session = await auth();

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-4xl font-bold tracking-tight">
          Simracing-Hub's League Manager
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-zinc-400">
          League management for iRacing communities. Registrations, seasons,
          results, standings, team ratings, and incident reporting — all in one
          place.
        </p>
      </section>

      <section className="rounded border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="text-lg font-semibold">Phase 1 in progress</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Skeleton deployed. Sign in with Discord to continue. Full league and
          season setup is coming in the following weeks.
        </p>
      </section>

      {session?.user && (
        <section className="rounded border border-emerald-800 bg-emerald-950 p-6">
          <h2 className="text-lg font-semibold text-emerald-300">
            You&apos;re signed in
          </h2>
          <p className="mt-2 text-sm text-emerald-200">
            Welcome, {session.user.name ?? session.user.email}. Your role is{" "}
            <code className="rounded bg-emerald-900 px-1.5 py-0.5">
              {session.user.role}
            </code>
            .
          </p>
        </section>
      )}
    </div>
  );
}
EOF

# src/app/dashboard/page.tsx — protected example page
mkdir -p src/app/dashboard
cat > src/app/dashboard/page.tsx <<'EOF'
import { auth, signIn } from "@/auth";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-zinc-400">You need to sign in to access this page.</p>
        <form
          action={async () => {
            "use server";
            await signIn("discord", { redirectTo: "/dashboard" });
          }}
        >
          <button
            type="submit"
            className="rounded bg-indigo-600 px-4 py-2 font-medium hover:bg-indigo-500"
          >
            Sign in with Discord
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="rounded border border-zinc-800 bg-zinc-900 p-6">
        <p>
          Signed in as{" "}
          <span className="font-semibold">{session.user.name}</span>
        </p>
        <p className="mt-2 text-sm text-zinc-400">
          User ID: <code>{session.user.id}</code>
        </p>
        <p className="text-sm text-zinc-400">
          Role: <code>{session.user.role}</code>
        </p>
      </div>
      <p className="text-sm text-zinc-500">
        More views will arrive in Week 2 (leagues, seasons, registrations).
      </p>
    </div>
  );
}
EOF

# .env.example — template for environment variables
cat > .env.example <<'EOF'
# Neon Postgres connection string
# Get this from Neon dashboard > Connection Details > copy "Pooled connection" string
DATABASE_URL="postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require"

# Auth.js secret — generate with: openssl rand -base64 32
AUTH_SECRET="replace-with-random-32-byte-base64-string"

# Discord OAuth — from discord.com/developers/applications > your app > OAuth2
AUTH_DISCORD_ID="your-discord-client-id"
AUTH_DISCORD_SECRET="your-discord-client-secret"

# Optional: for local dev, tells Auth.js where your app is
AUTH_URL="http://localhost:3000"
EOF

# .env — real credentials (gitignored)
# All secrets live in .env (not .env.local) so Prisma CLI can read them too.
# We generate a random AUTH_SECRET now so you don't need to.
AUTH_SECRET_VALUE=$(openssl rand -base64 32)

cat > .env <<EOF
# IMPORTANT: This file contains real credentials. Never commit it.
# It is already listed in .gitignore.

# Paste your actual Neon connection string here
DATABASE_URL="REPLACE_WITH_YOUR_NEON_CONNECTION_STRING"

# Random session secret (already generated)
AUTH_SECRET="$AUTH_SECRET_VALUE"

# Paste your Discord OAuth credentials here
AUTH_DISCORD_ID="REPLACE_WITH_DISCORD_CLIENT_ID"
AUTH_DISCORD_SECRET="REPLACE_WITH_DISCORD_CLIENT_SECRET"

# Local dev URL
AUTH_URL="http://localhost:3000"
EOF

# Append to .gitignore so .env* is never committed
cat >> .gitignore <<'EOF'

# Environment variables
.env
.env.local
.env.production
.env.*.local
EOF

# README.md — short project readme
cat > README.md <<'EOF'
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
EOF

# ------------------------------------------------------------
# 5. Initialize git
# ------------------------------------------------------------
echo ""
echo ">>> Step 5: Initializing git repository..."
echo ""

git init -q
git add .
git commit -q -m "Week 1 scaffold — Next.js + Auth.js + Prisma + Discord sign-in"

# ------------------------------------------------------------
# 6. Done — print next steps
# ------------------------------------------------------------
echo ""
echo "============================================="
echo "Done! Project created at $PROJECT_DIR"
echo "============================================="
echo ""
echo "NEXT STEPS:"
echo ""
echo "1. Open the project:"
echo "   cd $PROJECT_DIR"
echo "   open -a 'Visual Studio Code' . # or: cursor ."
echo ""
echo "2. Edit .env.local with your real credentials:"
echo "   - DATABASE_URL from Neon"
echo "   - AUTH_DISCORD_ID and AUTH_DISCORD_SECRET from Discord Developer Portal"
echo ""
echo "3. Push schema to your Neon database:"
echo "   npx prisma db push"
echo ""
echo "4. Run the dev server:"
echo "   npm run dev"
echo "   Then visit http://localhost:3000"
echo ""
echo "5. In Discord Developer Portal > your app > OAuth2 > Redirects, add:"
echo "   http://localhost:3000/api/auth/callback/discord"
echo "   (you'll add the production URL later)"
echo ""
echo "6. Once local sign-in works, push to GitHub:"
echo "   # First, create an empty repo on github.com named 'league-manager'"
echo "   git remote add origin git@github.com:YOURUSERNAME/league-manager.git"
echo "   git branch -M main"
echo "   git push -u origin main"
echo ""
echo "7. Import the repo in Vercel, add the same env vars there, and deploy."
echo ""
echo "Full walkthrough: see week1-instructions.md in your outputs folder."
echo ""
