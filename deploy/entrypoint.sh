#!/bin/sh
set -e

# The Next.js standalone runtime image intentionally ships only the Prisma
# CLIENT + query engine (what the app uses at request time) — NOT the Prisma
# CLI, whose dependencies (effect, etc.) aren't traced into the standalone
# bundle. So schema work is done OUT OF BAND, never in this container:
#   - Initial schema comes from the database dump/restore during migration.
#   - Future schema changes: run `npx prisma db push` from a full dev/build
#     environment (your Mac, or the build-stage image) against DATABASE_URL.
#
# This container's only job is to serve the app.
echo "Starting Next.js..."
exec node server.js
