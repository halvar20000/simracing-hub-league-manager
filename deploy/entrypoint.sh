#!/bin/sh
set -e

# Apply schema to the database, then start the server.
# Use db push (matches your project convention: Neon schema is managed with
# `prisma db push`, NOT migrate). Safe + additive. See CLAUDE.md.
# After a full dump/restore the schema already matches, so this is normally a
# no-op. It's here so future schema changes apply on deploy. It will NOT drop
# data unless you pass --accept-data-loss, which we deliberately omit.
echo "Applying schema with prisma db push..."
npx prisma db push --skip-generate

echo "Starting Next.js..."
exec node server.js
