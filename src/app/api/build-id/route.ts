import { NextResponse } from "next/server";
import { CURRENT_VERSION } from "@/lib/changelog";

/**
 * Which build is currently serving. Long-lived pages (the stint planner during
 * a 6h race) poll this: after a redeploy every Server Action ID from the old
 * build is gone ("Failed to find Server Action …"), so uploads and auto-save
 * silently die until the tab is reloaded. A plain route handler survives the
 * redeploy — its URL is stable — so it can tell the tab it has gone stale.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { version: CURRENT_VERSION },
    { headers: { "cache-control": "no-store, max-age=0" } }
  );
}
