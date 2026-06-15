# League Manager — production image (Next.js 16 standalone + Prisma + Postgres)
# Copy this to the repo ROOT before building (Coolify or `docker build`).
# Requires `output: "standalone"` in next.config.ts (see runbook Phase 4).

# ---- deps ----
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
COPY prisma ./prisma
# postinstall runs `prisma generate`
RUN npm ci

# ---- build ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# A dummy DATABASE_URL lets `next build` succeed without a live DB.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npm run build

# ---- runner ----
FROM node:22-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Next.js standalone output
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Prisma engine + schema + CLI for migrate-on-boot
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/node_modules/prisma ./node_modules/prisma

COPY deploy/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

EXPOSE 3000
CMD ["./entrypoint.sh"]
