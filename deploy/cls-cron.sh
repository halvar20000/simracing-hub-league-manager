#!/usr/bin/env bash
#
# CLS host cron runner — lives at /root/cls-cron.sh on the Hetzner box.
#
# WHY THIS EXISTS: the GitHub Actions `schedule` event is best-effort. Measured
# over 8 days in Aug 2026, the "*/10" post-stream workflow actually fired ~13
# times a day instead of 144 — median gap 101 min, shortest gap in 99 intervals
# 56 min, not one gap under 15 min. GitHub delays and outright drops scheduled
# runs under load, and high-frequency crons on free public repos go first. That
# is fine for the 3-hourly VOD matchers but not for stream announcements or the
# RSVP close, which are supposed to land at a specific time.
#
# This box already runs 24/7 next to the app, so it drives the schedule to the
# minute. The GitHub workflows stay ENABLED as a slow backup — every endpoint is
# idempotent (postedAt / notifiedAt / closedAt markers), so a double fire is a
# no-op and a late GitHub run simply finds nothing to do.
#
# Usage:  cls-cron.sh <endpoint-name>        e.g. cls-cron.sh post-stream-announcements
#
set -uo pipefail

ENDPOINT="${1:-}"
if [ -z "$ENDPOINT" ]; then
  echo "usage: $0 <cron-endpoint-name>" >&2
  exit 2
fi

BASE="https://league.simracing-hub.com/api/cron"
SECRET_FILE="/root/.cls-cron.secret"
LOG="/var/log/cls-cron.log"
LOCK="/run/cls-cron-${ENDPOINT}.lock"

log() { printf '%s %-28s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$ENDPOINT" "$*" >>"$LOG"; }

# Don't let a slow run stack up on top of itself. Exit quietly if the previous
# invocation of THIS endpoint is still going.
exec 9>"$LOCK"
if ! flock -n 9; then
  log "skipped (previous run still active)"
  exit 0
fi

# The CRON_SECRET is not stored in the repo. It is read out of the running app
# container and cached; the container name changes on every Coolify deploy, so
# we discover it by probing for the one that has the variable.
discover_secret() {
  local n s
  for n in $(docker ps --format '{{.Names}}' 2>/dev/null); do
    s="$(docker exec "$n" printenv CRON_SECRET 2>/dev/null)" || continue
    if [ -n "$s" ]; then
      printf '%s' "$s" >"$SECRET_FILE"
      chmod 600 "$SECRET_FILE"
      printf '%s' "$s"
      return 0
    fi
  done
  return 1
}

secret=""
if [ -s "$SECRET_FILE" ]; then
  secret="$(cat "$SECRET_FILE")"
fi
if [ -z "$secret" ]; then
  secret="$(discover_secret)" || {
    log "FAIL could not find CRON_SECRET in any running container"
    exit 1
  }
fi

body="$(mktemp)"
trap 'rm -f "$body"' EXIT

call() {
  curl -sS --max-time 55 -o "$body" -w '%{http_code}' \
    -H "Authorization: Bearer $secret" \
    "$BASE/$ENDPOINT" 2>>"$LOG"
}

started=$(date +%s)
code="$(call)" || code="000"

# A 401 means the cached secret went stale (CRON_SECRET rotated in Coolify).
# Re-read it from the container and retry once, so this self-heals.
if [ "$code" = "401" ]; then
  log "401 with cached secret — rediscovering"
  if secret="$(discover_secret)"; then
    code="$(call)" || code="000"
  fi
fi

elapsed=$(( $(date +%s) - started ))
summary="$(tr -d '\n' <"$body" | cut -c1-300)"

if [ "$code" = "200" ]; then
  log "ok   ${elapsed}s $summary"
else
  log "FAIL http=$code ${elapsed}s $summary"
  exit 1
fi
