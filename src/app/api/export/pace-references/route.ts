import { NextResponse } from "next/server";
import { getPaceReferences } from "@/lib/pace-references";
import { buildPaceWorkbook, paceFileName } from "@/lib/pace-export";
import { isAdmin } from "@/lib/auth-helpers";

/**
 * .xlsx export of the pace-reference library.
 *
 *   GET /api/export/pace-references            → every curve, one sheet each
 *   GET /api/export/pace-references?id=<id>    → just that one
 *
 * ADMIN ONLY. Unlike the standings export this is not public: the library is
 * an internal working file, typed in by hand from a members-site page, and it
 * is not ours to hand out.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  const all = await getPaceReferences();
  const rows = id ? all.filter((r) => r.id === id) : all;

  if (rows.length === 0) {
    return NextResponse.json(
      { error: id ? "No such pace reference." : "The library is empty." },
      { status: 404 }
    );
  }

  const buf = buildPaceWorkbook(rows);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${paceFileName(
        id ? rows[0] : null
      )}"`,
      "Cache-Control": "no-store",
    },
  });
}
