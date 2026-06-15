#!/usr/bin/env bash
# Migrate the CLS database from Neon -> local Postgres (Coolify).
#
# RUN THIS FROM HOME OR FROM THE VPS — your office WiFi blocks port 5432.
# Requires postgresql-client v17 (`brew install postgresql@17` on macOS, so
# pg_dump/pg_restore major version >= Neon's).
#
# Usage:
#   1. Fill in the two connection strings below.
#   2. bash migrate-db-from-neon.sh
set -euo pipefail

# --- Neon (source): copy the DIRECT (non-pooled) connection string from the
#     Neon dashboard. Keep ?sslmode=require.
NEON_URL="postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require"

# --- Coolify Postgres (target): the connection string Coolify shows for cls-db.
#     If running from your laptop, use the PUBLIC host:port Coolify exposes;
#     if running on the VPS, the internal string works.
TARGET_URL="postgresql://postgres:PASSWORD@HOST:5432/postgres"

DUMP="cls-neon-$(date +%Y%m%d-%H%M%S).dump"

echo ">> Dumping Neon database to ${DUMP} ..."
pg_dump "${NEON_URL}" \
  --format=custom \
  --no-owner --no-privileges \
  --file="${DUMP}"

echo ">> Restoring into target ..."
# --clean drops objects first so the restore is repeatable; remove if the
# target is brand new and empty.
pg_restore \
  --no-owner --no-privileges \
  --clean --if-exists \
  --dbname="${TARGET_URL}" \
  "${DUMP}"

echo ">> Done. Keep ${DUMP} as your final Neon backup."
