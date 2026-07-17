// Minimal server-side Garage 61 API client.
// Docs: https://garage61.net/developer — REST, Bearer token (GARAGE61_TOKEN).
// Only the read endpoints the stint planner needs.

const API_BASE = "https://garage61.net/api/v1";

export type G61Track = {
  id: number;
  name: string;
  variant?: string | null;
  platform?: string;
};

export type G61Car = {
  id: number;
  name: string;
  platform?: string;
  /** iRacing car id (as string) where the platform is iRacing. */
  platform_id?: string | null;
};

export type G61UserInfo = {
  slug: string;
  firstName?: string | null;
  lastName?: string | null;
};

export type G61Lap = {
  id: string;
  driver?: G61UserInfo | null;
  car: G61Car;
  track: G61Track;
  /** Lap time in seconds. */
  lapTime: number;
  clean: boolean;
  /** Extra fields (e.g. fuelUsed) are passed through untyped until confirmed. */
  [k: string]: unknown;
};

export type G61Team = { id: string; name: string; slug: string };
export type G61Me = {
  id: string;
  slug: string;
  apiPermissions: string[];
  teams: G61Team[];
};

export type G61Result<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string };

// Resolve the token to use: an explicit per-call token (e.g. a per-plan token)
// wins; otherwise fall back to the global GARAGE61_TOKEN env var (dev/shared).
function token(explicit?: string | null): string | null {
  if (explicit && explicit.length > 0) return explicit;
  const t = process.env.GARAGE61_TOKEN;
  return t && t.length > 0 ? t : null;
}

async function g61Fetch<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
  tokenArg?: string | null
): Promise<G61Result<T>> {
  const tok = token(tokenArg);
  if (!tok) return { ok: false, status: 0, error: "missing-GARAGE61_TOKEN" };
  const url = new URL(`${API_BASE}${path}`);
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }
  try {
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${tok}`,
        "Content-Type": "application/json",
      },
      // Garage 61 data changes slowly; cache briefly per request path.
      next: { revalidate: 300 },
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, status: res.status, error: text.slice(0, 300) };
    return { ok: true, data: (text ? JSON.parse(text) : null) as T };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

export function garage61Configured(tokenArg?: string | null): boolean {
  return token(tokenArg) !== null;
}

export async function g61GetMe(tokenArg?: string | null): Promise<G61Result<G61Me>> {
  return g61Fetch<G61Me>("/me", undefined, tokenArg);
}

export async function g61ListTracks(
  tokenArg?: string | null
): Promise<G61Result<{ items: G61Track[] }>> {
  return g61Fetch<{ items: G61Track[] }>("/tracks", undefined, tokenArg);
}

export async function g61ListCars(
  tokenArg?: string | null
): Promise<G61Result<{ items: G61Car[] }>> {
  return g61Fetch<{ items: G61Car[] }>("/cars", undefined, tokenArg);
}

export type FindLapsArgs = {
  /** Garage 61 track ids (required by the API). */
  tracks: number[];
  /** Garage 61 car ids. */
  cars?: number[];
  /** "me" / "following" tokens. */
  drivers?: string[];
  /** Driver slugs (non me/following). */
  extraDrivers?: string[];
  /** Team slugs. */
  teams?: string[];
  group?: "driver" | "driver-car" | "none";
  limit?: number;
  /** Max age in days (-1 = current season, -2 = curr+prev, …). */
  age?: number;
};

export async function g61FindLaps(
  args: FindLapsArgs,
  tokenArg?: string | null
): Promise<G61Result<{ items: G61Lap[]; total?: number }>> {
  const params: Record<string, string | number | undefined> = {
    tracks: args.tracks.join(","),
    cars: args.cars && args.cars.length ? args.cars.join(",") : undefined,
    drivers: args.drivers && args.drivers.length ? args.drivers.join(",") : undefined,
    extraDrivers:
      args.extraDrivers && args.extraDrivers.length
        ? args.extraDrivers.join(",")
        : undefined,
    teams: args.teams && args.teams.length ? args.teams.join(",") : undefined,
    group: args.group ?? "driver",
    limit: args.limit ?? 200,
    age: args.age,
  };
  return g61Fetch<{ items: G61Lap[]; total?: number }>("/laps", params, tokenArg);
}
