const IRLM_BASE_URL =
  process.env.IRLM_API_BASE_URL ?? "https://irleaguemanager.net/api";

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function loginToIRLM(): Promise<string> {
  const username = process.env.IRLM_USERNAME;
  const password = process.env.IRLM_PASSWORD;
  if (!username || !password) {
    throw new Error(
      "iRLeagueManager credentials missing. Set IRLM_USERNAME and IRLM_PASSWORD."
    );
  }
  const res = await fetch(`${IRLM_BASE_URL}/Authenticate/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    throw new Error(
      `iRLM login failed (${res.status}): ${await res.text().catch(() => "")}`
    );
  }
  const data = (await res.json()) as Record<string, unknown>;
  // Different builds expose the token under different keys. Try the common ones.
  const token =
    (data.token as string | undefined) ??
    (data.accessToken as string | undefined) ??
    (data.jwt as string | undefined) ??
    (data.idToken as string | undefined);
  if (typeof token !== "string" || token.length === 0) {
    throw new Error(
      `iRLM login returned no token. Keys: ${Object.keys(data).join(", ")}`
    );
  }
  return token;
}

async function getIRLMToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
  const t = await loginToIRLM();
  cachedToken = t;
  tokenExpiresAt = Date.now() + 30 * 60 * 1000; // re-login every 30 minutes
  return t;
}

async function irlmFetch<T = unknown>(path: string): Promise<T> {
  const url = path.startsWith("http") ? path : `${IRLM_BASE_URL}${path}`;
  let token = await getIRLMToken();
  let res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    cachedToken = null;
    token = await getIRLMToken();
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  }
  if (!res.ok) {
    throw new Error(
      `iRLM GET ${path} failed (${res.status}): ${await res.text().catch(() => "")}`
    );
  }
  return res.json() as Promise<T>;
}

// ===== Typed helpers (loose typing — iRLM returns large objects) =====

export interface IRLMResultRow {
  scoredResultRowId?: number;
  firstname?: string;
  lastname?: string;
  memberId?: number;
  teamName?: string | null;
  startPosition?: number;
  finishPosition?: number;
  carNumber?: string;
  car?: string;
  completedLaps?: number;
  leadLaps?: number;
  fastLapNr?: number;
  incidents?: number;
  status?: string;
  qualifyingTime?: string | null;
  fastestLapTime?: string | null;
  avgLapTime?: string | null;
  newIrating?: number | null;
  oldIrating?: number | null;
  completedPct?: number;
}

export interface IRLMSessionResult {
  sessionResultId?: number;
  sessionName?: string;
  sessionType?: string;
  resultRows?: IRLMResultRow[];
}

export interface IRLMEventResult {
  leagueId?: number;
  eventId?: number;
  resultId?: number;
  eventName?: string;
  date?: string;
  trackName?: string;
  configName?: string;
  sessionResults?: IRLMSessionResult[];
}

export async function fetchEventResults(
  leagueName: string,
  eventId: number
): Promise<IRLMEventResult[]> {
  return irlmFetch<IRLMEventResult[]>(
    `/${leagueName}/Events/${eventId}/Results`
  );
}

export async function fetchSeasons(
  leagueName: string
): Promise<{ seasonId: number; seasonName: string; finished: boolean }[]> {
  return irlmFetch(`/${leagueName}/Seasons`);
}

export async function fetchEvents(
  leagueName: string,
  scheduleId: number
): Promise<
  {
    id: number;
    name: string;
    date: string;
    trackName: string;
    configName: string;
    hasResult: boolean;
  }[]
> {
  return irlmFetch(`/${leagueName}/Schedules/${scheduleId}/Events?includeDetails=true`);
}
